Perfeito! Vou criar o ficheiro completo do componente MyPicksView.tsx, já com todas as tuas funcionalidades e a alteração na função savePicks para enviar corretamente para /api/history e guardar no localStorage.

Aqui está o ficheiro pronto para copiares/colares:

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

const normalizeGameText = (s: string) =>
  (s || "")
    .trim()
    .toUpperCase()
    .replace(/\s+VS\s+/g, " VS ")
    .replace(/\s+@\s+/g, " VS ")
    .replace(/\s+V\s+/g, " VS ")
    .replace(/\s+/g, " ")
    .replace(" vs ", " VS ");

const parseTeamsFromText = (text: string): string[] => {
  const raw = (text || "").trim();
  const abbrMatches = raw.match(/\b[A-Z]{2,4}\b/g) || [];
  const cleaned = abbrMatches
    .map((s) => s.toUpperCase())
    .filter((s) => s !== "OT" && s !== "VS" && s !== "V");
  if (cleaned.length >= 2) return cleaned.slice(0, 2);
  if (cleaned.length === 1) return cleaned;
  return [];
};

const isEmptyPicks = (p: Suggestions) =>
  p.tripleWin.length === 0 &&
  p.tripleOver15P1.length === 0 &&
  p.doubleOver15P1.length === 0 &&
  p.quadrupleOver45.length === 0 &&
  p.over55Suggestions.length === 0 &&
  p.drawSuggestions.length === 0;

