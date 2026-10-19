
export interface TeamP1Stats {
  n: number; // jogos com dados do 1.º período
  scored: number; // jogos em que marcou no 1.º período
  conceded: number; // jogos em que sofreu golo no 1.º período
  over15: number; // jogos com 2+ golos no 1.º período
  btts: number; // jogos em que ambas marcaram no 1.º período
  scoreProb: number; // % (modelo) de marcar no 1.º período hoje
}

export interface PlayerLogRow {
  d: string; // data (YYYY-MM-DD)
  o: string; // adversário (sigla)
  h: number; // 1 = em casa
  g: number; // golos
  a: number; // assistências
  prev?: number; // 1 = jogo da época passada
}

export interface PlayerStat {
  gp: number;
  g: number;
  a: number;
  p: number;
}

export interface PlayerCard {
  id: number;
  name: string;
  pos: string;
  stat: PlayerStat; // estatística mostrada (época atual, ou a passada se ainda não jogou)
  statPrev: boolean; // true = estatística da época passada
  probGoal: number; // % de marcar (0 se fora)
  probAssist: number; // % de assistir
  probPoint: number; // % de pontuar
  n: number; // jogos considerados (até 10)
  goalGames: number; // jogos em que marcou
  assistGames: number;
  pointGames: number; // jogos em que pontuou
  goalStreak: number; // jogos seguidos a marcar
  pointStreak: number;
  last3Goals: number;
  last3Points: number;
  status?: 'DTD' | 'OUT';
  injury?: string; // texto da lesão
  log: PlayerLogRow[]; // mais recente primeiro
}

export interface TeamPlayers {
  abbr: string;
  players: PlayerCard[];
  injured: { name: string; status: string }[];
  rosterSource: string;
}

export interface GamePlayers {
  id: string | number;
  home: TeamPlayers;
  away: TeamPlayers;
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
  expGoalsHome?: number; // golos esperados de cada equipa neste jogo
  expGoalsAway?: number;
  homeGames?: number; // jogos em que a estimativa de cada equipa se baseia
  awayGames?: number;
  homeB2B?: boolean; // jogou ontem
  awayB2B?: boolean;
  favorite?: 'home' | 'away' | 'even'; // 'even' = jogo equilibrado
  scoreGuess?: string; // ex.: "3–2"
  totalLine?: number; // ex.: 6.5
  p1WinHome?: number; // % de estar a ganhar no fim do 1.º período
  p1Draw?: number;
  p1WinAway?: number;
  homeP1?: TeamP1Stats;
  awayP1?: TeamP1Stats;
  // 2.º período (opcionais)
  over15P2Prob?: number;
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
  tripleOver15P2?: string[];
  strongPicks?: StrongPick[];
  winCombo?: WinCombo | null;
  combinadaFlex?: { game: string; pick: 'HOME' | 'AWAY' | '1X' | 'X2' }[]; // combinada manual (Minhas Picks)
}

export interface NHLAnalysisData {
  predictions: GamePrediction[];
  suggestions: Suggestions;
  lastUpdated: string;
  totalGames?: number; // jogos do dia (antes do filtro da janela noturna)
  leagueBaseline?: { draw: number; over15P1: number; btts1P: number; over15P2: number; over45: number; over55: number };
}
