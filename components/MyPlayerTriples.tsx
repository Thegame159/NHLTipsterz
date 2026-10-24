// components/MyPlayerTriples.tsx
// "Minhas Picks" → os meus tripletes de jogadores (golos e pontos), como na aba Jogadores,
// mas escolhidos por mim: 3 espaços por triplete, um jogador por jogo.
// O seletor mostra os 3 melhores de cada equipa de cada jogo e uma pesquisa por nome.

import React, { useEffect, useMemo, useState } from 'react';
import { GamePlayers, GamePrediction, PlayerCard } from '../types';
import { getLogoUrl, retryLightLogo, teamLabel } from '../utils/nhlUtils';
import { fetchPlayersForGames, playersCache, playersKey } from '../utils/playersData';
import { ProbBadge, PuckIcon, copyText, probOf, shortName, Mode } from './PlayersView';

export type Cand = { card: PlayerCard; abbr: string; opp: string; home: boolean; gameId: string };
type Slot = { gameId: string; playerId: number };
type Store = { goal: Slot[]; point: Slot[] };

const lsKey = (date: string) => `my_player_triples_${date}`;
const ddmm = (d: string) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '');
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const scaleOf = (mode: Mode) => (mode === 'goal' ? 'pGoal' : 'pPoint');

/** Todos os jogadores do dia (sem os lesionados "OUT") */
export function buildCands(predictions: GamePrediction[], games: GamePlayers[]): Cand[] {
  const byId = new Map<string, GamePlayers>(games.map((g) => [String(g.id), g] as [string, GamePlayers]));
  const out: Cand[] = [];
  for (const p of predictions) {
    const g = byId.get(String(p.id));
    if (!g) continue;
    for (const c of g.home.players) if (c.status !== 'OUT') out.push({ card: c, abbr: p.homeTeamAbbr, opp: p.awayTeamAbbr, home: true, gameId: String(p.id) });
    for (const c of g.away.players) if (c.status !== 'OUT') out.push({ card: c, abbr: p.awayTeamAbbr, opp: p.homeTeamAbbr, home: false, gameId: String(p.id) });
  }
  return out;
}

const Logo: React.FC<{ abbr: string; className?: string }> = ({ abbr, className = 'w-7 h-7' }) => (
  <img
    src={getLogoUrl(abbr)}
    alt={abbr}
    className={`${className} object-contain shrink-0 bg-slate-800 rounded-full p-0.5 border border-slate-700`}
    onError={(e) => { if (!retryLightLogo(e.currentTarget)) { e.currentTarget.style.visibility = 'hidden'; } }}
  />
);

// ─── Seletor ────────────────────────────────────────────────────────────────

