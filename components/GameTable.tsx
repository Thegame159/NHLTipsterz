import React, { useState } from 'react';
import { GamePrediction } from '../types';

interface Props {
  predictions: GamePrediction[];
}

const getLogoUrl = (abbr: string) => {
  const map: Record<string, string> = {
    'TBL': 'tb','TB': 'tb','SJS': 'sj','SJ': 'sj',
    'LAK': 'la','LA': 'la','VGK': 'vgs','VGS': 'vgs',
    'UTA': 'utah','NJD': 'nj','NJ': 'nj','CBJ': 'cbj',
    'WSH': 'wsh','WPG': 'wpg','NSH': 'nsh','MTL': 'mtl',
    'NYI': 'nyi','NYR': 'nyr','ANA': 'ana','BOS': 'bos',
    'BUF': 'buf','CGY': 'cgy','CAR': 'car','CHI': 'chi',
    'COL': 'col','DAL': 'dal','DET': 'det','EDM': 'edm',
    'FLA': 'fla','MIN': 'min','OTT': 'ott','PHI': 'phi',
    'PIT': 'pit','SEA': 'sea','STL': 'stl','VAN': 'van',
  };

  const normalizedAbbr = abbr?.toUpperCase();
  const code = map[normalizedAbbr] || normalizedAbbr?.toLowerCase();
  return `https://a.espncdn.com/i/teamlogos/nhl/500/${code}.png`;
};

const TEAM_SHORT_NAMES: Record<string, string> = {
  ANA: "Ducks",
  ARI: "Coyotes",
  BOS: "Bruins",
  BUF: "Sabres",
  CAR: "Hurricanes",
  CBJ: "Blue Jackets",
  CGY: "Flames",
  CHI: "Blackhawks",
  COL: "Avalanche",
  DAL: "Stars",
  DET: "Red Wings",
  EDM: "Oilers",
  FLA: "Panthers",
  LAK: "Kings",
  MIN: "Wild",
  MTL: "Canadiens",
  NJD: "Devils",
  NSH: "Predators",
  NYI: "Islanders",
  NYR: "Rangers",
  OTT: "Senators",
  PHI: "Flyers",
  PIT: "Penguins",
  SEA: "Kraken",
  SJS: "Sharks",
  STL: "Blues",
  TBL: "Lightning",
  TOR: "Leafs",
  UTA: "Utah",
  VAN: "Canucks",
  VGK: "Vegas",
  WPG: "Jets",
  WSH: "Capitals",
};
const teamLabel = (abbr: string) => TEAM_SHORT_NAMES[abbr?.toUpperCase()] || abbr;

/* 🔥 FILTRO MADRUGADA 23:00 → 05:00 */
const isMadrugadaGame = (dateTime: string) => {
  if (!dateTime) return false;

  const d = new Date(dateTime);
  const hour = d.getHours();
  const minutes = d.getMinutes();

  const total = hour * 60 + minutes;

  const start = 23 * 60; // 23:00
  const end = 5 * 60;    // 05:00

  // intervalo atravessa meia-noite
  return total >= start || total <= end;
};

