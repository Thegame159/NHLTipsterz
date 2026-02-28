import React from 'react';
import { GamePrediction } from '../types';
import ProbabilityBadge from './ProbabilityBadge';

interface Props {
  prediction: GamePrediction;
}

const getLogoUrl = (abbr: string) => {
  const map: Record<string, string> = {
    'TBL': 'tb',
    'TB': 'tb',
    'SJS': 'sj',
    'SJ': 'sj',
    'LAK': 'la',
    'LA': 'la',
    'VGK': 'vgs',
    'VGS': 'vgs',
    'UTA': 'utah',
    'NJD': 'nj',
    'NJ': 'nj',
    'CBJ': 'cbj',
    'WSH': 'wsh',
    'WPG': 'wpg',
    'NSH': 'nsh',
    'MTL': 'mtl',
    'NYI': 'nyi',
    'NYR': 'nyr',
    'ANA': 'ana',
    'BOS': 'bos',
    'BUF': 'buf',
    'CGY': 'cgy',
    'CAR': 'car',
    'CHI': 'chi',
    'COL': 'col',
    'DAL': 'dal',
    'DET': 'det',
    'EDM': 'edm',
    'FLA': 'fla',
    'MIN': 'min',
    'OTT': 'ott',
    'PHI': 'phi',
    'PIT': 'pit',
    'SEA': 'sea',
    'STL': 'stl',
    'VAN': 'van',
  };

  const normalizedAbbr = abbr.toUpperCase();
  const code = map[normalizedAbbr] || normalizedAbbr.toLowerCase();
  return `https://a.espncdn.com/i/teamlogos/nhl/500/${code}.png`;
};

const GameCard: React.FC<Props> = ({ prediction }) => {
  return (
    <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-5 hover:border-blue-500/50 transition-all shadow-lg overflow-hidden relative">
      
      {/* ================= HEADER (CASA vs FORA) ================= */}
      <div className="flex justify-between items-center mb-6">

        {/* CASA (agora à esquerda) */}
        <div className="flex-1 flex flex-col items-center text-center">
          <div className="w-14 h-14 mb-2 flex items-center justify-center bg-slate-900/40 rounded-full p-2 border border-slate-700/50">
            <img 
              src={getLogoUrl(prediction.homeTeamAbbr)} 
              alt={prediction.homeTeam} 
              className="w-full h-full object-contain drop-shadow-md"
              loading="lazy"
              onError={(e) => {
                const target = e.currentTarget;
                if (!target.src.includes('scoreboard/nhl.png')) {
                  target.src = 'https://a.espncdn.com/i/teamlogos/nhl/500/scoreboard/nhl.png';
                }
              }}
            />
          </div>
          <h3 className="text-sm font-bold text-slate-100 line-clamp-1">
            {prediction.homeTeam}
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
            {prediction.dateTime
              ? new Date(prediction.dateTime).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit'
                })
              : '--:--'}
          </span>
        </div>

        {/* FORA (agora à direita) */}
        <div className="flex-1 flex flex-col items-center text-center">
          <div className="w-14 h-14 mb-2 flex items-center justify-center bg-slate-900/40 rounded-full p-2 border border-slate-700/50">
            <img 
              src={getLogoUrl(prediction.awayTeamAbbr)} 
              alt={prediction.awayTeam} 
              className="w-full h-full object-contain drop-shadow-md"
              loading="lazy"
              onError={(e) => {
                const target = e.currentTarget;
                if (!target.src.includes('scoreboard/nhl.png')) {
                  target.src = 'https://a.espncdn.com/i/teamlogos/nhl/500/scoreboard/nhl.png';
                }
              }}
            />
          </div>
          <h3 className="text-sm font-bold text-slate-100 line-clamp-1">
            {prediction.awayTeam}
          </h3>
          <span className="text-[10px] text-slate-400 uppercase font-medium tracking-tight">
            Visitante
          </span>
        </div>
      </div>

      {/* ================= PROBABILIDADES ================= */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-6">
        <ProbabilityBadge value={prediction.winProbabilityHome} label="Vít. Casa" />
        <ProbabilityBadge value={prediction.over15P1Prob} label="O1.5 P1" />
        <ProbabilityBadge value={prediction.bttsP1Prob} label="BTTS P1" />
        <ProbabilityBadge value={prediction.drawTRProb} label="Empate" />
        <ProbabilityBadge value={prediction.over45Prob} label="O4.5 Total" />
      </div>

      {/* ================= RESTO DO CARD ================= */}
      <div className="space-y-4">
        <div className="bg-slate-900/50 rounded-lg p-3">
          <h4 className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-2 flex items-center">
            <i className="fas fa-stethoscope mr-2"></i> Relatório de Lesões
          </h4>
          <div className="grid grid-cols-2 gap-4 text-[11px]">
            <div>
              <p className="font-semibold text-slate-300 mb-1">
                {prediction.homeTeamAbbr}
              </p>
              <ul className="list-disc list-inside text-slate-400 pl-1">
                {prediction.injuries?.home?.length > 0
                  ? prediction.injuries.home.map((i, idx) => (
                      <li key={idx} className="truncate">{i}</li>
                    ))
                  : <li>Nenhuma</li>}
              </ul>
            </div>
            <div>
              <p className="font-semibold text-slate-300 mb-1">
                {prediction.awayTeamAbbr}
              </p>
              <ul className="list-disc list-inside text-slate-400 pl-1">
                {prediction.injuries?.away?.length > 0
                  ? prediction.injuries.away.map((i, idx) => (
                      <li key={idx} className="truncate">{i}</li>
                    ))
                  : <li>Nenhuma</li>}
              </ul>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-700/50 pt-3">
          <p className="text-[11px] text-slate-400 italic leading-relaxed">
            <span className="text-blue-400 font-bold not-italic mr-1">RESUMO:</span>
            {prediction.analysisSummary}
          </p>
        </div>
      </div>
    </div>
  );
};

export default GameCard;
