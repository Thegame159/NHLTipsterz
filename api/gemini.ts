import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "redis";

export const config = { runtime: "nodejs" };

// Cache só do Gemini (caro). Lesões NÃO são cacheadas.
const GEMINI_TTL_MS = 1000 * 60 * 60 * 12;

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

function normAbbr(abbr: string) {
  return (abbr || "").toUpperCase().trim();
}

function simplifyStatus(status?: string) {
  const s = (status || "").toLowerCase();
  if (!s) return "";
  if (s.includes("out")) return "OUT";
  if (s.includes("questionable")) return "Q";
  if (s.includes("day-to-day") || s.includes("day to day") || s.includes("day")) return "DTD";
  if (s.includes("ir")) return "IR";
  return status || "";
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

// ---------------- NHL SCHEDULE (real) ----------------
type ScheduleGame = {
  id: number;
  startTimeUTC?: string;
  homeTeam?: { abbrev?: string; placeName?: { default?: string } };
  awayTeam?: { abbrev?: string; placeName?: { default?: string } };
};

async function fetchNhlScheduleGames(date: string): Promise<ScheduleGame[]> {
  const url = `https://api-web.nhle.com/v1/schedule/${date}`;
  const res = await fetch(url);
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

// ---------------- ESPN TEAM ID RESOLVER (robusto) ----------------
// A ESPN usa IDs numéricos para /teams/{id}/injuries.
// Em vez de manter um mapa manual (que pode estar errado), buscamos a lista de equipas e fazemos lookup por abreviação.

type EspnTeamIndex = {
  fetchedAt: number;
  byAbbr: Record<string, string>; // "BOS" -> "1"
};

let _espnTeamIndex: EspnTeamIndex | null = null;
const ESPN_TEAM_INDEX_TTL_MS = 1000 * 60 * 60 * 12; // 12h em memória (na mesma instância)

async function getEspnTeamIndex(): Promise<EspnTeamIndex> {
  // cache em memória (melhor performance)
  if (_espnTeamIndex && Date.now() - _espnTeamIndex.fetchedAt < ESPN_TEAM_INDEX_TTL_MS) return _espnTeamIndex;

  const url = "https://site.web.api.espn.com/apis/site/v2/sports/hockey/nhl/teams";
  const res = await fetch(url, {
    headers: {
      accept: "application/json,text/plain,*/*",
      "accept-language": "pt-PT,pt;q=0.9,en;q=0.7",
      "user-agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
    },
  });

  if (!res.ok) {
    // fallback: devolve vazio para não rebentar
    _espnTeamIndex = { fetchedAt: Date.now(), byAbbr: {} };
    return _espnTeamIndex;
  }

  const data = await res.json();

  const byAbbr: Record<string, string> = {};
  // A estrutura costuma ter: sports[0].leagues[0].teams[{ team: {...}}]
  const teams = data?.sports?.[0]?.leagues?.[0]?.teams ?? [];

  for (const t of teams) {
    const team = t?.team;
    const abbr = normAbbr(team?.abbreviation || team?.abbrev || "");
    const id = team?.id ? String(team.id) : "";
    if (abbr && id) byAbbr[abbr] = id;
  }

  _espnTeamIndex = { fetchedAt: Date.now(), byAbbr };
  return _espnTeamIndex;
}

// ---------------- ESPN INJURIES (por equipa usando TEAM ID) ----------------
async function fetchTeamInjuriesByAbbr(teamAbbr: string): Promise<{ injuries: string[]; teamId?: string; ok: boolean; status: number; url: string }> {
  const abbr = normAbbr(teamAbbr);
  const index = await getEspnTeamIndex();
  const teamId = index.byAbbr[abbr];

  if (!teamId) {
    return { injuries: [], teamId: undefined, ok: false, status: 404, url: "teamId-not-found" };
  }

  const url = `https://site.web.api.espn.com/apis/site/v2/sports/hockey/nhl/teams/${teamId}/injuries`;
  const res = await fetch(url, {
    headers: {
      accept: "application/json,text/plain,*/*",
      "accept-language": "pt-PT,pt;q=0.9,en;q=0.7",
      "user-agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
    },
  });

  if (!res.ok) return { injuries: [], teamId, ok: false, status: res.status, url };

  const data = await res.json();

  const injuries: string[] = [];

  // Estruturas possíveis
  const list =
    data?.injuries ||
    data?.athletes ||
    data?.items ||
    [];

  if (Array.isArray(list)) {
    for (const item of list) {
      const name =
        item?.athlete?.displayName ||
        item?.athlete?.fullName ||
        item?.displayName ||
        item?.fullName ||
        "";

      const statusRaw =
        item?.status ||
        item?.injuryStatus ||
        item?.availability ||
        item?.state ||
        "";

      const detailRaw =
        item?.details?.type ||
        item?.details?.detail ||
        item?.injury?.type ||
        item?.injury?.detail ||
        item?.description ||
        item?.detail ||
        "";

      const status = simplifyStatus(String(statusRaw));
      const detail = String(detailRaw || "").trim();

      if (name) {
        injuries.push(
          `${name}${status ? ` (${status})` : ""}${detail ? ` - ${detail}` : ""}`.trim()
        );
      }
    }
  }

  return { injuries, teamId, ok: true, status: 200, url };
}

async function buildInjuriesByTeam(teamAbbrs: Set<string>) {
  const injuriesByTeam: Record<string, string[]> = {};
  const debugByTeam: Record<string, any> = {};

  for (const abbr of teamAbbrs) {
    const r = await fetchTeamInjuriesByAbbr(abbr);
    injuriesByTeam[abbr] = r.injuries;
    debugByTeam[abbr] = { teamId: r.teamId, ok: r.ok, status: r.status, url: r.url, count: r.injuries.length };
  }

  return { injuriesByTeam, debugByTeam };
}

// ---------------- GEMINI ----------------
async function generateWithFallback(ai: GoogleGenAI, prompt: string) {
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

// ---------------- MERGE FINAL (injuries sempre fresh) ----------------
function mergeInjuriesIntoPredictions(geminiObj: any, sourceById: Record<string, any>) {
  const root = geminiObj && typeof geminiObj === "object" ? geminiObj : {};
  const predictions = Array.isArray(root.predictions) ? root.predictions : [];
  const suggestions =
    root.suggestions && typeof root.suggestions === "object" ? root.suggestions : defaultSuggestions();

  const lastUpdated = new Date().toISOString();

  const mergedPredictions = predictions.map((p: any) => {
    const id = String(p?.id ?? "");
    const src = sourceById[id];

    return {
      id,
      homeTeam: String(p?.homeTeam ?? src?.homeTeam ?? ""),
      homeTeamAbbr: String(p?.homeTeamAbbr ?? src?.homeTeamAbbr ?? ""),
      homeRecordL10: String(p?.homeRecordL10 ?? "N/A"),
      awayTeam: String(p?.awayTeam ?? src?.awayTeam ?? ""),
      awayTeamAbbr: String(p?.awayTeamAbbr ?? src?.awayTeamAbbr ?? ""),
      awayRecordL10: String(p?.awayRecordL10 ?? "N/A"),
      dateTime: String(p?.dateTime ?? src?.dateTime ?? ""),
      winProbabilityHome: Number(p?.winProbabilityHome ?? 0),
      winProbabilityAway: Number(p?.winProbabilityAway ?? 0),
      over15P1Prob: Number(p?.over15P1Prob ?? 0),
      bttsP1Prob: Number(p?.bttsP1Prob ?? 0),
      drawTRProb: Number(p?.drawTRProb ?? 0),
      over45Prob: Number(p?.over45Prob ?? 0),
      over55Prob: Number(p?.over55Prob ?? 0),
      analysisSummary: String(p?.analysisSummary ?? ""),
      // ✅ ALWAYS from fresh source
      injuries: {
        home: (src?.injuries?.home ?? []).map(String),
        away: (src?.injuries?.away ?? []).map(String),
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

  return { predictions: mergedPredictions, suggestions: normalizedSuggestions, lastUpdated };
}

// ---------------- HANDLER ----------------
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ message: "Use POST." });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        message: "GEMINI_API_KEY não definida",
        predictions: [],
        suggestions: defaultSuggestions(),
        lastUpdated: new Date().toISOString(),
      });
    }

    const body = typeof req.body === "string" ? safeJsonParse(req.body) : (req.body ?? {});
    const selectedDate = body?.selectedDate;

    if (!selectedDate) {
      return res.status(400).json({
        message: "selectedDate obrigatório (YYYY-MM-DD)",
        predictions: [],
        suggestions: defaultSuggestions(),
        lastUpdated: new Date().toISOString(),
      });
    }

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

    // 2) equipas do dia
    const teamAbbrs = new Set<string>();
    for (const g of scheduleGames) {
      const h = normAbbr(g.homeTeam?.abbrev || "");
      const a = normAbbr(g.awayTeam?.abbrev || "");
      if (h) teamAbbrs.add(h);
      if (a) teamAbbrs.add(a);
    }

    // 3) injuries REAL (sempre fresh)
    const { injuriesByTeam, debugByTeam } = await buildInjuriesByTeam(teamAbbrs);

    // base por jogo
    const sourceById: Record<string, any> = {};
    const gamesForAI = scheduleGames.map((g) => {
      const id = String(g.id);
      const homeAbbr = normAbbr(g.homeTeam?.abbrev || "");
      const awayAbbr = normAbbr(g.awayTeam?.abbrev || "");

      const base = {
        id,
        dateTime: g.startTimeUTC ?? "",
        homeTeam: g.homeTeam?.placeName?.default ?? homeAbbr,
        homeTeamAbbr: homeAbbr,
        awayTeam: g.awayTeam?.placeName?.default ?? awayAbbr,
        awayTeamAbbr: awayAbbr,
        injuries: {
          home: injuriesByTeam[homeAbbr] ?? [],
          away: injuriesByTeam[awayAbbr] ?? [],
        },
      };

      sourceById[id] = base;
      return base;
    });

    // 4) cache só do Gemini
    const redis = await getRedis();
    const geminiCacheKey = `gemini_only:${selectedDate}`;
    let geminiObj: any = null;
    let geminiHit = false;

    if (redis) {
      try {
        const raw = await redis.get(geminiCacheKey);
        const cached = raw ? safeJsonParse(raw) : null;
        if (cached?.savedAt && Date.now() - cached.savedAt < GEMINI_TTL_MS) {
          geminiObj = cached.data;
          geminiHit = true;
        }
      } catch (e) {
        console.error("Redis read failed:", e);
      }
    }

    if (!geminiObj) {
      const ai = new GoogleGenAI({ apiKey });

      const prompt = `
Responde APENAS com JSON válido (sem texto extra).

Tens estes jogos da NHL para ${selectedDate}.
As lesões abaixo são REAIS. Usa-as no resumo/análise e NÃO inventes novas lesões.
${JSON.stringify(gamesForAI, null, 2)}

Devolve EXACTAMENTE este formato:
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
`.trim();

      const { parsed } = await generateWithFallback(ai, prompt);
      geminiObj = parsed;

      if (redis) {
        try {
          await redis.set(
            geminiCacheKey,
            JSON.stringify({ savedAt: Date.now(), data: geminiObj }),
            { PX: GEMINI_TTL_MS }
          );
        } catch (e) {
          console.error("Redis save failed:", e);
        }
      }
    }

    const finalData: any = mergeInjuriesIntoPredictions(geminiObj, sourceById);

    // DEBUG
    finalData.meta = {
      selectedDate,
      cache: { geminiHit, key: geminiCacheKey },
      injuriesCounts: Object.fromEntries(Object.entries(injuriesByTeam).map(([k, v]) => [k, v.length])),
      injuriesDebug: debugByTeam,
      teamsOnDate: Array.from(teamAbbrs),
    };

    return res.status(200).json(finalData);
  } catch (err: any) {
    return res.status(500).json({
      message: "Erro interno",
      details: String(err?.message ?? err),
      predictions: [],
      suggestions: defaultSuggestions(),
      lastUpdated: new Date().toISOString(),
    });
  }
}
