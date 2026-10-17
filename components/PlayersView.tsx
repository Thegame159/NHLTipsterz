// components/PlayersView.tsx
// Aba "Jogadores": por jogo, os jogadores mais prováveis de MARCAR e de PONTUAR (golo ou assistência),
// com os últimos 10 jogos de cada um (clica na linha para abrir).

import React, { useEffect, useState } from 'react';
import { GamePrediction, GamePlayers, PlayerCard, TeamPlayers } from '../types';
import { getLogoUrl, teamLabel } from '../utils/nhlUtils';

interface Props {
  predictions: GamePrediction[];
  date: string;
}

// Guarda os resultados enquanto a página está aberta (mudar de aba não volta a pedir tudo)
const cache = new Map<string, GamePlayers[]>();

const shortName = (full: string) => {
  const parts = full.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : full;
};

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const probColor = (p: number) =>
  p >= 55 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
  : p >= 35 ? 'text-amber-300 bg-amber-500/10 border-amber-500/30'
  : 'text-slate-300 bg-slate-700/30 border-slate-600/40';

// Faixa dos 10 jogos (do mais antigo para o mais recente): verde = marcou, azul = só assistência, cinza = nada
const FormStrip: React.FC<{ log: PlayerCard['log'] }> = ({ log }) => (
  <div className="flex gap-0.5" aria-hidden="true">
    {[...log].reverse().map((r, i) => (
      <span
        key={`${r.d}-${i}`}
        title={`${ddmm(r.d)} ${r.h ? 'vs' : '@'} ${r.o}: ${r.g}G ${r.a}A`}
        className={`w-2 h-4 rounded-sm ${r.g > 0 ? 'bg-emerald-500' : r.a > 0 ? 'bg-sky-500' : 'bg-slate-700'}`}
      />
    ))}
  </div>
);

