import React, { useEffect, useMemo, useRef, useState } from "react";
import { GamePrediction, Suggestions } from "../types";

interface Props {
  predictions: GamePrediction[];
  selectedDate: string;
}

type DrawItem = { game: string; explanation?: string };

const defaultSuggestions = (): Suggestions => ({
  tripleWin: [],
  tripleOver15P1: [],
  doubleOver15P1: [],
  drawSuggestions: [],
  quadrupleOver45: [],
  over55Suggestions: [],
});

const storageKey = (date: string) => `my_picks_${date}`;

// ---------------- Logos ----------------
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
  const normalized = (abbr || "").trim().toUpperCase();
  const code = map[normalized] || normalized.toLowerCase();
  return `https://a.espncdn.com/i/teamlogos/nhl/500/${code}.png`;
};

// ---------------- Parsing helpers ----------------
const normalizeGameText = (s: string) =>
  (s || "")
    .trim()
    .toUpperCase()
    .replace(/\(\s*\d+(\.\d+)?%\s*\)/g, "")
    .replace(/\s+VS\s+/g, " VS ")
    .replace(/\s+@\s+/g, " VS ")
    .replace(/\s+V\s+/g, " VS ")
    .replace(/\s+/g, " ");

const parseTeamsFromText = (text: string): string[] => {
  const raw = (text || "").trim().toUpperCase();
  const abbrMatches = raw.match(/\b[A-Z]{2,4}\b/g) || [];
  const cleaned = abbrMatches.filter((s) => s !== "OT" && s !== "VS" && s !== "V");
  if (cleaned.length >= 2) return cleaned.slice(0, 2);
  if (cleaned.length === 1) return cleaned;
  return [];
};

const isEmptyPicks = (p: Suggestions) =>
  (p.tripleWin?.length ?? 0) === 0 &&
  (p.tripleOver15P1?.length ?? 0) === 0 &&
  (p.doubleOver15P1?.length ?? 0) === 0 &&
  (p.quadrupleOver45?.length ?? 0) === 0 &&
  (p.over55Suggestions?.length ?? 0) === 0 &&
  (p.drawSuggestions?.length ?? 0) === 0;

// ---------------- Custom dropdown (com ícones) ----------------
type DropOption = {
  value: string;
  label: string;
  logos?: string[]; // abbrs
  disabled?: boolean;
};

const IconDropdown: React.FC<{
  value: string;
  onChange: (v: string) => void;
  options: DropOption[];
  placeholder: string;
}> = ({ value, onChange, options, placeholder }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const selected = options.find((o) => o.value === value) || null;

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={wrapRef} className="relative flex-1">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="w-full bg-slate-900/60 border border-slate-700/60 rounded-xl px-3 py-2 text-[11px] font-black text-slate-200 outline-none flex items-center justify-between gap-3"
      >
        <div className="flex items-center gap-2 min-w-0">
          {selected?.logos?.length ? (
            <div className="flex -space-x-2">
              {selected.logos.map((abbr, i) => (
                <img
                  key={`${abbr}-${i}`}
                  src={getLogoUrl(abbr)}
                  className="w-5 h-5 object-contain drop-shadow-md bg-slate-800 rounded-full p-0.5 border border-slate-700"
                  alt={abbr}
                  loading="lazy"
                  decoding="async"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                  style={{ zIndex: 10 - i }}
                />
              ))}
            </div>
          ) : null}

          <span className={`truncate ${selected ? "text-slate-200" : "text-slate-400"}`}>
            {selected ? selected.label : placeholder}
          </span>
        </div>

        <i className={`fas fa-chevron-down text-[10px] text-slate-400 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-2 w-full max-h-72 overflow-auto rounded-2xl border border-slate-700/60 bg-[#070f22]/95 backdrop-blur-xl shadow-2xl">
          <div className="p-2 space-y-1">
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                disabled={!!o.disabled}
                onClick={() => {
                  if (o.disabled) return;
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-xl flex items-center gap-2 border transition ${
                  o.disabled
                    ? "opacity-40 cursor-not-allowed border-transparent"
                    : "border-slate-700/40 hover:border-blue-500/30 hover:bg-white/5"
                }`}
                title={o.disabled ? "Indisponível" : o.label}
              >
                {o.logos?.length ? (
                  <div className="flex -space-x-2">
                    {o.logos.map((abbr, i) => (
                      <img
                        key={`${abbr}-${i}`}
                        src={getLogoUrl(abbr)}
                        className="w-6 h-6 object-contain drop-shadow-md bg-slate-800 rounded-full p-0.5 border border-slate-700"
                        alt={abbr}
                        loading="lazy"
                        decoding="async"
                        onError={(e) => (e.currentTarget.style.display = "none")}
                        style={{ zIndex: 10 - i }}
                      />
                    ))}
                  </div>
                ) : null}

                <span className="text-[11px] font-black text-slate-200 truncate">{o.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------- UI pieces ----------------
const SuggestionItemRow: React.FC<{
  text: string;
  badgeColor: string;
  index: number;
  onRemove?: () => void;
}> = ({ text, badgeColor, index, onRemove }) => {
  const teamMatches = parseTeamsFromText(text);
  const cleanText = text.replace(/\(\d+%\)/g, "").trim();

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

        <span className="text-sm font-semibold text-slate-200 group-hover:text-white truncate">
          {cleanText}
        </span>
      </div>

      {onRemove && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          className="shrink-0 px-2 py-1 rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-200 text-[10px] font-black uppercase tracking-widest hover:bg-rose-500/15"
          title="Remover"
        >
          <i className="fas fa-times" />
        </button>
      )}
    </div>
  );
};

