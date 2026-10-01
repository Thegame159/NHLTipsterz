// src/components/GameCard.tsx

import React from 'react';
import { GamePrediction } from '../types';
import ProbabilityBadge from './ProbabilityBadge';
import { getLogoUrl, FALLBACK_LOGO, teamLabel, formatTime } from '../utils/nhlUtils';

interface Props {
  prediction: GamePrediction;
}

const GameCard: React.FC<Props> = ({ prediction }) => {
  // Garantia de valores numéricos seguros para o ProbabilityBadge
  const winHome = typeof prediction?.winProbabilityHome === 'number' ? prediction.winProbabilityHome : 0;
  const over15P1 = typeof prediction?.over15P1Prob === 'number' ? prediction.over15P1Prob : 0;
  const bttsP1 = typeof prediction?.bttsP1Prob === 'number' ? prediction.bttsP1Prob : 0;
  const drawTR = typeof prediction?.drawTRProb === 'number' ? prediction.drawTRProb : 0;
  const over45 = typeof prediction?.over45Prob === 'number' ? prediction.over45Prob : 0;

  // Listas de lesões seguras
  const homeInjuries = prediction?.injuries?.home || [];
  const awayInjuries = prediction?.injuries?.away || [];

  return (
    <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-5 hover:border-blue-500/50 transition-all shadow-lg overflow-hidden relative">

      {/* ===== HEADER (CASA vs VISITANTE) ===== */}
      <div className="flex justify-between items-center mb-6">

        {/* CASA */}
        <div className="flex-1 flex flex-col items-center text-center">
          <div className="w-14 h-14 mb-2 flex items-center justify-center bg-slate-900/40 rounded-full p-2 border border-slate-700/50">
            <img
              src={getLogoUrl(prediction?.homeTeamAbbr || '')}
              alt={prediction?.homeTeam || 'Casa'}
              className="w-full h-full object-contain drop-shadow-md"
              loading="lazy"
              onError={(e) => {
                const t = e.currentTarget;
                if (!t.src.includes('scoreboard')) t.src = FALLBACK_LOGO;
              }}
            />
          </div>
          <h3 className="text-sm font-bold text-slate-100 leading-tight">
            {prediction?.homeTeam || 'Casa'}
          </h3>
          <span className="text-[10px] text-slate-400 uppercase font-medium tracking-tight">
            Casa
          </span>
        </div>

        {/* VS + Hora */}
        <div className="px-4 flex flex-col items-center justify-center">
          <div className="bg-slate-900/80 px-2 py-1 rounded border border-slate-700 mb-1">
            <span className="text-sm font-black text-blue-500 italic">VS</span>
          </div>
          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">
            {formatTime(prediction?.dateTime)}
          </span>
        </div>

        {/* VISITANTE */}
        <div className="flex-1 flex flex-col items-center text-center">
          <div className="w-14 h-14 mb-2 flex items-center justify-center bg-slate-900/40 rounded-full p-2 border border-slate-700/50">
            <img
              src={getLogoUrl(prediction?.awayTeamAbbr || '')}
              alt={prediction?.awayTeam || 'Visitante'}
              className="w-full h-full object-contain drop-shadow-md"
              loading="lazy"
              onError={(e) => {
                const t = e.currentTarget;
                if (!t.src.includes('scoreboard')) t.src = FALLBACK_LOGO;
              }}
            />
          </div>
          <h3 className="text-sm font-bold text-slate-100 leading-tight">
            {prediction?.awayTeam || 'Visitante'}
          </h3>
          <span className="text-[10px] text-slate-400 uppercase font-medium tracking-tight">
            Visitante
          </span>
        </div>
      </div>

      {/* ===== PROBABILIDADES ===== */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-6">
        <ProbabilityBadge value={winHome}  label="Vít. Casa" />
        <ProbabilityBadge value={over15P1} label="1ºP > 1.5" />
        <ProbabilityBadge value={bttsP1}   label="1ºP BTTS" />
        <ProbabilityBadge value={drawTR}   label="Empate OT" />
        <ProbabilityBadge value={over45}   label="Jogo > 4.5" />
      </div>

      {/* ===== LESÕES ===== */}
      <div className="bg-slate-900/50 rounded-lg p-3 mb-4">
        <h4 className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-2 flex items-center">
          <i className="fas fa-stethoscope mr-2"></i> Relatório de Lesões
        </h4>
        <div className="grid grid-cols-2 gap-4 text-[11px]">
          <div>
            <p className="font-semibold text-slate-300 mb-1">
              {teamLabel(prediction?.homeTeamAbbr || '')}
            </p>
            <ul className="list-disc list-inside text-slate-400 pl-1">
              {homeInjuries.length > 0
                ? homeInjuries.map((inj, idx) => (
                    <li key={idx} className="truncate">{inj}</li>
                  ))
                : <li>Nenhuma</li>}
            </ul>
          </div>
          <div>
            <p className="font-semibold text-slate-300 mb-1">
              {teamLabel(prediction?.awayTeamAbbr || '')}
            </p>
            <ul className="list-disc list-inside text-slate-400 pl-1">
              {awayInjuries.length > 0
                ? awayInjuries.map((inj, idx) => (
                    <li key={idx} className="truncate">{inj}</li>
                  ))
                : <li>Nenhuma</li>}
            </ul>
          </div>
        </div>
      </div>

      {/* ===== RESUMO ===== */}
      {prediction?.analysisSummary && (
        <div className="border-t border-slate-700/50 pt-3">
          <p className="text-[11px] text-slate-400 italic leading-relaxed">
            <span className="text-blue-400 font-bold not-italic mr-1">RESUMO:</span>
            {prediction.analysisSummary}
          </p>
        </div>
      )}
    </div>
  );
};

export default GameCard;
