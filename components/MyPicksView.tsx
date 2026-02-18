import React, { useEffect, useMemo, useState } from "react";
import { GamePrediction, Suggestions } from "../types";

interface Props {
  predictions: GamePrediction[];
  selectedDate: string; // YYYY-MM-DD (loadedDate)
}

const defaultSuggestions = (): Suggestions => ({
  tripleWin: [],
  tripleOver15P1: [],
  doubleOver15P1: [],
  drawSuggestions: [],
  quadrupleOver45: [],
  over55Suggestions: [],
});

const storageKey = (date: string) => `my_picks_${date}`;

const getLogoUrl = (abbr: string) => {
  const map: Record<string, string> = {
    TBL: "tb", TB: "tb", SJS: "sj", SJ: "sj",
    LAK: "la", LA: "la", VGK: "vgs", VGS: "vgs",
    UTA: "utah", NJD: "nj", NJ: "nj", CBJ: "cbj",
    WSH: "wsh", WPG: "wpg", NSH: "nsh", MTL: "mtl",
    NYI: "nyi", NYR: "nyr", ANA: "ana", BOS: "bos",
    BUF: "buf", CGY: "cgy", CAR: "car", CHI: "chi",
    COL: "col", DAL: "dal", DET: "det", EDM: "edm",
    FLA: "fla", MIN: "min", OTT: "ott", PHI: "phi",
    PIT: "pit", SEA: "sea", STL: "stl", VAN: "van",
    TOR: "tor",
  };
  const normalized = (abbr || "").trim().toUpperCase();
  const code = map[normalized] || normalized.toLowerCase();
  return `https://a.espncdn.com/i/teamlogos/nhl/500/${code}.png`;
};

// Para as tuas picks vamos guardar texto com abreviações (ex: "OTT vs DET", "BOS")
const parseTeamsFromText = (text: string): string[] => {
  const raw = (text || "").trim();
  const abbrMatches = raw.match(/\b[A-Z]{2,4}\b/g) || [];
  const cleaned = abbrMatches.map(s => s.toUpperCase()).filter(s => s !== "OT" && s !== "VS" && s !== "V");
  if (cleaned.length >= 2) return cleaned.slice(0, 2);
  if (cleaned.length === 1) return cleaned;
  return [];
};

const SuggestionItem: React.FC<{
  text: string;
  badgeColor: string;
  index: number;
  onRemove?: () => void;
}> = ({ text, badgeColor, index, onRemove }) => {
  const teams = parseTeamsFromText(text);

  return (
    <div className="flex items-center gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-700/50 group hover:border-blue-500/30 transition-colors">
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${badgeColor} text-white shrink-0 shadow-sm`}>
        {index + 1}
      </div>

      <div className="flex items-center gap-2 overflow-hidden flex-1">
        {teams.length > 0 && (
          <div className="flex -space-x-2 mr-1">
            {teams.map((abbr, i) => (
              <img
                key={`${abbr}-${i}`}
                src={getLogoUrl(abbr)}
                className="w-6 h-6 object-contain drop-shadow-md relative bg-slate-800 rounded-full p-0.5 border border-slate-700"
                alt={abbr}
                loading="lazy"
                decoding="async"
                onError={(e) => (e.currentTarget.style.display = "none")}
                style={{ zIndex: 10 - i }}
              />
            ))}
          </div>
        )}

        <span className="text-sm font-semibold text-slate-200 group-hover:text-white truncate">
          {text}
        </span>
      </div>

      {onRemove && (
        <button
          onClick={onRemove}
          className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-rose-400 transition"
          title="Remover"
        >
          Remover
        </button>
      )}
    </div>
  );
};

const CardShell: React.FC<{
  title: string;
  icon: string;
  gradient: string;
  description: string;
  children: React.ReactNode;
}> = ({ title, icon, gradient, description, children }) => (
  <div className="relative overflow-hidden bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6 shadow-xl transition-all hover:scale-[1.01] hover:shadow-blue-500/10">
    <div className={`absolute top-0 right-0 w-32 h-32 -mr-8 -mt-8 opacity-10 rounded-full blur-3xl ${gradient}`} />
    <div className="relative z-10">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${gradient} shadow-lg shadow-black/20`}>
          <i className={`fas ${icon} text-white text-xl`} />
        </div>
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Minhas escolhas</span>
      </div>

      <h3 className="text-xl font-bold text-white mb-1">{title}</h3>
      <p className="text-xs text-slate-400 mb-6 font-medium leading-tight">{description}</p>

      {children}
    </div>
  </div>
);

