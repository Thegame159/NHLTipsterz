import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { runtime: "nodejs" };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return res.status(200).json({
    ok: true,
    message: "History endpoint alive",
    node: process.version,
  });
}
