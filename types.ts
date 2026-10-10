
export interface TeamP1Stats {
  n: number; // jogos com dados do 1.º período
  scored: number; // jogos em que marcou no 1.º período
  conceded: number; // jogos em que sofreu golo no 1.º período
  over15: number; // jogos com 2+ golos no 1.º período
  btts: number; // jogos em que ambas marcaram no 1.º período
  scoreProb: number; // % (modelo) de marcar no 1.º período hoje
}

export interface GamePrediction {
  id: string;
  homeTeam: string;
  homeTeamAbbr: string;
  homeRecordL10: string; // Ex: 6-2-2
  awayTeam: string;
  awayTeamAbbr: string;
  awayRecordL10: string; // Ex: 4-5-1
  dateTime: string;
  winProbabilityHome: number;
  winProbabilityAway: number;
  over15P1Prob: number;
  bttsP1Prob: number;
  drawTRProb: number;
  over45Prob: number;
  over55Prob: number;
  analysisSummary: string;
  injuries: {
    home: string[];
    away: string[];
  };
  // Extras calculados pelo servidor (opcionais, para compatibilidade com dados antigos)
  homeGames?: number; // jogos em que a estimativa de cada equipa se baseia
  awayGames?: number;
  homeB2B?: boolean; // jogou ontem
  awayB2B?: boolean;
  scoreGuess?: string; // ex.: "3–2"
  totalLine?: number; // ex.: 6.5
  p1WinHome?: number; // % de estar a ganhar no fim do 1.º período
  p1Draw?: number;
  p1WinAway?: number;
  homeP1?: TeamP1Stats;
  awayP1?: TeamP1Stats;
  // 2.º período (opcionais)
  over15P2Prob?: number;
  bttsP2Prob?: number;
  p2WinHome?: number; // % de vencer o 2.º período
  p2Draw?: number;
  p2WinAway?: number;
  p12WinHome?: number; // % de estar a ganhar após 2 períodos
  p12Draw?: number;
  p12WinAway?: number;
  homeP2?: TeamP1Stats;
  awayP2?: TeamP1Stats;
  injuryAdj?: { home: number; away: number }; // golos/jogo que cada equipa perde por lesões
}

export interface StrongPick {
  game: string; // ex.: "BUF vs MIN"
  home: string; // abreviatura da equipa da casa
  away: string; // abreviatura da equipa de fora
  market: string; // ex.: "Over 1.5 no 1.º período"
  selection: string; // ex.: "Canadiens" (vitórias) ou o próprio jogo
  prob: number; // %
}

export interface WinComboLeg {
  team: string; // abreviatura do favorito
  game: string; // ex.: "MTL vs CAR"
  home: string;
  away: string;
  prob: number; // % de vitória do favorito
}

export interface WinCombo {
  legs: WinComboLeg[];
  combinedProb: number; // % de todas as pernas acertarem
  fairOdds: number; // 100 / combinedProb
}

export interface Suggestions {
  tripleWin: string[]; 
  tripleOver15P1: string[];
  doubleOver15P1: string[];
  drawSuggestions: {
    game: string;
    explanation: string;
  }[];
  quadrupleOver45: string[];
  over55Suggestions: string[];
  strongPicks?: StrongPick[];
  winCombo?: WinCombo | null;
}

export interface NHLAnalysisData {
  predictions: GamePrediction[];
  suggestions: Suggestions;
  lastUpdated: string;
  totalGames?: number; // jogos do dia (antes do filtro da janela noturna)
}
