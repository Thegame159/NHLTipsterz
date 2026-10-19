// utils/marketScale.ts
// Escalas de cor próprias de cada mercado, partilhadas pelo ecrã Jogos e pelo ecrã Dicas.
// O modelo varia pouco à volta da média da liga, por isso cada mercado tem os seus limites.
//
//  t = [fim do vermelho, fim do laranja, fim do verde] · star = a partir daqui aparece ★ · lo/hi = extremos da barra
//  empate (média ~22–23%): ≤21 vermelho · 22–24 laranja · 25 verde · 26+ forte, ★ a partir de 24
//  1.º período > 1.5 (média ~48%): ≤43 vermelho · 44–50 laranja · 51–52 verde · 53+ forte, ★ a partir de 49
//  1.º período BTTS (média ~31%): ≤27 vermelho · 28–33 laranja · 34–35 verde · 36+ forte, ★ a partir de 32
//  2.º período > 1.5 (média ~62%): ≤57 vermelho · 58–65 laranja · 66–67 verde · 68+ forte, ★ a partir de 64
//  jogo > 4.5 (média ~72%): ≤65 vermelho · 66–72 laranja · 73–74 verde · 75+ forte, ★ a partir de 74
//  jogo > 5.5 (média ~57%): ≤49 vermelho · 50–57 laranja · 58–61 verde · 62+ forte, ★ a partir de 59

export type ScaleKey = "draw" | "p1" | "btts" | "p2" | "o45" | "o55";

export const SCALES: Record<ScaleKey, { t: [number, number, number]; star: number; lo: number; hi: number }> = {
  draw: { t: [21.5, 24.5, 25.5], star: 23.5, lo: 15, hi: 30 },
  p1: { t: [43.5, 50.5, 52.5], star: 48.5, lo: 30, hi: 65 },
  btts: { t: [27.5, 33.5, 35.5], star: 31.5, lo: 15, hi: 50 },
  p2: { t: [57.5, 65.5, 67.5], star: 63.5, lo: 45, hi: 82 },
  o45: { t: [65.5, 72.5, 74.5], star: 73.5, lo: 50, hi: 92 },
  o55: { t: [49.5, 57.5, 61.5], star: 58.5, lo: 30, hi: 80 },
};

/** 0 vermelho · 1 laranja · 2 verde · 3 verde forte */
export const levelOf = (k: ScaleKey, v: number): number => {
  const t = SCALES[k].t;
  return v < t[0] ? 0 : v < t[1] ? 1 : v < t[2] ? 2 : 3;
};

export const hasStar = (k: ScaleKey, v: number): boolean => v >= SCALES[k].star;

export const SCALE_BADGE = [
  "text-rose-400 border-rose-500/30 bg-rose-500/10",
  "text-amber-400 border-amber-500/30 bg-amber-500/10",
  "text-green-400 border-green-500/30 bg-green-500/10",
  "text-emerald-300 border-emerald-400/60 bg-emerald-500/15 ring-1 ring-emerald-400/40 shadow-[0_0_12px_rgba(16,185,129,0.3)]",
];

export const SCALE_BAR = [
  "bg-gradient-to-r from-rose-500 to-red-500",
  "bg-gradient-to-r from-yellow-500 to-amber-500",
  "bg-gradient-to-r from-green-500 to-emerald-500",
  "bg-gradient-to-r from-emerald-400 to-green-500",
];

export const STAR_CLASS = [
  "border-rose-400 text-rose-300",
  "border-amber-400 text-amber-300",
  "border-emerald-400 text-emerald-300",
  "border-emerald-400 text-emerald-300",
];

export const barWidth = (k: ScaleKey, v: number): number => {
  const s = SCALES[k];
  return Math.max(6, Math.min(100, ((v - s.lo) / (s.hi - s.lo)) * 100));
};

/** Mantida só por compatibilidade (a escala já não depende da média enviada pela API). */
export function setLeagueBaseline(_b?: unknown) {}
