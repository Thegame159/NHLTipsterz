// utils/playersData.ts
// Pedido dos jogadores do dia (partilhado entre as abas Jogadores e Minhas Picks) com cache em memória.

import { GamePrediction, GamePlayers } from '../types';

export const playersCache = new Map<string, GamePlayers[]>();

export const playersKey = (date: string, predictions: GamePrediction[]) =>
  `${date}|${predictions.map((p) => p.id).join(',')}`;

export async function fetchPlayersForGames(date: string, predictions: GamePrediction[]): Promise<GamePlayers[]> {
  const key = playersKey(date, predictions);
  const cached = playersCache.get(key);
  if (cached) return cached;
  const res = await fetch('/api/players', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      date,
      games: predictions.map((p) => ({
        id: p.id,
        homeAbbr: p.homeTeamAbbr,
        awayAbbr: p.awayTeamAbbr,
        homeName: p.homeTeam,
        awayName: p.awayTeam,
        expHome: p.expGoalsHome,
        expAway: p.expGoalsAway,
      })),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || 'Não foi possível obter os jogadores.');
  const list: GamePlayers[] = Array.isArray(data?.games) ? data.games : [];
  playersCache.set(key, list);
  return list;
}
