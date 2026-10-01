// src/utils/nhlUtils.ts

export const getLogoUrl = (abbr: string): string => {
  const map: Record<string, string> = {
    TBL: 'tb',   TB: 'tb',
    SJS: 'sj',   SJ: 'sj',
    LAK: 'la',   LA: 'la',
    VGK: 'vgs',  VGS: 'vgs',
    UTA: 'utah',
    NJD: 'nj',   NJ: 'nj',
    CBJ: 'cbj',
    WSH: 'wsh',  WPG: 'wpg',
    NSH: 'nsh',  MTL: 'mtl',
    NYI: 'nyi',  NYR: 'nyr',
    ANA: 'ana',  BOS: 'bos',
    BUF: 'buf',  CGY: 'cgy',
    CAR: 'car',  CHI: 'chi',
    COL: 'col',  DAL: 'dal',
    DET: 'det',  EDM: 'edm',
    FLA: 'fla',  MIN: 'min',
    OTT: 'ott',  PHI: 'phi',
    PIT: 'pit',  SEA: 'sea',
    STL: 'stl',  VAN: 'van',
    TOR: 'tor',
  };

  const normalized = abbr?.toUpperCase();
  const code = map[normalized] ?? normalized?.toLowerCase();
  return `https://a.espncdn.com/i/teamlogos/nhl/500/${code}.png`;
};

export const FALLBACK_LOGO = 'https://a.espncdn.com/i/teamlogos/nhl/500/scoreboard/nhl.png';

export const TEAM_SHORT_NAMES: Record<string, string> = {
  ANA: 'Ducks',
  ARI: 'Coyotes',
  BOS: 'Bruins',
  BUF: 'Sabres',
  CAR: 'Hurricanes',
  CBJ: 'Blue Jackets',
  CGY: 'Flames',
  CHI: 'Blackhawks',
  COL: 'Avalanche',
  DAL: 'Stars',
  DET: 'Red Wings',
  EDM: 'Oilers',
  FLA: 'Panthers',
  LAK: 'Kings',
  MIN: 'Wild',
  MTL: 'Canadiens',
  NJD: 'Devils',
  NSH: 'Predators',
  NYI: 'Islanders',
  NYR: 'Rangers',
  OTT: 'Senators',
  PHI: 'Flyers',
  PIT: 'Penguins',
  SEA: 'Kraken',
  SJS: 'Sharks',
  STL: 'Blues',
  TBL: 'Lightning',
  TOR: 'Leafs',
  UTA: 'Utah',
  VAN: 'Canucks',
  VGK: 'Vegas',
  WPG: 'Jets',
  WSH: 'Capitals',
};

export const teamLabel = (abbr: string): string =>
  TEAM_SHORT_NAMES[abbr?.toUpperCase()] ?? abbr;

/** Desativado o corte por hora local para aceitar todos os jogos da jornada */
export const isMadrugadaGame = (dateTime: string): boolean => {
  return Boolean(dateTime);
};

/**
 * Desativado a restrição rígida de hora (23h-05h) para permitir que
 * jogos das madrugadas da jornada selecionada apareçam sem ser descartados.
 */
export const isWithinPortugalNightWindow = (dateTime: string): boolean => {
  return Boolean(dateTime);
};

/** Formata hora a partir de uma string ISO */
export const formatTime = (dateTime: string): string => {
  if (!dateTime) return '--:--';
  return new Date(dateTime).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
};