const MyPicksView: React.FC<Props> = ({ predictions, selectedDate }) => {
  const [picks, setPicks] = useState<Suggestions>(defaultSuggestions());

  // UI states (seletores)
  const [teamPick, setTeamPick] = useState<string>("");
  const [gamePick, setGamePick] = useState<string>("");
  const [drawPick, setDrawPick] = useState<string>("");
  const [drawNote, setDrawNote] = useState<string>("");

  const teams = useMemo(() => {
    const set = new Set<string>();
    for (const g of predictions) {
      if (g.homeTeamAbbr) set.add(g.homeTeamAbbr.toUpperCase());
      if (g.awayTeamAbbr) set.add(g.awayTeamAbbr.toUpperCase());
    }
    return Array.from(set).sort();
  }, [predictions]);

  const games = useMemo(() => {
    return predictions
      .map((g) => `${(g.awayTeamAbbr || "").toUpperCase()} vs ${(g.homeTeamAbbr || "").toUpperCase()}`)
      .filter((s) => !s.includes(" vs "));
  }, [predictions]);

  // Carregar do localStorage quando muda a data
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(selectedDate));
      if (!raw) {
        setPicks(defaultSuggestions());
        return;
      }
      const parsed = JSON.parse(raw);
      // merge defensivo
      setPicks({
        ...defaultSuggestions(),
        ...parsed,
        drawSuggestions: Array.isArray(parsed?.drawSuggestions) ? parsed.drawSuggestions : [],
      });
    } catch {
      setPicks(defaultSuggestions());
    }
  }, [selectedDate]);

  // Guardar sempre que muda
  useEffect(() => {
    try {
      localStorage.setItem(storageKey(selectedDate), JSON.stringify(picks));
    } catch {
      // ignore
    }
  }, [picks, selectedDate]);

  const addUnique = (arr: string[], value: string, max: number) => {
    const v = value.trim().toUpperCase();
    if (!v) return arr;
    if (arr.includes(v)) return arr;
    if (arr.length >= max) return arr;
    return [...arr, v];
  };

  const addGameUnique = (arr: string[], value: string, max: number) => {
    const v = value.trim().toUpperCase();
    if (!v) return arr;
    if (arr.includes(v)) return arr;
    if (arr.length >= max) return arr;
    return [...arr, v];
  };

  const removeAt = <T,>(arr: T[], idx: number) => arr.filter((_, i) => i !== idx);

  return (
    <div className="space-y-8 pb-24">
      <div className="bg-gradient-to-r from-blue-900/40 to-slate-900/40 border border-blue-500/20 rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-6">
        <div className="bg-blue-600/20 p-4 rounded-2xl border border-blue-500/30">
          <i className="fas fa-user-check text-4xl text-blue-400" />
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-black text-white italic">
            MINHAS <span className="text-blue-500">PICKS</span>
          </h2>
          <p className="text-slate-400 text-sm max-w-lg">
            Escolhe manualmente as tuas seleções para {selectedDate}. Fica guardado automaticamente.
          </p>
        </div>

        <button
          onClick={() => {
            if (confirm("Limpar todas as tuas picks desta data?")) setPicks(defaultSuggestions());
          }}
          className="bg-white/5 hover:bg-rose-500/10 text-slate-300 hover:text-rose-300 border border-white/10 hover:border-rose-500/20 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition"
        >
          Limpar tudo
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Triplete de Vitórias (equipa única) */}
        <CardShell
          title="Triplete de Vitórias"
          icon="fa-award"
          gradient="bg-gradient-to-br from-amber-500 to-orange-600"
          description="Escolhe 3 equipas que achas que vencem (incl. OT)."
        >
          <div className="flex gap-2 mb-4">
            <select
              value={teamPick}
              onChange={(e) => setTeamPick(e.target.value)}
              className="flex-1 bg-slate-900/60 border border-slate-700/50 rounded-xl px-3 py-2 text-[11px] font-black text-slate-200 outline-none"
            >
              <option value="">Selecionar equipa…</option>
              {teams.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            <button
              onClick={() => {
                setPicks((p) => ({
                  ...p,
                  tripleWin: addUnique(p.tripleWin, teamPick, 3),
                }));
                setTeamPick("");
              }}
              className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition"
              title="Adicionar"
            >
              + Add
            </button>
          </div>

          <div className="space-y-3">
            {picks.tripleWin.length ? picks.tripleWin.map((item, idx) => (
              <SuggestionItem
                key={`${item}-${idx}`}
                text={item}
                badgeColor="bg-amber-500"
                index={idx}
                onRemove={() => setPicks((p) => ({ ...p, tripleWin: removeAt(p.tripleWin, idx) }))}
              />
            )) : (
              <p className="text-slate-500 italic text-sm py-2">Sem seleções ainda.</p>
            )}
          </div>
        </CardShell>

        {/* Triplete Over 1.5 P1 */}
        <CardShell
          title="Triplete Over 1.5 P1"
          icon="fa-fire-alt"
          gradient="bg-gradient-to-br from-red-500 to-rose-700"
          description="Escolhe 3 jogos para 2+ golos no 1º período."
        >
          <div className="flex gap-2 mb-4">
            <select
              value={gamePick}
              onChange={(e) => setGamePick(e.target.value)}
              className="flex-1 bg-slate-900/60 border border-slate-700/50 rounded-xl px-3 py-2 text-[11px] font-black text-slate-200 outline-none"
            >
              <option value="">Selecionar jogo…</option>
              {predictions.map((g) => {
                const v = `${g.awayTeamAbbr.toUpperCase()} vs ${g.homeTeamAbbr.toUpperCase()}`;
                return <option key={g.id} value={v}>{v}</option>;
              })}
            </select>

            <button
              onClick={() => {
                setPicks((p) => ({
                  ...p,
                  tripleOver15P1: addGameUnique(p.tripleOver15P1, gamePick, 3),
                }));
                setGamePick("");
              }}
              className="bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/30 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition"
            >
              + Add
            </button>
          </div>

          <div className="space-y-3">
            {picks.tripleOver15P1.length ? picks.tripleOver15P1.map((item, idx) => (
              <SuggestionItem
                key={`${item}-${idx}`}
                text={item}
                badgeColor="bg-red-500"
                index={idx}
                onRemove={() => setPicks((p) => ({ ...p, tripleOver15P1: removeAt(p.tripleOver15P1, idx) }))}
              />
            )) : (
              <p className="text-slate-500 italic text-sm py-2">Sem seleções ainda.</p>
            )}
          </div>
        </CardShell>

        {/* Dupla Over 1.5 P1 */}
        <CardShell
          title="Dupla Over 1.5 P1"
          icon="fa-bolt"
          gradient="bg-gradient-to-br from-blue-500 to-indigo-700"
          description="Escolhe 2 jogos de alta confiança para golos rápidos."
        >
          <div className="flex gap-2 mb-4">
            <select
              value={gamePick}
              onChange={(e) => setGamePick(e.target.value)}
              className="flex-1 bg-slate-900/60 border border-slate-700/50 rounded-xl px-3 py-2 text-[11px] font-black text-slate-200 outline-none"
            >
              <option value="">Selecionar jogo…</option>
              {predictions.map((g) => {
                const v = `${g.awayTeamAbbr.toUpperCase()} vs ${g.homeTeamAbbr.toUpperCase()}`;
                return <option key={g.id} value={v}>{v}</option>;
              })}
            </select>

            <button
              onClick={() => {
                setPicks((p) => ({
                  ...p,
                  doubleOver15P1: addGameUnique(p.doubleOver15P1, gamePick, 2),
                }));
                setGamePick("");
              }}
              className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 border border-blue-500/30 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition"
            >
              + Add
            </button>
          </div>

          <div className="space-y-3">
            {picks.doubleOver15P1.length ? picks.doubleOver15P1.map((item, idx) => (
              <SuggestionItem
                key={`${item}-${idx}`}
                text={item}
                badgeColor="bg-blue-500"
                index={idx}
                onRemove={() => setPicks((p) => ({ ...p, doubleOver15P1: removeAt(p.doubleOver15P1, idx) }))}
              />
            )) : (
              <p className="text-slate-500 italic text-sm py-2">Sem seleções ainda.</p>
            )}
          </div>
        </CardShell>

        {/* Quadriplete O4.5 */}
        <CardShell
          title="Quadriplete O4.5"
          icon="fa-hockey-puck"
          gradient="bg-gradient-to-br from-emerald-500 to-teal-700"
          description="Escolhe 4 jogos com tendência para 5+ golos."
        >
          <div className="flex gap-2 mb-4">
            <select
              value={gamePick}
              onChange={(e) => setGamePick(e.target.value)}
              className="flex-1 bg-slate-900/60 border border-slate-700/50 rounded-xl px-3 py-2 text-[11px] font-black text-slate-200 outline-none"
            >
              <option value="">Selecionar jogo…</option>
              {predictions.map((g) => {
                const v = `${g.awayTeamAbbr.toUpperCase()} vs ${g.homeTeamAbbr.toUpperCase()}`;
                return <option key={g.id} value={v}>{v}</option>;
              })}
            </select>

            <button
              onClick={() => {
                setPicks((p) => ({
                  ...p,
                  quadrupleOver45: addGameUnique(p.quadrupleOver45, gamePick, 4),
                }));
                setGamePick("");
              }}
              className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/30 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition"
            >
              + Add
            </button>
          </div>

          <div className="space-y-3">
            {picks.quadrupleOver45.length ? picks.quadrupleOver45.map((item, idx) => (
              <SuggestionItem
                key={`${item}-${idx}`}
                text={item}
                badgeColor="bg-emerald-500"
                index={idx}
                onRemove={() => setPicks((p) => ({ ...p, quadrupleOver45: removeAt(p.quadrupleOver45, idx) }))}
              />
            )) : (
              <p className="text-slate-500 italic text-sm py-2">Sem seleções ainda.</p>
            )}
          </div>
        </CardShell>

        {/* Empate TR (2 colunas) */}
        <div className="md:col-span-2 bg-slate-800/40 border border-slate-700 rounded-2xl p-6 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
          <h3 className="text-xl font-bold flex items-center mb-6 text-indigo-400">
            <i className="fas fa-handshake mr-3 text-2xl" />
            Minhas Sugestões de Empate (TR)
          </h3>

          <div className="flex flex-col md:flex-row gap-3 mb-5">
            <select
              value={drawPick}
              onChange={(e) => setDrawPick(e.target.value)}
              className="flex-1 bg-slate-900/60 border border-slate-700/50 rounded-xl px-3 py-2 text-[11px] font-black text-slate-200 outline-none"
            >
              <option value="">Selecionar jogo…</option>
              {predictions.map((g) => {
                const v = `${g.awayTeamAbbr.toUpperCase()} vs ${g.homeTeamAbbr.toUpperCase()}`;
                return <option key={g.id} value={v}>{v}</option>;
              })}
            </select>

            <input
              value={drawNote}
              onChange={(e) => setDrawNote(e.target.value)}
              placeholder="(opcional) nota rápida"
              className="flex-1 bg-slate-900/60 border border-slate-700/50 rounded-xl px-3 py-2 text-[11px] font-bold text-slate-200 outline-none"
            />

            <button
              onClick={() => {
                const g = drawPick.trim().toUpperCase();
                if (!g) return;

                setPicks((p) => {
                  if (p.drawSuggestions.some((x) => x.game.toUpperCase() === g)) return p;
                  return {
                    ...p,
                    drawSuggestions: [
                      ...p.drawSuggestions,
                      { game: g, explanation: (drawNote || "").trim() },
                    ],
                  };
                });

                setDrawPick("");
                setDrawNote("");
              }}
              className="bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 border border-indigo-500/30 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition"
            >
              + Add
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {picks.drawSuggestions.length ? picks.drawSuggestions.map((s, idx) => {
              const teams = parseTeamsFromText(s.game);
              return (
                <div key={`${s.game}-${idx}`} className="bg-slate-900/80 p-5 rounded-2xl border border-slate-700/50 hover:bg-slate-900 transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <span className="bg-indigo-500/20 text-indigo-300 text-[10px] font-black px-2 py-0.5 rounded border border-indigo-500/30 uppercase tracking-widest">
                      Draw Candidate
                    </span>
                    <button
                      onClick={() => setPicks((p) => ({ ...p, drawSuggestions: removeAt(p.drawSuggestions, idx) }))}
                      className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-rose-400 transition"
                    >
                      Remover
                    </button>
                  </div>

                  <div className="flex items-center gap-3 mb-3">
                    {teams.length > 0 && (
                      <div className="flex -space-x-2">
                        {teams.map((abbr, i) => (
                          <img
                            key={`${abbr}-${i}`}
                            src={getLogoUrl(abbr)}
                            className="w-8 h-8 object-contain drop-shadow-md bg-slate-800 rounded-full p-1 border border-slate-700"
                            alt={abbr}
                            loading="lazy"
                            decoding="async"
                            onError={(e) => (e.currentTarget.style.display = "none")}
                          />
                        ))}
                      </div>
                    )}
                    <p className="font-bold text-lg text-slate-100">{s.game}</p>
                  </div>

                  {s.explanation ? (
                    <div className="flex gap-3">
                      <i className="fas fa-quote-left text-indigo-500/30 text-2xl mt-1" />
                      <p className="text-sm text-slate-400 leading-relaxed italic line-clamp-4">
                        {s.explanation}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">Sem nota.</p>
                  )}
                </div>
              );
            }) : (
              <div className="col-span-2 text-center py-6 text-slate-500">
                Ainda não escolheste empates para esta data.
              </div>
            )}
          </div>
        </div>

        {/* Over 5.5 Plus */}
        <CardShell
          title="Over 5.5 Plus"
          icon="fa-plus-circle"
          gradient="bg-gradient-to-br from-pink-500 to-fuchsia-700"
          description="Escolhe jogos que achas que passam de 5.5 golos (sem limite rígido)."
        >
          <div className="flex gap-2 mb-4">
            <select
              value={gamePick}
              onChange={(e) => setGamePick(e.target.value)}
              className="flex-1 bg-slate-900/60 border border-slate-700/50 rounded-xl px-3 py-2 text-[11px] font-black text-slate-200 outline-none"
            >
              <option value="">Selecionar jogo…</option>
              {predictions.map((g) => {
                const v = `${g.awayTeamAbbr.toUpperCase()} vs ${g.homeTeamAbbr.toUpperCase()}`;
                return <option key={g.id} value={v}>{v}</option>;
              })}
            </select>

            <button
              onClick={() => {
                setPicks((p) => ({
                  ...p,
                  over55Suggestions: addGameUnique(p.over55Suggestions, gamePick, 12),
                }));
                setGamePick("");
              }}
              className="bg-pink-500/20 hover:bg-pink-500/30 text-pink-200 border border-pink-500/30 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition"
            >
              + Add
            </button>
          </div>

          <div className="space-y-3">
            {picks.over55Suggestions.length ? picks.over55Suggestions.map((item, idx) => (
              <SuggestionItem
                key={`${item}-${idx}`}
                text={item}
                badgeColor="bg-pink-500"
                index={idx}
                onRemove={() => setPicks((p) => ({ ...p, over55Suggestions: removeAt(p.over55Suggestions, idx) }))}
              />
            )) : (
              <p className="text-slate-500 italic text-sm py-2">Sem seleções ainda.</p>
            )}
          </div>
        </CardShell>
      </div>
    </div>
  );
};

export default MyPicksView;