const CandRow: React.FC<{ x: Cand; mode: Mode; blocked?: string; onChoose: (x: Cand) => void }> = ({ x, mode, blocked, onChoose }) => (
  <button
    type="button"
    disabled={!!blocked}
    onClick={() => onChoose(x)}
    className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-left transition-colors w-full ${
      blocked ? 'bg-slate-900/30 border-slate-800/60 opacity-50 cursor-not-allowed' : 'bg-slate-900/70 border-slate-800 hover:border-orange-500/50'
    }`}
  >
    <Logo abbr={x.abbr} className="w-6 h-6" />
    <div className="min-w-0 flex-1">
      <div className="font-bold text-[13px] text-slate-100 truncate">
        {shortName(x.card.name)}
        {x.card.status === 'DTD' && <span className="ml-1.5 text-[9px] font-black text-amber-400">DÚVIDA</span>}
      </div>
      <div className="text-[10px] text-slate-500 truncate">
        {blocked ?? <>{x.home ? 'vs' : '@'} {teamLabel(x.opp)} · <b className="text-slate-300">{x.card.stat.p}</b> pts</>}
      </div>
    </div>
    <ProbBadge value={probOf(x.card, mode)} scale={scaleOf(mode)} className="px-1.5 py-0.5" />
  </button>
);

export const PlayerPicker: React.FC<{
  mode: Mode;
  all: Cand[];
  games: { id: string; home: string; away: string }[];
  usedGames: Set<string>;
  usedIds: Set<number>;
  onChoose: (x: Cand) => void;
  onClose: () => void;
  initialQuery?: string;
}> = ({ mode, all, games, usedGames, usedIds, onChoose, onClose, initialQuery = '' }) => {
  const [q, setQ] = useState(initialQuery);
  const query = norm(q.trim());

  const results = useMemo(() => {
    if (query.length < 2) return [];
    return all
      .filter((x) => norm(x.card.name).includes(query))
      .sort((a, b) => probOf(b.card, mode) - probOf(a.card, mode))
      .slice(0, 12);
  }, [all, query, mode]);

  const blockedOf = (x: Cand) => (usedIds.has(x.card.id) ? 'Já escolhido' : usedGames.has(x.gameId) ? 'Já tens um jogador deste jogo' : undefined);

  const topOf = (gameId: string, abbr: string) =>
    all
      .filter((x) => x.gameId === gameId && x.abbr === abbr)
      .sort((a, b) => probOf(b.card, mode) - probOf(a.card, mode))
      .slice(0, 3);

  return (
    <div className="rounded-xl border border-orange-500/40 bg-slate-950/70 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Procurar jogador (qualquer um dos jogos de hoje)…"
          className="flex-1 min-w-0 rounded-lg bg-slate-900 border border-slate-700 focus:border-orange-500/60 outline-none px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-600"
        />
        <button
          type="button"
          onClick={onClose}
          className="text-[10px] font-black uppercase tracking-wider rounded-lg px-2.5 py-2 border bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white"
        >
          Fechar
        </button>
      </div>

      {query.length >= 2 ? (
        results.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {results.map((x) => (
              <CandRow key={`${x.gameId}-${x.card.id}`} x={x} mode={mode} blocked={blockedOf(x)} onChoose={onChoose} />
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-slate-500 py-2">Nenhum jogador encontrado.</p>
        )
      ) : (
        <div className="space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Os 3 melhores de cada equipa</p>
          {games.map((g) =>
            usedGames.has(g.id) ? (
              <div key={g.id} className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
                <Logo abbr={g.away} className="w-5 h-5" />
                {teamLabel(g.away)} <span>@</span> {teamLabel(g.home)}
                <Logo abbr={g.home} className="w-5 h-5" />
                <span className="ml-1 text-emerald-500/80">✓ já tens um jogador deste jogo</span>
              </div>
            ) : (
            <div key={g.id} className="space-y-1.5">
              <div className="flex items-center gap-2 text-[11px] font-black text-slate-400">
                <Logo abbr={g.away} className="w-5 h-5" />
                {teamLabel(g.away)} <span className="text-slate-600">@</span> {teamLabel(g.home)}
                <Logo abbr={g.home} className="w-5 h-5" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {[g.away, g.home].map((abbr) => (
                  <div key={abbr} className="space-y-1.5">
                    {topOf(g.id, abbr).map((x) => (
                      <CandRow key={x.card.id} x={x} mode={mode} blocked={blockedOf(x)} onChoose={onChoose} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
            )
          )}
        </div>
      )}
    </div>
  );
};

// ─── Cartão do triplete ─────────────────────────────────────────────────────

export const MyTripleCard: React.FC<{
  mode: Mode;
  picks: Cand[];
  all: Cand[];
  games: { id: string; home: string; away: string }[];
  dateLabel: string;
  onAdd: (x: Cand) => void;
  onRemove: (playerId: number) => void;
  initialOpen?: boolean;
  initialQuery?: string;
}> = ({ mode, picks, all, games, dateLabel, onAdd, onRemove, initialOpen = false, initialQuery = '' }) => {
  const [open, setOpen] = useState(initialOpen);
  const [copied, setCopied] = useState(false);
  const full = picks.length >= 3;
  const combined = picks.length ? picks.reduce((acc, x) => acc * (probOf(x.card, mode) / 100), 1) * 100 : 0;
  const usedGames = new Set(picks.map((x) => x.gameId));
  const usedIds = new Set(picks.map((x) => x.card.id));

  const doCopy = async () => {
    const title = mode === 'goal' ? 'Meu triplete de golos' : 'Meu triplete de pontos';
    const lines = picks.map((x, j) => `${j + 1}. ${shortName(x.card.name)} (${x.abbr}) ${x.home ? 'vs' : '@'} ${x.opp} — ${probOf(x.card, mode)}%`);
    const text = `🏒 NHL Tipsterz · ${title}${dateLabel ? ` · ${dateLabel}` : ''}\n\n${lines.join('\n')}\nCombinada: ~${Math.round(combined)}%`;
    if (await copyText(text)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <section className="rounded-xl border border-orange-500/40 bg-gradient-to-br from-orange-500/10 to-slate-900/40 p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-black text-white text-sm uppercase tracking-wider">
          {mode === 'goal' ? <><PuckIcon className="w-5 h-5" /> Meu triplete de golos</> : <>🔥 Meu triplete de pontos</>}
        </h3>
        <div className="flex items-center gap-2">
          {picks.length > 0 && (
            <span className="text-[11px] font-black text-orange-300 bg-orange-500/10 border border-orange-500/30 rounded-full px-2 py-0.5">
              combinada {combined.toFixed(1)}%
            </span>
          )}
          {picks.length > 0 && (
            <button
              onClick={doCopy}
              className="text-[10px] font-black uppercase tracking-wider rounded-lg px-2.5 py-1 border bg-slate-800/60 border-slate-700 text-slate-300 hover:text-white hover:border-orange-500/50 transition-colors"
            >
              {copied ? '✓ Copiado' : 'Copiar'}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => {
          const x = picks[i];
          if (!x) {
            return (
              <button
                key={`empty-${i}`}
                type="button"
                onClick={() => setOpen(true)}
                className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-700 hover:border-orange-500/60 text-slate-500 hover:text-orange-300 px-2.5 py-3 text-[12px] font-black uppercase tracking-wider transition-colors"
              >
                <span className="text-base leading-none">＋</span> Escolher jogador
              </button>
            );
          }
          return (
            <div key={x.card.id} className="flex items-center gap-2.5 rounded-lg bg-slate-900/70 border border-slate-800 px-2.5 py-1.5">
              <Logo abbr={x.abbr} />
              <div className="min-w-0 flex-1">
                <div className="font-bold text-sm text-slate-100 truncate">{shortName(x.card.name)}</div>
                <div className="text-[10px] text-slate-500">
                  {x.home ? 'vs' : '@'} {teamLabel(x.opp)} · <b className="text-slate-300">{x.card.stat.p}</b> pts
                </div>
              </div>
              <ProbBadge value={probOf(x.card, mode)} scale={scaleOf(mode)} className="px-1.5 py-0.5" />
              <button
                type="button"
                title="Remover"
                onClick={() => onRemove(x.card.id)}
                className="w-6 h-6 shrink-0 flex items-center justify-center rounded-full text-slate-500 hover:text-rose-300 hover:bg-rose-500/10 text-xs"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>

      {open && !full && (
        <PlayerPicker
          mode={mode}
          all={all}
          games={games}
          usedGames={usedGames}
          usedIds={usedIds}
          initialQuery={initialQuery}
          onClose={() => setOpen(false)}
          onChoose={(x) => {
            onAdd(x);
            if (picks.length + 1 >= 3) setOpen(false);
          }}
        />
      )}

      <p className="text-[10px] text-slate-500">
        {mode === 'goal' ? 'Para marcar golo.' : 'Para pontuar (golo ou assistência).'} Um jogador por jogo; a combinada assume jogadores independentes.
      </p>
    </section>
  );
};

// ─── Secção (dados + guardar no telemóvel) ──────────────────────────────────

const MyPlayerTriples: React.FC<{ predictions: GamePrediction[]; date: string }> = ({ predictions, date }) => {
  const key = playersKey(date, predictions);
  const [games, setGames] = useState<GamePlayers[] | null>(playersCache.get(key) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [store, setStore] = useState<Store>({ goal: [], point: [] });

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(lsKey(date));
      const p = raw ? JSON.parse(raw) : null;
      setStore({ goal: Array.isArray(p?.goal) ? p.goal : [], point: Array.isArray(p?.point) ? p.point : [] });
    } catch {
      setStore({ goal: [], point: [] });
    }
  }, [date]);

  const save = (next: Store) => {
    setStore(next);
    try {
      window.localStorage.setItem(lsKey(date), JSON.stringify(next));
    } catch {
      // sem armazenamento: fica só nesta sessão
    }
  };

  useEffect(() => {
    if (predictions.length === 0 || games) return;
    let active = true;
    setError(null);
    fetchPlayersForGames(date, predictions)
      .then((list) => active && setGames(list))
      .catch((e) => active && setError(e?.message || 'Erro ao obter os jogadores.'));
    return () => {
      active = false;
    };
  }, [key, attempt]);

  const all = useMemo(() => (games ? buildCands(predictions, games) : []), [games, predictions]);
  const gameList = useMemo(() => predictions.map((p) => ({ id: String(p.id), home: p.homeTeamAbbr, away: p.awayTeamAbbr })), [predictions]);
  const resolve = (slots: Slot[]): Cand[] =>
    slots.map((s) => all.find((x) => x.gameId === s.gameId && x.card.id === s.playerId)).filter(Boolean) as Cand[];

  if (predictions.length === 0) return null;
  if (error) {
    return (
      <div className="rounded-xl border border-slate-800 p-4 text-center space-y-3">
        <p className="text-sm text-slate-400">{error}</p>
        <button onClick={() => setAttempt((a) => a + 1)} className="rounded-lg bg-orange-600 hover:bg-orange-500 px-4 py-2 text-[11px] font-black uppercase tracking-wider text-white">
          Tentar de novo
        </button>
      </div>
    );
  }
  if (!games) {
    return <div className="py-8 text-center text-slate-500 text-[10px] font-black uppercase tracking-widest">A carregar jogadores…</div>;
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-black text-white">Tripletes de jogadores</h2>
        <p className="text-xs text-slate-400">Escolhe até 3 jogadores (de jogos diferentes) para golos e para pontos.</p>
      </div>
      {(['goal', 'point'] as Mode[]).map((mode) => (
        <MyTripleCard
          key={mode}
          mode={mode}
          picks={resolve(store[mode])}
          all={all}
          games={gameList}
          dateLabel={ddmm(date)}
          onAdd={(x) => {
            if (store[mode].length >= 3) return;
            save({ ...store, [mode]: [...store[mode], { gameId: x.gameId, playerId: x.card.id }] });
          }}
          onRemove={(id) => save({ ...store, [mode]: store[mode].filter((s) => s.playerId !== id) })}
        />
      ))}
    </div>
  );
};

export default MyPlayerTriples;
