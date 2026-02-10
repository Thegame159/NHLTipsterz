import { NHLAnalysisData } from "../types";

export const fetchNHLAnalysis = async (selectedDate: string): Promise<NHLAnalysisData> => {
  const r = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selectedDate }),
  });

  if (!r.ok) {
    const msg = await r.text();
    throw new Error(msg || `Request failed: ${r.status}`);
  }

  return r.json();
};
