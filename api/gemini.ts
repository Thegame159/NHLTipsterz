import { GoogleGenAI, Type } from "@google/genai";

/**
 * Cache simples em memória.
 * Nota: em serverless não é garantido entre instâncias,
 * mas ajuda a reduzir chamadas repetidas no mesmo runtime.
 */
type CacheEntry = { at: number; data: any };
const cache = new Map<string, CacheEntry>();

const TTL_MS = 1000 * 60 * 30; // 30 minutos
const STALE_MAX_MS = 1000 * 60 * 60 * 24; // 24h (aceita stale)

function isQuotaError(msg: string) {
  const m = msg.toLowerCase();
  return (
    m.includes("429") ||
    m.includes("resource_exhausted") ||
    m.includes("quota") ||
    m.includes("rate limit")
  );
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({
        code: "METHOD_NOT_ALLOWED",
        message: "Método não permitido. Use POST."
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        code: "MISSING_GEMINI_API_KEY",
        message: "GEMINI_API_KEY não definida no servidor."
      });
    }

    const { selectedDate } = req.body || {};
    if (!selectedDate) {
      return res.status(400).json({
        code: "MISSING_SELECTED_DATE",
        message: "Parâmetro 'selectedDate' é obrigatório."
      });
    }

    const cacheKey = String(selectedDate);
    const now = Date.now();
    const entry = cache.get(cacheKey);

    const age = entry ? now - entry.at : Infinity;
    const fresh = entry && age < TTL_MS;
    const staleOk = entry && age < STALE_MAX_MS;

    // 1️⃣ Cache fresco → responde direto
    if (fresh && entry) {
      res.setHeader("x-cache", "HIT");
      return res.status(200).json({
        ...entry.data,
        cache: { hit: true, stale: false, ageMs: age }
      });
    }

    try {
      // 2️⃣ Chamada à Gemini (APENAS quando necessário)
      const ai = new GoogleGenAI({ apiKey });

      const prompt = `
Analise os jogos da NHL que ocorrerão na data: ${selectedDate}.

Para cada jogo dessa data:
- Baseie-se no desempenho dos últimos 10 jogos (L10).
- Considere fator Casa vs Fora.
- Considere lesões conhecidas e impacto esperado.

Gere probabilidades (0-100):
- Vitória (inclui OT)
- Over 1.5 golos no 1º Período
- BTTS no 1º Período
- Empate no Tempo Regulamentar
- Over 4.5 golos (jogo)
- Over 5.5 golos (jogo)

Gere também sugestões APENAS para esta data (${selectedDate}):
- Triplete de vitórias (3 jogos)
- Triplete Over 1.5 1º Período
- Dupla Over 1.5 1º Período
- 2 empates com explicação
- Quadriplete Over 4.5
- Extras Over 5.5

Regras:
- Sempre incluir percentagem (ex: 72%).
- Usar abreviações oficiais de 3 letras (ex: TOR @ BOS).
- Incluir L10 no formato V-D-OT.
`.trim();

      const response = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              predictions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    homeTeam: { type: Type.STRING },
                    homeTeamAbbr: { type: Type.STRING },
                    homeRecordL10: { type: Type.STRING },
                    awayTeam: { type: Type.STRING },
                    awayTeamAbbr: { type: Type.STRING },
                    awayRecordL10: { type: Type.STRING },
                    winProbabilityHome: { type: Type.NUMBER },
                    winProbabilityAway: { type: Type.NUMBER },
                    over15P1Prob: { type: Type.NUMBER },
                    bttsP1Prob: { type: Type.NUMBER },
                    drawTRProb: { type: Type.NUMBER },
                    over45Prob: { type: Type.NUMBER },
                    over55Prob: { type: Type.NUMBER },
                    analysisSummary: { type: Type.STRING }
                  },
                  required: [
                    "homeTeam",
                    "homeTeamAbbr",
                    "awayTeam",
                    "awayTeamAbbr",
                    "winProbabilityHome"
                  ]
                }
              },
              suggestions: {
                type: Type.OBJECT,
                properties: {
                  tripleWin: { type: Type.ARRAY, items: { type: Type.STRING } },
                  tripleOver15P1: { type: Type.ARRAY, items: { type: Type.STRING } },
                  doubleOver15P1: { type: Type.ARRAY, items: { type: Type.STRING } },
                  drawSuggestions: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        game: { type: Type.STRING },
                        explanation: { type: Type.STRING }
                      }
                    }
                  },
                  quadrupleOver45: { type: Type.ARRAY, items: { type: Type.STRING } },
                  over55Suggestions: { type: Type.ARRAY, items: { type: Type.STRING } }
                }
              }
            }
          }
        }
      });

      const text = response.text || "{}";
      const result = JSON.parse(text);

      const payload = {
        ...result,
        lastUpdated: new Date().toISOString()
      };

      cache.set(cacheKey, { at: now, data: payload });

      res.setHeader("x-cache", "MISS");
      return res.status(200).json({
        ...payload,
        cache: { hit: false, stale: false, ageMs: 0 }
      });
    } catch (e: any) {
      const msg = String(e?.message ?? "Gemini error");

      // 3️⃣ Quota estourada → devolve cache stale se existir
      if (isQuotaError(msg) && staleOk && entry) {
        const staleAge = now - entry.at;
        res.setHeader("x-cache", "STALE");
        return res.status(200).json({
          ...entry.data,
          cache: { hit: true, stale: true, ageMs: staleAge },
          warning: "Quota atingida. A mostrar dados em cache."
        });
      }

      if (isQuotaError(msg)) {
        return res.status(429).json({
          code: "QUOTA_EXCEEDED",
          message: "Limite da Gemini API atingido. Tenta mais tarde."
        });
      }

      return res.status(500).json({
        code: "GEMINI_ERROR",
        message: "Erro ao gerar análise.",
        details: msg
      });
    }
  } catch (e: any) {
    return res.status(500).json({
      code: "SERVER_ERROR",
      message: "Erro interno no servidor.",
      details: String(e?.message ?? "Server error")
    });
  }
}