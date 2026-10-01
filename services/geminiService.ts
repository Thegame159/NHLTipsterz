// src/services/geminiService.ts

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
    return "Limite atingido. Tenta novamente mais tarde.";
  }

  if (status === 400) return "Pedido inválido. Verifica a data selecionada.";
  if (status === 500) return "Erro no servidor ao gerar a análise.";

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

function normalizeToUiShape(raw: any): NHLAnalysisData {
  if (!raw || typeof raw !== "object") {
    return {
      predictions: [],
      suggestions: defaultSuggestions(),
      lastUpdated: new Date().toISOString(),
    };
  }

  const rawPredictions = Array.isArray(raw.predictions)
    ? raw.predictions
    : Array.isArray(raw.games)
    ? raw.games
    : [];

  const predictions = rawPredictions.map((p: any) => ({
    ...p,
    winProbabilityHome: p.winProbabilityHome ?? p.homeWinProb ?? 0,
    winProbabilityAway: p.winProbabilityAway ?? p.awayWinProb ?? 0,
    over15P1Prob: p.over15P1Prob ?? 0,
    bttsP1Prob: p.bttsP1Prob ?? 0,
    drawTRProb: p.drawTRProb ?? p.drawProb ?? 0,
    over45Prob: p.over45Prob ?? p.over55Prob ?? 0,
    homeTeamAbbr: p.homeTeamAbbr ?? p.homeTeam ?? '',
    awayTeamAbbr: p.awayTeamAbbr ?? p.awayTeam ?? '',
    analysisSummary: p.analysisSummary ?? p.analysis ?? '',
  }));

  const suggestions =
    raw.suggestions && typeof raw.suggestions === "object"
      ? (raw.suggestions as Suggestions)
      : defaultSuggestions();

  const lastUpdated =
    typeof raw.lastUpdated === "string" && raw.lastUpdated.trim()
      ? raw.lastUpdated
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

  throw new AppError(message, { code, status: r.status });
};
