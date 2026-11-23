// components/PicksDoDiaView.tsx
// Separador "Picks do Dia" (só leitura): as picks que o administrador publicou, no mesmo formato das Dicas.

import React, { useEffect, useMemo, useState } from 'react';
import type { Suggestions } from '../types';
import TabHeader from './TabHeader';
import { PickRow, SuggestionCard } from './SuggestionsView';

type PlayerPick = { name?: string; abbr?: string; opp?: string; prob?: number };
type GameProbs = {
  home: string;
  away: string;
  winHome?: number;
  winAway?: number;
  over15P1?: number;
  btts1P?: number;
  draw?: number;
  over45?: number;
  over55?: number;
  over15P2?: number;
};
type Published = {
  date: string;
  publishedAt: number;
  suggestions: Suggestions;
  players?: { goal?: PlayerPick[]; point?: PlayerPick[] };
  games?: GameProbs[];
};

const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const shift = (iso: string, days: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  return toISO(new Date(y, m - 1, d + days));
};
const fmtDay = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/');

/** "AWAY VS HOME" (como as Minhas Picks guardam) → equipas */
const teamsOf = (g: string) =>
  String(g || '')
    .toUpperCase()
    .replace(/\(\s*\d+(\.\d+)?%\s*\)/g, '')
    .split(/\s+(?:VS|@)\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

const COMBO: Record<string, string> = { HOME: 'Vitória casa', AWAY: 'Vitória fora', '1X': '1X · casa ou empate', X2: 'X2 · fora ou empate' };

const PicksDoDiaView: React.FC = () => {
  const today = toISO(new Date());
  const [date, setDate] = useState(today);
  const [data, setData] = useState<Published | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    fetch(`/api/history?date=${date}&side=published`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => alive && setData(d?.published ?? null))
      .catch(() => alive && setError(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [date]);

  // procura o jogo pelas duas equipas (em qualquer ordem)
  const findGame = useMemo(() => {
    const list = data?.games ?? [];
    return (teams: string[]) => list.find((g) => teams.includes(g.home) && teams.includes(g.away)) ?? null;
  }, [data]);
  const gameOfTeam = (abbr: string) => (data?.games ?? []).find((g) => g.home === abbr || g.away === abbr) ?? null;

  const s = data?.suggestions;
  const tiros = s?.tiroDoDia ?? [];
  const combo = s?.combinadaFlex ?? [];
  const overs = [
    ...(s?.quadrupleOver45 ?? []).map((g) => ({ g, line: '4.5' as const })),
    ...(s?.over55Suggestions ?? []).map((g) => ({ g, line: '5.5' as const })),
  ];
  const goal = data?.players?.goal ?? [];
  const point = data?.players?.point ?? [];
  const draws = s?.drawSuggestions ?? [];
  const tripleWin = s?.tripleWin ?? [];
  const p1Triple = s?.tripleOver15P1 ?? [];
  const p1Double = s?.doubleOver15P1 ?? [];
  const p2Triple = s?.tripleOver15P2 ?? [];
  const total =
    tiros.length + combo.length + overs.length + goal.length + point.length + draws.length + tripleWin.length + p1Triple.length + p1Double.length + p2Triple.length;

  const gameRows = (items: string[], key: keyof GameProbs, badge: string, scale?: any) =>
    items.map((g, i) => {
      const t = teamsOf(g);
      const game = findGame(t);
      return (
        <PickRow key={i} index={i} badgeColor={badge} teams={t} text={t.join(' vs ')} perc={game ? Number(game[key]) : undefined} scale={scale} />
      );
    });

  return (
    <div className="pb-24">
      <TabHeader
        kind="suggestions"
        title="Picks do Dia"
        subtitle={
          data?.publishedAt
            ? `Publicadas às ${new Date(data.publishedAt).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })} · escolhas do tipster`
            : 'As escolhas do tipster para o dia'
        }
      />

      <div className="mb-6 flex items-center gap-2">
        <button
          onClick={() => setDate((d) => shift(d, -1))}
          className="rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-1.5 text-sm text-slate-300 hover:bg-zinc-800"
          aria-label="Dia anterior"
        >
          ‹
        </button>
        <span className="min-w-[88px] text-center text-xs font-black uppercase tracking-wider text-slate-300">
          {date === today ? 'Hoje' : fmtDay(date)}
        </span>
        <button
          onClick={() => setDate((d) => shift(d, 1))}
          disabled={date >= today}
          className="rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-1.5 text-sm text-slate-300 hover:bg-zinc-800 disabled:opacity-30"
          aria-label="Dia seguinte"
        >
          ›
        </button>
      </div>

      {loading && <p className="py-24 text-center text-[10px] font-black uppercase tracking-widest text-slate-600">A carregar…</p>}
      {!loading && error && <p className="py-24 text-center text-xs text-red-300">Não foi possível carregar. Tenta de novo.</p>}
      {!loading && !error && total === 0 && (
        <p className="py-24 text-center text-[10px] font-black uppercase tracking-widest text-slate-600">
          {date === today ? 'As picks de hoje ainda não foram publicadas. Volta mais tarde.' : 'Não há picks publicadas neste dia.'}
        </p>
      )}

      {!loading && !error && total > 0 && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {tiros.length > 0 && (
            <SuggestionCard title="Tiros do Dia" items={[]} icon="fa-crosshairs" gradient="bg-gradient-to-br from-fuchsia-500 to-purple-700" badgeColor="bg-fuchsia-500" description="As apostas isoladas do dia." label="Pick do Tipster">
              {tiros.map((t, i) => {
                const game = findGame([t.home, t.away]);
                const isPlayer = t.type === 'PTS' || t.type === 'GOAL';
                const perc = isPlayer ? t.prob : t.type === 'DRAW' ? game?.draw : t.type === 'BTTS1P' ? game?.btts1P : undefined;
                const what = t.type === 'DRAW' ? 'Empate (tempo regulamentar)' : t.type === 'BTTS1P' ? 'Ambas marcam no 1.º período' : t.type === 'GOAL' ? 'A marcar' : 'A pontuar';
                return (
                  <PickRow
                    key={i}
                    index={i}
                    badgeColor="bg-fuchsia-500"
                    teams={isPlayer && t.team ? [t.team] : [t.home, t.away]}
                    text={isPlayer ? `${t.player ?? 'Jogador'}` : `${t.home} vs ${t.away}`}
                    detail={isPlayer ? `${what} · ${t.home} vs ${t.away}` : what}
                    perc={perc}
                    scale={t.type === 'DRAW' ? 'draw' : t.type === 'BTTS1P' ? 'btts' : t.type === 'GOAL' ? 'pGoal' : t.type === 'PTS' ? 'pPoint' : undefined}
                  />
                );
              })}
            </SuggestionCard>
          )}

          {combo.length > 0 && (
            <SuggestionCard title={`Combinada (${combo.length})`} items={[]} icon="fa-layer-group" gradient="bg-gradient-to-br from-yellow-400 to-orange-600" badgeColor="bg-yellow-500" description="Todas as seleções têm de acertar." label="Pick do Tipster">
              {combo.map((c, i) => {
                const t = teamsOf(c.game);
                const game = findGame(t);
                const perc = !game ? undefined : c.pick === 'HOME' ? game.winHome : c.pick === 'AWAY' ? game.winAway : undefined;
                const side = c.pick === 'HOME' || c.pick === '1X' ? game?.home : c.pick === 'AWAY' || c.pick === 'X2' ? game?.away : undefined;
                return <PickRow key={i} index={i} badgeColor="bg-yellow-500" teams={t} text={t.join(' vs ')} detail={`${COMBO[c.pick] ?? c.pick}${side ? ` (${side})` : ''}`} perc={perc} />;
              })}
            </SuggestionCard>
          )}

          {tripleWin.length > 0 && (
            <SuggestionCard title="Triplete de Vitórias" items={[]} icon="fa-award" gradient="bg-gradient-to-br from-amber-500 to-orange-600" badgeColor="bg-amber-500" description="Três equipas a ganhar (incl. OT)." label="Pick do Tipster">
              {tripleWin.map((abbr, i) => {
                const a = String(abbr).trim().toUpperCase();
                const game = gameOfTeam(a);
                const perc = !game ? undefined : game.home === a ? game.winHome : game.winAway;
                const opp = game ? (game.home === a ? game.away : game.home) : '';
                return <PickRow key={i} index={i} badgeColor="bg-amber-500" teams={[a]} text={a} detail={opp ? `contra ${opp}` : undefined} perc={perc} />;
              })}
            </SuggestionCard>
          )}

          {p1Triple.length > 0 && (
            <SuggestionCard title="Triplete Over 1.5 P1" items={[]} icon="fa-fire-alt" gradient="bg-gradient-to-br from-red-500 to-rose-700" badgeColor="bg-red-500" description="Pelo menos 2 golos no 1.º período." label="Pick do Tipster">
              {gameRows(p1Triple, 'over15P1', 'bg-red-500', 'p1')}
            </SuggestionCard>
          )}

          {p1Double.length > 0 && (
            <SuggestionCard title="Dupla Over 1.5 P1" items={[]} icon="fa-bolt" gradient="bg-gradient-to-br from-blue-500 to-indigo-700" badgeColor="bg-blue-500" description="Pelo menos 2 golos no 1.º período." label="Pick do Tipster">
              {gameRows(p1Double, 'over15P1', 'bg-blue-500', 'p1')}
            </SuggestionCard>
          )}

          {p2Triple.length > 0 && (
            <SuggestionCard title="Triplete Over 1.5 P2" items={[]} icon="fa-fire-alt" gradient="bg-gradient-to-br from-orange-500 to-amber-700" badgeColor="bg-orange-500" description="Pelo menos 2 golos no 2.º período." label="Pick do Tipster">
              {gameRows(p2Triple, 'over15P2', 'bg-orange-500', 'p2')}
            </SuggestionCard>
          )}

          {overs.length > 0 && (
            <SuggestionCard title={`Quádrupla Overs (${overs.length})`} items={[]} icon="fa-hockey-puck" gradient="bg-gradient-to-br from-emerald-500 to-teal-700" badgeColor="bg-emerald-500" description="Golos no jogo, cada um com a sua linha." label="Pick do Tipster">
              {overs.map((o, i) => {
                const t = teamsOf(o.g);
                const game = findGame(t);
                return (
                  <PickRow
                    key={i}
                    index={i}
                    badgeColor="bg-emerald-500"
                    teams={t}
                    text={t.join(' vs ')}
                    detail={`Over ${o.line}`}
                    perc={game ? (o.line === '4.5' ? game.over45 : game.over55) : undefined}
                    scale={o.line === '4.5' ? 'o45' : 'o55'}
                  />
                );
              })}
            </SuggestionCard>
          )}

          {draws.length > 0 && (
            <SuggestionCard title="Empates (TR)" items={[]} icon="fa-handshake" gradient="bg-gradient-to-br from-indigo-500 to-violet-700" badgeColor="bg-indigo-500" description="Empate no fim do tempo regulamentar." label="Pick do Tipster">
              {draws.map((d, i) => {
                const t = teamsOf(d.game);
                const game = findGame(t);
                return <PickRow key={i} index={i} badgeColor="bg-indigo-500" teams={t} text={t.join(' vs ')} detail={d.explanation || undefined} perc={game?.draw} scale="draw" />;
              })}
            </SuggestionCard>
          )}

          {goal.length > 0 && (
            <SuggestionCard title="Triplete a Marcar" items={[]} icon="fa-bullseye" gradient="bg-gradient-to-br from-cyan-500 to-sky-700" badgeColor="bg-cyan-500" description="Três jogadores a marcar golo." label="Pick do Tipster">
              {goal.map((p, i) => (
                <PickRow key={i} index={i} badgeColor="bg-cyan-500" teams={p.abbr ? [p.abbr] : []} text={p.name ?? 'Jogador'} detail={p.opp ? `contra ${p.opp}` : undefined} perc={p.prob} scale="pGoal" />
              ))}
            </SuggestionCard>
          )}

          {point.length > 0 && (
            <SuggestionCard title="Triplete a Pontuar" items={[]} icon="fa-star" gradient="bg-gradient-to-br from-lime-500 to-green-700" badgeColor="bg-lime-500" description="Três jogadores com golo ou assistência." label="Pick do Tipster">
              {point.map((p, i) => (
                <PickRow key={i} index={i} badgeColor="bg-lime-500" teams={p.abbr ? [p.abbr] : []} text={p.name ?? 'Jogador'} detail={p.opp ? `contra ${p.opp}` : undefined} perc={p.prob} scale="pPoint" />
              ))}
            </SuggestionCard>
          )}
        </div>
      )}
    </div>
  );
};

export default PicksDoDiaView;
