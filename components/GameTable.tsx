
import React, { useState } from 'react';
import { GamePrediction } from '../types';

interface Props {
  predictions: GamePrediction[];
}

const getLogoUrl = (abbr: string) => {
  const map: Record<string, string> = {
    'TBL': 'tb', 'TB': 'tb', 'SJS': 'sj', 'SJ': 'sj',
    'LAK': 'la', 'LA': 'la', 'VGK': 'vgs', 'VGS': 'vgs',
    'UTA': 'utah', 'NJD': 'nj', 'NJ': 'nj', 'CBJ': 'cbj',
    'WSH': 'wsh', 'WPG': 'wpg', 'NSH': 'nsh', 'MTL': 'mtl',
    'NYI': 'nyi', 'NYR': 'nyr', 'ANA': 'ana', 'BOS': 'bos',
    'BUF': 'buf', 'CGY': 'cgy', 'CAR': 'car', 'CHI': 'chi',
    'COL': 'col', 'DAL': 'dal', 'DET': 'det', 'EDM': 'edm',
    'FLA': 'fla', 'MIN': 'min', 'OTT': 'ott', 'PHI': 'phi',
    'PIT': 'pit', 'SEA': 'sea', 'STL': 'stl', 'VAN': 'van',
  };
  const normalizedAbbr = abbr?.toUpperCase();
  const code = map[normalizedAbbr] || normalizedAbbr?.toLowerCase();
  return `https://a.espncdn.com/i/teamlogos/nhl/500/${code}.png`;
};