const ProbabilityCell: React.FC<{ value: number }> = ({ value }) => {
const getColorClass = (v: number) => {
  if (v <= 30) return 'text-rose-400 border-rose-500/30';
  if (v <= 49) return 'text-amber-400 border-amber-500/30';
  if (v <= 69) return 'text-green-400 border-green-500/30';
  return 'text-emerald-400 border-emerald-600/40';
};

const getBarColor = (v: number) => {
  if (v <= 30) return 'bg-gradient-to-r from-rose-500 to-red-500';
  if (v <= 49) return 'bg-gradient-to-r from-yellow-500 to-amber-500';
  if (v <= 69) return 'bg-gradient-to-r from-green-500 to-emerald-500';
  return 'bg-gradient-to-r from-emerald-500 to-green-600';
};

  return (
    <div className="flex flex-col items-center justify-center min-w-[80px]">
      <div className={`px-4 py-1.5 rounded-lg border bg-slate-900/60 font-black text-sm mb-1.5 ${getColorClass(value)}`}>
        {Math.round(value)}%
      </div>
      <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden max-w-[60px]">
        <div 
          className={`h-full ${getBarColor(value)} transition-all duration-1000`} 
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
};

const GameRow: React.FC<{ game: GamePrediction }> = ({ game }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const isHomeFav = game.winProbabilityHome >= game.winProbabilityAway;
  const maxProb = Math.max(game.winProbabilityHome, game.winProbabilityAway);

  return (
    <>
      <tr 
        onClick={() => setIsExpanded(!isExpanded)}
        className="group border-b border-slate-800/50 hover:bg-blue-500/5 transition-colors cursor-pointer"
      >
        <td className="py-6 pl-4">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-slate-500 mb-3 flex items-center gap-1.5">
              <i className="far fa-clock"></i>
              {game.dateTime 
                ? new Date(game.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                : '00:00'}
            </span>

            <div className="space-y-4">

              {/* CASA */}
              <div className="flex items-center gap-3">
                <img 
                  src={getLogoUrl(game.homeTeamAbbr)} 
                  className="w-7 h-7 object-contain drop-shadow-sm" 
                  alt={game.homeTeamAbbr}
                  onError={(e) => (e.currentTarget.src = 'https://a.espncdn.com/i/teamlogos/nhl/500/scoreboard/nhl.png')}
                />
                <div className="flex items-center gap-2">
                 <span className={`font-black text-lg ${isHomeFav ? 'text-white' : 'text-slate-400'}`}>
                  {teamLabel(game.homeTeamAbbr)}
                  </span>
               
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-bold uppercase">
                    {game.homeRecordL10 || '0-0-0'}
                  </span>
                </div>
              </div>

              <div className="pl-2.5">
                <span className="text-slate-600 font-bold text-xs">vs</span>
              </div>

              {/* FORA */}
              <div className="flex items-center gap-3">
                <img 
                  src={getLogoUrl(game.awayTeamAbbr)} 
                  className="w-7 h-7 object-contain drop-shadow-sm" 
                  alt={game.awayTeamAbbr}
                  onError={(e) => (e.currentTarget.src = 'https://a.espncdn.com/i/teamlogos/nhl/500/scoreboard/nhl.png')}
                />
                <div className="flex items-center gap-2">
                 <span className={`font-black text-lg ${!isHomeFav ? 'text-white' : 'text-slate-400'}`}>
                {teamLabel(game.awayTeamAbbr)}
                </span>
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-bold uppercase">
                    {game.awayRecordL10 || '0-0-0'}
                  </span>
                </div>
              </div>

            </div>
          </div>
        </td>

        <td className="text-right py-6 pr-8">
          <div className="flex flex-col items-end gap-1">
            <div className="flex gap-4 text-[10px] font-bold text-slate-500 uppercase mb-2">
              <span>Casa: {game.winProbabilityHome.toFixed(1)}%</span>
              <span>Fora: {game.winProbabilityAway.toFixed(1)}%</span>
            </div>

            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border font-black text-xs min-w-[100px] justify-center ${
            maxProb <= 30
  ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
  : maxProb <= 49
  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
  : maxProb <= 69
  ? 'bg-green-500/10 border-green-500/30 text-green-400'
  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            }`}>
              {Math.round(maxProb)}%
              <span className="text-[8px] opacity-60 ml-1">
                {isHomeFav ? 'CASA' : 'FORA'}
              </span>
            </div>

            <div className="w-full h-1 bg-slate-800 rounded-full mt-2 max-w-[100px] overflow-hidden">
              <div 
                className={`h-full transition-all duration-1000 ${
                  isHomeFav ? 'bg-amber-500' : 'bg-emerald-500'
                }`} 
                style={{ width: `${maxProb}%` }}
              />
            </div>
          </div>
        </td>

        <td className="py-6 text-center"><ProbabilityCell value={game.drawTRProb} /></td>
        <td className="py-6 text-center"><ProbabilityCell value={game.over15P1Prob} /></td>
        <td className="py-6 text-center"><ProbabilityCell value={game.bttsP1Prob} /></td>
        <td className="py-6 text-center pr-4"><ProbabilityCell value={game.over45Prob} /></td>
      </tr>

     {isExpanded && (
  <tr className="bg-slate-900/40 border-b border-slate-800">
    <td colSpan={6} className="p-6 space-y-4">

      {/* RESUMO */}
      <div className="text-sm text-slate-300">
        <span className="text-blue-500 font-black uppercase mr-2">Resumo:</span>
        <span className="italic text-slate-400">{game.analysisSummary}</span>
      </div>

      {/* LESÕES */}
      {(game.injuries?.home?.length || game.injuries?.away?.length) && (
        <div className="text-sm text-slate-300">
          <span className="text-red-500 font-black uppercase mr-2">Lesões:</span>

          <div className="mt-2 space-y-1 text-xs text-slate-400">

            {game.injuries.home?.map((p: string, i: number) => (
              <div key={`h${i}`}>🏠 {p}</div>
            ))}

            {game.injuries.away?.map((p: string, i: number) => (
              <div key={`a${i}`}>✈️ {p}</div>
            ))}

          </div>
        </div>
      )}

    </td>
  </tr>
)}
    </>
  );
};

const GameTable: React.FC<Props> = ({ predictions }) => {
  const madrugadaGames = predictions.filter(game =>
    isMadrugadaGame(game.dateTime)
  );

  return (
      <div className="space-y-8 pb-32"> 
    <div className="w-full overflow-x-auto rounded-2xl border border-slate-800 bg-slate-800/20 shadow-2xl backdrop-blur-sm">
      <table className="w-full text-left border-collapse min-w-[1000px]">
        <thead>
          <tr className="bg-slate-900/60 border-b border-slate-800">
            <th className="py-4 pl-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Jogo</th>
            <th className="py-4 text-right pr-8 text-[10px] font-black text-slate-500 uppercase tracking-widest">Prob. Vitória</th>
            <th className="py-4 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest">Prob. Empate</th>
            <th className="py-4 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest">1ºP &gt; 1.5</th>
            <th className="py-4 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest">1ºP AMAMB</th>
            <th className="py-4 text-center pr-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Jogo &gt; 4.5</th>
          </tr>
        </thead>
        <tbody>
          {madrugadaGames.map((game, idx) => (
            <GameRow key={game.id || idx} game={game} />
          ))}
        </tbody>
      </table>
    </div>
    </div>      
  );
};

export default GameTable;
