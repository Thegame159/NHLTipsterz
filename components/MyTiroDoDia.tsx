// components/MyTiroDoDia.tsx
// "Minhas Picks" → Tiro do Dia: pode haver mais do que um por dia.
// Tipos: Empate (tempo regulamentar), BTTS 1P (ambas marcam no 1.º período),
// jogador a pontuar e jogador a marcar.

import React, { useMemo, useState } from 'react';
import { GamePlayers, GamePrediction, Tiro, TiroType } from '../types';
import { getLogoUrl, retryLightLogo, teamLabel } from '../utils/nhlUtils';
import { fetchPlayersForGames } from '../utils/playersData';
import { IconDropdown, Option } from './IconDropdown';
import { buildCands, Cand, PlayerPicker } from './MyPlayerTriples';
import { probOf } from './PlayersView';

export const TIRO_TYPES: { type: TiroType; icon: string; label: string; long: string }[] = [
  { type: 'DRAW', icon: '🤝', label: 'Empate', long: 'Empate (tempo regulamentar)' },
  { type: 'BTTS1P', icon: '⚽⚽', label: 'BTTS 1P', long: 'BTTS 1.º período' },
  { type: 'PTS', icon: '🎯', label: 'Jogador a pontuar', long: 'Jogador a pontuar' },
  { type: 'GOAL', icon: '🥅', label: 'Jogador a marcar', long: 'Jogador a marcar' },
];
const typeInfo = (t: TiroType) => TIRO_TYPES.find((x) => x.type === t)!;

const Logo: React.FC<{ abbr: string; className?: string }> = ({ abbr, className = 'w-7 h-7' }) => (
  <img
    src={getLogoUrl(abbr)}
    alt=""
    className={`${className} bg-slate-800 rounded-full p-0.5 border border-slate-700`}
    onError={(e) => {
      if (!retryLightLogo(e.currentTarget)) e.currentTarget.style.display = 'none';
    }}
  />
);

export const TiroRow: React.FC<{ tiro: Tiro; onRemove?: () => void }> = ({ tiro, onRemove }) => {
  const info = typeInfo(tiro.type);
  const isPlayer = tiro.type === 'PTS' || tiro.type === 'GOAL';
  return (
    <div className="flex items-center gap-3 rounded-xl bg-slate-900/70 border border-rose-500/30 p-3">
      <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-sm shrink-0">{info.icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-black uppercase tracking-widest text-rose-300">{info.long}</div>
        <div className="text-base font-black text-white truncate">
          {isPlayer ? tiro.player : `${teamLabel(tiro.home)} vs ${teamLabel(tiro.away)}`}
        </div>
        {isPlayer && (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            {tiro.team && <Logo abbr={tiro.team} className="w-4 h-4" />}
            {teamLabel(tiro.home)} vs {teamLabel(tiro.away)}
            {tiro.prob != null && <span className="ml-1 font-black text-emerald-300">{Math.round(tiro.prob)}%</span>}
          </div>
        )}
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition shrink-0"
          aria-label="Remover tiro"
        >
          <i className="fas fa-times text-[10px]" />
        </button>
      )}
    </div>
  );
};

const sameTiro = (a: Tiro, b: Tiro) =>
  a.type === b.type && a.home === b.home && a.away === b.away && (a.playerId ?? 0) === (b.playerId ?? 0);

