import React from 'react';
import { Suggestions } from '../types';

interface Props {
  suggestions: Suggestions;
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
    'TOR': 'tor',
  };
  const normalizedAbbr = abbr?.trim().toUpperCase();
  const code = map[normalizedAbbr] || normalizedAbbr?.toLowerCase();
  return `https://a.espncdn.com/i/teamlogos/nhl/500/${code}.png`;
};

/** --- mapping de nomes -> abreviações --- */
const TEAM_NAME_TO_ABBR: Record<string, string> = {
  // Atlantic
  'Boston': 'BOS',
  'Boston Bruins': 'BOS',
  'Buffalo': 'BUF',
  'Buffalo Sabres': 'BUF',
  'Detroit': 'DET',
  'Detroit Red Wings': 'DET',
  'Florida': 'FLA',
  'Florida Panthers': 'FLA',
  'Montréal': 'MTL',
  'Montreal': 'MTL',
  'Montréal Canadiens': 'MTL',
  'Montreal Canadiens': 'MTL',
  'Ottawa': 'OTT',
  'Ottawa Senators': 'OTT',
  'Tampa Bay': 'TBL',
  'Tampa Bay Lightning': 'TBL',
  'Toronto': 'TOR',
  'Toronto Maple Leafs': 'TOR',

  // Metro
  'Carolina': 'CAR',
  'Carolina Hurricanes': 'CAR',
  'Columbus': 'CBJ',
  'Columbus Blue Jackets': 'CBJ',
  'New Jersey': 'NJD',
  'New Jersey Devils': 'NJD',
  'New York Islanders': 'NYI',
  'NY Islanders': 'NYI',
  'New York Rangers': 'NYR',
  'NY Rangers': 'NYR',
  'Philadelphia': 'PHI',
  'Philadelphia Flyers': 'PHI',
  'Pittsburgh': 'PIT',
  'Pittsburgh Penguins': 'PIT',
  'Washington': 'WSH',
  'Washington Capitals': 'WSH',

  // Central
  'Chicago': 'CHI',
  'Chicago Blackhawks': 'CHI',
  'Colorado': 'COL',
  'Colorado Avalanche': 'COL',
  'Dallas': 'DAL',
  'Dallas Stars': 'DAL',
  'Minnesota': 'MIN',
  'Minnesota Wild': 'MIN',
  'Nashville': 'NSH',
  'Nashville Predators': 'NSH',
  'St. Louis': 'STL',
  'St Louis': 'STL',
  'St. Louis Blues': 'STL',
  'St Louis Blues': 'STL',
  'Winnipeg': 'WPG',
  'Winnipeg Jets': 'WPG',

  // Pacific
  'Anaheim': 'ANA',
  'Anaheim Ducks': 'ANA',
  'Calgary': 'CGY',
  'Calgary Flames': 'CGY',
  'Edmonton': 'EDM',
  'Edmonton Oilers': 'EDM',
  'Los Angeles': 'LAK',
  'Los Angeles Kings': 'LAK',
  'LA': 'LAK',
  'San Jose': 'SJS',
  'San Jose Sharks': 'SJS',
  'Seattle': 'SEA',
  'Seattle Kraken': 'SEA',
  'Vancouver': 'VAN',
  'Vancouver Canucks': 'VAN',
  'Vegas': 'VGK',
  'Vegas Golden Knights': 'VGK',

  // Utah / Arizona (caso uses)
  'Utah': 'UTA',
  'Utah Hockey Club': 'UTA',
  'Arizona': 'ARI',
  'Arizona Coyotes': 'ARI',
};

// Normalizador (remove acentos e normaliza espaços)
const normName = (s: string) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

// Pré-normaliza chaves para matching “contains”
const TEAM_KEYS_NORMALIZED: Array<{ key: string; keyNorm: string; abbr: string }> = Object.entries(TEAM_NAME_TO_ABBR)
  .map(([key, abbr]) => ({ key, keyNorm: normName(key), abbr }))
  // ordena por comprimento desc para preferir “Boston Bruins” antes de “Boston”
  .sort((a, b) => b.keyNorm.length - a.keyNorm.length);