const PlayerRow: React.FC<{ card: PlayerCard; mode: 'goal' | 'point' }> = ({ card, mode }) => {
  const [open, setOpen] = useState(false);
  const prob = mode === 'goal' ? card.probGoal : card.probPoint;

  const badge =
    mode === 'goal'
      ? card.goalStreak >= 2
        ? `🔥 ${card.goalStreak} jogos seguidos a marcar`
        : card.last3Goals >= 2
        ? `marcou em ${card.last3Goals} dos últimos 3`
        : null
      : card.pointStreak >= 3
      ? `🔥 ${card.pointStreak} jogos seguidos a pontuar`
      : card.last3Points >= 2
      ? `pontuou em ${card.last3Points} dos últimos 3`
      : null;

  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-800/40 transition-colors"
        aria-expanded={open}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-100 truncate">{shortName(card.name)}</span>
            <span className="text-[9px] font-black text-slate-500 uppercase">{card.pos}</span>
            {card.status === 'DTD' && (
              <span title="Dúvida (day-to-day): probabilidade reduzida" className="text-[9px] font-black text-amber-400 border border-amber-500/30 bg-amber-500/10 px-1 rounded">
                DÚVIDA
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            marcou <b className="text-slate-200">{card.goalGames}/{card.n}</b> · pontuou{' '}
            <b className="text-slate-200">{card.pointGames}/{card.n}</b>
          </div>
          {badge && <div className="text-[10px] font-bold text-orange-400 mt-0.5">{badge}</div>}
        </div>
        <FormStrip log={card.log} />
        <span className={`text-xs font-black px-2 py-1 rounded border ${probColor(prob)}`}>{prob}%</span>
        <span className="text-slate-600 text-[10px]">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-slate-800 px-3 py-2">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-slate-500 uppercase tracking-wider text-[9px]">
                <th className="text-left font-black py-1">Data</th>
                <th className="text-left font-black py-1">Jogo</th>
                <th className="text-center font-black py-1">G</th>
                <th className="text-center font-black py-1">A</th>
                <th className="text-center font-black py-1">P</th>
              </tr>
            </thead>
            <tbody>
              {card.log.map((r, i) => (
                <tr
                  key={`${r.d}-${i}`}
                  className={r.g > 0 ? 'bg-emerald-500/10' : r.a > 0 ? 'bg-sky-500/10' : ''}
                >
                  <td className="py-1 text-slate-400">
                    {ddmm(r.d)}
                    {r.prev ? <span className="ml-1 text-[9px] text-slate-600" title="Época passada">ép. ant.</span> : null}
                  </td>
                  <td className="py-1 text-slate-300">
                    {r.h ? 'vs' : '@'} {teamLabel(r.o)}
                  </td>
                  <td className={`py-1 text-center font-bold ${r.g > 0 ? 'text-emerald-400' : 'text-slate-600'}`}>{r.g}</td>
                  <td className={`py-1 text-center font-bold ${r.a > 0 ? 'text-sky-400' : 'text-slate-600'}`}>{r.a}</td>
                  <td className={`py-1 text-center font-black ${r.g + r.a > 0 ? 'text-white' : 'text-slate-600'}`}>{r.g + r.a}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const TeamBlock: React.FC<{ team: TeamPlayers }> = ({ team }) => (
  <div className="space-y-4">
    <div className="flex items-center gap-2">
      <img
        src={getLogoUrl(team.abbr)}
        alt={team.abbr}
        className="w-7 h-7 object-contain bg-slate-800 rounded-full p-1 border border-slate-700"
        loading="lazy"
        onError={(e) => (e.currentTarget.style.display = 'none')}
      />
      <span className="font-black text-white">{teamLabel(team.abbr)}</span>
    </div>

    {team.candidates === 0 ? (
      <p className="text-xs text-slate-500">Sem dados suficientes de jogadores desta equipa.</p>
    ) : (
      <>
        <div className="space-y-2">
          <div className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Para marcar</div>
          {team.scorers.map((c) => (
            <PlayerRow key={`g-${c.id}`} card={c} mode="goal" />
          ))}
        </div>
        <div className="space-y-2">
          <div className="text-[10px] font-black uppercase tracking-widest text-sky-400">Para pontuar (golo ou assistência)</div>
          {team.pointers.map((c) => (
            <PlayerRow key={`p-${c.id}`} card={c} mode="point" />
          ))}
        </div>
      </>
    )}
  </div>
);

const PlayersView: React.FC<Props> = ({ predictions, date }) => {
  const key = `${date}|${predictions.map((p) => p.id).join(',')}`;
  const [games, setGames] = useState<GamePlayers[] | null>(cache.get(key) ?? null);
  const [loading, setLoading] = useState(!cache.has(key) && predictions.length > 0);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (predictions.length === 0) return;
    const cached = cache.get(key);
    if (cached) {
      setGames(cached);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    (async () => {
      try {
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
        cache.set(key, list);
        if (active) setGames(list);
      } catch (e: any) {
        if (active) setError(e?.message || 'Erro ao obter os jogadores.');
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [key, attempt]);

  if (predictions.length === 0) {
    return <div className="py-24 text-center text-slate-600 text-[10px] font-black uppercase tracking-widest">Sem jogos para mostrar</div>;
  }
  if (loading) {
    return <div className="py-24 text-center text-slate-500 text-[10px] font-black uppercase tracking-widest">A carregar jogadores…</div>;
  }
  if (error) {
    return (
      <div className="py-16 text-center space-y-4">
        <p className="text-sm text-slate-400">{error}</p>
        <button onClick={() => setAttempt((a) => a + 1)} className="rounded-lg bg-orange-600 hover:bg-orange-500 px-4 py-2 text-[11px] font-black uppercase tracking-wider text-white">
          Tentar de novo
        </button>
      </div>
    );
  }

  const byId = new Map<string, GamePlayers>((games ?? []).map((g) => [String(g.id), g] as [string, GamePlayers]));

  return (
    <div className="space-y-6">
      <p className="text-[11px] text-slate-500 leading-snug">
        Probabilidade calculada a partir dos <b className="text-slate-300">últimos 10 jogos</b> de cada jogador, do rendimento da época e dos
        golos esperados da equipa neste jogo. Faixa verde = marcou, azul = só assistência. Clica num jogador para ver os 10 jogos.
      </p>

      {predictions.map((p) => {
        const g = byId.get(String(p.id));
        if (!g) return null;
        return (
          <section key={p.id} className="bg-slate-800/40 border border-slate-700 rounded-2xl p-5 space-y-5">
            <header className="flex items-center justify-between">
              <h3 className="font-black text-white">
                {teamLabel(p.homeTeamAbbr)} <span className="text-slate-500 font-bold">vs</span> {teamLabel(p.awayTeamAbbr)}
              </h3>
              <span className="text-[11px] font-bold text-slate-500">
                {new Date(p.dateTime).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </header>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <TeamBlock team={g.home} />
              <TeamBlock team={g.away} />
            </div>
          </section>
        );
      })}
    </div>
  );
};

export default PlayersView;
