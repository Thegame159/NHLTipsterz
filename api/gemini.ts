// api/gemini.ts
// Fluxo: calendário real (NHL) + classificação real (NHL) → Groq (probabilidades + texto) → cache em Redis.
// Nota: o nome do ficheiro mantém-se "gemini" para não partir o frontend (/api/gemini).

import { redis } from "./_redis.js";

export const config = { runtime: "edge" };

const NHL_API = "https://api-web.nhle.com/v1";
const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const CACHE_PREFIX = "nhl:analysis:";
const CACHE_TTL_MS = 8 * 60 * 60 * 1000; // 8 horas

// ─── Tipos ───────────────────────────────────────────────────────────────────

type NhlGame = {
  id: number;
  startTimeUTC: string;
  gameType: number; // 1 = pré-época, 2 = época regular, 3 = playoffs
  homeAbbr: string;
  awayAbbr: string;
  homeName: string;
  awayName: string;
};

type TeamForm = {
  abbr: string;
  gp: number;
  points: number;
  pointPct: number; // 0..1
  gfPg: number;
  gaPg: number;
  l10: string; // "V-D-DP"
  l10Gf: number;
  l10Ga: number;
  homeRecord: string;
  roadRecord: string;
};

type Prediction = {
  id: string;
  homeTeam: string;
  homeTeamAbbr: string;
  homeRecordL10: string;
  awayTeam: string;
  awayTeamAbbr: string;
  awayRecordL10: string;
  dateTime: string;
  winProbabilityHome: number;
  winProbabilityAway: number;
  over15P1Prob: number;
  bttsP1Prob: number;
  drawTRProb: number;
  over45Prob: number;
  over55Prob: number;
  analysisSummary: string;
  // A API da NHL não fornece lesões; não inventamos.
  injuries: { home: string[]; away: string[] };
};

type AnalysisPayload = {
  predictions: Prediction[];
  lastUpdated: string;
  meta: { source: "ai" | "baseline"; games: number; note?: string };
};

// ─── Utilitários ─────────────────────────────────────────────────────────────

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

const num = (x: unknown, fallback = 0) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
};

const clampPct = (x: unknown, fallback: number) => {
  const n = Number(x);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(99, Math.max(1, Math.round(n)));
};

const etDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// ─── Dados reais da NHL ──────────────────────────────────────────────────────

async function fetchGames(date: string): Promise<NhlGame[]> {
  const res = await fetchWithTimeout(`${NHL_API}/schedule/${date}`);
  if (!res.ok) throw new Error(`Calendário da NHL indisponível (HTTP ${res.status}).`);
  const data = await res.json();

  const seen = new Set<number>();
  const games: NhlGame[] = [];

  for (const day of Array.isArray(data?.gameWeek) ? data.gameWeek : []) {
    for (const g of Array.isArray(day?.games) ? day.games : []) {
      if (!g?.id || !g?.startTimeUTC || seen.has(g.id)) continue;
      // Mesmo critério do /api/results: o "dia do jogo" é a data na hora da costa leste.
      if (etDate(g.startTimeUTC) !== date) continue;
      seen.add(g.id);

      const fullName = (t: any) =>
        [t?.placeName?.default, t?.commonName?.default].filter(Boolean).join(" ") || t?.abbrev || "";

      games.push({
        id: g.id,
        startTimeUTC: g.startTimeUTC,
        gameType: num(g.gameType, 2),
        homeAbbr: String(g.homeTeam?.abbrev ?? "").toUpperCase(),
        awayAbbr: String(g.awayTeam?.abbrev ?? "").toUpperCase(),
        homeName: fullName(g.homeTeam),
        awayName: fullName(g.awayTeam),
      });
    }
  }

  return games.sort((a, b) => a.startTimeUTC.localeCompare(b.startTimeUTC));
}

async function fetchForm(): Promise<Map<string, TeamForm>> {
  const map = new Map<string, TeamForm>();
  try {
    const res = await fetchWithTimeout(`${NHL_API}/standings/now`);
    if (!res.ok) return map;
    const data = await res.json();

    for (const r of Array.isArray(data?.standings) ? data.standings : []) {
      const abbr = String(r?.teamAbbrev?.default ?? "").toUpperCase();
      if (!abbr) continue;
      const gp = num(r.gamesPlayed);
      map.set(abbr, {
        abbr,
        gp,
        points: num(r.points),
        pointPct: num(r.pointPctg),
        gfPg: gp > 0 ? num(r.goalFor) / gp : 0,
        gaPg: gp > 0 ? num(r.goalAgainst) / gp : 0,
        l10: `${num(r.l10Wins)}-${num(r.l10Losses)}-${num(r.l10OtLosses)}`,
        l10Gf: num(r.l10GoalsFor),
        l10Ga: num(r.l10GoalsAgainst),
        homeRecord: `${num(r.homeWins)}-${num(r.homeLosses)}-${num(r.homeOtLosses)}`,
        roadRecord: `${num(r.roadWins)}-${num(r.roadLosses)}-${num(r.roadOtLosses)}`,
      });
    }
  } catch (e) {
    console.error("[gemini] standings falhou:", e);
  }
  return map;
}

