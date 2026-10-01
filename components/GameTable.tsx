// src/components/GameTable.tsx

import React, { useState } from 'react';
import { GamePrediction } from '../types';
import {
  getLogoUrl,
  FALLBACK_LOGO,
  teamLabel,
  formatTime,
} from '../utils/nhlUtils';

interface Props {
  predictions: GamePrediction[];
}

// ─── Helper de segurança numérica ──────────────────────────────────────────

const safeNum = (v: any): number => {
  return typeof v === 'number' && !isNaN(v) ? v : 0;
};

// ─── Célula de probabilidade ────────────────────────────────────────────────

const getColorClass = (v: number) => {
  if (v <= 30) return 'text-rose-400 border-rose-500/30 bg-rose-500/10';
  if (v <= 49) return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
  if (v <= 69) return 'text-green-400 border-green-500/30 bg-green-500/10';
  return 'text-emerald-400 border-emerald-600/40 bg-emerald-500/10';
};

const getBarColor = (v: number) => {
  if (v <= 30) return 'bg-gradient-to-r from-rose-500 to-red-500';
  if (v <= 49) return 'bg-gradient-to-r from-yellow-500 to-amber-500';
  if (v <= 69) return 'bg-gradient-to-r from-green-500 to-emerald-500';
  return 'bg-gradient-to-r from-emerald-500 to-green-600';
};

const ProbabilityCell: React.FC<{ value?: number }> = ({ value }) => {
  const val = safeNum(value);
  return (
    <div className="flex flex-col items-center justify-center min-w-[80px]">
      <div className={`px-4 py-1.5 rounded-lg border font-black text-sm mb-1.5 ${getColorClass(val)}`}>
        {Math.round(val)}%
      </div>
      <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden max-w-[60px]">
        <div
          className={`h-full ${getBarColor(val)} transition-all duration-700`}
          style={{ width: `${val}%` }}
        />
      </div>
    </div>
  );
};

// ─── Linha de jogo ───────────────────────────────────────────────────────────