const PickCard: React.FC<{
  title: string;
  icon: string;
  gradient: string;
  description: string;
  limit: number;
  children: React.ReactNode;
}> = ({ title, icon, gradient, description, limit, children }) => (
  <div className="relative overflow-hidden bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6 shadow-xl transition-all hover:scale-[1.01] hover:shadow-blue-500/10">
    <div className={`absolute top-0 right-0 w-32 h-32 -mr-8 -mt-8 opacity-10 rounded-full blur-3xl ${gradient}`} />

    <div className="relative z-10">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${gradient} shadow-lg shadow-black/20`}>
          <i className={`fas ${icon} text-white text-xl`} />
        </div>
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">As Minhas Picks</span>
      </div>

      <h3 className="text-xl font-bold text-white mb-1">{title}</h3>
      <p className="text-xs text-slate-400 mb-6 font-medium leading-tight">
        {description} <span className="text-slate-500">(máx. {limit})</span>
      </p>

      {children}
    </div>
  </div>
);

// ---------------- Main ----------------
const MyPicksView: React.FC<Props> = ({ predictions, selectedDate }) => {
  const [picks, setPicks] = useState<Suggestions>(defaultSuggestions());

  const [teamPick, setTeamPick] = useState<string>("");
  const [gamePickOver15Triple, setGamePickOver15Triple] = useState<string>("");
  const [gamePickOver15Double, setGamePickOver15Double] = useState<string>("");
  const [gamePickOver45Quad, setGamePickOver45Quad] = useState<string>("");
  const [gamePickOver55, setGamePickOver55] = useState<string>("");
  const [gamePickDrawTR, setGamePickDrawTR] = useState<string>("");

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

  const allowedTeams = useMemo(() => {
    const set = new Set<string>();
    for (const g of predictionsOfDay as any[]) {
      const a = String((g as any).awayTeamAbbr || "").trim().toUpperCase();
      const h = String((g as any).homeTeamAbbr || "").trim().toUpperCase();
      if (a) set.add(a);
      if (h) set.add(h);
    }
    return Array.from(set).sort();
  }, [predictionsOfDay]);

  const gamesOfDay = useMemo(() => {
    const set = new Set<string>();
    for (const g of predictionsOfDay as any[]) {
      const away = String((g as any).awayTeamAbbr || "").trim().toUpperCase();
      const home = String((g as any).homeTeamAbbr || "").trim().toUpperCase();
      if (!away || !home) continue;
      const txt = normalizeGameText(`${away} VS ${home}`);
      if (txt.includes(" VS ")) set.add(txt);
    }
    return Array.from(set).sort();
  }, [predictionsOfDay]);

  // --------- options com ícones ----------
  const teamOptions: DropOption[] = useMemo(
    () =>
      [
        // placeholder já é tratado pelo IconDropdown
        ...allowedTeams.map((t) => ({
          value: t,
          label: t,
          logos: [t],
        })),
      ],
    [allowedTeams]
  );

  // 🔒 regra: triplete O1.5 e dupla O1.5 não podem partilhar jogos
  const triple15Chosen = useMemo(
    () => new Set((picks.tripleOver15P1 || []).map(normalizeGameText)),
    [picks.tripleOver15P1]
  );
  const double15Chosen = useMemo(
    () => new Set((picks.doubleOver15P1 || []).map(normalizeGameText)),
    [picks.doubleOver15P1]
  );

  const gameOptionsAll: DropOption[] = useMemo(
    () =>
      gamesOfDay.map((g) => {
        const abbrs = parseTeamsFromText(g);
        return { value: g, label: g, logos: abbrs };
      }),
    [gamesOfDay]
  );

  const gameOptionsTriple15: DropOption[] = useMemo(
    () =>
      gameOptionsAll.map((o) => ({
        ...o,
        disabled: double15Chosen.has(normalizeGameText(o.value)), // não pode usar os da dupla
      })),
    [gameOptionsAll, double15Chosen]
  );

  const gameOptionsDouble15: DropOption[] = useMemo(
    () =>
      gameOptionsAll.map((o) => ({
        ...o,
        disabled: triple15Chosen.has(normalizeGameText(o.value)), // não pode usar os da triplete
      })),
    [gameOptionsAll, triple15Chosen]
  );

  // --------- add helpers ----------
  const addTeamToTripleWin = () => {
    const t = (teamPick || "").trim().toUpperCase();
    if (!t) return;
    if (!allowedTeams.includes(t)) return;

    setPicks((prev) => {
      const cur = (prev.tripleWin || []).map(String);
      if (cur.includes(t)) return prev;
      if (cur.length >= 3) return prev;
      return { ...prev, tripleWin: [...cur, t] };
    });
    setTeamPick("");
  };

  const addGameToList = (field: keyof Suggestions, value: string, max: number) => {
    const g = normalizeGameText(value);
    if (!g.includes(" VS ")) return;
    if (!gamesOfDay.map(normalizeGameText).includes(g)) return;

    // 🔒 bloqueio cruzado Triplete O1.5 <-> Dupla O1.5
    if (field === "tripleOver15P1" && double15Chosen.has(g)) return;
    if (field === "doubleOver15P1" && triple15Chosen.has(g)) return;

    setPicks((prev) => {
      const cur = ((prev as any)[field] || []) as any[];

      if (field === "drawSuggestions") {
        const curObj = cur as DrawItem[];
        const exists = curObj.some((x) => normalizeGameText(x?.game ?? "") === g);
        if (exists) return prev;
        if (curObj.length >= max) return prev;
        return { ...prev, drawSuggestions: [...curObj, { game: g }] as any };
      }

      const curStr = cur.map((x) => String(x));
      const exists = curStr.map(normalizeGameText).includes(g);
      if (exists) return prev;
      if (curStr.length >= max) return prev;
      return { ...prev, [field]: [...curStr, g] } as any;
    });
  };

  const removeFromStringList = (field: keyof Suggestions, idx: number) => {
    setPicks((prev) => {
      const cur = (((prev as any)[field] || []) as any[]).map((x) => String(x));
      const next = cur.filter((_, i) => i !== idx);
      return { ...prev, [field]: next } as any;
    });
  };

  const removeFromDrawList = (idx: number) => {
    setPicks((prev) => {
      const cur = ((prev.drawSuggestions || []) as any[]).map((x) => x);
      const next = cur.filter((_, i) => i !== idx);
      return { ...prev, drawSuggestions: next as any };
    });
  };

  const savePicks = async () => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey(selectedDate), JSON.stringify(picks));
      }
    } catch {
      // ignore
    }

    try {
      const res = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: selectedDate,
          mine: {
            savedAt: Date.now(),
            suggestions: picks,
          },
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
          <i className="fas fa-user-check text-4xl text-blue-400" />
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-black text-white italic">
            PICKS <span className="text-blue-500">PERSONALIZADAS</span>
          </h2>
          <p className="text-slate-400 text-sm max-w-2xl">
            Igual às “Dicas” — mas aqui és tu que escolhes os jogos do dia. Só podes selecionar equipas/jogos que existem nesta data.
          </p>
        </div>

        <button
          onClick={savePicks}
          disabled={isEmptyPicks(picks)}
          className={`px-4 py-2 rounded-lg border text-[10px] font-black uppercase tracking-widest transition ${
            isEmptyPicks(picks)
              ? "bg-white/5 border-white/10 text-slate-500 cursor-not-allowed"
              : "bg-amber-500/20 border-amber-500/30 text-amber-200 hover:bg-amber-500/25"
          }`}
        >
          Guardar Picks
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Triplete Win */}
        <PickCard
          title="Triplete de Vitórias"
          icon="fa-award"
          gradient="bg-gradient-to-br from-amber-500 to-orange-600"
          description="Escolhe 3 equipas do dia para vencer (incl. OT)."
          limit={3}
        >
          <div className="flex gap-2 mb-5">
            <IconDropdown
              value={teamPick}
              onChange={setTeamPick}
              options={teamOptions}
              placeholder="Seleciona equipa…"
            />

            <button
              onClick={addTeamToTripleWin}
              disabled={!teamPick || (picks.tripleWin || []).length >= 3}
              className={`px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest ${
                !teamPick || (picks.tripleWin || []).length >= 3
                  ? "bg-white/5 border-white/10 text-slate-500 cursor-not-allowed"
                  : "bg-white/5 border-white/10 text-slate-200 hover:bg-white/10"
              }`}
            >
              Adicionar
            </button>
          </div>

          <div className="space-y-3">
            {(picks.tripleWin || []).length ? (
              (picks.tripleWin || []).map((t, idx) => (
                <div
                  key={`${t}-${idx}`}
                  className="flex items-center gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-700/50"
                >
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold bg-amber-500 text-white shrink-0">
                    {idx + 1}
                  </div>

                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <img
                      src={getLogoUrl(String(t))}
                      className="w-6 h-6 object-contain drop-shadow-md bg-slate-800 rounded-full p-0.5 border border-slate-700"
                      alt={String(t)}
                      loading="lazy"
                      decoding="async"
                      onError={(e) => (e.currentTarget.style.display = "none")}
                    />
                    <span className="text-sm font-semibold text-slate-200 truncate">{String(t)}</span>
                  </div>

                  <button
                    onClick={() => removeFromStringList("tripleWin", idx)}
                    className="shrink-0 px-2 py-1 rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-200 text-[10px] font-black uppercase tracking-widest hover:bg-rose-500/15"
                    title="Remover"
                  >
                    <i className="fas fa-times" />
                  </button>
                </div>
              ))
            ) : (
              <p className="text-slate-500 italic text-sm py-2">Sem seleções ainda — adiciona acima.</p>
            )}
          </div>
        </PickCard>

        {/* Triplete Over 1.5 P1 */}
        <PickCard
          title="Triplete Over 1.5 P1"
          icon="fa-fire-alt"
          gradient="bg-gradient-to-br from-red-500 to-rose-700"
          description="Escolhe 3 jogos do dia para pelo menos 2 golos no 1º período."
          limit={3}
        >
          <div className="flex gap-2 mb-5">
            <IconDropdown
              value={gamePickOver15Triple}
              onChange={setGamePickOver15Triple}
              options={gameOptionsTriple15}
              placeholder="Seleciona jogo…"
            />

            <button
              onClick={() => {
                addGameToList("tripleOver15P1", gamePickOver15Triple, 3);
                setGamePickOver15Triple("");
              }}
              disabled={!gamePickOver15Triple || (picks.tripleOver15P1 || []).length >= 3}
              className={`px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest ${
                !gamePickOver15Triple || (picks.tripleOver15P1 || []).length >= 3
                  ? "bg-white/5 border-white/10 text-slate-500 cursor-not-allowed"
                  : "bg-white/5 border-white/10 text-slate-200 hover:bg-white/10"
              }`}
            >
              Adicionar
            </button>
          </div>

          <div className="space-y-3">
            {(picks.tripleOver15P1 || []).length ? (
              (picks.tripleOver15P1 || []).map((item, idx) => (
                <SuggestionItemRow
                  key={`tr15-${idx}`}
                  text={String(item)}
                  badgeColor="bg-red-500"
                  index={idx}
                  onRemove={() => removeFromStringList("tripleOver15P1", idx)}
                />
              ))
            ) : (
              <p className="text-slate-500 italic text-sm py-2">Sem seleções ainda — adiciona acima.</p>
            )}
          </div>
        </PickCard>

        {/* Dupla Over 1.5 P1 */}
        <PickCard
          title="Dupla Over 1.5 P1"
          icon="fa-bolt"
          gradient="bg-gradient-to-br from-blue-500 to-indigo-700"
          description="Escolhe 2 jogos do dia para golos rápidos."
          limit={2}
        >
          <div className="flex gap-2 mb-5">
            <IconDropdown
              value={gamePickOver15Double}
              onChange={setGamePickOver15Double}
              options={gameOptionsDouble15}
              placeholder="Seleciona jogo…"
            />

            <button
              onClick={() => {
                addGameToList("doubleOver15P1", gamePickOver15Double, 2);
                setGamePickOver15Double("");
              }}
              disabled={!gamePickOver15Double || (picks.doubleOver15P1 || []).length >= 2}
              className={`px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest ${
                !gamePickOver15Double || (picks.doubleOver15P1 || []).length >= 2
                  ? "bg-white/5 border-white/10 text-slate-500 cursor-not-allowed"
                  : "bg-white/5 border-white/10 text-slate-200 hover:bg-white/10"
              }`}
            >
              Adicionar
            </button>
          </div>

          <div className="space-y-3">
            {(picks.doubleOver15P1 || []).length ? (
              (picks.doubleOver15P1 || []).map((item, idx) => (
                <SuggestionItemRow
                  key={`du15-${idx}`}
                  text={String(item)}
                  badgeColor="bg-blue-500"
                  index={idx}
                  onRemove={() => removeFromStringList("doubleOver15P1", idx)}
                />
              ))
            ) : (
              <p className="text-slate-500 italic text-sm py-2">Sem seleções ainda — adiciona acima.</p>
            )}
          </div>
        </PickCard>

        {/* Quadriplete O4.5 */}
        <PickCard
          title="Quadriplete O4.5"
          icon="fa-hockey-puck"
          gradient="bg-gradient-to-br from-emerald-500 to-teal-700"
          description="Escolhe 4 jogos do dia com tendência ofensiva (5+ golos)."
          limit={4}
        >
          <div className="flex gap-2 mb-5">
            <IconDropdown
              value={gamePickOver45Quad}
              onChange={setGamePickOver45Quad}
              options={gameOptionsAll}
              placeholder="Seleciona jogo…"
            />

            <button
              onClick={() => {
                addGameToList("quadrupleOver45", gamePickOver45Quad, 4);
                setGamePickOver45Quad("");
              }}
              disabled={!gamePickOver45Quad || (picks.quadrupleOver45 || []).length >= 4}
              className={`px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest ${
                !gamePickOver45Quad || (picks.quadrupleOver45 || []).length >= 4
                  ? "bg-white/5 border-white/10 text-slate-500 cursor-not-allowed"
                  : "bg-white/5 border-white/10 text-slate-200 hover:bg-white/10"
              }`}
            >
              Adicionar
            </button>
          </div>

          <div className="space-y-3">
            {(picks.quadrupleOver45 || []).length ? (
              (picks.quadrupleOver45 || []).map((item, idx) => (
                <SuggestionItemRow
                  key={`qo45-${idx}`}
                  text={`Over 4.5: ${String(item)}`}
                  badgeColor="bg-emerald-500"
                  index={idx}
                  onRemove={() => removeFromStringList("quadrupleOver45", idx)}
                />
              ))
            ) : (
              <p className="text-slate-500 italic text-sm py-2">Sem seleções ainda — adiciona acima.</p>
            )}
          </div>
        </PickCard>

        {/* Draw TR */}
        <div className="md:col-span-2 bg-slate-800/40 border border-slate-700 rounded-2xl p-6 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
          <div className="flex items-center justify-between gap-3 mb-6">
            <h3 className="text-xl font-bold flex items-center text-indigo-400">
              <i className="fas fa-handshake mr-3 text-2xl" />
              Master Insight: Empate (TR)
            </h3>

            <div className="flex gap-2 w-full max-w-[520px]">
              <IconDropdown
                value={gamePickDrawTR}
                onChange={setGamePickDrawTR}
                options={gameOptionsAll}
                placeholder="Seleciona jogo…"
              />

              <button
                onClick={() => {
                  addGameToList("drawSuggestions", gamePickDrawTR, 4);
                  setGamePickDrawTR("");
                }}
                disabled={!gamePickDrawTR || (picks.drawSuggestions || []).length >= 4}
                className={`px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest ${
                  !gamePickDrawTR || (picks.drawSuggestions || []).length >= 4
                    ? "bg-white/5 border-white/10 text-slate-500 cursor-not-allowed"
                    : "bg-indigo-500/15 border-indigo-500/30 text-indigo-200 hover:bg-indigo-500/20"
                }`}
              >
                Adicionar
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {(picks.drawSuggestions || []).length ? (
              (picks.drawSuggestions as any[]).map((s, idx) => {
                const game = String((s as any)?.game ?? s);
                const teamMatches = parseTeamsFromText(game);
                const cleanGameText = game.replace(/\(\d+%\)/g, "").trim();

                return (
                  <div key={`draw-${idx}`} className="bg-slate-900/80 p-5 rounded-2xl border border-slate-700/50 hover:bg-slate-900 transition-all">
                    <div className="flex items-center justify-between mb-3">
                      <span className="bg-indigo-500/20 text-indigo-300 text-[10px] font-black px-2 py-0.5 rounded border border-indigo-500/30 uppercase tracking-widest">
                        Draw Candidate
                      </span>

                      <button
                        onClick={() => removeFromDrawList(idx)}
                        className="px-2 py-1 rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-200 text-[10px] font-black uppercase tracking-widest hover:bg-rose-500/15"
                        title="Remover"
                      >
                        <i className="fas fa-times" />
                      </button>
                    </div>

                    <div className="flex items-center gap-3">
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

                    <div className="flex gap-3 mt-3">
                      <i className="fas fa-quote-left text-indigo-500/30 text-2xl mt-1" />
                      <p className="text-sm text-slate-500 leading-relaxed italic">
                        (opcional) Podes depois adicionar uma explicação se quiseres.
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="col-span-2 text-center py-6 text-slate-500">Sem seleções ainda — adiciona acima.</div>
            )}
          </div>
        </div>

        {/* Over 5.5 */}
        <div className="bg-slate-800/40 border border-slate-700 rounded-2xl p-6 flex flex-col relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 -mr-8 -mt-8 opacity-10 rounded-full blur-3xl bg-gradient-to-br from-pink-500 to-fuchsia-700" />

          <div className="relative z-10">
            <h3 className="text-lg font-bold flex items-center mb-4 text-pink-400">
              <i className="fas fa-plus-circle mr-3" />
              Over 5.5 Plus
            </h3>

            <div className="flex gap-2 mb-4">
              <IconDropdown
                value={gamePickOver55}
                onChange={setGamePickOver55}
                options={gameOptionsAll}
                placeholder="Seleciona jogo…"
              />

              <button
                onClick={() => {
                  addGameToList("over55Suggestions", gamePickOver55, 6);
                  setGamePickOver55("");
                }}
                disabled={!gamePickOver55 || (picks.over55Suggestions || []).length >= 6}
                className={`px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest ${
                  !gamePickOver55 || (picks.over55Suggestions || []).length >= 6
                    ? "bg-white/5 border-white/10 text-slate-500 cursor-not-allowed"
                    : "bg-pink-500/15 border-pink-500/25 text-pink-200 hover:bg-pink-500/20"
                }`}
              >
                Adicionar
              </button>
            </div>

            <div className="flex flex-wrap gap-2 mt-auto">
              {(picks.over55Suggestions || []).map((item, idx) => {
                const teamMatches = parseTeamsFromText(String(item));
                const cleanItemText = String(item).replace(/\(\d+%\)/g, "").trim();

                return (
                  <div
                    key={`o55tag-${idx}`}
                    className="bg-pink-500/5 hover:bg-pink-500/10 text-pink-200 px-3 py-2 rounded-xl text-[11px] font-bold border border-pink-500/20 transition-all flex items-center gap-2"
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

                    <span className="truncate">{cleanItemText}</span>

                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        removeFromStringList("over55Suggestions", idx);
                      }}
                      className="ml-1 text-[10px] font-black opacity-80 hover:opacity-100"
                      title="Remover"
                    >
                      <i className="fas fa-times" />
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
    </div>
  );
};

export default MyPicksView;
