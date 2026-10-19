// utils/marketScale.ts
// Cores da tabela de jogos relativas a CADA mercado (mantém a paleta colorida de sempre).
//
// Um empate com 27% é um valor alto (a média anda nos 23%), enquanto 1.º período > 1.5 com 47% é normal.
// Por isso a cor não depende do número em bruto, mas de onde ele fica face ao que é típico no mercado:
//   low     → vermelho   (abaixo do habitual nesse mercado)
//   normal  → âmbar      (dentro do habitual)
//   watch   → verde      (acima da média: vale a pena olhar)
//   strong  → verde forte, com brilho (atinge o critério das Escolhas Fortes)

import { STRONG_RULES } from "./suggestions";

export type MarketKey = "win" | "draw" | "over15P1" | "btts1P" | "over15P2" | "over45" | "over55";
export type Tier = "low" | "normal" | "watch" | "strong";

const M = STRONG_RULES.markets;

// low: abaixo disto é vermelho · watch: a partir daqui é verde · strong: critério das Escolhas Fortes
// lo/hi: extremos da barra (a barra enche entre estes dois valores, em vez de 0–100%).
const SCALE: Record<MarketKey, { low: number; watch: number; strong: number; lo: number; hi: number }> = {
  win: { low: 45, watch: 54, strong: M.win.min, lo: 35, hi: 75 },
  draw: { low: 21, watch: 24.5, strong: M.draw.min, lo: 15, hi: 30 },
  over15P1: { low: 40, watch: 55, strong: M.over15P1.min, lo: 30, hi: 75 },
  btts1P: { low: 26, watch: 38, strong: M.btts1P.min, lo: 15, hi: 55 },
  over15P2: { low: 55, watch: 66, strong: M.over15P2.min, lo: 45, hi: 82 },
  over45: { low: 65, watch: 74, strong: M.over45.min, lo: 50, hi: 92 },
  over55: { low: 40, watch: 55, strong: M.over55.min, lo: 30, hi: 78 },
};

export function tierOf(market: MarketKey, value: number): Tier {
  const s = SCALE[market];
  if (value >= s.strong) return "strong";
  if (value >= s.watch) return "watch";
  if (value < s.low) return "low";
  return "normal";
}

/** Largura da barra (6–100%) face ao intervalo típico do mercado. */
export function barPct(market: MarketKey, value: number): number {
  const s = SCALE[market];
  const p = ((value - s.lo) / (s.hi - s.lo)) * 100;
  return Math.max(6, Math.min(100, p));
}

export const TIER_BADGE: Record<Tier, string> = {
  low: "text-rose-400 border-rose-500/30 bg-rose-500/10",
  normal: "text-amber-400 border-amber-500/30 bg-amber-500/10",
  watch: "text-green-400 border-green-500/30 bg-green-500/10",
  strong: "text-emerald-300 border-emerald-400/60 bg-emerald-500/15 ring-1 ring-emerald-400/40 shadow-[0_0_12px_rgba(16,185,129,0.3)]",
};

export const TIER_BAR: Record<Tier, string> = {
  low: "bg-gradient-to-r from-rose-500 to-red-500",
  normal: "bg-gradient-to-r from-yellow-500 to-amber-500",
  watch: "bg-gradient-to-r from-green-500 to-emerald-500",
  strong: "bg-gradient-to-r from-emerald-400 to-green-500",
};
