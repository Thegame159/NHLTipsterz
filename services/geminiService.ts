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

export const fetchNHLAnalysis = async (selectedDate: string): Promise<NHLAnalysisData> => {
  const r = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selectedDate }),
  });

  if (!r.ok) {
    let data: any = null;
    try {
      data = await r.json();
    } catch {
      // ignore
    }

    const message =
      data?.message ||
      (r.status === 429
        ? "Limite da API atingido. Tenta novamente mais tarde."
        : "Erro ao carregar análise. Tenta novamente.");

    throw new AppError(message, { code: data?.code, status: r.status });
  }

  return r.json();
};
