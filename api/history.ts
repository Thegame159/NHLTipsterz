import type { NextApiRequest, NextApiResponse } from "next";

type StoreItem = {
  date: string;
  auto: null | { savedAt: number; suggestions: any };
  mine: null | { savedAt: number; suggestions: any };
};

let memoryStore: StoreItem[] = [];

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const limit = Number(req.query.limit || 100);

    const items = memoryStore
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, limit);

    return res.status(200).json({ items });
  }

  if (req.method === "POST") {
    const { date, auto, mine } = req.body;

    if (!date) {
      return res.status(400).json({ error: "Missing date" });
    }

    let existing = memoryStore.find((x) => x.date === date);

    if (!existing) {
      existing = { date, auto: null, mine: null };
      memoryStore.push(existing);
    }

    // 🔥 MERGE — não apagar o outro lado
    if (auto) {
      existing.auto = auto;
    }

    if (mine) {
      existing.mine = mine;
    }

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