const GameRow: React.FC<{ game: GamePrediction }> = ({ game }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Leitura segura de valores numéricos
  const winHome = safeNum(game.winProbabilityHome ?? (game as any).homeWinProb);
  const winAway = safeNum(game.winProbabilityAway ?? (game as any).awayWinProb);
  const drawProb = safeNum(game.drawTRProb ?? (game as any).drawProb);
  const over15P1 = safeNum(game.over15P1Prob);
  const bttsP1 = safeNum(game.bttsP1Prob);
  const over45 = safeNum(game.over45Prob ?? (game as any).over55Prob);

  const isHomeFav = winHome >= winAway;
  const maxProb = Math.max(winHome, winAway);

  const homeTeam = game.homeTeamAbbr || game.homeTeam || '';
  const awayTeam = game.awayTeamAbbr || game.awayTeam || '';

  return (
    <>
      <tr
        onClick={() => setIsExpanded(!isExpanded)}
        className="group border-b border-slate-800/50 hover:bg-blue-500/5 transition-colors cursor-pointer"
      >
        {/* COLUNA: Jogo */}
        <td className="py-6 pl-4">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-slate-500 mb-3 flex items-center gap-1.5">
              <i className="far fa-clock"></i>
              {formatTime(game.dateTime)}
            </span>

            <div className="space-y-4">
              {/* CASA */}
              <div className="flex items-center gap-3">
                <img
                  src={getLogoUrl(homeTeam)}
                  className="w-7 h-7 object-contain drop-shadow-sm"
                  alt={homeTeam}
                  onError={(e) => (e.currentTarget.src = FALLBACK_LOGO)}
                />
                <div className="flex items-center gap-2">
                  <span className={`font-black text-lg ${isHomeFav ? 'text-white' : 'text-slate-400'}`}>
                    {teamLabel(homeTeam)}
                  </span>
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-bold uppercase">
                    {game.homeRecordL10 || '0-0-0'}
                  </span>
                </div>
              </div>

              <div className="pl-2.5">
                <span className="text-slate-600 font-bold text-xs">vs</span>
              </div>

              {/* VISITANTE */}
              <div className="flex items-center gap-3">
                <img
                  src={getLogoUrl(awayTeam)}
                  className="w-7 h-7 object-contain drop-shadow-sm"
                  alt={awayTeam}
                  onError={(e) => (e.currentTarget.src = FALLBACK_LOGO)}
                />
                <div className="flex items-center gap-2">
                  <span className={`font-black text-lg ${!isHomeFav ? 'text-white' : 'text-slate-400'}`}>
                    {teamLabel(awayTeam)}
                  </span>
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-bold uppercase">
                    {game.awayRecordL10 || '0-0-0'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </td>

        {/* COLUNA: Prob. Vitória */}
        <td className="text-right py-6 pr-8">
          <div className="flex flex-col items-end gap-1">
            <div className="flex gap-4 text-[10px] font-bold text-slate-500 uppercase mb-2">
              <span>Casa: {winHome.toFixed(1)}%</span>
              <span>Fora: {winAway.toFixed(1)}%</span>
            </div>

            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border font-black text-xs min-w-[100px] justify-center ${getColorClass(maxProb)}`}>
              {Math.round(maxProb)}%
              <span className="text-[8px] opacity-60 ml-1">
                {isHomeFav ? 'CASA' : 'FORA'}
              </span>
            </div>

            <div className="w-full h-1 bg-slate-800 rounded-full mt-2 max-w-[100px] overflow-hidden">
              <div
                className={`h-full transition-all duration-700 ${
                  maxProb <= 30 ? 'bg-rose-500' :
                  maxProb <= 49 ? 'bg-amber-500' :
                  maxProb <= 69 ? 'bg-green-500' :
                  'bg-emerald-500'
                }`}
                style={{ width: `${maxProb}%` }}
              />
            </div>

            {/* Seta indicadora de expansão */}
            <span className={`text-slate-500 text-[10px] mt-1 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''} inline-block`}>
              ▶
            </span>
          </div>
        </td>

        {/* COLUNAS: Probabilidades */}
        <td className="py-6 text-center"><ProbabilityCell value={drawProb} /></td>
        <td className="py-6 text-center"><ProbabilityCell value={over15P1} /></td>
        <td className="py-6 text-center"><ProbabilityCell value={bttsP1} /></td>
        <td className="py-6 text-center pr-4"><ProbabilityCell value={over45} /></td>
      </tr>

      {/* PAINEL EXPANDIDO */}
      {isExpanded && (
        <tr className="bg-slate-900/40 border-b border-slate-800">
          <td colSpan={6} className="p-6 space-y-4">

            {/* Resumo */}
            <div className="text-sm text-slate-300">
              <span className="text-blue-500 font-black uppercase mr-2">Resumo:</span>
              <span className="italic text-slate-400">{game.analysisSummary || (game as any).analysis || 'Sem resumo disponível.'}</span>
            </div>

            {/* Lesões */}
            <div className="grid grid-cols-2 gap-6 text-sm">
              <div>
                <div className="text-rose-400 font-bold mb-2 text-[11px] uppercase tracking-wide">
                  Lesões {teamLabel(homeTeam)}
                </div>
                {game.injuries?.home?.length > 0
                  ? <ul className="space-y-1 text-slate-400">
                      {game.injuries.home.map((inj, i) => <li key={i}>• {inj}</li>)}
                    </ul>
                  : <p className="text-slate-600 text-[11px]">Sem lesões registadas</p>
                }
              </div>
              <div>
                <div className="text-rose-400 font-bold mb-2 text-[11px] uppercase tracking-wide">
                  Lesões {teamLabel(awayTeam)}
                </div>
                {game.injuries?.away?.length > 0
                  ? <ul className="space-y-1 text-slate-400">
                      {game.injuries.away.map((inj, i) => <li key={i}>• {inj}</li>)}
                    </ul>
                  : <p className="text-slate-600 text-[11px]">Sem lesões registadas</p>
                }
              </div>
            </div>

          </td>
        </tr>
      )}
    </>
  );
};

// ─── Tabela principal ────────────────────────────────────────────────────────

const GameTable: React.FC<Props> = ({ predictions }) => {
  const gamesList = predictions || [];

  return (
    <div className="space-y-8 pb-8">

      {/* Cabeçalho de secção com contador */}
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          Jogos Agendados
        </span>
        <span className="ml-auto text-[10px] text-slate-600 font-bold">
          {gamesList.length} {gamesList.length === 1 ? 'jogo' : 'jogos'}
        </span>
      </div>

      {/* Estado vazio */}
      {gamesList.length === 0 ? (
        <div className="w-full rounded-2xl border border-slate-800 bg-slate-800/20 py-16 text-center">
          <p className="text-slate-500 text-sm">Sem jogos disponíveis para esta data.</p>
        </div>
      ) : (
        <div className="w-full overflow-x-auto rounded-2xl border border-slate-800 bg-slate-800/20 shadow-2xl backdrop-blur-sm">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-slate-900/60 border-b border-slate-800">
                <th className="py-4 pl-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Jogo
                </th>
                <th className="py-4 text-right pr-8 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Prob. Vitória
                </th>
                <th className="py-4 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Empate OT
                </th>
                <th className="py-4 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  1ºP &gt; 1.5
                </th>
                <th className="py-4 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  1ºP BTTS
                </th>
                <th className="py-4 text-center pr-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Jogo &gt; 4.5
                </th>
              </tr>
            </thead>
            <tbody>
              {gamesList.map((game, idx) => (
                <GameRow key={game.id ?? idx} game={game} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default GameTable;
