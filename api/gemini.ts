import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "redis";

export const config = { runtime: "nodejs" };

// Cache do Gemini (predictions) e das lesões
const GEMINI_TTL_MS = 1000 * 60 * 60 * 12; // 12h
const INJURIES_TTL_MS = 1000 * 60 * 60 * 6; // 6h

// Rate limit
const RL_WINDOW_SEC = 600; // 10 min
const RL_LIMIT = 30; // 30 req / 10 min / IP

// Intervalo permitido para selectedDate (para evitar abuso)
const MAX_DAYS_PAST = 30;
const MAX_DAYS_FUTURE = 7;

// ---------------- REDIS ----------------
let _redis: ReturnType<typeof createClient> | null = null;

async function getRedis() {
  if (_redis) return _redis;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  const client = createClient({ url });
  client.on("error", (err) => console.error("Redis error:", err));
  await client.connect();
  _redis = client;
  return _redis;
}

// ---------------- HELPERS ----------------
function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function norm(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

function normAbbr(abbr: string) {
  return (abbr || "").toUpperCase().trim();
}

function defaultSuggestions() {
  return {
    tripleWin: [],
    tripleOver15P1: [],
    doubleOver15P1: [],
    drawSuggestions: [],
    quadrupleOver45: [],
    over55Suggestions: [],
  };
}

function jsonError(res: VercelResponse, status: number, code: string, message: string, details?: any) {
  return res.status(status).json({
    code,
    message,
    details,
    predictions: [],
    suggestions: defaultSuggestions(),
    lastUpdated: new Date().toISOString(),
  });
}

function getClientIp(req: VercelRequest) {
  const xff = String(req.headers["x-forwarded-for"] || "");
  const ip = xff.split(",")[0].trim();
  return ip || String((req as any).socket?.remoteAddress || "unknown");
}

async function rateLimit(redis: any, ip: string) {
  const key = `rl:${ip}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, RL_WINDOW_SEC);
  return { ok: count <= RL_LIMIT, count };
}

function validateSelectedDate(selectedDate: unknown) {
  if (typeof selectedDate !== "string") return { ok: false, error: "selectedDate obrigatório (YYYY-MM-DD)" };

  const s = selectedDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return { ok: false, error: "Formato inválido. Usa YYYY-MM-DD." };
  }

  const [yyyy, mm, dd] = s.split("-").map((x) => Number(x));
  if (!Number.isFinite(yyyy) || !Number.isFinite(mm) || !Number.isFinite(dd)) {
    return { ok: false, error: "Data inválida." };
  }

  // Validação calendário básica
  const dt = new Date(Date.UTC(yyyy, mm - 1, dd));
  if (dt.getUTCFullYear() !== yyyy || dt.getUTCMonth() !== mm - 1 || dt.getUTCDate() !== dd) {
    return { ok: false, error: "Data inválida." };
  }

  // Limitar intervalo (para evitar abuso e custo)
  const now = new Date();
  const todayUtcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const diffDays = Math.round((dt.getTime() - todayUtcMidnight.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < -MAX_DAYS_PAST) return { ok: false, error: `Data demasiado antiga (máx. ${MAX_DAYS_PAST} dias).` };
  if (diffDays > MAX_DAYS_FUTURE) return { ok: false, error: `Data demasiado no futuro (máx. ${MAX_DAYS_FUTURE} dias).` };

  return { ok: true, value: s, diffDays };
}

async function fetchWithTimeout(url: string, init: RequestInit | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...(init || {}), signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

// ---------------- NHL SCHEDULE (real) ----------------
type ScheduleGame = {
  id: number;
  startTimeUTC?: string;
  homeTeam?: { abbrev?: string; placeName?: { default?: string } };
  awayTeam?: { abbrev?: string; placeName?: { default?: string } };
};

async function fetchNhlScheduleGames(date: string): Promise<ScheduleGame[]> {
  const url = `https://api-web.nhle.com/v1/schedule/${date}`;
  const res = await fetchWithTimeout(url, undefined, 8000);
  if (!res.ok) return [];
  const data = await res.json();

  const games: ScheduleGame[] = [];
  if (!data?.gameWeek?.length) return games;

  for (const day of data.gameWeek) {
    if (!Array.isArray(day?.games)) continue;
    for (const g of day.games) if (g?.id) games.push(g);
  }
  return games;
}

// ---------------- TEAM NAME MAP (para casar ESPN->ABBR) ----------------
const TEAM_FULLNAMES: Record<string, string[]> = {
  ANA: ["anaheim ducks", "ducks"],
  BOS: ["boston bruins", "bruins"],
  BUF: ["buffalo sabres", "sabres"],
  CAR: ["carolina hurricanes", "hurricanes"],
  CBJ: ["columbus blue jackets", "blue jackets", "bluejackets"],
  CGY: ["calgary flames", "flames"],
  CHI: ["chicago blackhawks", "blackhawks"],
  COL: ["colorado avalanche", "avalanche"],
  DAL: ["dallas stars", "stars"],
  DET: ["detroit red wings", "red wings", "redwings"],
  EDM: ["edmonton oilers", "oilers"],
  FLA: ["florida panthers", "panthers"],
  LAK: ["los angeles kings", "la kings", "kings"],
  MIN: ["minnesota wild", "wild"],
  MTL: ["montreal canadiens", "canadiens"],
  NJD: ["new jersey devils", "devils"],
  NSH: ["nashville predators", "predators"],
  NYI: ["new york islanders", "islanders"],
  NYR: ["new york rangers", "rangers"],
  OTT: ["ottawa senators", "senators"],
  PHI: ["philadelphia flyers", "flyers"],
  PIT: ["pittsburgh penguins", "penguins"],
  SEA: ["seattle kraken", "kraken"],
  SJS: ["san jose sharks", "sharks"],
  STL: ["st. louis blues", "st louis blues", "blues"],
  TBL: ["tampa bay lightning", "lightning"],
  TOR: ["toronto maple leafs", "maple leafs", "leafs"],
  VAN: ["vancouver canucks", "canucks"],
  VGK: ["vegas golden knights", "golden knights", "knights"],
  WPG: ["winnipeg jets", "jets"],
  WSH: ["washington capitals", "capitals"],
  UTA: ["utah hockey club", "utah"],
  ARI: ["arizona coyotes", "coyotes"],
};

function guessAbbrFromTeamName(teamName: string): string | null {
  const t = norm(teamName);
  if (!t) return null;

  for (const [abbr, names] of Object.entries(TEAM_FULLNAMES)) {
    for (const n of names) {
      if (t.includes(n)) return abbr;
    }
  }
  return null;
}

// ---------------- ESPN HTML -> GEMINI (extract injuries) ----------------
type ExtractedTeamInjuries = {
  team: string;
  injuries: string[];
};

type InjuriesExtractResult = {
  teams: ExtractedTeamInjuries[];
};

async function fetchEspnBrazilInjuriesHtml(): Promise<{ ok: boolean; status: number; url: string; html: string }> {
  const url = "https://www.espn.com.br/nhl/lesoes";
  const res = await fetchWithTimeout(
    url,
    {
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "pt-PT,pt;q=0.9,en;q=0.7",
        "user-agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
      },
    },
    12000
  );

  const html = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, url, html };
}

