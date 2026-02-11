import { GoogleGenAI, Type } from "@google/genai";
import { kv } from "@vercel/kv";

const TTL_MS = 1000 * 60 * 60 * 24; // 24h

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
      return res.status(405).json({ code: "METHOD_NOT_ALLOWED", message: "Use POST." });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ code: "MISSING_GEMINI_API_KEY", message: "GEMINI_API_KEY não definida." });

    const { selectedDate } = req.body || {};
    if (!selectedDate) return res.status(400).json({ code: "MISSING_SELECTED_DATE", message: "'selectedDate' obrigatório." });

    const cacheKey = `gemini:${selectedDate}`;

    // Tenta obter do KV
    let entry = await kv.get(cacheKey);
    const now = Date.now();

    if (entry) {
      const age = now - entry.lastUpdated;
      if (age < TTL_MS) {
        return res.status(200).json({ ...entry.data, cache: { hit: true, ageMs: age } });
      }
    }

    // Se não está em cache ou expirou
    try {
      const ai = new GoogleGenAI({ apiKey });

      const prompt = `
Analise os jogos da NHL que ocorrerão na data: ${selectedDate}.
Gere probabilidades e sugestões estratégicas conforme especificado no código anterior.
`.trim();

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: { type: Type.OBJECT }
        }
      });

      const result = JSON.parse(response.text || "{}");
      const payload = { ...result, lastUpdated: new Date().toISOString() };

      // Guarda no KV
      await kv.set(cacheKey, { data: payload, lastUpdated: now }, { ex: TTL_MS / 1000 });

      return res.status(200).json({ ...payload, cache: { hit: false, ageMs: 0 } });
    } catch (e: any) {
      const msg = String(e?.message ?? "Gemini error");

      if (isQuotaError(msg) && entry) {
        return res.status(200).json({ ...entry.data, cache: { hit: true, stale: true }, warning: "Quota atingida, mostrando cache." });
      }

      if (isQuotaError(msg)) return res.status(429).json({ code: "QUOTA_EXCEEDED", message: "Limite Gemini atingido", details: msg });

      return res.status(500).json({ code: "GEMINI_ERROR", message: "Erro ao gerar análise.", details: msg });
    }
  } catch (e: any) {
    return res.status(500).json({ code: "SERVER_ERROR", message: "Erro interno.", details: String(e?.message ?? "Server error") });
  }
}