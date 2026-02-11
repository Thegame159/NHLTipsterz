import { NHLAnalysisData } from "../types";

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

  if (status === 429 || code === "QUOTA_EXCEEDED") {
    return "Limite da Gemini API atingido (quota/rate limit). Tenta novamente mais tarde.";
  }

  if (status === 400) return "Pedido inválido. Verifica a data selecionada e tenta novamente.";
  if (status === 500) return "Erro no servidor ao gerar a análise. Tenta novamente.";
  if (status === 503) return "Serviço temporariamente indisponível. Tenta novamente.";

  return "Erro ao carregar dados. Tenta novamente.";
}

// Normaliza o payload do backend para o formato que a UI espera (NHLAnalysisData)
function normalizeToUiShape(raw: any): NHLAnalysisData {
  const obj = raw && typeof raw === "object" ? raw : {};

  // Backend novo: { predictions: [...] }
  const predictions = Array.isArray(obj.predictions) ? obj.predictions : [];

  // UI antiga: usa "jogos"
  // Se já vier "jogos" do backend antigo, preserva; senão usa predictions.
  const jogos = Array.isArray(obj.jogos) ? obj.jogos : predictions;

  return {
    ...obj,
    jogos,
    // Mantém também predictions para debug/uso futuro (não atrapalha)
    predictions,
  } as NHLAnalysisData;
}

export const fetchNHLAnalysis = async (selectedDate: string): Promise<NHLAnalysisData> => {
  const r = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selectedDate }),
  });

  // Sucesso
  if (r.ok) {
    const data = await r.json();
    return normalizeToUiShape(data);
  }

  // Erro: tenta ler JSON padronizado do backend
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
