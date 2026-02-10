
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
}

export interface NHLAnalysisData {
  predictions: GamePrediction[];
  suggestions: Suggestions;
  lastUpdated: string;
}
