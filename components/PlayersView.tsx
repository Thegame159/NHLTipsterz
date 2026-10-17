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

const byPoints = (cards: PlayerCard[]) =>
  [...cards].sort((x, y) => y.stat.p - x.stat.p || y.stat.g - x.stat.g || y.probPoint - x.probPoint);

// Faixa dos 10 jogos (do mais antigo para o mais recente): verde = marcou, azul = só assistência, cinza = nada
const FormStrip: React.FC<{ log: PlayerCard['log'] }> = ({ log }) => (
  <div className="flex gap-0.5" aria-hidden="true">
    {[...log].reverse().map((r, i) => (
      <span
        key={`${r.d}-${i}`}
        title={`${ddmm(r.d)} ${r.h ? 'vs' : '@'} ${r.o}: ${r.g}G ${r.a}A`}
        className={`w-1.5 h-4 rounded-sm ${r.g > 0 ? 'bg-emerald-500' : r.a > 0 ? 'bg-sky-500' : 'bg-slate-700'}`}
      />
    ))}
  </div>
);

const PlayerRow: React.FC<{ card: PlayerCard; rank: number; top?: boolean }> = ({ card, rank, top }) => {
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
    <div className={`bg-slate-900/70 border rounded-xl overflow-hidden ${off ? 'border-red-500/30' : top ? 'border-orange-500/60 bg-orange-500/5' : 'border-slate-800'}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-800/40 transition-colors"
        aria-expanded={open}
      >
        <span className="w-4 text-[11px] font-black text-slate-600">{rank}</span>
        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          <span className={`font-bold truncate ${off ? 'text-slate-500 line-through' : 'text-slate-100'}`}>{shortName(card.name)}</span>
          <span className="text-[9px] font-black text-slate-500 uppercase">{card.pos}</span>
          {top && (
            <span className="text-[9px] font-black text-orange-400 border border-orange-500/40 bg-orange-500/10 px-1 rounded">★ DESTAQUE</span>
          )}
          {off && (
            <span title={card.injury} className="text-[9px] font-black text-red-400 border border-red-500/30 bg-red-500/10 px-1 rounded">
              LESIONADO
            </span>
          )}
          {card.status === 'DTD' && (
            <span title={card.injury} className="text-[9px] font-black text-amber-400 border border-amber-500/30 bg-amber-500/10 px-1 rounded">
              DÚVIDA
            </span>
          )}
        </div>
        <FormStrip log={card.log} />
        <span className="text-[11px] text-slate-400 whitespace-nowrap">
          <b className="text-white">{card.stat.p}</b> pts
        </span>
        <span className={`w-12 text-center text-xs font-black px-1.5 py-1 rounded border ${off ? 'text-slate-600 border-slate-800' : probColor(card.probPoint)}`}>
          {off ? '—' : `${card.probPoint}%`}
        </span>
        <span className="text-slate-600 text-[10px]">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-slate-800 px-3 py-3 space-y-2">
          <div className="text-[11px] text-slate-400">
            Época: <b className="text-slate-200">{card.stat.g}</b>G · <b className="text-slate-200">{card.stat.a}</b>A ·{' '}
            <b className="text-white">{card.stat.p}</b>P em {card.stat.gp} jogos{card.statPrev ? ' (época anterior)' : ''}
          </div>
          {card.injury && <div className="text-[11px] text-amber-300">Estado: {card.injury}</div>}
          {!off && (
            <div className="text-[11px] text-slate-400">
              Hoje: marcar <b className="text-slate-200">{card.probGoal}%</b> · assistir <b className="text-slate-200">{card.probAssist}%</b> · pontuar{' '}
              <b className="text-slate-200">{card.probPoint}%</b>
            </div>
          )}
          <div className="text-[11px] text-slate-400">
            Últimos {card.n} jogos: marcou {card.goalGames} · assistiu {card.assistGames} · pontuou {card.pointGames}
          </div>
          {streak && !off && <div className="text-[11px] font-bold text-orange-400">{streak}</div>}
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

const TeamBlock: React.FC<{ team: TeamPlayers }> = ({ team }) => {
  const [all, setAll] = useState(false);
  const cards = byPoints(team.players);
  // destaque: os 3 com maior probabilidade de pontuar hoje (disponíveis)
  const top = new Set(
    [...cards]
      .filter((c) => c.status !== 'OUT')
      .sort((a, b) => b.probPoint - a.probPoint)
      .slice(0, 3)
      .map((c) => c.id)
  );
  const list = all ? cards : cards.filter((c, i) => i < SHOWN || top.has(c.id));

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
          {list.map((c) => (
            <PlayerRow key={c.id} card={c} rank={cards.indexOf(c) + 1} top={top.has(c.id)} />
          ))}
          {cards.length > list.length || all ? (
            <button onClick={() => setAll((v) => !v)} className="w-full text-[10px] font-black uppercase tracking-wider text-slate-500 hover:text-slate-300 py-1">
              {all ? 'Ver menos' : `Ver mais (${cards.length - list.length})`}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
};

const TeamChip: React.FC<{ abbr: string; align: 'left' | 'right' }> = ({ abbr, align }) => (
  <div className={`flex items-center gap-3 min-w-0 flex-1 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}>
    <img
      src={getLogoUrl(abbr)}
      alt={abbr}
      className="w-10 h-10 sm:w-11 sm:h-11 object-contain shrink-0 bg-slate-800/80 rounded-full p-1.5 border border-slate-700"
      loading="lazy"
      onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
    />
    <span className="font-black text-white text-sm sm:text-base truncate">{teamLabel(abbr)}</span>
  </div>
);

