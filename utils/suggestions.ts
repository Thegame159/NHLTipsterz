// utils/suggestions.ts
// Constrói as "Dicas" a partir das previsões que estão REALMENTE visíveis no ecrã,
// para que as sugestões nunca falem de jogos que a aba "Jogos" não mostra.

import type { GamePrediction, StrongPick, Suggestions, WinCombo } from "../types";

/** Limiares ajustáveis. */
export const SUGGESTION_RULES = {
  tripleWin: 3,
  tripleOver15P1: 3,
  doubleOver15P1: 2, // jogos seguintes aos do triplete (nunca repetidos)
  quadrupleOver45: 4,
  over55: { max: 4, minProb: 55 },
  draw: { max: 2, minProb: 25 },
};

/**
 * "Escolhas fortes": só entram mercados em que o modelo está claramente acima do valor típico da liga.
 * `min` = probabilidade mínima (%) para o mercado entrar. Ajusta à vontade:
 * valores típicos de um jogo médio: vitória ~54, 1.º período >1.5 ~56, ambas marcam 1.º período ~37,
 * empate aos 60' ~22, 5+ golos ~73, 6+ golos ~57.
 */
export const STRONG_RULES = {
  maxPicks: 6,
  markets: {
    win: { label: "Vitória", min: 62 },
    over15P1: { label: "Over 1.5 no 1.º período", min: 64 },
    btts1P: { label: "Ambas marcam no 1.º período", min: 46 },
    draw: { label: "Empate aos 60 min", min: 28 },
    over45: { label: "Over 4.5 golos", min: 80 },
    over55: { label: "Over 5.5 golos", min: 66 },
  },
} as const;

/**
 * Combo de vitórias: só é gerado com `minGames` ou mais jogos e usa os `legs` favoritos mais prováveis.
 * Pernas extra (até `maxLegs`) só entram se o favorito seguinte tiver pelo menos `extraLegMinProb`%,
 * porque cada perna a mais multiplica a probabilidade combinada.
 */
export const COMBO_RULES = { minGames: 5, legs: 4, maxLegs: 6, extraLegMinProb: 62 };

const pct = (n: number) => Math.round(Number.isFinite(n) ? n : 0);
const matchup = (g: GamePrediction) => `${g.homeTeamAbbr} vs ${g.awayTeamAbbr}`;
const byDesc = (f: (g: GamePrediction) => number) => (a: GamePrediction, b: GamePrediction) => f(b) - f(a);

function buildWinCombo(games: GamePrediction[]): WinCombo | null {
  if (games.length < COMBO_RULES.minGames) return null;

  const ranked = games
    .map((g) => {
      const homeFav = g.winProbabilityHome >= g.winProbabilityAway;
      return {
        team: homeFav ? g.homeTeamAbbr : g.awayTeamAbbr,
        game: matchup(g),
        home: g.homeTeamAbbr,
        away: g.awayTeamAbbr,
        prob: pct(homeFav ? g.winProbabilityHome : g.winProbabilityAway),
      };
    })
    .sort((a, b) => b.prob - a.prob);

  // 4 pernas de base; as seguintes só entram se forem fortes
  const legs = ranked.filter(
    (leg, i) => i < COMBO_RULES.legs || (i < COMBO_RULES.maxLegs && leg.prob >= COMBO_RULES.extraLegMinProb)
  );

  // Jogos independentes: a probabilidade da combinada é o produto das probabilidades de cada perna.
  const combined = legs.reduce((acc, l) => acc * (l.prob / 100), 1);
  if (!(combined > 0)) return null;

  return {
    legs,
    combinedProb: Math.round(combined * 1000) / 10, // 1 casa decimal, em %
    fairOdds: Math.round((1 / combined) * 100) / 100,
  };
}

function buildStrongPicks(games: GamePrediction[]): StrongPick[] {
  const M = STRONG_RULES.markets;
  const found: (StrongPick & { margin: number })[] = [];

  for (const g of games) {
    const base = { game: matchup(g), home: g.homeTeamAbbr, away: g.awayTeamAbbr };
    const add = (m: { label: string; min: number }, prob: number, selection: string) => {
      const p = pct(prob);
      if (p >= m.min) found.push({ ...base, market: m.label, selection, prob: p, margin: p - m.min });
    };

    const homeFav = g.winProbabilityHome >= g.winProbabilityAway;
    add(M.win, homeFav ? g.winProbabilityHome : g.winProbabilityAway, homeFav ? g.homeTeamAbbr : g.awayTeamAbbr);
    add(M.over15P1, g.over15P1Prob, matchup(g));
    add(M.btts1P, g.bttsP1Prob, matchup(g));
    add(M.draw, g.drawTRProb, matchup(g));
    add(M.over45, g.over45Prob, matchup(g));
    add(M.over55, g.over55Prob ?? 0, matchup(g));
  }

  // Ordena por quanto cada pick ultrapassa o seu próprio limiar (mercados diferentes ficam comparáveis)
  return found
    .sort((a, b) => b.margin - a.margin)
    .slice(0, STRONG_RULES.maxPicks)
    .map(({ margin, ...pick }) => pick);
}

export function buildSuggestions(predictions: GamePrediction[]): Suggestions {
  const games = Array.isArray(predictions) ? predictions : [];
  const R = SUGGESTION_RULES;

  const favourite = (g: GamePrediction) =>
    g.winProbabilityHome >= g.winProbabilityAway
      ? { abbr: g.homeTeamAbbr, p: g.winProbabilityHome }
      : { abbr: g.awayTeamAbbr, p: g.winProbabilityAway };

  const tripleWin = [...games]
    .sort(byDesc((g) => favourite(g).p))
    .slice(0, R.tripleWin)
    .map((g) => `${favourite(g).abbr} (${pct(favourite(g).p)}%)`);

  const byP1 = [...games].sort(byDesc((g) => g.over15P1Prob));
  const label = (g: GamePrediction, p: number) => `${matchup(g)} (${pct(p)}%)`;

  const tripleOver15P1 = byP1.slice(0, R.tripleOver15P1).map((g) => label(g, g.over15P1Prob));
  const doubleOver15P1 = byP1
    .slice(R.tripleOver15P1, R.tripleOver15P1 + R.doubleOver15P1)
    .map((g) => label(g, g.over15P1Prob));

  const quadrupleOver45 = [...games]
    .sort(byDesc((g) => g.over45Prob))
    .slice(0, R.quadrupleOver45)
    .map((g) => label(g, g.over45Prob));

  const over55Suggestions = [...games]
    .filter((g) => (g.over55Prob ?? 0) >= R.over55.minProb)
    .sort(byDesc((g) => g.over55Prob ?? 0))
    .slice(0, R.over55.max)
    .map((g) => label(g, g.over55Prob ?? 0));

  const drawSuggestions = [...games]
    .filter((g) => g.drawTRProb >= R.draw.minProb)
    .sort(byDesc((g) => g.drawTRProb))
    .slice(0, R.draw.max)
    .map((g) => ({
      game: label(g, g.drawTRProb),
      explanation: g.analysisSummary || "Jogo equilibrado, com probabilidade acima da média de empate no tempo regulamentar.",
    }));

  return {
    tripleWin,
    tripleOver15P1,
    doubleOver15P1,
    drawSuggestions,
    quadrupleOver45,
    over55Suggestions,
    strongPicks: buildStrongPicks(games),
    winCombo: buildWinCombo(games),
  };
}