const SuggestionItem: React.FC<{
  text: string;
  badgeColor: string;
  index: number;
  onRemove?: () => void;
  disabled?: boolean;
}> = ({ text, badgeColor, index, onRemove, disabled }) => {
  const teams = parseTeamsFromText(text);

  return (
    <div
      className={`flex items-center gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-700/50 group transition-colors ${
        disabled ? "opacity-70" : "hover:border-blue-500/30"
      }`}
    >
      <div
        className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${badgeColor} text-white shrink-0 shadow-sm`}
      >
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

        <span className="text-sm font-semibold text-slate-200 truncate">{text}</span>
      </div>

      {onRemove && (
        <button
          onClick={onRemove}
          disabled={disabled}
          className={`text-[10px] font-black uppercase tracking-widest transition ${
            disabled ? "text-slate-600 cursor-not-allowed" : "text-slate-500 hover:text-rose-400"
          }`}
          title={disabled ? "Ativa Editar para alterar" : "Remover"}
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

// --------------------------------------------------
// PrettyDropdown (Portal + fixed)
// --------------------------------------------------
type MenuPos = { left: number; top: number; width: number };

const PrettyDropdown: React.FC<{
  value: string;
  onChange: (v: string) => void;
  onSelect?: (v: string) => void;
  options: string[];
  placeholder: string;
  disabled?: boolean;
  mode?: "team" | "game";
}> = ({ value, onChange, onSelect, options, placeholder, disabled, mode = "game" }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pos, setPos] = useState<MenuPos | null>(null);

  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const computePos = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const top = Math.min(window.innerHeight - 8, r.bottom + 8);
    const left = Math.max(8, r.left);
    const width = Math.max(180, r.width);
    setPos({ left, top, width });
  };

  useEffect(() => {
    if (!open) return;
    computePos();
    const onScroll = () => computePos();
    const onResize = () => computePos();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;

    const onDocPointerDown = (e: PointerEvent) => {
      const btn = btnRef.current;
      const menu = menuRef.current;

      const target = e.target as Node | null;
      if (!target) return;

      if (btn && btn.contains(target)) return;
      if (menu && menu.contains(target)) return;

      setOpen(false);
    };

    document.addEventListener("pointerdown", onDocPointerDown, { capture: true });
    return () => document.removeEventListener("pointerdown", onDocPointerDown, { capture: true } as any);
  }, [open]);

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const filtered = useMemo(() => {
    const needle = q.trim().toUpperCase();
    if (!needle) return options;
    return options.filter((o) => o.toUpperCase().includes(needle));
  }, [options, q]);

  const selectedLabel = value || "";
  const teams = mode === "game" ? parseTeamsFromText(selectedLabel) : value ? [value] : [];

  const menu =
    open && !disabled && pos
      ? createPortal(
          <div
            ref={menuRef}
            className="z-[9999] rounded-2xl border border-slate-700/60 bg-[#050b1a]/95 backdrop-blur-xl shadow-2xl overflow-hidden"
            style={{ position: "fixed", left: pos.left, top: pos.top, width: pos.width }}
          >
            <div className="p-2 border-b border-white/5">
              <div className="flex items-center gap-2 bg-slate-900/50 border border-slate-700/50 rounded-xl px-3 py-2">
                <i className="fas fa-search text-slate-500 text-[11px]" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Pesquisar..."
                  className="w-full bg-transparent outline-none text-[11px] font-bold text-slate-200 placeholder:text-slate-600"
                  autoFocus
                />
              </div>
            </div>

            <div className="max-h-64 overflow-auto p-2">
              {filtered.length === 0 ? (
                <div className="py-6 text-center text-[11px] text-slate-600 font-black uppercase tracking-widest">
                  Sem resultados
                </div>
              ) : (
                <div className="space-y-1">
                  {filtered.map((opt) => {
                    const optTeams = mode === "game" ? parseTeamsFromText(opt) : [opt];
                    return (
                      <button
                        type="button"
                        key={opt}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();

                          onChange(opt);
                          onSelect?.(opt);
                          setOpen(false);
                        }}
                        className="w-full text-left flex items-center justify-between gap-3 px-3 py-2 rounded-xl border transition bg-white/0 border-white/0 hover:bg-white/5 hover:border-white/10"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex -space-x-2">
                            {optTeams.map((abbr, i) => (
                              <img
                                key={`${abbr}-${i}`}
                                src={getLogoUrl(abbr)}
                                className="w-6 h-6 object-contain bg-slate-800 rounded-full p-0.5 border border-slate-700"
                                alt={abbr}
                                loading="lazy"
                                decoding="async"
                                onError={(ev) => ((ev.currentTarget.style.display = "none") as any)}
                                style={{ zIndex: 10 - i }}
                              />
                            ))}
                          </div>
                          <span className="text-[11px] font-black text-slate-100 truncate">{opt}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((s) => !s);
        }}
        className={`w-full flex items-center justify-between gap-2 bg-slate-900/60 border border-slate-700/50 rounded-xl px-3 py-2 text-[11px] font-black text-slate-200 outline-none transition ${
          disabled ? "opacity-60 cursor-not-allowed" : "hover:border-blue-500/30"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {mode === "game" && teams.length > 0 && (
            <div className="flex -space-x-2">
              {teams.map((abbr, i) => (
                <img
                  key={`${abbr}-${i}`}
                  src={getLogoUrl(abbr)}
                  className="w-5 h-5 object-contain bg-slate-800 rounded-full p-0.5 border border-slate-700"
                  alt={abbr}
                  loading="lazy"
                  decoding="async"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                  style={{ zIndex: 10 - i }}
                />
              ))}
            </div>
          )}

          {mode === "team" && value && (
            <img
              src={getLogoUrl(value)}
              className="w-5 h-5 object-contain bg-slate-800 rounded-full p-0.5 border border-slate-700"
              alt={value}
              loading="lazy"
              decoding="async"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
          )}

          <span className={`truncate ${selectedLabel ? "text-slate-100" : "text-slate-500"}`}>
            {selectedLabel || placeholder}
          </span>
        </div>

        <i className={`fas ${open ? "fa-chevron-up" : "fa-chevron-down"} text-slate-500`} />
      </button>

      {menu}
    </>
  );
};

// --------------------------------------------------
// COMPONENTE PRINCIPAL
// --------------------------------------------------
const MyPicksView: React.FC<Props> = ({ predictions, selectedDate }) => {
  const [picks, setPicks] = useState<Suggestions>(defaultSuggestions());
  const [isEditing, setIsEditing] = useState<boolean>(true);
  const [saveState, setSaveState] = useState<"idle" | "saved">("idle");

  const [teamPick, setTeamPick] = useState<string>("");
  const [gamePickOver15Triple, setGamePickOver15Triple] = useState<string>("");
  const [gamePickOver15Double, setGamePickOver15Double] = useState<string>("");
  const [gamePickOver45Quad, setGamePickOver45Quad] = useState<string>("");
  const [gamePickOver55, setGamePickOver55] = useState<string>("");
  const [drawPick, setDrawPick] = useState<string>("");
  const [drawNote, setDrawNote] = useState<string>("");

  const predictionsOfDay = useMemo(() => predictions || [], [predictions]);

  const teams = useMemo(() => {
    const set = new Set<string>();
    for (const g of predictionsOfDay as any[]) {
      if ((g as any).homeTeamAbbr) set.add(String((g as any).homeTeamAbbr).toUpperCase());
      if ((g as any).awayTeamAbbr) set.add(String((g as any).awayTeamAbbr).toUpperCase());
    }
    return Array.from(set).sort();
  }, [predictionsOfDay]);

  const gamesOfDay = useMemo(() => {
    const set = new Set<string>();
    for (const g of predictionsOfDay as any[]) {
      const away = String((g as any).awayTeamAbbr || "").trim().toUpperCase();
      const home = String((g as any).homeTeamAbbr || "").trim().toUpperCase();
      if (!away || !home) continue;
      const txt = normalizeGameText(`${away} vs ${home}`);
      if (txt.includes(" VS ")) set.add(txt);
    }
    return Array.from(set).sort();
  }, [predictionsOfDay]);

  const availableTeams = useMemo(() => {
    const chosen = new Set(picks.tripleWin.map((t) => (t || "").trim().toUpperCase()));
    return teams.filter((t) => !chosen.has(t));
  }, [teams, picks.tripleWin]);

  const availableOver15Shared = useMemo(() => {
    const chosen = new Set([...picks.tripleOver15P1, ...picks.doubleOver15P1].map(normalizeGameText));
    return gamesOfDay.filter((g) => !chosen.has(normalizeGameText(g)));
  }, [gamesOfDay, picks.tripleOver15P1, picks.doubleOver15P1]);

  const availableQuadOver45 = useMemo(() => {
    const chosen = new Set(picks.quadrupleOver45.map(normalizeGameText));
    return gamesOfDay.filter((g) => !chosen.has(normalizeGameText(g)));
  }, [gamesOfDay, picks.quadrupleOver45