async function extractInjuriesWithGemini(apiKey: string, html: string): Promise<InjuriesExtractResult> {
  const ai = new GoogleGenAI({ apiKey });

  const MAX_CHARS = 180_000;
  const clipped = html.length > MAX_CHARS ? html.slice(0, MAX_CHARS) : html;

  const prompt = `
Vais receber HTML da página de lesões da NHL da ESPN Brasil.
A tua tarefa é APENAS extrair as lesões listadas no HTML. NÃO INVENTES NADA.

Regras:
- Se não encontrares uma equipa ou jogador no HTML, não cries entradas.
- Devolve APENAS JSON válido.
- Formato EXATO:
{
  "teams": [
    { "team": "string", "injuries": ["string", "..."] }
  ]
}

O campo "team" deve ser o nome da equipa como aparece no HTML (ex: "Boston Bruins").
Cada item em "injuries" deve ser uma linha curta por jogador (ex: "Nome (OUT) - Lesão" ou "Nome - Lesão" se o estado não existir).
Se não encontrares lesões, devolve: { "teams": [] }

HTML:
${clipped}
`.trim();

  const resp = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: { responseMimeType: "application/json" },
  });

  const parsed = safeJsonParse(resp.text || "");
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as any).teams)) {
    return { teams: [] };
  }

  const teams: ExtractedTeamInjuries[] = (parsed as any).teams
    .filter((x: any) => x && typeof x.team === "string" && Array.isArray(x.injuries))
    .map((x: any) => ({
      team: String(x.team),
      injuries: x.injuries.map((s: any) => String(s)).filter((s: string) => s.trim().length > 0),
    }));

  return { teams };
}

