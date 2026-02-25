import type { NextApiRequest, NextApiResponse } from "next";

type StoreItem = {
  date: string;
  auto: any | null;
  mine: any | null;
};

let memoryStore: Record<string, StoreItem> = {};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const limit = Number(req.query.limit || 100);

    const items = Object.values(memoryStore)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, limit);

    return res.status(200).json({ items });
  }

  if (req.method === "POST") {
    const { date, auto, mine } = req.body;

    if (!date) {
      return res.status(400).json({ error: "Missing date" });
    }

    if (!memoryStore[date]) {
      memoryStore[date] = { date, auto: null, mine: null };
    }

    if (auto) memoryStore[date].auto = auto;
    if (mine) memoryStore[date].mine = mine;

    return res.status(200).json({
      ok: true,
      item: memoryStore[date],
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