// ─── Probabilidades base (usadas se a IA falhar ou não devolver um jogo) ────

function baseline(home?: TeamForm, away?: TeamForm) {
  // Sem jogos disputados (início de época) a equipa conta como "média" (0.5), não como 0%.
  const pp = (t?: TeamForm) => (t && t.gp > 0 ? t.pointPct : 0.5);
  const diff = pp(home) - pp(away);
  const winHome = clampPct(54 + diff * 25, 54);
  return {
    winProbabilityHome: Math.min(75, Math.max(30, winHome)),
    over15P1Prob: 55,
    bttsP1Prob: 30,
    drawTRProb: 23,
    over45Prob: 68,
    over55Prob: 50,
  };
}

// ─── Groq ────────────────────────────────────────────────────────────────────

function describeTeam(label: string, t?: TeamForm, venue?: "casa" | "fora") {
  if (!t || t.gp === 0) return `${label}: sem jogos disputados esta época (sem dados de forma).`;
  const rec = venue === "casa" ? `em casa ${t.homeRecord}` : `fora ${t.roadRecord}`;
  return (
    `${label}: ${t.gp} jogos, ${t.points} pts (${Math.round(t.pointPct * 100)}%), ` +
    `golos ${t.gfPg.toFixed(2)} marcados / ${t.gaPg.toFixed(2)} sofridos por jogo, ` +
    `últimos 10 (V-D-DP) ${t.l10} (GF ${t.l10Gf}, GA ${t.l10Ga}), ${rec}`
  );
}

function buildPrompt(date: string, games: NhlGame[], form: Map<string, TeamForm>) {
  const block = games
    .map((g) => {
      const tag = g.gameType === 1 ? " [PRÉ-ÉPOCA]" : g.gameType === 3 ? " [PLAYOFFS]" : "";
      return [
        `id=${g.id}${tag} | ${g.homeAbbr} (casa) vs ${g.awayAbbr} (fora) | ${g.startTimeUTC}`,
        `  ${describeTeam(`CASA ${g.homeAbbr}`, form.get(g.homeAbbr), "casa")}`,
        `  ${describeTeam(`FORA ${g.awayAbbr}`, form.get(g.awayAbbr), "fora")}`,
      ].join("\n");
    })
    .join("\n");

  return `És o motor estatístico do NHL Tipsterz. Estima probabilidades para os jogos da NHL de ${date}.

REGRAS:
- Usa APENAS os dados fornecidos abaixo. Não inventes lesões, alinhamentos, guarda-redes nem resultados.
- Se uma equipa não tem jogos disputados (início de época/pré-época), fica perto das médias da liga e diz isso no resumo; vantagem de jogar em casa ≈ 54%.
- Valores inteiros de 1 a 99 (percentagens).
- Referências aproximadas da liga: vitória da casa ~54%; empate no tempo regulamentar ~23%; 2+ golos no 1º período ~55%; ambas marcam no 1º período ~30%; 5+ golos no jogo ~68%; 6+ golos no jogo ~50%.
- analysisSummary: 1 a 2 frases em português de Portugal, baseadas só nos números fornecidos. Não menciones lesões.

CAMPOS (por jogo):
- winProbabilityHome: probabilidade de a equipa da casa vencer (inclui prolongamento/desempate).
- over15P1Prob: probabilidade de haver 2 ou mais golos no 1º período.
- bttsP1Prob: probabilidade de ambas as equipas marcarem no 1º período.
- drawTRProb: probabilidade de empate no tempo regulamentar (60 min).
- over45Prob: probabilidade de 5 ou mais golos no jogo (tempo regulamentar).
- over55Prob: probabilidade de 6 ou mais golos no jogo (tempo regulamentar).

JOGOS:
${block}

Responde EXCLUSIVAMENTE com JSON neste formato, com um objeto por jogo e o "id" exatamente como indicado:
{"games":[{"id":"...","winProbabilityHome":0,"over15P1Prob":0,"bttsP1Prob":0,"drawTRProb":0,"over45Prob":0,"over55Prob":0,"analysisSummary":"..."}]}`;
}

