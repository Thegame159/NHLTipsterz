import { GoogleGenAI, Type } from "@google/genai";

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
    }

    const { selectedDate } = req.body || {};
    if (!selectedDate) {
      return res.status(400).json({ error: "Missing selectedDate" });
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `
Analise os jogos da NHL que ocorrerão na data: ${selectedDate}.
Para cada jogo desta data específica, realize um estudo de performance baseado nos últimos 10 jogos de cada equipe, considerando:
1. Fator Casa vs Fora (performance específica nessas condições).
2. Lista atual de lesões de cada equipe e seu impacto.

Gere as seguintes probabilidades em percentagem (0-100):
- Probabilidade de vitória (incluindo prolongamento).
- Probabilidade de Over 1.5 golos no 1º Período.
- Probabilidade de BTTS (Ambas Marcam) no 1º Período.
- Probabilidade de Empate no Tempo Regulamentar (TR).
- Probabilidade de Over 4.5 golos no jogo total.
- Probabilidade de Over 5.5 golos no jogo total.

Além disso, gere sugestões estratégicas baseadas APENAS nos jogos desta data (${selectedDate}):
- Triplete de vitórias (3 jogos mais prováveis). Formato: "EQUIPA (X%)".
- Triplete de Over 1.5 no 1º Período (3 jogos). Formato: "VIS @ HOM (X%)".
- Dupla de Over 1.5 no 1º Período (2 jogos adicionais). Formato: "VIS @ HOM (X%)".
- 2 sugestões de empate com explicação detalhada. Formato do nome do jogo: "VIS @ HOM (X%)".
- Quadriplete de Over 4.5 golos. Formato: "VIS @ HOM (X%)".
- Sugestões extras de Over 5.5 golos. Formato: "VIS @ HOM (X%)".

IMPORTANTE:
- Use ferramentas de busca para obter dados reais e atualizados especificamente para o dia ${selectedDate}.
- SEMPRE inclua a percentagem de probabilidade calculada entre parênteses, ex: "(78%)".
- Forneça a abreviação oficial de 3 letras para cada equipa.
- Nas listas de sugestões, SEMPRE use as abreviações das equipes (ex: "TOR @ BOS (72%)") para que eu possa exibir os logos e a probabilidade.
- Inclua o registro dos últimos 10 jogos (L10) no formato Vitórias-Derrotas-DerrotasOT.
`.trim();

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            predictions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  homeTeam: { type: Type.STRING },
                  homeTeamAbbr: { type: Type.STRING },
                  homeRecordL10: { type: Type.STRING },
                  awayTeam: { type: Type.STRING },
                  awayTeamAbbr: { type: Type.STRING },
                  awayRecordL10: { type: Type.STRING },
                  dateTime: { type: Type.STRING },
                  winProbabilityHome: { type: Type.NUMBER },
                  winProbabilityAway: { type: Type.NUMBER },
                  over15P1Prob: { type: Type.NUMBER },
                  bttsP1Prob: { type: Type.NUMBER },
                  drawTRProb: { type: Type.NUMBER },
                  over45Prob: { type: Type.NUMBER },
                  over55Prob: { type: Type.NUMBER },
                  analysisSummary: { type: Type.STRING },
                  injuries: {
                    type: Type.OBJECT,
                    properties: {
                      home: { type: Type.ARRAY, items: { type: Type.STRING } },
                      away: { type: Type.ARRAY, items: { type: Type.STRING } }
                    }
                  }
                },
                required: [
                  "homeTeam",
                  "homeTeamAbbr",
                  "awayTeam",
                  "awayTeamAbbr",
                  "winProbabilityHome",
                  "over15P1Prob",
                  "drawTRProb"
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

    return res.status(200).json({
      ...result,
      lastUpdated: new Date().toISOString()
    });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e?.message ?? "Gemini error" });
  }
}
