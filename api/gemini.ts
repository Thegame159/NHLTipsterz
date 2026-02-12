import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "redis";

export const config = { runtime: "nodejs" };

// Cache do Gemini (predictions) e das lesões
const GEMINI_TTL_MS = 1000 * 60 * 60 * 12; // 12h
const INJURIES_TTL_MS = 1000 * 60 * 60 * 6; // 6h (como pediste)

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

// ---------------- TEAM NAME MAP (para casar ESPN->ABBR) ----------------
// Isto ajuda a mapear "Boston Bruins" -> "BOS" mesmo que a ESPN não mostre abreviação.
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
  UTA: ["utah hockey club", "utah"], // se aparecer assim na ESPN
  ARI: ["arizona coyotes", "coyotes"], // se aparecer histórico
};

function guessAbbrFromTeamName(teamName: string): string | null {
  const t = norm(teamName);
  if (!t) return null;

  // match por full names / aliases
  for (const [abbr, names] of Object.entries(TEAM_FULLNAMES)) {
    for (const n of names) {
      if (t.includes(n)) return abbr;
    }
  }

  return null;
}

// ---------------- ESPN HTML -> GEMINI (extract injuries) ----------------
type ExtractedTeamInjuries = {
  team: string; // ex: "Boston Bruins"
  injuries: string[]; // ex: ["Player (OUT) - Lower Body", ...]
};

type InjuriesExtractResult = {
  teams: ExtractedTeamInjuries[];
};

async function fetchEspnBrazilInjuriesHtml(): Promise<{ ok: boolean; status: number; url: string; html: string }> {
  const url = "https://www.espn.com.br/nhl/lesoes";
  const res = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "pt-PT,pt;q=0.9,en;q=0.7",
      "user-agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
    },
  });

  const html = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, url, html };
}

async function extractInjuriesWithGemini(apiKey: string, html: string): Promise<InjuriesExtractResult> {
  const ai = new GoogleGenAI({ apiKey });

  // Não mandes HTML infinito. Mantemos um chunk grande, mas com limite.
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
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.teams)) {
    return { teams: [] };
  }

  // normaliza
  const teams: ExtractedTeamInjuries[] = parsed.teams
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

  // 1) cache (6h)
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

  // 2) fetch html
  const htmlRes = await fetchEspnBrazilInjuriesHtml();

  // 3) Gemini extrai (só parsing)
  const extracted = await extractInjuriesWithGemini(apiKey, htmlRes.html);

  // 4) map para abreviações que interessam
  const mapped = mapExtractedToAbbr(extracted, teamsOnDate);

  // 5) guarda cache
  if (redis) {
    try {
      await redis.set(
        cacheKey,
        JSON.stringify({ savedAt: Date.now(), data: extracted }),
        { PX: INJURIES_TTL_MS }
      );
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

  // init vazios
  for (const abbr of teamsOnDate) injuriesByTeam[abbr] = [];

  // tenta casar por nome -> abbr
  for (const t of extracted.teams) {
    const abbr = guessAbbrFromTeamName(t.team);
    if (!abbr) continue;
    if (!teamsOnDate.has(abbr)) continue;

    injuriesByTeam[abbr] = t.injuries;
    debug[abbr] = { matchedFrom: t.team, count: t.injuries.length };
  }

  // counts
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

    // 4) Gemini predictions (cache 12h)
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
          await redis.set(
            geminiCacheKey,
            JSON.stringify({ savedAt: Date.now(), data: geminiObj }),
            { PX: GEMINI_TTL_MS }
          );
        } catch (e) {
          console.error("Gemini cache save failed:", e);
        }
      }
    }

    // 5) Merge final (injuries sempre vindas do pack)
    const finalData: any = mergeInjuriesIntoPredictions(geminiObj, injuriesPack.injuriesByTeam);

    // debug/meta
    finalData.meta = {
      selectedDate,
      cache: { geminiHit, geminiKey: geminiCacheKey, injuries: injuriesPack.meta },
      injuriesCounts: injuriesPack.injuriesCounts,
      injuriesMatch: injuriesPack.debugMatch,
      extractedTeams: injuriesPack.extractedTeams,
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