const MyTiroDoDia: React.FC<{
  tiros: Tiro[];
  onChange: (next: Tiro[]) => void;
  predictions: GamePrediction[];
  date: string;
  gameOptions: Option[];
}> = ({ tiros, onChange, predictions, date, gameOptions }) => {
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<TiroType | null>(null);
  const [games, setGames] = useState<GamePlayers[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isPlayer = type === 'PTS' || type === 'GOAL';
  const gameList = useMemo(() => predictions.map((p) => ({ id: String(p.id), home: p.homeTeamAbbr, away: p.awayTeamAbbr })), [predictions]);
  const all: Cand[] = useMemo(() => (games ? buildCands(predictions, games) : []), [games, predictions]);

  const reset = () => {
    setAdding(false);
    setType(null);
  };

  const add = (t: Tiro) => {
    if (tiros.some((x) => sameTiro(x, t))) return;
    onChange([...tiros, t]);
    reset();
  };

  const pickType = (t: TiroType) => {
    setType(t);
    if ((t === 'PTS' || t === 'GOAL') && !games) {
      setError(null);
      fetchPlayersForGames(date, predictions)
        .then(setGames)
        .catch((e) => setError(e?.message || 'Erro ao obter os jogadores.'));
    }
  };

  const gameOpts = useMemo(() => {
    if (!type || isPlayer) return [];
    return gameOptions.filter((o) => {
      const [home, away] = o.teams || [];
      return !tiros.some((x) => x.type === type && x.home === home && x.away === away);
    });
  }, [gameOptions, tiros, type, isPlayer]);

  const usedIds = useMemo(() => new Set(tiros.filter((t) => t.type === type && t.playerId).map((t) => t.playerId as number)), [tiros, type]);

  return (
    <div
      className={`relative overflow-visible rounded-2xl p-6 shadow-xl border ${
        tiros.length > 0 ? 'border-rose-500/40 bg-gradient-to-br from-rose-900/30 to-slate-900/40' : 'border-slate-700/50 bg-slate-800/40'
      }`}
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-rose-500 to-red-700 shadow-lg shadow-black/20 text-xl">🎯</div>
        <div className="flex-1">
          <h3 className="text-xl font-bold text-white leading-tight">Tiro do Dia</h3>
          <p className="text-xs text-slate-400">1 pick · maior risco, maior retorno</p>
        </div>
        {tiros.length > 0 && (
          <span className="bg-rose-500/20 border border-rose-500/30 text-rose-200 text-[10px] font-black px-2 py-0.5 rounded-full">{tiros.length}</span>
        )}
      </div>

      {tiros.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
          {tiros.map((t, i) => (
            <TiroRow key={`${t.type}-${t.home}-${t.away}-${t.playerId ?? 0}`} tiro={t} onRemove={() => onChange(tiros.filter((_, j) => j !== i))} />
          ))}
        </div>
      )}

      {!adding ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-full rounded-xl border border-dashed border-rose-500/40 bg-rose-500/5 hover:bg-rose-500/10 py-3 text-[11px] font-black uppercase tracking-widest text-rose-200 transition"
        >
          ＋ {tiros.length > 0 ? 'Adicionar outro tiro' : 'Adicionar tiro do dia'}
        </button>
      ) : (
        <div className="rounded-xl border border-rose-500/30 bg-slate-950/60 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">1 · Tipo</span>
            <button type="button" onClick={reset} className="text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-white">
              Fechar
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {TIRO_TYPES.map((t) => (
              <button
                key={t.type}
                type="button"
                onClick={() => pickType(t.type)}
                className={`px-3 py-2 rounded-xl border text-[11px] font-black uppercase tracking-wider transition ${
                  type === t.type ? 'bg-rose-500/25 border-rose-400/50 text-rose-200' : 'bg-slate-900/60 border-slate-700 text-slate-300 hover:border-slate-500'
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {type && !isPlayer && (
            <div className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">2 · Jogo</span>
              <div className="max-w-[480px]">
                <IconDropdown
                  placeholder="Seleciona jogo..."
                  options={gameOpts}
                  value=""
                  onChange={(v) => {
                    const o = gameOptions.find((x) => x.value === v);
                    const [home, away] = o?.teams || [];
                    if (home && away) add({ type, home, away });
                  }}
                />
              </div>
            </div>
          )}

          {type && isPlayer && (
            <div className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">2 · Jogo e jogador</span>
              {error ? (
                <p className="text-sm text-slate-400">{error}</p>
              ) : !games ? (
                <p className="py-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-500">A carregar jogadores…</p>
              ) : (
                <PlayerPicker
                  mode={type === 'GOAL' ? 'goal' : 'point'}
                  all={all}
                  games={gameList}
                  usedGames={new Set()}
                  usedIds={usedIds}
                  onClose={reset}
                  onChoose={(x) => {
                    const g = gameList.find((gg) => gg.id === x.gameId);
                    if (!g) return;
                    add({
                      type,
                      home: g.home,
                      away: g.away,
                      playerId: x.card.id,
                      player: x.card.name,
                      team: x.abbr,
                      prob: probOf(x.card, type === 'GOAL' ? 'goal' : 'point'),
                    });
                  }}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MyTiroDoDia;
