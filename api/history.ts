import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { runtime: "nodejs" };

// ⚠️ Ajusta se estiveres a usar outro storage
let HISTORY: any[] = [];

function setCors(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // GET
  if (req.method === "GET") {
    const limit = Number(req.query.limit || 120);
    return res.status(200).json({
      items: HISTORY.slice(-limit).reverse(),
    });
  }

  // POST (guardar snapshot)
  if (req.method === "POST") {
    const { date, side, suggestions } = req.body || {};
    if (!date || !side) {
      return res.status(400).json({ message: "date e side obrigatórios" });
    }

    let existing = HISTORY.find((x) => x.date === date);
    if (!existing) {
      existing = { date, auto: null, mine: null };
      HISTORY.push(existing);
    }

    existing[side] = {
      savedAt: Date.now(),
      suggestions,
    };

    return res.status(200).json({ ok: true });
  }

  // ✅ DELETE POR DATA
  if (req.method === "DELETE") {
    const date = String(req.query.date || "").trim();
    if (!date) {
      return res.status(400).json({ message: "date obrigatório" });
    }

    HISTORY = HISTORY.filter((x) => x.date !== date);

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ message: "Método não permitido" });
}