/**
 * NOVO: tenta encontrar 1 equipa num texto livre (ex: "Boston Bruins (78%)")
 */
const findSingleTeamAbbrFromText = (text: string): string | null => {
  const t = normName(text.replace(/\(\d+%\)/g, ''));
  if (!t) return null;

  for (const { keyNorm, abbr } of TEAM_KEYS_NORMALIZED) {
    if (keyNorm && t.includes(keyNorm)) return abbr;
  }
  return null;
};

/**
 * Extrai equipas de um texto que pode vir como:
 * - "TOR @ BOS (75%)"
 * - "Florida vs Toronto"
 * - "Montréal vs NY Islanders"
 * - "Boston Bruins"  ✅ agora funciona (1 equipa)
 */
const parseTeamsFromText = (text: string): string[] => {
  const raw = (text || '').trim();

  // 1) Se já tiver abreviações (2-4 letras), usa-as
  const abbrMatches = raw.match(/\b[A-Z]{2,4}\b/g) || [];
  const cleanedAbbr = abbrMatches
    .map(s => s.toUpperCase())
    .filter(s => s !== 'OT' && s !== 'VS' && s !== 'V');

  if (cleanedAbbr.length >= 2) return cleanedAbbr.slice(0, 2);
  if (cleanedAbbr.length === 1) return cleanedAbbr;

  // 2) Caso venha por nomes: tenta detectar "A vs B" / "A v B" / "A @ B"
  const normalized = raw.replace(/\s+/g, ' ').replace(/\(\d+%\)/g, '').trim();

  const split =
    normalized.includes(' vs ') ? normalized.split(' vs ')
    : normalized.includes(' v ') ? normalized.split(' v ')
    : normalized.includes(' @ ') ? normalized.split(' @ ')
    : null;

  if (split && split.length >= 2) {
    const aName = split[0].trim();
    const bName = split[1].trim();

    const a = findSingleTeamAbbrFromText(aName);
    const b = findSingleTeamAbbrFromText(bName);

    const res: string[] = [];
    if (a) res.push(a);
    if (b) res.push(b);

    if (res.length) return res;
  }

  // 3) ✅ NOVO: se for só um nome ("Boston Bruins"), tenta reconhecer 1 equipa
  const single = findSingleTeamAbbrFromText(normalized);
  return single ? [single] : [];
};