async function getInjuriesByAbbr(apiKey: string, teamsOnDate: Set<string>) {
  const redis = await getRedis();
  const cacheKey = "espn_br_injuries_extracted_v1";

  if (redis) {
    try {
      const raw = await redis.get(cacheKey);
      const cached = raw ? safeJsonParse(raw) : null;
      if (cached?.savedAt && Date.now() - cached.savedAt < INJURIES_TTL_MS && cached?.data?.teams) {
        const extracted: InjuriesExtractResult = cached.data;
        const mapped = mapExtractedToAbbr(extracted, teamsOnDate);
        return {
          ...mapped,
          meta: { hit: true, key: cacheKey, savedAt: cached.savedAt },
        };
      }
    } catch (e) {
      console.error("Injuries cache read failed:", e);
    }
  }

  const htmlRes = await fetchEspnBrazilInjuriesHtml();
  const extracted = await extractInjuriesWithGemini(apiKey, htmlRes.html);
  const mapped = mapExtractedToAbbr(extracted, teamsOnDate);

  if (redis) {
    try {
      await redis.set(cacheKey, JSON.stringify({ savedAt: Date.now(), data: extracted }), { PX: INJURIES_TTL_MS });
    } catch (e) {
      console.error("Injuries cache save failed:", e);
    }
  }

  return {
    ...mapped,
    meta: {
      hit: false,
      key: cacheKey,
      espn: { ok: htmlRes.ok, status: htmlRes.status, url: htmlRes.url, htmlLen: htmlRes.html.length },
    },
  };
}

function mapExtractedToAbbr(extracted: InjuriesExtractResult, teamsOnDate: Set<string>) {
  const injuriesByTeam: Record<string, string[]> = {};
  const debug: Record<string, any> = {};

  for (const abbr of teamsOnDate) injuriesByTeam[abbr] = [];

  for (const t of extracted.teams) {
    const abbr = guessAbbrFromTeamName(t.team);
    if (!abbr) continue;
    if (!teamsOnDate.has(abbr)) continue;

    injuriesByTeam[abbr] = t.injuries;
    debug[abbr] = { matchedFrom: t.team, count: t.injuries.length };
  }

  const injuriesCounts = Object.fromEntries(
    Object.entries(injuriesByTeam).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0])
  );

  return { injuriesByTeam, injuriesCounts, debugMatch: debug, extractedTeams: extracted.teams.length };
}

// ---------------- GEMINI PREDICTIONS ----------------
async function generatePredictionsWithFallback(ai: GoogleGenAI, prompt: string) {
  const modelsToTry = ["gemini-3-flash-preview", "gemini-3-pro-preview", "gemini-2.0-flash"];
  let lastErr: any = null;

  for (const model of modelsToTry) {
    try {
      const resp = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: "application/json" },
      });

      const parsed = safeJsonParse(resp.text || "") ?? {};
      return { modelUsed: model, parsed };
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message ?? e);
      if (msg.toLowerCase().includes("not found")) continue;
      throw e;
    }
  }

  throw new Error(`Nenhum modelo disponível. Último erro: ${String(lastErr?.message ?? lastErr)}`);
}

