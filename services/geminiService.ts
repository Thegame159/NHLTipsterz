import { NHLAnalysisData, Suggestions } from "../types";

export class AppError extends Error {
  code?: string;
  status?: number;

  constructor(message: string, opts?: { code?: string; status?: number }) {
    super(message);
    this.name = "AppError";
    this.code = opts?.code;
    this.status = opts?.status;
  }
}

function friendlyMessage(status: number, code?: string, backendMessage?: string) {
  if (backendMessage && backendMessage.trim().length > 0) return backendMessage;

  if (status === 429 || code === "QUOTA_EXCEEDED" || code === "RATE_LIMIT") {
    return "Limite atingido (quota/rate limit). Tenta novamente mais tarde.";
  }

  if (status === 400) return "Pedido inválido. Verifica a data selecionada e tenta novamente.";
  if (status === 403) return "Acesso bloqueado (CORS/origem não permitida).";
  if (status === 500) return "Erro no servidor ao gerar a análise. Tenta novamente.";
  if (status === 503) return "Serviço temporariamente indisponível. Tenta novamente.";

  return "Erro ao carregar dados. Tenta novamente.";
}

function defaultSuggestions(): Suggestions {
  return {
    tripleWin: [],
    tripleOver15P1: [],
    doubleOver15P1: [],
    drawSuggestions: [],
    quadrupleOver45: [],
    over55Suggestions: [],
  };
}

// Descodifica de forma robusta strings JSON vindas da Groq/OpenAI
function parseModelJson(rawContent: any): any {
  if (!rawContent) return null;
  if (typeof rawContent === "object") return rawContent;

  if (typeof rawContent === "string") {
    try {
      // Limpa delimitadores de código markdown se existirem (```json ... ```)
      let cleaned = rawContent.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
      return JSON.parse(cleaned);
    } catch (e) {
      console.error("Falha ao efetuar parse direto do JSON:", e);
    }
  }
  return null;
}

// Normaliza e garante o formato que a UI espera (NHLAnalysisData)
function normalizeToUiShape(raw: any): NHLAnalysisData {
  let parsedRaw = raw;

  // Se os dados vierem em 'text' ou 'result' (string codificada vinda do modelo)
  if (raw?.text) {
    parsedRaw = parseModelJson(raw.text) || parsedRaw;
  } else if (raw?.result) {
    parsedRaw = parseModelJson(raw.result) || parsedRaw;
  }

  // Se o objeto ainda contiver 'text' interiorizadamente
  if (typeof parsedRaw === "string") {
    parsedRaw = parseModelJson(parsedRaw) || {};
  }

  const predictions = Array.isArray(parsedRaw?.predictions)
    ? parsedRaw.predictions
    : Array.isArray(parsedRaw?.games)
    ? parsedRaw.games
    : [];

  const suggestions =
    parsedRaw?.suggestions && typeof parsedRaw.suggestions === "object"
      ? (parsedRaw.suggestions as Suggestions)
      : defaultSuggestions();

  const lastUpdated =
    typeof parsedRaw?.lastUpdated === "string" && parsedRaw.lastUpdated.trim()
      ? parsedRaw.lastUpdated
      : new Date().toISOString();

  return {
    predictions,
    suggestions,
    lastUpdated,
  };
}

export const fetchNHLAnalysis = async (
  selectedDate: string,
  signal?: AbortSignal
): Promise<NHLAnalysisData> => {
  const r = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selectedDate }),
    signal,
  });

  if (r.ok) {
    const data = await r.json();
    return normalizeToUiShape(data);
  }

  let data: any = null;
  let rawText = "";

  try {
    data = await r.clone().json();
  } catch {
    try {
      rawText = await r.text();
    } catch {
      // ignore
    }
  }

  const code: string | undefined = data?.code;
  const backendMessage: string | undefined = data?.message;

  const message = friendlyMessage(r.status, code, backendMessage);

  const err = new AppError(message, { code, status: r.status });
  (err as any).details = data?.details || rawText || undefined;

  throw err;
};
