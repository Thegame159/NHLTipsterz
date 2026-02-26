import React, { useEffect, useMemo, useState } from "react";
import { GamePrediction, Suggestions } from "../types";

interface Props {
  predictions: GamePrediction[];
  selectedDate: string; // loadedDate
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
    TBL: "tb",
    TB: "tb",
    SJS: "sj",
    SJ: "sj",
    LAK: "la",
    LA: "la",
    VGK: "vgs",
    VGS: "vgs",
    UTA: "utah",
    NJD: "nj",
    NJ: "nj",
    CBJ: "cbj",
    WSH: "wsh",
    WPG: "wpg",
    NSH: "nsh",
    MTL: "mtl",
    NYI: "nyi",
    NYR: "nyr",
    ANA: "ana",
    BOS: "bos",
    BUF: "buf",
    CGY: "cgy",
    CAR: "car",
    CHI: "chi",
    COL: "col",
    DAL: "dal",
    DET: "det",
    EDM: "edm",
    FLA: "fla",
    MIN: "min",
    OTT: "ott",
    PHI: "phi",
    PIT: "pit",
    SEA: "sea",
    STL: "stl",
    VAN: "van",
    TOR: "tor",
  };
  const normalizedAbbr = abbr?.trim().toUpperCase();
  const code = map[normalizedAbbr] || normalizedAbbr?.toLowerCase();
  return `https://a.espncdn.com/i/teamlogos/nhl/500/${code}.png`;
};

// Normalizador (remove acentos e normaliza espaços) — para comparação
const normName = (s: string) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();

const parseTeamsFromText = (text: string): string[] => {
  const raw = (text || "").trim();
  const abbrMatches = raw.match(/\b[A-Z]{2,4}\b/g) || [];
  const cleanedAbbr = abbrMatches.map((s) => s.toUpperCase()).filter((s) => s !== "OT" && s !== "VS" && s !== "V");
  if (cleanedAbbr.length >= 2) return cleanedAbbr.slice(0, 2);
  if (cleanedAbbr.length === 1) return cleanedAbbr;
  return [];
};

const isEmptyPicks = (p: Suggestions) =>
  (p.tripleWin || []).length === 0 &&
  (p.tripleOver15P1 || []).length === 0 &&
  (p.doubleOver15P1 || []).length === 0 &&
  (p.quadrupleOver45 || []).length === 0 &&
  (p.over55Suggestions || []).length === 0 &&
  (p.drawSuggestions || []).length === 0;