function mergeInjuriesIntoPredictions(geminiObj: any, injuriesByTeam: Record<string, string[]>) {
  const root = geminiObj && typeof geminiObj === "object" ? geminiObj : {};
  const predictions = Array.isArray(root.predictions) ? root.predictions : [];
  const suggestions =
    root.suggestions && typeof root.suggestions === "object" ? root.suggestions : defaultSuggestions();

  const mergedPredictions = predictions.map((p: any) => {
    const homeAbbr = normAbbr(String(p?.homeTeamAbbr ?? ""));
    const awayAbbr = normAbbr(String(p?.awayTeamAbbr ?? ""));

    return {
      id: String(p?.id ?? ""),
      homeTeam: String(p?.homeTeam ?? ""),
      homeTeamAbbr: homeAbbr,
      homeRecordL10: String(p?.homeRecordL10 ?? "N/A"),
      awayTeam: String(p?.awayTeam ?? ""),
      awayTeamAbbr: awayAbbr,
      awayRecordL10: String(p?.awayRecordL10 ?? "N/A"),
      dateTime: String(p?.dateTime ?? ""),
      winProbabilityHome: Number(p?.winProbabilityHome ?? 0),
      winProbabilityAway: Number(p?.winProbabilityAway ?? 0),
      over15P1Prob: Number(p?.over15P1Prob ?? 0),
      bttsP1Prob: Number(p?.bttsP1Prob ?? 0),
      drawTRProb: Number(p?.drawTRProb ?? 0),
      over45Prob: Number(p?.over45Prob ?? 0),
      over55Prob: Number(p?.over55Prob ?? 0),
      analysisSummary: String(p?.analysisSummary ?? ""),
      injuries: {
        home: injuriesByTeam[homeAbbr] ?? [],
        away: injuriesByTeam[awayAbbr] ?? [],
      },
    };
  });

  const sug = suggestions;
  const normalizedSuggestions = {
    tripleWin: Array.isArray(sug.tripleWin) ? sug.tripleWin.map(String) : [],
    tripleOver15P1: Array.isArray(sug.tripleOver15P1) ? sug.tripleOver15P1.map(String) : [],
    doubleOver15P1: Array.isArray(sug.doubleOver15P1) ? sug.doubleOver15P1.map(String) : [],
    drawSuggestions: Array.isArray(sug.drawSuggestions)
      ? sug.drawSuggestions.map((d: any) => ({ game: String(d?.game ?? ""), explanation: String(d?.explanation ?? "") }))
      : [],
    quadrupleOver45: Array.isArray(sug.quadrupleOver45) ? sug.quadrupleOver45.map(String) : [],
    over55Suggestions: Array.isArray(sug.over55Suggestions) ? sug.over55Suggestions.map(String) : [],
  };

  return {
    predictions: mergedPredictions,
    suggestions: normalizedSuggestions,
    lastUpdated: new Date().toISOString(),
  };
}