// Componente para extrair e mostrar logos e percentagem de uma string
const SuggestionItem: React.FC<{ text: string; badgeColor: string; index: number }> = ({ text, badgeColor, index }) => {
  // ✅ Agora suporta abreviações OU nomes (inclusive 1 equipa)
  const teamMatches = parseTeamsFromText(text);

  // Encontra a percentagem (ex: 75%)
  const percentageMatch = text.match(/\d+%/);
  const percentage = percentageMatch ? percentageMatch[0] : null;

  // Remove a percentagem do texto para exibição limpa
  const cleanText = text.replace(/\(\d+%\)/, '').trim();

  return (
    <div className="flex items-center gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-700/50 group hover:border-blue-500/30 transition-colors">
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${badgeColor} text-white shrink-0 shadow-sm`}>
        {index + 1}
      </div>

      <div className="flex items-center gap-2 overflow-hidden flex-1">
        {teamMatches.length > 0 && (
          <div className="flex -space-x-2 mr-1">
            {teamMatches.map((abbr, i) => (
              <img
                key={`${abbr}-${i}`}
                src={getLogoUrl(abbr)}
                className="w-6 h-6 object-contain drop-shadow-md relative bg-slate-800 rounded-full p-0.5 border border-slate-700"
                alt={abbr}
                loading="lazy"
                decoding="async"
                onError={(e) => (e.currentTarget.style.display = 'none')}
                style={{ zIndex: 10 - i }}
              />
            ))}
          </div>
        )}
        <span className="text-sm font-semibold text-slate-200 group-hover:text-white truncate">
          {cleanText}
        </span>
      </div>

      {percentage && (
        <div className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-black text-emerald-400">
          {percentage}
        </div>
      )}
    </div>
  );
};

const SuggestionCard: React.FC<{
  title: string;
  items: string[];
  icon: string;
  gradient: string;
  badgeColor: string;
  description: string;
}> = ({ title, items, icon, gradient, badgeColor, description }) => (
  <div className={`relative overflow-hidden bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6 shadow-xl transition-all hover:scale-[1.01] hover:shadow-blue-500/10`}>
    <div className={`absolute top-0 right-0 w-32 h-32 -mr-8 -mt-8 opacity-10 rounded-full blur-3xl ${gradient}`}></div>

    <div className="relative z-10">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${gradient} shadow-lg shadow-black/20`}>
          <i className={`fas ${icon} text-white text-xl`}></i>
        </div>
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Pick do Especialista</span>
      </div>

      <h3 className="text-xl font-bold text-white mb-1">{title}</h3>
      <p className="text-xs text-slate-400 mb-6 font-medium leading-tight">{description}</p>

      <div className="space-y-3">
        {items.length > 0 ? items.map((item, idx) => (
          <SuggestionItem key={`${title}-${idx}`} text={item} badgeColor={badgeColor} index={idx} />
        )) : (
          <p className="text-slate-500 italic text-sm py-4">Sem seleções disponíveis para este mercado.</p>
        )}
      </div>
    </div>
  </div>
);