const ProbabilityCell: React.FC<{ value: number }> = ({ value }) => {
  const getColorClass = (v: number) => {
    if (v >= 70) return 'text-emerald-400 border-emerald-500/30';
    if (v >= 50) return 'text-amber-400 border-amber-500/30';
    return 'text-rose-400 border-rose-500/30';
  };

  const getBarColor = (v: number) => {
    if (v >= 70) return 'bg-emerald-500';
    if (v >= 50) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  return (
    <div className="flex flex-col items-center justify-center min-w-[80px]">
      <div className={`px-4 py-1.5 rounded-lg border bg-slate-900/60 font-black text-sm mb-1.5 ${getColorClass(value)}`}>
        {value.toFixed(1)}%
      </div>
      <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden max-w-[60px]">
        <div 
          className={`h-full ${getBarColor(value)} transition-all duration-1000`} 
          style={{ width: `${value}%` }}
        ></div>
      </div>
    </div>
  );
};

const GameRow: React.FC<{ game: GamePrediction }> = ({ game }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <>
      <tr 
        onClick={() => setIsExpanded(!isExpanded)}
        className="group border-b border-slate-800/50 hover:bg-blue-500/5 transition-colors cursor-pointer"
      >
        {/* JOGO COLUMN */}
        <td className="py-6 pl-4">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-slate-500 mb-3 flex items-center gap-1.5">
              <i className="far fa-clock"></i>
              {game.dateTime ? new Date(game.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '00:00'}
            </span>
            
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <img 
                  src={getLogoUrl(game.awayTeamAbbr)} 
                  className="w-7 h-7 object-contain drop-shadow-sm" 
                  alt={game.awayTeamAbbr}
                  onError={(e) => (e.currentTarget.src = 'https://a.espncdn.com/i/teamlogos/nhl/500/scoreboard/nhl.png')}
                />
                <div className="flex items-center gap-2">
                  <span className="font-black text-lg text-slate-100">{game.awayTeamAbbr}</span>
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-bold uppercase">
                    {game.awayRecordL10 || '0-0-0'}
                  </span>
                </div>
              </div>
              
              <div className="pl-2.5">
                <span className="text-slate-600 font-bold text-xs">@</span>
              </div>

              <div className="flex items-center gap-3">
                <img 
                  src={getLogoUrl(game.homeTeamAbbr)} 
                  className="w-7 h-7 object-contain drop-shadow-sm" 
                  alt={game.homeTeamAbbr}
                  onError={(e) => (e.currentTarget.src = 'https://a.espncdn.com/i/teamlogos/nhl/500/scoreboard/nhl.png')}
                />
                <div className="flex items-center gap-2">
                  <span className="font-black text-lg text-slate-100">{game.homeTeamAbbr}</span>
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-bold uppercase">
                    {game.homeRecordL10 || '0-0-0'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </td>

        {/* PROB. VITÓRIA COLUMN */}
        <td className="text-right py-6 pr-8">
          <div className="flex flex-col items-end gap-1">
            <div className="flex gap-4 text-[10px] font-bold text-slate-500 uppercase mb-2">
              <span>H: {game.winProbabilityHome.toFixed(1)}%</span>
              <span>A: {game.winProbabilityAway.toFixed(1)}%</span>
            </div>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border font-black text-xs min-w-[100px] justify-center ${
              game.winProbabilityAway > game.winProbabilityHome 
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
              : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
            }`}>
              {Math.max(game.winProbabilityHome, game.winProbabilityAway).toFixed(1)}%
              <span className="text-[8px] opacity-60 ml-1">
                {game.winProbabilityAway > game.winProbabilityHome ? 'AWAY' : 'HOME'}
              </span>
            </div>
            <div className="w-full h-1 bg-slate-800 rounded-full mt-2 max-w-[100px] overflow-hidden">
               <div 
                className={`h-full transition-all duration-1000 ${game.winProbabilityAway > game.winProbabilityHome ? 'bg-emerald-500' : 'bg-amber-500'}`} 
                style={{ width: `${Math.max(game.winProbabilityHome, game.winProbabilityAway)}%` }}
              ></div>
            </div>
          </div>
        </td>

        {/* PROB. EMPATE COLUMN */}
        <td className="py-6 text-center align-middle">
          <ProbabilityCell value={game.drawTRProb} />
        </td>

        {/* 1ºP > 1.5 COLUMN */}
        <td className="py-6 text-center align-middle">
          <ProbabilityCell value={game.over15P1Prob} />
        </td>

        {/* 1ºP AMAMB COLUMN */}
        <td className="py-6 text-center align-middle">
          <ProbabilityCell value={game.bttsP1Prob} />
        </td>

        {/* JOGO > 4.5 COLUMN */}
        <td className="py-6 text-center align-middle pr-4">
          <ProbabilityCell value={game.over45Prob} />
        </td>
      </tr>
      
      {isExpanded && (
        <tr className="bg-slate-900/40 border-b border-slate-800 animate-in slide-in-from-top-2 duration-300">
          <td colSpan={6} className="p-8">
            <div className="space-y-8 max-w-4xl">
              {/* Relatório de Lesões Section */}
              <div className="bg-slate-800/20 rounded-xl p-5 border border-slate-700/30 shadow-inner">
                <h4 className="text-xs font-black text-blue-400 uppercase tracking-widest mb-6 flex items-center">
                  <i className="fas fa-stethoscope mr-3"></i> Relatório de Lesões
                </h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                  {/* Away Team Injuries */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-slate-500 text-xs">•</span>
                      <span className="text-sm font-black text-slate-200 tracking-wider">{game.awayTeamAbbr}</span>
                    </div>
                    <ul className="space-y-2 pl-3">
                      {game.injuries.away.length > 0 ? game.injuries.away.map((injury, idx) => (
                        <li key={idx} className="text-xs text-slate-400 flex items-start gap-2">
                          <span className="text-slate-600 mt-1.5">•</span>
                          <span>{injury}</span>
                        </li>
                      )) : (
                        <li className="text-xs text-slate-500 italic">Sem lesões reportadas.</li>
                      )}
                    </ul>
                  </div>

                  {/* Home Team Injuries */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-slate-500 text-xs">•</span>
                      <span className="text-sm font-black text-slate-200 tracking-wider">{game.homeTeamAbbr}</span>
                    </div>
                    <ul className="space-y-2 pl-3">
                      {game.injuries.home.length > 0 ? game.injuries.home.map((injury, idx) => (
                        <li key={idx} className="text-xs text-slate-400 flex items-start gap-2">
                          <span className="text-slate-600 mt-1.5">•</span>
                          <span>{injury}</span>
                        </li>
                      )) : (
                        <li className="text-xs text-slate-500 italic">Sem lesões reportadas.</li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
              
              {/* Resumo/Análise Section */}
              <div className="pt-6 border-t border-slate-800/60">
                <div className="text-sm leading-relaxed text-slate-300">
                  <span className="text-blue-500 font-black uppercase mr-2 tracking-tighter">Resumo:</span>
                  <span className="italic text-slate-400">{game.analysisSummary}</span>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

const GameTable: React.FC<Props> = ({ predictions }) => {
  return (
    <div className="w-full overflow-x-auto rounded-2xl border border-slate-800 bg-slate-800/20 shadow-2xl backdrop-blur-sm">
      <table className="w-full text-left border-collapse min-w-[1000px]">
        <thead>
          <tr className="bg-slate-900/60 border-b border-slate-800">
            <th className="py-4 pl-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Jogo</th>
            <th className="py-4 text-right pr-8 text-[10px] font-black text-slate-500 uppercase tracking-widest">Prob. Vitória</th>
            <th className="py-4 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest">Prob. Empate</th>
            <th className="py-4 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest"> 1ºP &gt; 1.5</th>
            <th className="py-4 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest">1ºP AMAMB</th>
            <th className="py-4 text-center pr-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Jogo &gt; 4.5</th>
          </tr>
        </thead>
        <tbody>
          {predictions.map((game, idx) => (
            <GameRow key={game.id || idx} game={game} />
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default GameTable;
