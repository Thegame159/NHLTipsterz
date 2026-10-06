
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
}
