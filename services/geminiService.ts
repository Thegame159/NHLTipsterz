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
  // Se o backend já mandou uma mensagem boa, usa ela
  if (backendMessage && backendMessage.trim().length > 0) return backendMessage;

  // Mensagens padrão por status/código
  if (status === 429 || code === "QUOTA_EXCEEDED") {
    return "Limite da Gemini API atingido (quota/rate limit). Tenta novamente mais tarde.";
  }

  if (status === 400) return "Pedido inválido. Verifica a data selecionada e tenta novamente.";
  if (status === 500) return "Erro no servidor ao gerar a análise. Tenta novamente.";
  if (status === 503) return "Serviço temporariamente indisponível. Tenta novamente.";

  return "Erro ao carregar dados. Tenta novamente.";
}

export const fetchNHLAnalysis = async (selectedDate: string): Promise<NHLAnalysisData> => {
  const r = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selectedDate }),
  });

  // Sucesso
  if (r.ok) {
    return r.json();
  }

  // Erro: tenta ler JSON padronizado do backend
  let data: any = null;
  let rawText = "";

  try {
    // Clona para tentar json sem perder body
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

  // Opcional: guardar detalhes para debug (não aparece na UI)
  const err = new AppError(message, { code, status: r.status });
  (err as any).details = data?.details || rawText || undefined;

  throw err;
};
