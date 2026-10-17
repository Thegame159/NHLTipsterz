// components/PlayersView.tsx
// Aba "Jogadores": por equipa, os jogadores do plantel atual com mais pontos / golos / assistências,
// probabilidades de hoje (golo, assistência, ponto) e os últimos 10 jogos (clica na linha para abrir).

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

type SortKey = 'p' | 'g' | 'a' | 'prob';
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'p', label: 'Pontos' },
  { key: 'g', label: 'Golos' },
  { key: 'a', label: 'Assistências' },
  { key: 'prob', label: 'Prob. hoje' },
];

const sortCards = (cards: PlayerCard[], key: SortKey) =>
  [...cards].sort((x, y) => {
    if (key === 'prob') return y.probPoint - x.probPoint || y.probGoal - x.probGoal;
    const f = (c: PlayerCard) => (key === 'p' ? c.stat.p : key === 'g' ? c.stat.g : c.stat.a);
    return f(y) - f(x) || y.stat.p - x.stat.p || y.probPoint - x.probPoint;
  });

// Faixa dos 10 jogos (do mais antigo para o mais recente): verde = marcou, azul = só assistência, cinza = nada
const FormStrip: React.FC<{ log: PlayerCard['log'] }> = ({ log }) => (
  <div className="hidden sm:flex gap-0.5" aria-hidden="true">
    {[...log].reverse().map((r, i) => (
      <span
        key={`${r.d}-${i}`}
        title={`${ddmm(r.d)} ${r.h ? 'vs' : '@'} ${r.o}: ${r.g}G ${r.a}A`}
        className={`w-1.5 h-4 rounded-sm ${r.g > 0 ? 'bg-emerald-500' : r.a > 0 ? 'bg-sky-500' : 'bg-slate-700'}`}
      />
    ))}
  </div>
);

const Prob: React.FC<{ label: string; value: number; off: boolean }> = ({ label, value, off }) => (
  <div className="text-center w-11">
    <div className={`text-[11px] font-black px-1 py-0.5 rounded border ${off ? 'text-slate-600 border-slate-800' : probColor(value)}`}>
      {off ? '—' : `${value}%`}
    </div>
    <div className="text-[8px] font-black uppercase text-slate-600 mt-0.5">{label}</div>
  </div>
);

const PlayerRow: React.FC<{ card: PlayerCard; rank: number }> = ({ card, rank }) => {
  const [open, setOpen] = useState(false);
  const off = card.status === 'OUT';

  const streak =
    card.goalStreak >= 2
      ? `🔥 ${card.goalStreak} jogos seguidos a marcar`
      : card.pointStreak >= 3
      ? `🔥 ${card.pointStreak} jogos seguidos a pontuar`
      : card.last3Goals >= 2
      ? `marcou em ${card.last3Goals} dos últimos 3`
      : null;

  return (
    <div className={`bg-slate-900/70 border rounded-xl overflow-hidden ${off ? 'border-red-500/30' : 'border-slate-800'}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-slate-800/40 transition-colors"
        aria-expanded={open}
      >
        <span className="w-4 text-[11px] font-black text-slate-600">{rank}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`font-bold truncate ${off ? 'text-slate-500 line-through' : 'text-slate-100'}`}>{shortName(card.name)}</span>
            <span className="text-[9px] font-black text-slate-500 uppercase">{card.pos}</span>
            {card.status === 'OUT' && (
              <span title={card.injury} className="text-[9px] font-black text-red-400 border border-red-500/30 bg-red-500/10 px-1 rounded">
                LESIONADO · FORA
              </span>
            )}
            {card.status === 'DTD' && (
              <span title={card.injury} className="text-[9px] font-black text-amber-400 border border-amber-500/30 bg-amber-500/10 px-1 rounded">
                DÚVIDA
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            <b className="text-slate-200">{card.stat.g}</b>G · <b className="text-slate-200">{card.stat.a}</b>A ·{' '}
            <b className="text-white">{card.stat.p}</b>P <span className="text-slate-600">({card.stat.gp} j{card.statPrev ? ', ép. anterior' : ''})</span>
          </div>
          <div className="text-[10px] text-slate-500">
            últimos {card.n}: marcou {card.goalGames} · assistiu {card.assistGames} · pontuou {card.pointGames}
          </div>
          {streak && !off && <div className="text-[10px] font-bold text-orange-400">{streak}</div>}
        </div>
        <FormStrip log={card.log} />
        <Prob label="Golo" value={card.probGoal} off={off} />
        <Prob label="Assist." value={card.probAssist} off={off} />
        <Prob label="Ponto" value={card.probPoint} off={off} />
        <span className="text-slate-600 text-[10px]">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-slate-800 px-3 py-2">
          {card.injury && <p className="text-[11px] text-amber-300 mb-1">Estado: {card.injury}</p>}
          {card.log.length === 0 ? (
            <p className="text-[11px] text-slate-500">Sem jogos registados.</p>
          ) : (
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
                  <tr key={`${r.d}-${i}`} className={r.g > 0 ? 'bg-emerald-500/10' : r.a > 0 ? 'bg-sky-500/10' : ''}>
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
          )}
        </div>
      )}
    </div>
  );
};

const SHOWN = 5;

const TeamBlock: React.FC<{ team: TeamPlayers; sort: SortKey }> = ({ team, sort }) => {
  const [all, setAll] = useState(false);
  const cards = sortCards(team.players, sort);
  const list = all ? cards : cards.slice(0, SHOWN);

  return (
    <div className="space-y-3">
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

      {team.injured.length > 0 && (
        <p className="text-[11px] text-red-300/90 leading-snug">
          <b>Lesionados:</b> {team.injured.map((i) => `${i.name} (${i.status})`).join(' · ')}
        </p>
      )}

      {cards.length === 0 ? (
        <p className="text-xs text-slate-500">Sem dados de jogadores desta equipa.</p>
      ) : (
        <div className="space-y-2">
          {list.map((c, i) => (
            <PlayerRow key={c.id} card={c} rank={i + 1} />
          ))}
          {cards.length > SHOWN && (
            <button onClick={() => setAll((v) => !v)} className="w-full text-[10px] font-black uppercase tracking-wider text-slate-500 hover:text-slate-300 py-1">
              {all ? 'Ver menos' : `Ver mais (${cards.length - SHOWN})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const PlayersView: React.FC<Props> = ({ predictions, date }) => {
  const key = `${date}|${predictions.map((p) => p.id).join(',')}`;
  const [games, setGames] = useState<GamePlayers[] | null>(cache.get(key) ?? null);
  const [loading, setLoading] = useState(!cache.has(key) && predictions.length > 0);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sort, setSort] = useState<SortKey>('p');

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
      <div className="space-y-2">
        <p className="text-[11px] text-slate-500 leading-snug">
          Plantel <b className="text-slate-300">atual</b> de cada equipa. Probabilidades de hoje a partir dos <b className="text-slate-300">últimos 10 jogos</b>, da época
          e dos golos esperados da equipa. Faixa verde = marcou, azul = só assistência. Clica num jogador para ver os 10 jogos.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {SORTS.map((o) => (
            <button
              key={o.key}
              onClick={() => setSort(o.key)}
              className={`rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-wider border transition-colors ${
                sort === o.key ? 'bg-orange-600 border-orange-500 text-white' : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

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
              <TeamBlock team={g.home} sort={sort} />
              <TeamBlock team={g.away} sort={sort} />
            </div>
          </section>
        );
      })}
    </div>
  );
};

export default PlayersView;