async function askGroq(apiKey: string, prompt: string): Promise<any[]> {
  const res = await fetchWithTimeout(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: "json_object" },
        temperature: 0.1,
                max_completion_tokens: 8000,
        reasoning_effort: "low",
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: "Gera o JSON pedido." },
        ],
      }),
    },
    22000
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Groq HTTP ${res.status}`);

  const content = String(data?.choices?.[0]?.message?.content ?? "{}")
    .replace(/```json|```/g, "")
    .trim();
  const parsed = JSON.parse(content);
  if (Array.isArray(parsed?.games)) return parsed.games;
  if (Array.isArray(parsed?.predictions)) return parsed.predictions;
  throw new Error("Resposta da IA sem lista de jogos.");
}

// ─── Montagem das previsões ──────────────────────────────────────────────────

function buildPredictions(games: NhlGame[], form: Map<string, TeamForm>, ai: any[] | null) {
  const byId = new Map<string, any>();
  for (const item of ai ?? []) if (item?.id != null) byId.set(String(item.id), item);

  let aiCount = 0;

  const predictions: Prediction[] = games.map((g) => {
    const home = form.get(g.homeAbbr);
    const away = form.get(g.awayAbbr);
    const base = baseline(home, away);
    const a = byId.get(String(g.id));
    if (a) aiCount++;

    const winHome = clampPct(a?.winProbabilityHome, base.winProbabilityHome);

    return {
      id: String(g.id),
      homeTeam: g.homeName,
      homeTeamAbbr: g.homeAbbr,
      homeRecordL10: home?.l10 ?? "0-0-0",
      awayTeam: g.awayName,
      awayTeamAbbr: g.awayAbbr,
      awayRecordL10: away?.l10 ?? "0-0-0",
      dateTime: g.startTimeUTC,
      winProbabilityHome: winHome,
      winProbabilityAway: 100 - winHome,
      over15P1Prob: clampPct(a?.over15P1Prob, base.over15P1Prob),
      bttsP1Prob: clampPct(a?.bttsP1Prob, base.bttsP1Prob),
      drawTRProb: clampPct(a?.drawTRProb, base.drawTRProb),
      over45Prob: clampPct(a?.over45Prob, base.over45Prob),
      over55Prob: clampPct(a?.over55Prob, base.over55Prob),
      analysisSummary:
        typeof a?.analysisSummary === "string" && a.analysisSummary.trim()
          ? a.analysisSummary.trim()
          : "Estimativa base a partir da classificação (sem análise de IA para este jogo).",
      injuries: { home: [], away: [] },
    };
  });

  return { predictions, aiCount };
}

// ─── Cache (Redis) ───────────────────────────────────────────────────────────

async function readCache(date: string): Promise<AnalysisPayload | null> {
  const raw = await redis.get(`${CACHE_PREFIX}${date}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.predictions) ? parsed : null;
  } catch {
    return null;
  }
}

async function clearCache(): Promise<number> {
  let cursor = "0";
  let removed = 0;
  for (let i = 0; i < 20; i++) {
    const r = await redis.scan(cursor, `${CACHE_PREFIX}*`, 100);
    if (!r) break;
    cursor = r[0];
    for (const key of r[1]) {
      await redis.del(key);
      removed++;
    }
    if (cursor === "0") break;
  }
  return removed;
}

// ─── Handlers ────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const date = String(body?.selectedDate ?? body?.date ?? "").trim();
    const force = body?.force === true;

    if (!isDate(date)) return json({ message: "Data inválida (usa YYYY-MM-DD)." }, 400);

    if (!force) {
      const cached = await readCache(date);
      if (cached) return json({ ...cached, meta: { ...cached.meta, cached: true } });
    }

    let games: NhlGame[];
    try {
      games = await fetchGames(date);
    } catch (e: any) {
      return json({ message: e?.message || "Não foi possível obter o calendário da NHL." }, 502);
    }

    if (games.length === 0) {
      return json({
        predictions: [],
        lastUpdated: new Date().toISOString(),
        meta: { source: "baseline", games: 0, note: "Sem jogos da NHL nesta data." },
      });
    }

    const form = await fetchForm();

    let ai: any[] | null = null;
    let aiError: string | null = null;
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      aiError = "GROQ_API_KEY não configurada na Vercel.";
    } else {
      try {
        ai = await askGroq(apiKey, buildPrompt(date, games, form));
      } catch (e: any) {
        aiError = e?.message || "Erro na IA.";
        console.error("[gemini] Groq falhou:", aiError);
      }
    }

    const { predictions, aiCount } = buildPredictions(games, form, ai);
    const usedAi = aiCount > 0;

    const payload: AnalysisPayload = {
      predictions,
      lastUpdated: new Date().toISOString(),
      meta: {
        source: usedAi ? "ai" : "baseline",
        games: predictions.length,
        ...(aiError ? { note: `IA indisponível (${aiError}). A mostrar estimativas base.` } : {}),
      },
    };

    // Só guardamos em cache resultados com IA, para não "congelar" estimativas base durante 8h.
    if (usedAi && aiCount === games.length) {
      await redis.setPx(`${CACHE_PREFIX}${date}`, JSON.stringify(payload), CACHE_TTL_MS);
    }

    return json(payload);
  } catch (e: any) {
    return json({ message: e?.message || "Erro interno no servidor." }, 500);
  }
}

export async function DELETE() {
  const removed = await clearCache();
  return json({ success: true, removed, message: "Cache limpa!" });
}