const GameSection: React.FC<{ p: GamePrediction; g: GamePlayers }> = ({ p, g }) => {
  const [open, setOpen] = useState(false);
  return (
    <section className={`rounded-2xl border overflow-hidden transition-colors ${open ? 'border-orange-500/40 bg-slate-800/50' : 'border-slate-700 bg-slate-800/40'}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 sm:px-5 py-3.5 text-left hover:bg-slate-800/60 transition-colors"
        aria-expanded={open}
      >
        <TeamChip abbr={p.homeTeamAbbr} align="left" />
        <div className="flex flex-col items-center shrink-0">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">vs</span>
          <span className="mt-0.5 text-[11px] font-black text-orange-300 bg-orange-500/10 border border-orange-500/30 rounded-full px-2.5 py-0.5">
            {new Date(p.dateTime).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <TeamChip abbr={p.awayTeamAbbr} align="right" />
        <span className="text-slate-500 text-[10px] shrink-0">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-4 sm:px-5 pb-5 pt-1 border-t border-slate-700/60">
          <TeamBlock team={g.home} />
          <TeamBlock team={g.away} />
        </div>
      )}
    </section>
  );
};

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
        Jogadores do plantel atual ordenados por <b className="text-slate-300">pontos</b> na época. A % é a probabilidade de pontuar hoje; os 3 com maior probabilidade de cada equipa ficam em destaque (★).
        Clica num jogo para abrir e num jogador para ver os últimos 10 jogos.
      </p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-[11px] text-slate-400">
        <span className="font-black uppercase tracking-wider text-[9px] text-slate-500">Últimos 10 jogos</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-4 rounded-sm bg-emerald-500" /> golo</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-4 rounded-sm bg-sky-500" /> só assistência</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-4 rounded-sm bg-slate-700" /> sem pontos</span>
        <span className="text-slate-600">· do mais antigo (esq.) ao mais recente (dir.)</span>
      </div>

      {predictions.map((p) => {
        const g = byId.get(String(p.id));
        if (!g) return null;
        return <GameSection key={p.id} p={p} g={g} />;
      })}
    </div>
  );
};

export default PlayersView;
