import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "redis";

export const config = { runtime: "nodejs" };

const GEMINI_TTL_MS = 1000 * 60 * 60 * 12;

// ---------------- REDIS ----------------
let _redis: ReturnType<typeof createClient> | null = null;

async function getRedis() {
  if (_redis) return _redis;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  const client = createClient({ url });
  await client.connect();
  _redis = client;
  return _redis;
}

// ---------------- ESPN INJURIES (POR EQUIPA) ----------------
function simplifyStatus(status?: string) {
  const s = (status || "").toLowerCase();
  if (!s) return "";
  if (s.includes("out")) return "OUT";
  if (s.includes("questionable")) return "Q";
  if (s.includes("day")) return "DTD";
  if (s.includes("ir")) return "IR";
  return status || "";
}

async function fetchTeamInjuries(teamAbbr: string): Promise<string[]> {
  try {
    const url = `https://site.web.api.espn.com/apis/site/v2/sports/hockey/nhl/teams/${teamAbbr}/injuries`;
    const res = await fetch(url);

    if (!res.ok) return [];

    const data = await res.json();
    const injuries: string[] = [];

    const list = data?.injuries || data?.athletes || [];

    for (const item of list) {
      const name =
        item?.athlete?.displayName ||
        item?.displayName ||
        item?.fullName ||
        "";

      const status = simplifyStatus(
        item?.status ||
        item?.injuryStatus ||
        item?.availability
      );

      const detail =
        item?.details?.type ||
        item?.details?.detail ||
        item?.injury?.type ||
        item?.injury?.detail ||
        "";

      if (name) {
        injuries.push(
          `${name}${status ? ` (${status})` : ""}${detail ? ` - ${detail}` : ""}`
        );
      }
    }

    return injuries;
  } catch {
    return [];
  }
}

// ---------------- NHL SCHEDULE ----------------
async function fetchSchedule(date: string) {
  const res = await fetch(`https://api-web.nhle.com/v1/schedule/${date}`);
  if (!res.ok) return [];

  const data = await res.json();
  const games: any[] = [];

  if (!data?.gameWeek) return [];

  for (const day of data.gameWeek) {
    if (Array.isArray(day.games)) {
      for (const g of day.games) games.push(g);
    }
  }

  return games;
}

// ---------------- GEMINI ----------------
async function generateGemini(apiKey: string, prompt: string) {
  const ai = new GoogleGenAI({ apiKey });

  const models = [
    "gemini-3-flash-preview",
    "gemini-3-pro-preview",
    "gemini-2.0-flash"
  ];

  for (const model of models) {
    try {
      const resp = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });

      return JSON.parse(resp.text || "{}");
    } catch (e: any) {
      if (!String(e.message).toLowerCase().includes("not found")) {
        throw e;
      }
    }
  }

  throw new Error("Nenhum modelo Gemini disponível.");
}

// ---------------- HANDLER ----------------
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ message: "Use POST." });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ message: "GEMINI_API_KEY não definida." });

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const selectedDate = body?.selectedDate;

    if (!selectedDate)
      return res.status(400).json({ message: "selectedDate obrigatório." });

    // 1️⃣ Buscar jogos reais
    const schedule = await fetchSchedule(selectedDate);
    if (!schedule.length)
      return res.status(200).json({ predictions: [], suggestions: {}, lastUpdated: new Date().toISOString() });

    // 2️⃣ Buscar lesões (sempre fresh)
    const teamAbbrs = new Set<string>();
    schedule.forEach(g => {
      if (g.homeTeam?.abbrev) teamAbbrs.add(g.homeTeam.abbrev);
      if (g.awayTeam?.abbrev) teamAbbrs.add(g.awayTeam.abbrev);
    });

    const injuriesByTeam: Record<string, string[]> = {};
    for (const team of teamAbbrs) {
      injuriesByTeam[team] = await fetchTeamInjuries(team);
    }

    // 3️⃣ Cache só Gemini
    const redis = await getRedis();
    const cacheKey = `gemini_only:${selectedDate}`;
    let geminiData: any = null;
    let cacheHit = false;

    if (redis) {
      const raw = await redis.get(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Date.now() - parsed.savedAt < GEMINI_TTL_MS) {
          geminiData = parsed.data;
          cacheHit = true;
        }
      }
    }

    if (!geminiData) {
      const prompt = `
Analisa estes jogos da NHL em ${selectedDate}.
Responde apenas com JSON válido.
Jogos:
${JSON.stringify(schedule, null, 2)}
`;

      geminiData = await generateGemini(apiKey, prompt);

      if (redis) {
        await redis.set(
          cacheKey,
          JSON.stringify({ savedAt: Date.now(), data: geminiData }),
          { PX: GEMINI_TTL_MS }
        );
      }
    }

    // 4️⃣ Injectar lesões reais
    geminiData.predictions = geminiData.predictions.map((p: any) => ({
      ...p,
      injuries: {
        home: injuriesByTeam[p.homeTeamAbbr] || [],
        away: injuriesByTeam[p.awayTeamAbbr] || []
      }
    }));

    geminiData.meta = {
      selectedDate,
      cacheHit,
      injuriesCounts: Object.fromEntries(
        Object.entries(injuriesByTeam).map(([k, v]) => [k, v.length])
      )
    };

    return res.status(200).json(geminiData);

  } catch (err: any) {
    return res.status(500).json({
      message: "Erro interno",
      details: err.message
    });
  }
}