// --- item igual ao SuggestionsView, mas com remover opcional ---
const SuggestionItem: React.FC<{
  text: string;
  badgeColor: string;
  index: number;
  onRemove?: () => void;
}> = ({ text, badgeColor, index, onRemove }) => {
  const teamMatches = parseTeamsFromText(text);

  const percentageMatch = text.match(/\d+%/);
  const percentage = percentageMatch ? percentageMatch[0] : null;
  const cleanText = text.replace(/\(\d+%\)/, "").trim();

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
                onError={(e) => (e.currentTarget.style.display = "none")}
                style={{ zIndex: 10 - i }}
              />
            ))}
          </div>
        )}
        <span className="text-sm font-semibold text-slate-200 group-hover:text-white truncate">{cleanText}</span>
      </div>

      {percentage && (
        <div className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-black text-emerald-400">
          {percentage}
        </div>
      )}

      {onRemove && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          className="ml-2 px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20 text-[10px] font-black text-rose-200 hover:bg-rose-500/15 shrink-0"
          title="Remover"
        >
          <i className="fas fa-times" />
        </button>
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
  addUi?: React.ReactNode;
  renderItem?: (item: string, idx: number) => React.ReactNode;
}> = ({ title, items, icon, gradient, badgeColor, description, addUi, renderItem }) => (
  <div className="relative overflow-hidden bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6 shadow-xl transition-all hover:scale-[1.01] hover:shadow-blue-500/10">
    <div className={`absolute top-0 right-0 w-32 h-32 -mr-8 -mt-8 opacity-10 rounded-full blur-3xl ${gradient}`}></div>

    <div className="relative z-10">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${gradient} shadow-lg shadow-black/20`}>
          <i className={`fas ${icon} text-white text-xl`}></i>
        </div>
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">As Minhas Picks</span>
      </div>

      <h3 className="text-xl font-bold text-white mb-1">{title}</h3>
      <p className="text-xs text-slate-400 mb-6 font-medium leading-tight">{description}</p>

      {addUi && <div className="mb-4">{addUi}</div>}

      <div className="space-y-3">
        {items.length > 0 ? (
          items.map((item, idx) =>
            renderItem ? renderItem(item, idx) : <SuggestionItem key={`${title}-${idx}`} text={item} badgeColor={badgeColor} index={idx} />
          )
        ) : (
          <p className="text-slate-500 italic text-sm py-4">Sem seleções ainda — adiciona acima.</p>
        )}
      </div>
    </div>
  </div>
);

const MyPicksView: React.FC<Props> = ({ predictions, selectedDate }) => {
  const [picks, setPicks] = useState<Suggestions>(defaultSuggestions());

  // dropdown values
  const [teamToAdd, setTeamToAdd] = useState("");
  const [gameToAdd_TripleO15, setGameToAdd_TripleO15] = useState("");
  const [gameToAdd_DoubleO15, setGameToAdd_DoubleO15] = useState("");
  const [gameToAdd_O45, setGameToAdd_O45] = useState("");
  const [gameToAdd_Draw, setGameToAdd_Draw] = useState("");
  const [gameToAdd_O55, setGameToAdd_O55] = useState("");

  // load backup (browser) por data
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const raw = window.localStorage.getItem(storageKey(selectedDate));
      if (!raw) {
        setPicks(defaultSuggestions());
        return;
      }
      const parsed = JSON.parse(raw);
      setPicks({ ...defaultSuggestions(), ...(parsed || {}) });
    } catch {
      setPicks(defaultSuggestions());
    }
  }, [selectedDate]);

  const predictionsOfDay = useMemo(() => predictions || [], [predictions]);

  // ✅ só equipas do dia (unique)
  const teamsOfDay = useMemo(() => {
    const set = new Set<string>();
    for (const g of predictionsOfDay as any[]) {
      const a = String((g as any).awayTeamAbbr || "").trim().toUpperCase();
      const h = String((g as any).homeTeamAbbr || "").trim().toUpperCase();
      if (a) set.add(a);
      if (h) set.add(h);
    }
    return Array.from(set).sort();
  }, [predictionsOfDay]);

  // ✅ só jogos do dia (unique)
  const gamesOfDay = useMemo(() => {
    const set = new Set<string>();
    for (const g of predictionsOfDay as any[]) {
      const away = String((g as any).awayTeamAbbr || "").trim().toUpperCase();
      const home = String((g as any).homeTeamAbbr || "").trim().toUpperCase();
      if (!away || !home) continue;
      set.add(`${away} vs ${home}`);
    }
    return Array.from(set).sort();
  }, [predictionsOfDay]);

  // ✅ validação extra: não deixa adicionar coisas que não sejam do dia
  const isValidTeam = (abbr: string) => teamsOfDay.includes(String(abbr || "").trim().toUpperCase());
  const isValidGame = (game: string) => gamesOfDay.some((g) => normName(g) === normName(game));

  // helpers duplicates/limits
  const hasInArrayNorm = (arr: string[], value: string) => {
    const v = normName(value);
    return arr.some((x) => normName(String(x)) === v);
  };

  const addTeam = () => {
    const t = String(teamToAdd || "").trim().toUpperCase();
    if (!t || !isValidTeam(t)) return;

    setPicks((prev) => {
      const cur = (prev.tripleWin || []).map(String);
      if (cur.length >= 3) return prev;
      if (cur.includes(t)) return prev;
      return { ...prev, tripleWin: [...cur, t] };
    });

    setTeamToAdd("");
  };

  const addGameTo = (field: keyof Suggestions, rawValue: string, limit?: number) => {
    const value = String(rawValue || "").trim();
    if (!value || !isValidGame(value)) return;

    setPicks((prev) => {
      const cur = (prev[field] as any[] | undefined) ?? [];
      const asStrings =
        field === "drawSuggestions"
          ? cur.map((x: any) => String(x?.game ?? ""))
          : cur.map((x: any) => String(x));

      if (limit && asStrings.length >= limit) return prev;
      if (hasInArrayNorm(asStrings, value)) return prev;

      if (field === "drawSuggestions") {
        return { ...prev, drawSuggestions: [...cur, { game: value, explanation: "" }] as any };
      }
      return { ...prev, [field]: [...asStrings, value] as any };
    });
  };

  const removeAt = (field: keyof Suggestions, idx: number) => {
    setPicks((prev) => {
      const cur = (prev[field] as any[] | undefined) ?? [];
      const next = cur.filter((_, i) => i !== idx);
      return { ...prev, [field]: next as any };
    });
  };

  const savePicks = async () => {
    // backup local
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey(selectedDate), JSON.stringify(picks));
      }
    } catch {
      // ignore
    }

    // save server
    try {
      const res = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: selectedDate,
          mine: { savedAt: Date.now(), suggestions: picks },
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        console.error("SAVE /api/history failed:", res.status, data);
        alert("Falhou a guardar no servidor (ficou guardado no browser).");
        return;
      }

      alert("Picks guardadas!");
    } catch (err) {
      console.error("Failed to save picks:", err);
      alert("Falhou a guardar no servidor (ficou guardado no browser).");
    }
  };

  return (
    <div className="space-y-8 pb-24">
      <div className="bg-gradient-to-r from-blue-900/40 to-slate-900/40 border border-blue-500/20 rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-6">
        <div className="bg-blue-600/20 p-4 rounded-2xl border border-blue-500/30">
          <i className="fas fa-user-edit text-4xl text-blue-400"></i>
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-black text-white italic">
            MINHAS PICKS <span className="text-blue-500">PERSONALIZADAS</span>
          </h2>
          <p className="text-slate-400 text-sm max-w-lg">Mesma UI das DICAS — mas aqui és tu que escolhes os jogos do dia.</p>
        </div>

        <button
          onClick={savePicks}
          disabled={isEmptyPicks(picks)}
          className={`px-4 py-3 rounded-xl border text-[10px] font-black uppercase tracking-widest transition ${
            isEmptyPicks(picks)
              ? "bg-white/5 border-white/10 text-slate-500 cursor-not-allowed"
              : "bg-amber-500/20 border-amber-500/30 text-amber-200 hover:bg-amber-500/25"
          }`}
          title="Guarda no servidor (history) + backup no browser"
        >
          Guardar Picks
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* ✅ TRIPLETE WIN com LOGOS */}
        <SuggestionCard
          title="Triplete de Vitórias"
          items={picks.tripleWin || []}
          icon="fa-award"
          gradient="bg-gradient-to-br from-amber-500 to-orange-600"
          badgeColor="bg-amber-500"
          description="Escolhe 3 equipas do dia para vencer (incl. OT)."
          addUi={
            <div className="flex gap-2">
              <select
                value={teamToAdd}
                onChange={(e) => setTeamToAdd(e.target.value)}
                className="flex-1 bg-slate-900/60 border border-slate-700/50 rounded-xl px-3 py-2.5 text-[11px] font-black text-slate-200 outline-none"
              >
                <option value="">Seleciona equipa…</option>
                {teamsOfDay.map((abbr) => (
                  <option key={abbr} value={abbr}>
                    {abbr}
                  </option>
                ))}
              </select>

              <button
                onClick={addTeam}
                disabled={!teamToAdd || (picks.tripleWin || []).length >= 3}
                className={`px-3 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-widest ${
                  !teamToAdd || (picks.tripleWin || []).length >= 3
                    ? "bg-white/5 border-white/10 text-slate-500 cursor-not-allowed"
                    : "bg-orange-600/20 border-orange-600/30 text-orange-200 hover:bg-orange-600/25"
                }`}
              >
                Adicionar
              </button>
            </div>
          }
          renderItem={(abbr, idx) => (
            <SuggestionItem
              key={`tw-${idx}`}
              text={String(abbr).toUpperCase()} // ✅ parseTeamsFromText apanha a abbr e mostra logo
              badgeColor="bg-amber-500"
              index={idx}
              onRemove={() => removeAt("tripleWin", idx)}
            />
          )}
        />

        <SuggestionCard
          title="Triplete Over 1.5 P1"
          items={picks.tripleOver15P1 || []}
          icon="fa-fire-alt"
          gradient="bg-gradient-to-br from-red-500 to-rose-700"
          badgeColor="bg-red-500"
          description="Escolhe 3 jogos do dia para pelo menos 2 golos no 1º período."
          addUi={
            <div className="flex gap-2">
              <select
                value={gameToAdd_TripleO15}
                onChange={(e) => setGameToAdd_TripleO15(e.target.value)}
                className="flex-1 bg-slate-900/60 border border-slate-700/50 rounded-xl px-3 py-2.5 text-[11px] font-black text-slate-200 outline-none"
              >
                <option value="">Seleciona jogo…</option>
                {gamesOfDay.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  addGameTo("tripleOver15P1", gameToAdd_TripleO15, 3);
                  setGameToAdd_TripleO15("");
                }}
                disabled={!gameToAdd_TripleO15 || (picks.tripleOver15P1 || []).length >= 3}
                className={`px-3 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-widest ${
                  !gameToAdd_TripleO15 || (picks.tripleOver15P1 || []).length >= 3
                    ? "bg-white/5 border-white/10 text-slate-500 cursor-not-allowed"
                    : "bg-orange-600/20 border-orange-600/30 text-orange-200 hover:bg-orange-600/25"
                }`}
              >
                Adicionar
              </button>
            </div>
          }
          renderItem={(item, idx) => (
            <SuggestionItem
              key={`to15-${idx}`}
              text={item}
              badgeColor="bg-red-500"
              index={idx}
              onRemove={() => removeAt("tripleOver15P1", idx)}
            />
          )}
        />

        <SuggestionCard
          title="Dupla Over 1.5 P1"
          items={picks.doubleOver15P1 || []}
          icon="fa-bolt"
          gradient="bg-gradient-to-br from-blue-500 to-indigo-700"
          badgeColor="bg-blue-500"
          description="Escolhe 2 jogos do dia (secundários) para golos rápidos."
          addUi={
            <div className="flex gap-2">
              <select
                value={gameToAdd_DoubleO15}
                onChange={(e) => setGameToAdd_DoubleO15(e.target.value)}
                className="flex-1 bg-slate-900/60 border border-slate-700/50 rounded-xl px-3 py-2.5 text-[11px] font-black text-slate-200 outline-none"
              >
                <option value="">Seleciona jogo…</option>
                {gamesOfDay.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  addGameTo("doubleOver15P1", gameToAdd_DoubleO15, 2);
                  setGameToAdd_DoubleO15("");
                }}
                disabled={!gameToAdd_DoubleO15 || (picks.doubleOver15P1 || []).length >= 2}
                className={`px-3 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-widest ${
                  !gameToAdd_DoubleO15 || (picks.doubleOver15P1 || []).length >= 2
                    ? "bg-white/5 border-white/10 text-slate-500 cursor-not-allowed"
                    : "bg-orange-600/20 border-orange-600/30 text-orange-200 hover:bg-orange-600/25"
                }`}
              >
                Adicionar
              </button>
            </div>
          }
          renderItem={(item, idx) => (
            <SuggestionItem
              key={`do15-${idx}`}
              text={item}
              badgeColor="bg-blue-500"
              index={idx}
              onRemove={() => removeAt("doubleOver15P1", idx)}
            />
          )}
        />

        <SuggestionCard
          title="Quadriplete O4.5"
          items={picks.quadrupleOver45 || []}
          icon="fa-hockey-puck"
          gradient="bg-gradient-to-br from-emerald-500 to-teal-700"
          badgeColor="bg-emerald-500"
          description="Escolhe 4 jogos do dia com tendência ofensiva (5+ golos)."
          addUi={
            <div className="flex gap-2">
              <select
                value={gameToAdd_O45}
                onChange={(e) => setGameToAdd_O45(e.target.value)}
                className="flex-1 bg-slate-900/60 border border-slate-700/50 rounded-xl px-3 py-2.5 text-[11px] font-black text-slate-200 outline-none"
              >
                <option value="">Seleciona jogo…</option>
                {gamesOfDay.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  addGameTo("quadrupleOver45", gameToAdd_O45, 4);
                  setGameToAdd_O45("");
                }}
                disabled={!gameToAdd_O45 || (picks.quadrupleOver45 || []).length >= 4}
                className={`px-3 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-widest ${
                  !gameToAdd_O45 || (picks.quadrupleOver45 || []).length >= 4
                    ? "bg-white/5 border-white/10 text-slate-500 cursor-not-allowed"
                    : "bg-orange-600/20 border-orange-600/30 text-orange-200 hover:bg-orange-600/25"
                }`}
              >
                Adicionar
              </button>
            </div>
          }
          renderItem={(item, idx) => (
            <SuggestionItem
              key={`o45-${idx}`}
              text={item}
              badgeColor="bg-emerald-500"
              index={idx}
              onRemove={() => removeAt("quadrupleOver45", idx)}
            />
          )}
        />

        {/* DRAW — continua igual às DICAS, mas só jogos do dia */}
        <div className="md:col-span-2 bg-slate-800/40 border border-slate-700 rounded-2xl p-6 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <h3 className="text-xl font-bold flex items-center text-indigo-400">
              <i className="fas fa-handshake mr-3 text-2xl"></i>
              Master Insight: Sugestões de Empate (TR)
            </h3>

            <div className="flex gap-2 w-full sm:w-auto">
              <select
                value={gameToAdd_Draw}
                onChange={(e) => setGameToAdd_Draw(e.target.value)}
                className="flex-1 sm:flex-none bg-slate-900/60 border border-slate-700/50 rounded-xl px-3 py-2.5 text-[11px] font-black text-slate-200 outline-none min-w-[220px]"
              >
                <option value="">Seleciona jogo…</option>
                {gamesOfDay.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>

              <button
                onClick={() => {
                  addGameTo("drawSuggestions", gameToAdd_Draw);
                  setGameToAdd_Draw("");
                }}
                disabled={!gameToAdd_Draw}
                className={`px-3 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-widest ${
                  !gameToAdd_Draw
                    ? "bg-white/5 border-white/10 text-slate-500 cursor-not-allowed"
                    : "bg-indigo-500/20 border-indigo-500/30 text-indigo-200 hover:bg-indigo-500/25"
                }`}
              >
                Adicionar
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {(picks.drawSuggestions || []).length > 0 ? (
              (picks.drawSuggestions as any[]).map((s, idx) => {
                const teamMatches = parseTeamsFromText(s.game);
                const percentageMatch = String(s.game || "").match(/\d+%/);
                const percentage = percentageMatch ? percentageMatch[0] : null;
                const cleanGameText = String(s.game || "").replace(/\(\d+%\)/, "").trim();

                return (
                  <div
                    key={idx}
                    className="bg-slate-900/80 p-5 rounded-2xl border border-slate-700/50 hover:bg-slate-900 transition-all relative"
                  >
                    <button
                      onClick={() => removeAt("drawSuggestions", idx)}
                      className="absolute top-3 right-3 w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-200 hover:bg-rose-500/15 flex items-center justify-center"
                      title="Remover"
                    >
                      <i className="fas fa-times text-[12px]" />
                    </button>

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
                              onError={(e) => (e.currentTarget.style.display = "none")}
                            />
                          ))}
                        </div>
                      )}
                      <p className="font-bold text-lg text-slate-100">{cleanGameText}</p>
                    </div>

                    <div className="flex gap-3">
                      <i className="fas fa-quote-left text-indigo-500/30 text-2xl mt-1"></i>
                      <p className="text-sm text-slate-400 leading-relaxed italic line-clamp-4">
                        {String(s.explanation || "Sem nota (opcional).")}
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="col-span-2 text-center py-6 text-slate-500">Nenhum cenário de empate escolhido.</div>
            )}
          </div>
        </div>

        {/* Over 5.5 — só jogos do dia */}
        <div className="bg-slate-800/40 border border-slate-700 rounded-2xl p-6 flex flex-col">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="text-lg font-bold flex items-center text-pink-400">
              <i className="fas fa-plus-circle mr-3"></i>
              Over 5.5 Plus
            </h3>

            <div className="flex gap-2">
              <select
                value={gameToAdd_O55}
                onChange={(e) => setGameToAdd_O55(e.target.value)}
                className="bg-slate-900/60 border border-slate-700/50 rounded-xl px-3 py-2 text-[11px] font-black text-slate-200 outline-none"
              >
                <option value="">Seleciona jogo…</option>
                {gamesOfDay.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>

              <button
                onClick={() => {
                  addGameTo("over55Suggestions", gameToAdd_O55);
                  setGameToAdd_O55("");
                }}
                disabled={!gameToAdd_O55}
                className={`px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest ${
                  !gameToAdd_O55
                    ? "bg-white/5 border-white/10 text-slate-500 cursor-not-allowed"
                    : "bg-pink-500/15 border-pink-500/25 text-pink-200 hover:bg-pink-500/20"
                }`}
              >
                Adicionar
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-auto">
            {(picks.over55Suggestions || []).map((item, idx) => {
              const teamMatches = parseTeamsFromText(item);
              const percentageMatch = item.match(/\d+%/);
              const percentage = percentageMatch ? percentageMatch[0] : "";
              const cleanItemText = item.replace(/\(\d+%\)/, "").trim();

              return (
                <div
                  key={idx}
                  className="bg-pink-500/5 hover:bg-pink-500/10 text-pink-300 px-3 py-2 rounded-xl text-[11px] font-bold border border-pink-500/20 transition-all flex items-center gap-2"
                >
                  <div className="flex -space-x-1.5">
                    {teamMatches.map((abbr, i) => (
                      <img
                        key={`${abbr}-${i}`}
                        src={getLogoUrl(abbr)}
                        className="w-4 h-4 object-contain bg-slate-900 rounded-full p-0.5 border border-slate-700"
                        alt={abbr}
                        loading="lazy"
                        decoding="async"
                        onError={(e) => (e.currentTarget.style.display = "none")}
                      />
                    ))}
                  </div>
                  <span>{cleanItemText}</span>
                  {percentage && <span className="text-[9px] opacity-70 ml-1">{percentage}</span>}

                  <button
                    onClick={() => removeAt("over55Suggestions", idx)}
                    className="ml-1 w-6 h-6 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-200 hover:bg-rose-500/15 flex items-center justify-center"
                    title="Remover"
                  >
                    <i className="fas fa-times text-[10px]" />
                  </button>
                </div>
              );
            })}

            {(picks.over55Suggestions || []).length === 0 && (
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

export default MyPicksView;
