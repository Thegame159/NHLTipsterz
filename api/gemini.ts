import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { runtime: "nodejs" };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    return res.status(200).json({
      ok: true,
      message: "Gemini endpoint alive",
      node: process.version,
      hasApiKey: !!process.env.GEMINI_API_KEY,
      hasRedis: !!process.env.REDIS_URL,
    });
  } catch (err: any) {
    return res.status(500).json({
      error: "fatal",
      details: String(err?.message ?? err),
    });
  }
}
