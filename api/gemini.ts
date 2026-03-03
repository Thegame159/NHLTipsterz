import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI } from "@google/genai";
import crypto from "crypto";
import { redis } from "./_redis.js";

export const config = { runtime: "nodejs" };

// Cache FIXA para tudo (Gemini + Lesões)
const CACHE_TTL_MS = 1000 * 60 * 60 * 9; // 9 horas

// Rate limit
const RL_WINDOW_SEC = 600; // 10 min
const RL_LIMIT = 30; // 30 req / 10 min / IP

// Intervalo permitido para selectedDate (para evitar abuso)
const MAX_DAYS_PAST = 30;
const MAX_DAYS_FUTURE = 20;

// ---------------- HELPERS ----------------
function safeJsonParse(input: any) {
  try {
    let s = "";
    if (typeof input === "string") s = input;
    else if (input && typeof (input as any).toString === "function") s = (input as any).toString();
    if (!s) return null;
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function norm(s: string) {
  // Compatível com runtimes que não suportam \p{Diacritic}
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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
    ok: false,
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

async function rateLimit(ip: string) {
  const key = `rl:${ip}`;
  const count = await redis.incr(key);
  if (count === null) return { ok: true, count: 0, skipped: true }; // sem Redis => sem RL
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

  const dt = new Date(Date.UTC(yyyy, mm - 1, dd));
  if (dt.getUTCFullYear() !== yyyy || dt.getUTCMonth() !== mm - 1 || dt.getUTCDate() !== dd) {
    return { ok: false, error: "Data inválida." };
  }

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

function sha256(text: string) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function isRetryableGeminiError(e: any) {
  const msg = String(e?.message ?? e ?? "").toLowerCase();
  const status = e?.status ?? e?.code ?? e?.response?.status;

  return (
    status === 503 ||
    msg.includes("unavailable") ||
    msg.includes("high demand") ||
    msg.includes("503")
  );
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  baseMs = 900
) {
  let lastErr: any;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;

      if (attempt === retries || !isRetryableGeminiError(e)) {
        throw e;
      }

      const backoff = baseMs * Math.pow(2, attempt);
      await sleep(backoff);
    }
  }

  throw lastErr;
}
// ---------------- NHL SCHEDULE (real) ----------------
type ScheduleGame = {
  id: number;
  startTimeUTC?: string;
  homeTeam?: { abbrev?: string; placeName?: { default?: string } };
  awayTeam?: { abbrev?: string; placeName?: { default?: string } };
};

async function fetchNhlScheduleGames(date: string): Promise<ScheduleGame[]> {
  const url = `https://api-web.nhle.com/v1/score/${date}`;
  const res = await fetchWithTimeout(url, undefined, 8000);

  if (!res.ok) return [];

  const data = await res.json();
  const games: ScheduleGame[] = [];

  if (!Array.isArray(data?.games)) return games;

  for (const g of data.games) {
    if (!g?.id) continue;

    games.push({
      id: g.id,
      startTimeUTC: g.startTimeUTC,
      homeTeam: { abbrev: g.homeTeam?.abbrev },
      awayTeam: { abbrev: g.awayTeam?.abbrev },
    });
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
type ExtractedTeamInjuries = { team: string; injuries: string[] };
type InjuriesExtractResult = { teams: ExtractedTeamInjuries[] };

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

function mergeExtracted(results: InjuriesExtractResult[]): InjuriesExtractResult {
  const map = new Map<string, Set<string>>();

  for (const r of results) {
    for (const t of r.teams || []) {
      const team = String(t.team || "").trim();
      if (!team) continue;

      const set = map.get(team) ?? new Set<string>();
      for (const inj of t.injuries || []) {
        const s = String(inj || "").trim();
        if (s) set.add(s);
      }
      map.set(team, set);
    }
  }

  return {
    teams: Array.from(map.entries()).map(([team, set]) => ({
      team,
      injuries: Array.from(set),
    })),
  };
}

async function extractInjuriesChunkWithGemini(ai: GoogleGenAI, chunk: string): Promise<InjuriesExtractResult> {
  const prompt = `
Vais receber um excerto de HTML da página de lesões da NHL (ESPN Brasil).
A tua tarefa é APENAS extrair as lesões listadas NESSE HTML. NÃO INVENTES NADA.

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
${chunk}
`.trim();

 const resp = await withRetry(() =>
  ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: { responseMimeType: "application/json" },
  })
);

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

async function extractInjuriesWithGemini(apiKey: string, html: string): Promise<InjuriesExtractResult> {
  const ai = new GoogleGenAI({ apiKey });

  const MAX_CHARS_PER_CHUNK = 90_000;
  const OVERLAP = 2_000;

  const chunks: string[] = [];
  if (!html) return { teams: [] };

  let i = 0;
  while (i < html.length) {
    const end = Math.min(i + MAX_CHARS_PER_CHUNK, html.length);
    chunks.push(html.slice(i, end));
    if (end >= html.length) break;
    i = Math.max(0, end - OVERLAP);
  }

  const MAX_CHUNKS = 6;
  const clippedChunks = chunks.slice(0, MAX_CHUNKS);

  const partials: InjuriesExtractResult[] = [];
  for (const c of clippedChunks) {
    try {
      partials.push(await extractInjuriesChunkWithGemini(ai, c));
    } catch (e) {
      console.error("Chunk extraction failed:", e);
    }
  }

  return mergeExtracted(partials);
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

async function getInjuriesByAbbr(
  apiKey: string,
  teamsOnDate: Set<string>,
  opts: { injuriesTtlMs: number; refresh: boolean }
) {
  const todayKey = new Date().toISOString().slice(0, 10);
  const cacheKey = `espn_br_injuries_extracted_v2:${todayKey}`;

  if (!opts.refresh) {
    const raw = await redis.get(cacheKey);
    const cached = raw ? safeJsonParse(raw) : null;
    if (cached?.savedAt && Date.now() - cached.savedAt < opts.injuriesTtlMs && cached?.data?.teams) {
      const extracted: InjuriesExtractResult = cached.data;
      const mapped = mapExtractedToAbbr(extracted, teamsOnDate);
      return {
        ...mapped,
        meta: { hit: true, key: cacheKey, savedAt: cached.savedAt, htmlHash: cached.htmlHash ?? null },
      };
    }
  }

  const htmlRes = await fetchEspnBrazilInjuriesHtml();
  const htmlHash = sha256(htmlRes.html || "");
  const extracted = await extractInjuriesWithGemini(apiKey, htmlRes.html);
  const mapped = mapExtractedToAbbr(extracted, teamsOnDate);

  await redis.setPx(cacheKey, JSON.stringify({ savedAt: Date.now(), htmlHash, data: extracted }), opts.injuriesTtlMs);

  return {
    ...mapped,
    meta: {
      hit: false,
      key: cacheKey,
      htmlHash,
      espn: { ok: htmlRes.ok, status: htmlRes.status, url: htmlRes.url, htmlLen: htmlRes.html.length },
    },
  };
}

// ---------------- GEMINI PREDICTIONS ----------------
async function generatePredictionsWithFallback(ai: GoogleGenAI, prompt: string) {
  const modelsToTry = ["gemini-2.5-flash"];
  let lastErr: any = null;

  for (const model of modelsToTry) {
    try {
     const resp = await withRetry(() =>
  ai.models.generateContent({
    model,
    contents: prompt,
    config: { responseMimeType: "application/json" },
  })
);
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
function normalizeProb(value: any) {
  const n = Number(value ?? 0);

  if (!isFinite(n) || n < 0) return 0;

  if (n <= 1) return n * 100;

  return n;
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
      winProbabilityHome: normalizeProb(p?.winProbabilityHome),
winProbabilityAway: normalizeProb(p?.winProbabilityAway),
over15P1Prob: normalizeProb(p?.over15P1Prob),
bttsP1Prob: normalizeProb(p?.bttsP1Prob),
drawTRProb: normalizeProb(p?.drawTRProb),
over45Prob: normalizeProb(p?.over45Prob),
over55Prob: normalizeProb(p?.over55Prob),
      analysisSummary: String(p?.analysisSummary ?? ""),
      injuries: {
        home: injuriesByTeam[homeAbbr] ?? [],
        away: injuriesByTeam[awayAbbr] ?? [],
      },
    };
  });

  const sug = suggestions as any;
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
function buildSuggestions(predictions: any[]) {
  const format = (g: any) => `${g.homeTeamAbbr} vs ${g.awayTeamAbbr}`;

  const sortByMaxWin = (a: any, b: any) =>
    Math.max(b.winProbabilityHome, b.winProbabilityAway) -
    Math.max(a.winProbabilityHome, a.winProbabilityAway);

  const sortBy = (key: string) => (a: any, b: any) =>
    Number(b?.[key] ?? 0) - Number(a?.[key] ?? 0);

  const byWin = [...predictions].sort(sortByMaxWin);
const byOver15 = [...predictions].sort(sortBy("over15P1Prob"));
const byOver45 = [...predictions].sort(sortBy("over45Prob"));
const byOver55 = [...predictions].sort(sortBy("over55Prob"));
const byDraw  = [...predictions].sort(sortBy("drawTRProb"));
let tripleOver15: any[] = [];
let doubleOver15: any[] = [];

if (byOver15.length >= 3) {
  tripleOver15 = byOver15.slice(0, 3);
  const tripleIds = new Set(tripleOver15.map((g: any) => String(g.id)));

  doubleOver15 = byOver15
    .filter((g: any) => !tripleIds.has(String(g.id)))
    .slice(0, 2);
} else {
  // menos de 3 jogos => só faz dupla com os 2 melhores
  doubleOver15 = byOver15.slice(0, 2);
}

  return {
tripleWin: byWin
  .filter((g: any) =>
    Math.max(g.winProbabilityHome, g.winProbabilityAway) >= 55
  )
  .slice(0, 3)
  .map((g: any) =>
    g.winProbabilityHome >= g.winProbabilityAway
      ? g.homeTeamAbbr
      : g.awayTeamAbbr
  ),
   tripleOver15P1: byOver15
  .filter((g: any) => g.over15P1Prob >= 60)
  .slice(0, 3)
  .map(format),
doubleOver15P1: doubleOver15.length === 2 ? doubleOver15.map(format) : [],
   quadrupleOver45: byOver45
  .slice(0, Math.min(4, byOver45.length))
  .map(format),

over55Suggestions: byOver55
  .slice(0, Math.min(4, byOver55.length))
  .map(format),
   drawSuggestions: byDraw
  .filter((g: any) =>
    g.drawTRProb >= 20 &&
    g.drawTRProb <= 30 &&
    Math.abs(g.winProbabilityHome - g.winProbabilityAway) <= 15
  )
  .slice(0, 2)
  .map((g: any) => ({
    game: format(g),
    explanation: "Jogo equilibrado com probabilidade realista de empate.",
  })),
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

  if (!origin) {
    res.setHeader("Access-Control-Allow-Origin", "https://nhl-tipsterz.vercel.app");
  } else if (!allowlist.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", "https://nhl-tipsterz.vercel.app");
    res.setHeader("Vary", "Origin");
    (res as any).__corsBlocked = true;
  } else {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// ---------------- HANDLER ----------------
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    setCors(req, res);

    if ((res as any).__corsBlocked) {
      return jsonError(res, 403, "CORS_BLOCKED", "Origin não permitida.");
    }

    if (req.method === "OPTIONS") return res.status(200).end();

    // ✅ Healthcheck para veres logo env + redis
    if (req.method === "GET") {
      const hasApiKey = !!process.env.GEMINI_API_KEY;
      const hasRedisRestUrl = !!process.env.REDIS_REST_URL;
      const hasRedisRestToken = !!process.env.REDIS_REST_TOKEN;

      // tenta um ping leve ao redis (set/get)
      let redisOk: boolean | null = null;
      try {
        const k = "health:ping";
        await redis.setPx(k, "1", 5000);
        const v = await redis.get(k);
        redisOk = v === "1";
      } catch {
        redisOk = false;
      }

      return res.status(200).json({
        ok: true,
        message: "Gemini endpoint alive",
        node: process.version,
        hasApiKey,
        hasRedisRestUrl,
        hasRedisRestToken,
        redisOk,
      });
    }

    if (req.method !== "POST") return jsonError(res, 405, "METHOD_NOT_ALLOWED", "Use POST.");

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return jsonError(res, 500, "MISSING_API_KEY", "GEMINI_API_KEY não definida.");

    // Rate limit (se Redis funcionar)
    const ip = getClientIp(req);
    const rl = await rateLimit(ip);
    if (!rl.ok) {
      return jsonError(res, 429, "RATE_LIMIT", "Muitos pedidos. Tenta novamente mais tarde.", {
        windowSec: RL_WINDOW_SEC,
        limit: RL_LIMIT,
      });
    }

    const body = typeof req.body === "string" ? safeJsonParse(req.body) : req.body ?? {};
    const selectedDateRaw = (body as any)?.selectedDate;

    const v = validateSelectedDate(selectedDateRaw);
    if (!v.ok) return jsonError(res, 400, "BAD_REQUEST", v.error);

    const selectedDate = v.value;
    const diffDays = (v as any).diffDays as number;

    const geminiTtlMs = CACHE_TTL_MS;
    const injuriesTtlMs = CACHE_TTL_MS;

    const refresh = String((req.query as any)?.refresh ?? "") === "1";

  // 1) schedule real
const scheduleGames = await fetchNhlScheduleGames(selectedDate);

// 👇 ADICIONA ISTO AQUI
console.log("SELECTED DATE:", selectedDate);
console.log(
  "SCHEDULE GAMES:",
  scheduleGames.map(g => ({
    id: g.id,
    home: g.homeTeam?.abbrev,
    away: g.awayTeam?.abbrev,
    start: g.startTimeUTC
  }))
);

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

    // 3) Injuries
    const injuriesPack = await getInjuriesByAbbr(apiKey, teamAbbrs, { injuriesTtlMs, refresh });

    // 4) Gemini predictions cache
    const geminiCacheKey = `gemini_only:v2:${selectedDate}`;
    let geminiObj: any = null;
    let geminiHit = false;

    if (!refresh) {
      const raw = await redis.get(geminiCacheKey);
      const cached = raw ? safeJsonParse(raw) : null;
      if (cached?.savedAt && Date.now() - cached.savedAt < geminiTtlMs) {
  geminiHit = true;

  return res.status(200).json(cached.data);
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

Regras obrigatórias:

- Usa percentagens entre 0 e 100 (não valores decimais entre 0 e 1).
- A soma de winProbabilityHome + winProbabilityAway + drawTRProb deve ser aproximadamente 100.
- Na NHL, a probabilidade de empate no tempo regulamentar (drawTRProb) normalmente situa-se entre 17% e 30%.
- Só sai desse intervalo se houver uma razão estatística muito forte.
- Evita valores extremos irrealistas (ex: 90% vitória em jogos equilibrados).
- Mantém coerência matemática e realismo estatístico.
- Se uma equipa é favorita clara, aumenta winProbability mas mantém draw dentro de intervalo plausível.
- Baseia as estimativas em forma recente (last 10), equilíbrio ofensivo/defensivo e contexto geral típico da NHL.

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

    
    }

// 5) Merge final
const finalData: any = mergeInjuriesIntoPredictions(geminiObj, injuriesPack.injuriesByTeam);

// 🇵🇹 Filtrar apenas jogos entre 23:00 e 05:00 (hora de Portugal)
finalData.predictions = finalData.predictions.filter((p: any) => {
  if (!p.dateTime) return false;

  const gameDate = new Date(p.dateTime);

  const ptHour = Number(
    gameDate.toLocaleString("en-GB", {
      timeZone: "Europe/Lisbon",
      hour: "2-digit",
      hour12: false,
    })
  );

  return ptHour >= 23 || ptHour <= 5;
});

// gerar sugestões com base nesses jogos
finalData.suggestions = buildSuggestions(finalData.predictions);
     await redis.setPx(
  geminiCacheKey,
  JSON.stringify({ savedAt: Date.now(), data: finalData }),
  geminiTtlMs
);
    
    const debug = String((req.query as any)?.debug ?? "") === "1";
    if (debug) {
      finalData.meta = {
        selectedDate,
        refresh,
        cache: { geminiHit, geminiKey: geminiCacheKey, injuries: injuriesPack.meta },
        injuriesTtlMs,
        injuriesCounts: injuriesPack.injuriesCounts,
        injuriesMatch: injuriesPack.debugMatch,
        extractedTeams: injuriesPack.extractedTeams,
        teamsOnDate: Array.from(teamAbbrs),
      };
    }

    return res.status(200).json(finalData);
  } catch (err: any) {

  if (isRetryableGeminiError(err)) {
    return jsonError(
      res,
      503,
      "UNAVAILABLE",
      "Modelo temporariamente sobrecarregado. Tenta novamente.",
      { message: String(err?.message ?? err) }
    );
  }

  return jsonError(res, 500, "INTERNAL", "Erro interno no /api/gemini", {
    message: String(err?.message ?? err),
    stack: String(err?.stack ?? ""),
  });
}
}
