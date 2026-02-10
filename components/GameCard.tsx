
import React from 'react';
import { GamePrediction } from '../types';
import ProbabilityBadge from './ProbabilityBadge';

interface Props {
  prediction: GamePrediction;
}

const getLogoUrl = (abbr: string) => {
  // Mapeamento exaustivo para garantir compatibilidade com o CDN da ESPN
  // A ESPN usa códigos específicos que nem sempre batem com a abreviação oficial da NHL
  const map: Record<string, string> = {
    'TBL': 'tb',    // Tampa Bay Lightning
    'TB': 'tb',
    'SJS': 'sj',    // San Jose Sharks
    'SJ': 'sj',
    'LAK': 'la',    // Los Angeles Kings (ESPN usa 'la')
    'LA': 'la',
    'VGK': 'vgs',   // Vegas Golden Knights
    'VGS': 'vgs',
    'UTA': 'utah',  // Utah Hockey Club
    'NJD': 'nj',    // New Jersey Devils
    'NJ': 'nj',
    'CBJ': 'cbj',   // Columbus Blue Jackets
    'WSH': 'wsh',   // Washington Capitals
    'WPG': 'wpg',   // Winnipeg Jets
    'NSH': 'nsh',   // Nashville Predators
    'MTL': 'mtl',   // Montreal Canadiens
    'NYI': 'nyi',   // NY Islanders
    'NYR': 'nyr',   // NY Rangers
    'ANA': 'ana',   // Anaheim Ducks
    'BOS': 'bos',   // Boston Bruins
    'BUF': 'buf',   // Buffalo Sabres
    'CGY': 'cgy',   // Calgary Flames
    'CAR': 'car',   // Carolina Hurricanes
    'CHI': 'chi',   // Chicago Blackhawks
    'COL': 'col',   // Colorado Avalanche
    'DAL': 'dal',   // Dallas Stars
    'DET': 'det',   // Detroit Red Wings
    'EDM': 'edm',   // Edmonton Oilers
    'FLA': 'fla',   // Florida Panthers
    'MIN': 'min',   // Minnesota Wild
    'OTT': 'ott',   // Ottawa Senators
    'PHI': 'phi',   // Philadelphia Flyers
    'PIT': 'pit',   // Pittsburgh Penguins
    'SEA': 'sea',   // Seattle Kraken
    'STL': 'stl',   // St. Louis Blues
    'VAN': 'van',   // Vancouver Canucks
  };

  const normalizedAbbr = abbr.toUpperCase();
  const code = map[normalizedAbbr] || normalizedAbbr.toLowerCase();
  
  return `https://a.espncdn.com/i/teamlogos/nhl/500/${code}.png`;
};

const GameCard: React.FC<Props> = ({ prediction }) => {
  return (
    <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-5 hover:border-blue-500/50 transition-all shadow-lg overflow-hidden relative">
      <div className="flex justify-between items-center mb-6">
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
          <h3 className="text-sm font-bold text-slate-100 line-clamp-1">{prediction.awayTeam}</h3>
          <span className="text-[10px] text-slate-400 uppercase font-medium tracking-tight">Visitante</span>
        </div>

        <div className="px-4 flex flex-col items-center justify-center">
          <div className="bg-slate-900/80 px-2 py-1 rounded border border-slate-700 mb-1">
            <span className="text-sm font-black text-blue-500 italic">VS</span>
          </div>
          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">
            {prediction.dateTime ? new Date(prediction.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
          </span>
        </div>

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
          <h3 className="text-sm font-bold text-slate-100 line-clamp-1">{prediction.homeTeam}</h3>
          <span className="text-[10px] text-slate-400 uppercase font-medium tracking-tight">Casa</span>
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-6">
        <ProbabilityBadge value={prediction.winProbabilityHome} label="Vít. Casa" />
        <ProbabilityBadge value={prediction.over15P1Prob} label="O1.5 P1" />
        <ProbabilityBadge value={prediction.bttsP1Prob} label="BTTS P1" />
        <ProbabilityBadge value={prediction.drawTRProb} label="Empate" />
        <ProbabilityBadge value={prediction.over45Prob} label="O4.5 Total" />
      </div>

      <div className="space-y-4">
        <div className="bg-slate-900/50 rounded-lg p-3">
          <h4 className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-2 flex items-center">
            <i className="fas fa-stethoscope mr-2"></i> Relatório de Lesões
          </h4>
          <div className="grid grid-cols-2 gap-4 text-[11px]">
            <div>
              <p className="font-semibold text-slate-300 mb-1 flex items-center gap-1">
                <span className="w-1 h-1 bg-slate-500 rounded-full"></span> {prediction.awayTeamAbbr}
              </p>
              <ul className="list-disc list-inside text-slate-400 pl-1">
                {prediction.injuries?.away?.length > 0 ? prediction.injuries.away.map((i, idx) => <li key={idx} className="truncate">{i}</li>) : <li>Nenhuma</li>}
              </ul>
            </div>
            <div>
              <p className="font-semibold text-slate-300 mb-1 flex items-center gap-1">
                 <span className="w-1 h-1 bg-slate-500 rounded-full"></span> {prediction.homeTeamAbbr}
              </p>
              <ul className="list-disc list-inside text-slate-400 pl-1">
                {prediction.injuries?.home?.length > 0 ? prediction.injuries.home.map((i, idx) => <li key={idx} className="truncate">{i}</li>) : <li>Nenhuma</li>}
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