// ---------------- CORS HELPERS ----------------
function setCors(req: VercelRequest, res: VercelResponse) {
  const origin = String(req.headers.origin ?? "");

  const allowlist = new Set([
    "capacitor://localhost",
    "http://localhost:3000",
    "http://localhost",
    "https://nhl-tipsterz.vercel.app",
  ]);

  // Se não houver Origin (ex: curl, server-to-server), permite.
  if (!origin) {
    res.setHeader("Access-Control-Allow-Origin", "https://nhl-tipsterz.vercel.app");
  } else if (!allowlist.has(origin)) {
    // Origin existe mas não é permitida
    // Nota: não respondemos com "*" para não permitir sites aleatórios chamarem a tua API
    res.setHeader("Access-Control-Allow-Origin", "https://nhl-tipsterz.vercel.app");
    res.setHeader("Vary", "Origin");
    // devolvemos 403 no handler para ficar explícito
    (res as any).__corsBlocked = true;
  } else {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// ---------------- HANDLER ----------------
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    setCors(req, res);

    if ((res as any).__corsBlocked) {
      return jsonError(res, 403, "CORS_BLOCKED", "Origin não permitida.");
    }

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    if (req.method !== "POST") return jsonError(res, 405, "METHOD_NOT_ALLOWED", "Use POST.");

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return jsonError(res, 500, "MISSING_API_KEY", "GEMINI_API_KEY não definida.");
    }

    const redis = await getRedis();

    // Rate limit (se houver Redis)
    if (redis) {
      const ip = getClientIp(req);
      const rl = await rateLimit(redis, ip);
      if (!rl.ok) {
        return jsonError(res, 429, "RATE_LIMIT", "Muitos pedidos. Tenta novamente mais tarde.", {
          windowSec: RL_WINDOW_SEC,
          limit: RL_LIMIT,
        });
      }
    }

    const body = typeof req.body === "string" ? safeJsonParse(req.body) : req.body ?? {};
    const selectedDateRaw = (body as any)?.selectedDate;

    const v = validateSelectedDate(selectedDateRaw);
    if (!v.ok) {
      return jsonError(res, 400, "BAD_REQUEST", v.error);
    }
    const selectedDate = v.value;
    const diffDays = (v as any).diffDays as number;

    // TTL dinâmico (mais curto para datas “próximas”)
    const geminiTtlMs = Math.abs(diffDays) <= 1 ? 1000 * 60 * 60 * 2 : GEMINI_TTL_MS;

    // 1) schedule real
    const scheduleGames = await fetchNhlScheduleGames(selectedDate);
    if (!scheduleGames.length) {
      return res.status(200).json({
        predictions: [],
        suggestions: defaultSuggestions(),
        lastUpdated: new Date().toISOString(),
        meta: { selectedDate, note: "Sem jogos na data." },
      });
    }

    // 2) teams no dia
    const teamAbbrs = new Set<string>();
    for (const g of scheduleGames) {
      const h = normAbbr(g.homeTeam?.abbrev || "");
      const a = normAbbr(g.awayTeam?.abbrev || "");
      if (h) teamAbbrs.add(h);
      if (a) teamAbbrs.add(a);
    }

    // 3) Injuries (ESPN HTML -> Gemini extract) com cache 6h
    const injuriesPack = await getInjuriesByAbbr(apiKey, teamAbbrs);

    // 4) Gemini predictions (cache)
    const geminiCacheKey = `gemini_only:${selectedDate}`;
    let geminiObj: any = null;
    let geminiHit = false;

    if (redis) {
      try {
        const raw = await redis.get(geminiCacheKey);
        const cached = raw ? safeJsonParse(raw) : null;
        if (cached?.savedAt && Date.now() - cached.savedAt < geminiTtlMs) {
          geminiObj = cached.data;
          geminiHit = true;
        }
      } catch (e) {
        console.error("Gemini cache read failed:", e);
      }
    }

    if (!geminiObj) {
      const ai = new GoogleGenAI({ apiKey });

      const gamesForAI = scheduleGames.map((g) => ({
        id: String(g.id),
        dateTime: g.startTimeUTC ?? "",
        homeTeamAbbr: normAbbr(g.homeTeam?.abbrev || ""),
        awayTeamAbbr: normAbbr(g.awayTeam?.abbrev || ""),
      }));

      const prompt = `
Responde APENAS com JSON válido (sem texto extra).

Analisa estes jogos da NHL para ${selectedDate} e devolve EXACTAMENTE este formato:
{
  "predictions": [
    {
      "id": "string",
      "homeTeam": "string",
      "homeTeamAbbr": "string",
      "homeRecordL10": "string",
      "awayTeam": "string",
      "awayTeamAbbr": "string",
      "awayRecordL10": "string",
      "dateTime": "string",
      "winProbabilityHome": 0,
      "winProbabilityAway": 0,
      "over15P1Prob": 0,
      "bttsP1Prob": 0,
      "drawTRProb": 0,
      "over45Prob": 0,
      "over55Prob": 0,
      "analysisSummary": "string"
    }
  ],
  "suggestions": {
    "tripleWin": ["string"],
    "tripleOver15P1": ["string"],
    "doubleOver15P1": ["string"],
    "drawSuggestions": [{ "game": "string", "explanation": "string" }],
    "quadrupleOver45": ["string"],
    "over55Suggestions": ["string"]
  }
}

Jogos (IDs e abreviações):
${JSON.stringify(gamesForAI, null, 2)}
`.trim();

      const { modelUsed, parsed } = await generatePredictionsWithFallback(ai, prompt);
      geminiObj = { ...parsed, modelUsed };

      if (redis) {
        try {
          await redis.set(geminiCacheKey, JSON.stringify({ savedAt: Date.now(), data: geminiObj }), { PX: geminiTtlMs });
        } catch (e) {
          console.error("Gemini cache save failed:", e);
        }
      }
    }

    // 5) Merge final
    const finalData: any = mergeInjuriesIntoPredictions(geminiObj, injuriesPack.injuriesByTeam);

    const debug = String((req.query as any)?.debug ?? "") === "1";

    if (debug) {
      finalData.meta = {
        selectedDate,
        cache: { geminiHit, geminiKey: geminiCacheKey, injuries: injuriesPack.meta },
        injuriesCounts: injuriesPack.injuriesCounts,
        injuriesMatch: injuriesPack.debugMatch,
        extractedTeams: injuriesPack.extractedTeams,
        teamsOnDate: Array.from(teamAbbrs),
      };
    }

    return res.status(200).json(finalData);
  } catch (err: any) {
    return jsonError(res, 500, "INTERNAL", "Erro interno", String(err?.message ?? err));
  }
}
