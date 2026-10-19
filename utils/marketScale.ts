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

// Referência de cada mercado = taxa de um jogo médio da liga (a API calcula-a com os jogos reais recentes).
// Os limites são múltiplos dessa referência, medidos na dispersão real do modelo:
//   low ≈ bem abaixo da média · watch = a partir da média (verde) · strong ≈ percentil 90 (e nunca acima do critério das Escolhas Fortes)
// Se a API ainda não enviou a referência, usam-se valores típicos da NHL.
export type LeagueBaseline = { draw: number; over15P1: number; btts1P: number; over15P2: number; over45: number; over55: number };

const DEFAULT_BASE: LeagueBaseline = { draw: 22.5, over15P1: 48, btts1P: 31, over15P2: 62, over45: 72, over55: 57 };
let base: LeagueBaseline = DEFAULT_BASE;

export function setLeagueBaseline(b?: LeagueBaseline) {
  base = b ? { ...DEFAULT_BASE, ...b } : DEFAULT_BASE;
}

// razões low / watch / strong face à referência
const RATIOS: Record<Exclude<MarketKey, "win">, [number, number, number]> = {
  draw: [0.92, 0.98, 1.06],
  over15P1: [0.90, 0.97, 1.05],
  btts1P: [0.88, 0.97, 1.06],
  over15P2: [0.91, 0.97, 1.04],
  over45: [0.91, 0.97, 1.04],
  over55: [0.85, 0.97, 1.08],
};

type Scale = { low: number; watch: number; strong: number; lo: number; hi: number };

function scaleOf(market: MarketKey): Scale {
  if (market === "win") return { low: 45, watch: 54, strong: M.win.min, lo: 35, hi: 75 };
  const b = base[market];
  const [l, w, s] = RATIOS[market];
  return {
    low: b * l,
    watch: b * w,
    strong: Math.min(b * s, M[market].min),
    lo: b * 0.7,
    hi: Math.min(100, b * 1.3),
  };
}

export function tierOf(market: MarketKey, value: number): Tier {
  const s = scaleOf(market);
  if (value >= s.strong) return "strong";
  if (value >= s.watch) return "watch";
  if (value < s.low) return "low";
  return "normal";
}

/** Largura da barra (6–100%) face ao intervalo típico do mercado. */
export function barPct(market: MarketKey, value: number): number {
  const s = scaleOf(market);
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
