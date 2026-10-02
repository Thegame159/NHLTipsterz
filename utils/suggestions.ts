// utils/suggestions.ts
// Constrói as "Dicas" a partir das previsões que estão REALMENTE visíveis no ecrã,
// para que as sugestões nunca falem de jogos que a aba "Jogos" não mostra.

import type { GamePrediction, Suggestions } from "../types";

/** Limiares ajustáveis. */
export const SUGGESTION_RULES = {
  tripleWin: 3,
  tripleOver15P1: 3,
  doubleOver15P1: 2, // jogos seguintes aos do triplete (nunca repetidos)
  quadrupleOver45: 4,
  over55: { max: 4, minProb: 55 },
  draw: { max: 2, minProb: 25 },
};

const pct = (n: number) => Math.round(Number.isFinite(n) ? n : 0);
const matchup = (g: GamePrediction) => `${g.homeTeamAbbr} vs ${g.awayTeamAbbr}`;
const byDesc = (f: (g: GamePrediction) => number) => (a: GamePrediction, b: GamePrediction) => f(b) - f(a);

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

  return { tripleWin, tripleOver15P1, doubleOver15P1, drawSuggestions, quadrupleOver45, over55Suggestions };
}