const SuggestionsView: React.FC<Props> = ({ suggestions }) => {
  return (
    <div className="space-y-8 pb-24">
      <div className="bg-gradient-to-r from-blue-900/40 to-slate-900/40 border border-blue-500/20 rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-6">
        <div className="bg-blue-600/20 p-4 rounded-2xl border border-blue-500/30">
          <i className="fas fa-bolt text-4xl text-blue-400"></i>
        </div>
        <div>
          <h2 className="text-2xl font-black text-white italic">
            COMBO TIPSTERZ <span className="text-blue-500">PREMIUM</span>
          </h2>
          <p className="text-slate-400 text-sm max-w-lg">
            As nossas melhores seleções baseadas em modelos estatísticos de alta confiança, processados em tempo real com as respetivas probabilidades.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <SuggestionCard
          title="Triplete de Vitórias"
          items={suggestions.tripleWin}
          icon="fa-award"
          gradient="bg-gradient-to-br from-amber-500 to-orange-600"
          badgeColor="bg-amber-500"
          description="Os 3 favoritos com maior probabilidade de vencer (incl. OT)."
        />

        <SuggestionCard
          title="Triplete Over 1.5 P1"
          items={suggestions.tripleOver15P1}
          icon="fa-fire-alt"
          gradient="bg-gradient-to-br from-red-500 to-rose-700"
          badgeColor="bg-red-500"
          description="3 jogos com entradas fortes para pelo menos 2 golos no 1º período."
        />

        <SuggestionCard
          title="Dupla Over 1.5 P1"
          items={suggestions.doubleOver15P1}
          icon="fa-bolt"
          gradient="bg-gradient-to-br from-blue-500 to-indigo-700"
          badgeColor="bg-blue-500"
          description="Seleção secundária de alta confiança para golos rápidos."
        />

        <SuggestionCard
          title="Quadriplete O4.5"
          items={suggestions.quadrupleOver45}
          icon="fa-hockey-puck"
          gradient="bg-gradient-to-br from-emerald-500 to-teal-700"
          badgeColor="bg-emerald-500"
          description="Série de 4 jogos com forte tendência ofensiva para 5+ golos."
        />

        <div className="md:col-span-2 bg-slate-800/40 border border-slate-700 rounded-2xl p-6 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
          <h3 className="text-xl font-bold flex items-center mb-6 text-indigo-400">
            <i className="fas fa-handshake mr-3 text-2xl"></i>
            Master Insight: Sugestões de Empate (TR)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {suggestions.drawSuggestions.length > 0 ? suggestions.drawSuggestions.map((s, idx) => {
              const teamMatches = parseTeamsFromText(s.game);
              const percentageMatch = s.game.match(/\d+%/);
              const percentage = percentageMatch ? percentageMatch[0] : null;
              const cleanGameText = s.game.replace(/\(\d+%\)/, '').trim();

              return (
                <div key={idx} className="bg-slate-900/80 p-5 rounded-2xl border border-slate-700/50 hover:bg-slate-900 transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <span className="bg-indigo-500/20 text-indigo-300 text-[10px] font-black px-2 py-0.5 rounded border border-indigo-500/30 uppercase tracking-widest">
                      Draw Candidate
                    </span>
                    {percentage && (
                      <span className="text-xs font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        {percentage}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mb-3">
                    {teamMatches.length > 0 && (
                      <div className="flex -space-x-2">
                        {teamMatches.map((abbr, i) => (
                          <img
                            key={`${abbr}-${i}`}
                            src={getLogoUrl(abbr)}
                            className="w-8 h-8 object-contain drop-shadow-md bg-slate-800 rounded-full p-1 border border-slate-700"
                            alt={abbr}
                            loading="lazy"
                            decoding="async"
                            onError={(e) => (e.currentTarget.style.display = 'none')}
                          />
                        ))}
                      </div>
                    )}
                    <p className="font-bold text-lg text-slate-100">{cleanGameText}</p>
                  </div>
                  <div className="flex gap-3">
                    <i className="fas fa-quote-left text-indigo-500/30 text-2xl mt-1"></i>
                    <p className="text-sm text-slate-400 leading-relaxed italic line-clamp-4">
                      {s.explanation}
                    </p>
                  </div>
                </div>
              );
            }) : (
              <div className="col-span-2 text-center py-6 text-slate-500">Nenhum cenário de empate evidente hoje.</div>
            )}
          </div>
        </div>

        <div className="bg-slate-800/40 border border-slate-700 rounded-2xl p-6 flex flex-col">
          <h3 className="text-lg font-bold flex items-center mb-4 text-pink-400">
            <i className="fas fa-plus-circle mr-3"></i>
            Over 5.5 Plus
          </h3>
          <div className="flex flex-wrap gap-2 mt-auto">
            {suggestions.over55Suggestions.map((item, idx) => {
              const teamMatches = parseTeamsFromText(item);
              const percentageMatch = item.match(/\d+%/);
              const percentage = percentageMatch ? percentageMatch[0] : '';
              const cleanItemText = item.replace(/\(\d+%\)/, '').trim();

              return (
                <div key={idx} className="bg-pink-500/5 hover:bg-pink-500/10 text-pink-300 px-3 py-2 rounded-xl text-[11px] font-bold border border-pink-500/20 transition-all flex items-center gap-2">
                  <div className="flex -space-x-1.5">
                    {teamMatches.map((abbr, i) => (
                      <img
                        key={`${abbr}-${i}`}
                        src={getLogoUrl(abbr)}
                        className="w-4 h-4 object-contain bg-slate-900 rounded-full p-0.5 border border-slate-700"
                        alt={abbr}
                        loading="lazy"
                        decoding="async"
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                      />
                    ))}
                  </div>
                  <span>{cleanItemText}</span>
                  {percentage && <span className="text-[9px] opacity-70 ml-1">{percentage}</span>}
                </div>
              );
            })}
            {suggestions.over55Suggestions.length === 0 && (
              <span className="text-slate-600 text-sm italic">Nenhuma sugestão adicional.</span>
            )}
          </div>
          <p className="text-[10px] text-slate-500 mt-4 leading-tight uppercase tracking-wider font-bold">
            Jogos com elevado potencial de chuva de golos.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SuggestionsView;
