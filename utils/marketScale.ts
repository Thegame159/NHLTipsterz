// utils/marketScale.ts
// Cores da tabela de jogos relativas a CADA mercado.
//
// Um empate com 27% é um valor alto (a média anda nos 23%), enquanto 1.º período > 1.5 com 47% é normal.
// Por isso as cores não dependem do número em bruto, mas de onde ele fica face ao que é típico no mercado:
//   normal  → cinzento (sem destaque)
//   watch   → âmbar    (acima da média: vale a pena olhar)
//   strong  → verde    (atinge o critério das Escolhas Fortes)
// Não usamos vermelho: uma probabilidade baixa só quer dizer "não interessa", não que seja mau.

import { STRONG_RULES } from "./suggestions";

export type MarketKey = "win" | "draw" | "over15P1" | "btts1P" | "over15P2" | "over45" | "over55";
export type Tier = "normal" | "watch" | "strong";

const M = STRONG_RULES.markets;

// watch: a partir daqui já é acima da média; strong: critério das Escolhas Fortes;
// lo/hi: extremos da barra (a barra enche entre estes dois valores, em vez de 0–100%).
const SCALE: Record<MarketKey, { watch: number; strong: number; lo: number; hi: number }> = {
  win: { watch: 57, strong: M.win.min, lo: 40, hi: 75 },
  draw: { watch: 24.5, strong: M.draw.min, lo: 15, hi: 30 },
  over15P1: { watch: 55, strong: M.over15P1.min, lo: 30, hi: 75 },
  btts1P: { watch: 38, strong: M.btts1P.min, lo: 15, hi: 55 },
  over15P2: { watch: 66, strong: M.over15P2.min, lo: 45, hi: 82 },
  over45: { watch: 76, strong: M.over45.min, lo: 50, hi: 92 },
  over55: { watch: 55, strong: M.over55.min, lo: 30, hi: 78 },
};

export function tierOf(market: MarketKey, value: number): Tier {
  const s = SCALE[market];
  if (value >= s.strong) return "strong";
  if (value >= s.watch) return "watch";
  return "normal";
}

/** Largura da barra (6–100%) face ao intervalo típico do mercado. */
export function barPct(market: MarketKey, value: number): number {
  const s = SCALE[market];
  const p = ((value - s.lo) / (s.hi - s.lo)) * 100;
  return Math.max(6, Math.min(100, p));
}

export const TIER_BADGE: Record<Tier, string> = {
  normal: "text-slate-300 border-slate-700 bg-slate-800/40",
  watch: "text-amber-300 border-amber-500/50 bg-amber-500/15",
  strong: "text-emerald-300 border-emerald-400/70 bg-emerald-500/20 ring-1 ring-emerald-400/40 shadow-[0_0_12px_rgba(16,185,129,0.25)]",
};

export const TIER_BAR: Record<Tier, string> = {
  normal: "bg-slate-500",
  watch: "bg-amber-400",
  strong: "bg-emerald-400",
};
