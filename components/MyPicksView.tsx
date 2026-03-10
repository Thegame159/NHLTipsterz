import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GamePrediction, Suggestions } from "../types";

type ComboPick = {
  game: string
  type: "WIN" | "1X" | "X2"
}
interface Props {
  predictions: GamePrediction[];
  selectedDate: string;
}

const defaultSuggestions = (): Suggestions => ({
  tripleWin: [],
  tripleOver15P1: [],
  doubleOver15P1: [],
  drawSuggestions: [],
  quadrupleOver45: [],
  over55Suggestions: [],
  combinadaFlex: [],
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

const normalizeGameText = (s: string) => {
  let str = (s || "")
    .trim()
    .toUpperCase()
    .replace(/\(\s*\d+(\.\d+)?%\s*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // 🔄 inverter formato americano AWAY @ HOME
  if (str.includes(" @ ")) {
    const [away, home] = str.split(" @ ").map((t) => t.trim());
    str = `${home} VS ${away}`;
  }

  // normalizar VS
  str = str.replace(/\s+VS\s+/g, " VS ");
  str = str.replace(/\s+V\s+/g, " VS ");

  return str;
};

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

/* -------------------- PORTAL DROPDOWN -------------------- */

type Option = { value: string; label: string; teams?: string[] };
type CombinadaPick = {
  game: string;
  pick: "HOME" | "AWAY" | "1X" | "X2";
};

const PortalMenu: React.FC<{
  open: boolean;
  anchorEl: HTMLElement | null;
  width?: number;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ open, anchorEl, onClose, children }) => {
  const [pos, setPos] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 280,
  });
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || !anchorEl) return;

    const calc = () => {
      const r = anchorEl.getBoundingClientRect();
      setPos({
        top: r.bottom + 8,
        left: r.left,
        width: Math.max(220, r.width),
      });
    };

    calc();
    window.addEventListener("scroll", calc, true);
    window.addEventListener("resize", calc);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current && menuRef.current.contains(t)) return;
      if (anchorEl && anchorEl.contains(t)) return;
      onClose();
    };
    window.addEventListener("mousedown", onDown);

    return () => {
      window.removeEventListener("scroll", calc, true);
      window.removeEventListener("resize", calc);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open, anchorEl, onClose]);

  if (!open || !anchorEl) return null;

  return createPortal(
    <div
      ref={menuRef}
      style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 999999 }}
      className="max-h-80 overflow-auto rounded-xl border border-white/10 bg-slate-950/95 backdrop-blur-xl shadow-2xl"
    >
      {children}
    </div>,
    document.body
  );
};

const IconDropdown: React.FC<{
  placeholder: string;
  options: Option[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}> = ({ placeholder, options, value, onChange, disabled }) => {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  const selected = options.find((o) => o.value === value) || null;
  const selectedTeams = useMemo(() => {
    if (!selected) return [];
    const teams = selected.teams?.length ? selected.teams : parseTeamsFromText(selected.label);
    return (teams || []).slice(0, 2);
  }, [selected]);

  return (
    <div className="flex-1">
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((s) => !s)}
        className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg border text-[11px] font-black ${
          disabled
            ? "bg-white/5 border-white/10 text-slate-600 cursor-not-allowed"
            : "bg-slate-900/40 border-white/10 text-slate-200 hover:bg-slate-900/60"
        }`}
      >
        {/* ✅ AQUI: mostrar ícone(s) + label quando selecionado */}
        <span className="min-w-0 flex items-center gap-2 truncate">
          {selected ? (
            <>
              {selectedTeams.length > 0 ? (
                <span className="flex -space-x-2 shrink-0">
                  {selectedTeams.map((abbr, i) => (
                    <img
                      key={`sel-${selected.value}-${abbr}-${i}`}
                      src={getLogoUrl(abbr)}
                      className="w-5 h-5 object-contain bg-slate-900 rounded-full p-0.5 border border-slate-700"
                      alt={abbr}
                      loading="lazy"
                      decoding="async"
                      onError={(e) => (e.currentTarget.style.display = "none")}
                      style={{ zIndex: 10 - i }}
                    />
                  ))}
                </span>
              ) : (
                <span className="w-5 h-5 rounded-full bg-white/5 border border-white/10 shrink-0" />
              )}

              <span className="truncate">{selected.label}</span>
            </>
          ) : (
            <span className="text-slate-400 truncate">{placeholder}</span>
          )}
        </span>

        <i className={`fas ${open ? "fa-chevron-up" : "fa-chevron-down"} text-slate-500`} />
      </button>

      <PortalMenu open={open} anchorEl={btnRef.current} onClose={() => setOpen(false)}>
        <div className="p-2 space-y-1">
          {options.length === 0 && (
            <div className="px-3 py-2 text-[11px] text-slate-500">Sem opções.</div>
          )}

          {options.map((o) => {
            const teams = o.teams?.length ? o.teams : parseTeamsFromText(o.label);
            return (
              <button
                type="button"
                key={o.value}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 border border-transparent hover:border-white/10 text-left"
              >
                {teams.length > 0 ? (
                  <div className="flex -space-x-2">
                    {teams.slice(0, 2).map((abbr, i) => (
                      <img
                        key={`${o.value}-${abbr}-${i}`}
                        src={getLogoUrl(abbr)}
                        className="w-6 h-6 object-contain bg-slate-900 rounded-full p-0.5 border border-slate-700"
                        alt={abbr}
                        loading="lazy"
                        decoding="async"
                        onError={(e) => (e.currentTarget.style.display = "none")}
                        style={{ zIndex: 10 - i }}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="w-6 h-6 rounded-full bg-white/5 border border-white/10" />
                )}

                <div className="min-w-0">
                  <div className="text-[11px] font-black text-slate-200 truncate">{o.label}</div>
                </div>
              </button>
            );
          })}
        </div>
      </PortalMenu>
    </div>
  );
};

/* -------------------- UI (igual às Dicas) -------------------- */

const PickLine: React.FC<{
  text: string;
  badgeColor: string;
  index: number;
  onRemove?: () => void;
}> = ({ text, badgeColor, index, onRemove }) => {
  const teams = parseTeamsFromText(text);
  return (
    <div className="flex items-center gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-700/50 group hover:border-blue-500/30 transition-colors">
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
        <span className="text-sm font-semibold text-slate-200 group-hover:text-white truncate">{text}</span>
      </div>

      {onRemove && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          className="px-2 py-1 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-[10px] font-black text-slate-300"
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
  badgeColor: string;
  description: string;
  max: number;
  options: Option[];
  selectedItems: string[];
  placeholder: string;
  onAdd: (v: string) => void;
  onRemove: (idx: number) => void;
  disabledAdd?: boolean;
}> = ({
  title,
  icon,
  gradient,
  badgeColor,
  description,
  max,
  options,
  selectedItems,
  placeholder,
  onAdd,
  onRemove,
  disabledAdd,
}) => {
  const [sel, setSel] = useState("");

  useEffect(() => setSel(""), [options.length]);

  return (
    <div className="relative overflow-visible bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6 shadow-xl transition-all hover:scale-[1.01] hover:shadow-blue-500/10">
      <div className={`absolute top-0 right-0 w-32 h-32 -mr-8 -mt-8 opacity-10 rounded-full blur-3xl ${gradient}`} />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${gradient} shadow-lg shadow-black/20`}>
            <i className={`fas ${icon} text-white text-xl`} />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">As minhas picks</span>
        </div>

        <h3 className="text-xl font-bold text-white mb-1">{title}</h3>
        <p className="text-xs text-slate-400 mb-5 font-medium leading-tight">
          {description} <span className="text-slate-500">(máx. {max})</span>
        </p>

        <div className="flex items-center gap-2 mb-5">
          <IconDropdown
            placeholder={placeholder}
            options={options}
            value={sel}
            onChange={(v) => setSel(v)}
            disabled={options.length === 0}
          />
          <button
            type="button"
            disabled={!sel || disabledAdd || selectedItems.length >= max}
            onClick={() => {
              if (!sel) return;
              onAdd(sel);
              setSel("");
            }}
            className={`px-3 py-2 rounded-lg border text-[10px] font-black uppercase tracking-widest transition ${
              !sel || disabledAdd || selectedItems.length >= max
                ? "bg-white/5 border-white/10 text-slate-600 cursor-not-allowed"
                : "bg-white/5 border-white/10 text-slate-200 hover:bg-white/10"
            }`}
          >
            Adicionar
          </button>
        </div>

        <div className="space-y-3">
          {selectedItems.length > 0 ? (
            selectedItems.map((t, idx) => (
              <PickLine
                key={`${title}-${idx}-${t}`}
                text={t}
                badgeColor={badgeColor}
                index={idx}
                onRemove={() => onRemove(idx)}
              />
            ))
          ) : (
            <p className="text-slate-500 italic text-sm py-3">Sem seleções ainda — adiciona acima.</p>
          )}
        </div>
      </div>
    </div>
  );
};

/* -------------------- MAIN -------------------- */

const MyPicksView: React.FC<Props> = ({ predictions, selectedDate }) => {
  const [picks, setPicks] = useState<Suggestions>(defaultSuggestions());

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
      const away = String((g as any).awayTeamAbbr || "").trim().toUpperCase();
      const home = String((g as any).homeTeamAbbr || "").trim().toUpperCase();
      if (away) set.add(away);
      if (home) set.add(home);
    }
    return Array.from(set).sort();
  }, [predictionsOfDay]);

  const gamesOfDay = useMemo(() => {
    const set = new Set<string>();
    for (const g of predictionsOfDay as any[]) {
      const away = String((g as any).awayTeamAbbr || "").trim().toUpperCase();
      const home = String((g as any).homeTeamAbbr || "").trim().toUpperCase();
      if (!away || !home) continue;
      const txt = normalizeGameText(`${away} @ ${home}`);
      if (txt.includes(" VS ")) set.add(txt);
    }
    return Array.from(set).sort();
  }, [predictionsOfDay]);

  const teamOptions: Option[] = useMemo(
    () => allowedTeams.map((abbr) => ({ value: abbr, label: abbr, teams: [abbr] })),
    [allowedTeams]
  );
const tripleWinOptions = useMemo(() => {
  const chosen = new Set(
    (picks.tripleWin || []).map(t => t.trim().toUpperCase())
  );

  return teamOptions.filter(o =>
    !chosen.has(o.value.trim().toUpperCase())
  );
}, [teamOptions, picks.tripleWin]);
  
  const gameOptionsAll: Option[] = useMemo(
    () =>
      gamesOfDay.map((g) => {
        const teams = parseTeamsFromText(g);
        return { value: g, label: g.replace(" VS ", " vs "), teams };
      }),
    [gamesOfDay]
  );
  const combinadaOptions: Option[] = useMemo(() => {
  const usedGames = new Set(
    ((picks.combinadaFlex || []) as CombinadaPick[]).map((p) => p.game)
  );

  const out: Option[] = [];

  for (const game of gamesOfDay) {
    if (usedGames.has(game)) continue;

    const teams = parseTeamsFromText(game);
    if (teams.length < 2) continue;

    const [home, away] = teams;

    out.push({
      value: `${game}|HOME`,
      label: `${home} win`,
      teams: [home, away],
    });

    out.push({
      value: `${game}|AWAY`,
      label: `${away} win`,
      teams: [home, away],
    });

    out.push({
      value: `${game}|1X`,
      label: `1X (${home} ou empate)`,
      teams: [home, away],
    });

    out.push({
      value: `${game}|X2`,
      label: `X2 (${away} ou empate)`,
      teams: [home, away],
    });
  }

  return out;
}, [gamesOfDay, picks.combinadaFlex]);

  const tripleOverSet = useMemo(
    () => new Set((picks.tripleOver15P1 || []).map(normalizeGameText)),
    [picks.tripleOver15P1]
  );
  const doubleOverSet = useMemo(
    () => new Set((picks.doubleOver15P1 || []).map(normalizeGameText)),
    [picks.doubleOver15P1]
  );

  const tripleOverOptions = useMemo(() => {
  const tripleSet = new Set(
    (picks.tripleOver15P1 || []).map(normalizeGameText)
  );

  return gameOptionsAll.filter((o) => {
    const normalized = normalizeGameText(o.value);
    return (
      !doubleOverSet.has(normalized) &&   // não pode estar na dupla
      !tripleSet.has(normalized)         // não pode estar na própria tripla
    );
  });
}, [gameOptionsAll, doubleOverSet, picks.tripleOver15P1]);
  const doubleOverOptions = useMemo(() => {
  const doubleSet = new Set(
    (picks.doubleOver15P1 || []).map(normalizeGameText)
  );

  return gameOptionsAll.filter((o) => {
    const normalized = normalizeGameText(o.value);
    return (
      !tripleOverSet.has(normalized) &&  // não pode estar na tripla
      !doubleSet.has(normalized)        // não pode estar na própria dupla
    );
  });
}, [gameOptionsAll, tripleOverSet, picks.doubleOver15P1]);

  const over45Options = useMemo(() => {
    const chosen = new Set((picks.quadrupleOver45 || []).map(normalizeGameText));
    return gameOptionsAll.filter((o) => !chosen.has(normalizeGameText(o.value)));
  }, [gameOptionsAll, picks.quadrupleOver45]);

  const over55Options = useMemo(() => {
    const chosen = new Set((picks.over55Suggestions || []).map(normalizeGameText));
    return gameOptionsAll.filter((o) => !chosen.has(normalizeGameText(o.value)));
  }, [gameOptionsAll, picks.over55Suggestions]);

  const drawOptions = useMemo(() => {
    const chosen = new Set((picks.drawSuggestions || []).map((d: any) => normalizeGameText(d?.game ?? String(d))));
    return gameOptionsAll.filter((o) => !chosen.has(normalizeGameText(o.value)));
  }, [gameOptionsAll, picks.drawSuggestions]);

  const addTeamToTripleWin = (abbr: string) => {
    const t = abbr.trim().toUpperCase();
    if (!allowedTeams.includes(t)) return;
    setPicks((prev) => {
      const cur = prev.tripleWin || [];
      if (cur.includes(t)) return prev;
      if (cur.length >= 3) return prev;
      return { ...prev, tripleWin: [...cur, t] };
    });
  };

  const addGameToTripleOver = (gameValue: string) => {
    const g = normalizeGameText(gameValue);
    if (!gamesOfDay.includes(g)) return;

    setPicks((prev) => {
      const cur = prev.tripleOver15P1 || [];
      if (cur.map(normalizeGameText).includes(g)) return prev;
      if (cur.length >= 3) return prev;

      const nextDouble = (prev.doubleOver15P1 || []).filter((x) => normalizeGameText(x) !== g);

      return { ...prev, tripleOver15P1: [...cur, g], doubleOver15P1: nextDouble };
    });
  };

  const addGameToDoubleOver = (gameValue: string) => {
    const g = normalizeGameText(gameValue);
    if (!gamesOfDay.includes(g)) return;

    setPicks((prev) => {
      const cur = prev.doubleOver15P1 || [];
      if (cur.map(normalizeGameText).includes(g)) return prev;
      if (cur.length >= 2) return prev;

      const nextTriple = (prev.tripleOver15P1 || []).filter((x) => normalizeGameText(x) !== g);

      return { ...prev, doubleOver15P1: [...cur, g], tripleOver15P1: nextTriple };
    });
  };

  const addGameToOver45 = (gameValue: string) => {
    const g = normalizeGameText(gameValue);
    if (!gamesOfDay.includes(g)) return;

    setPicks((prev) => {
      const cur = prev.quadrupleOver45 || [];
      if (cur.map(normalizeGameText).includes(g)) return prev;
      if (cur.length >= 4) return prev;
      return { ...prev, quadrupleOver45: [...cur, g] };
    });
  };

  const addGameToOver55 = (gameValue: string) => {
    const g = normalizeGameText(gameValue);
    if (!gamesOfDay.includes(g)) return;

    setPicks((prev) => {
      const cur = prev.over55Suggestions || [];
      if (cur.map(normalizeGameText).includes(g)) return prev;
      return { ...prev, over55Suggestions: [...cur, g] };
    });
  };

  const addGameToDrawTR = (gameValue: string) => {
    const g = normalizeGameText(gameValue);
    if (!gamesOfDay.includes(g)) return;

    setPicks((prev) => {
      const cur = prev.drawSuggestions || [];
      const exists = cur.some((x: any) => normalizeGameText(x?.game ?? String(x)) === g);
      if (exists) return prev;
      return { ...prev, drawSuggestions: [...cur, { game: g, explanation: "" }] as any };
    });
  };
const addToCombinada = (value: string) => {
  const [gameRaw, pickRaw] = value.split("|");
  const game = normalizeGameText(gameRaw);
  const pick = pickRaw as "HOME" | "AWAY" | "1X" | "X2";

  setPicks((prev) => {
    const cur = (prev.combinadaFlex || []) as CombinadaPick[];

    if (cur.find((p) => p.game === game)) return prev;
    if (cur.length >= 6) return prev;

    return {
      ...prev,
      combinadaFlex: [...cur, { game, pick }],
    };
  });
};
  const savePicks = async () => {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey(selectedDate), JSON.stringify(picks));
    }
  } catch {}

  try {
 const res = await fetch("/api/history", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
  date: selectedDate,
  side: "mine",
  suggestions: picks
})
  
});

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      console.error("SAVE /api/history failed:", res.status, data);
      alert("Falhou a guardar no servidor (ficou guardado no browser).");
      return;
    }

    alert("Picks guardadas!");

    // 🔥 ADICIONA ESTA LINHA
    window.dispatchEvent(new CustomEvent("history-updated"));

  } catch (err) {
    console.error("Failed to save picks:", err);
    alert("Falhou a guardar no servidor (ficou guardado no browser).");
  }
};

  /* 👇 COLA AQUI */
const formatCombinadaPick = (item: CombinadaPick) => {
  const teams = parseTeamsFromText(item.game);
  const [home, away] = teams;

  if (item.pick === "HOME") return `${home} win`;
  if (item.pick === "AWAY") return `${away} win`;
  if (item.pick === "1X") return `1X (${home} ou empate)`;
  return `X2 (${away} ou empate)`;
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
          <p className="text-slate-400 text-sm max-w-lg">
            Igual às “Dicas” — mas aqui és tu que escolhes os jogos do dia (apenas jogos existentes nesta data).
          </p>
        </div>

        <button
          onClick={savePicks}
          disabled={isEmptyPicks(picks)}
          className={`px-4 py-2 rounded-lg border text-[11px] font-black uppercase tracking-widest ${
            isEmptyPicks(picks)
              ? "bg-white/5 border-white/10 text-slate-500 cursor-not-allowed"
              : "bg-amber-500/20 border-amber-500/30 text-amber-200 hover:bg-amber-500/25"
          }`}
          title="Guarda no servidor + backup no browser"
        >
          Guardar Picks
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <div className="col-span-full">
 <div className="col-span-full bg-slate-800/40 border border-slate-700 rounded-2xl p-6">

<div className="flex items-center justify-between mb-4">
<h3 className="text-xl font-bold text-white flex items-center gap-2">
<i className="fas fa-layer-group text-yellow-400"/>
Combinada
</h3>

<span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
As minhas picks
</span>
</div>

<p className="text-xs text-slate-400 mb-5">
Escolhe jogos com Vitória ou Dupla Chance (1X / X2). (máx. 6)
</p>

<div className="flex gap-2 mb-6 max-w-[420px]">

<IconDropdown
placeholder="Seleciona jogo..."
options={gameOptionsAll}
value=""
onChange={(v)=>addToCombinada(v)}
/>

</div>

<div className="space-y-3">

{(picks.combinadaFlex||[]).length>0 ? (

picks.combinadaFlex.map((game,idx)=>{

const teams=parseTeamsFromText(game)

return(

<div
key={idx}
className="flex items-center justify-between bg-slate-900/60 p-3 rounded-xl border border-slate-700"
>

<div className="flex items-center gap-3">

<div className="flex -space-x-2">
{teams.map((abbr,i)=>(
<img
key={i}
src={getLogoUrl(abbr)}
className="w-6 h-6 bg-slate-800 rounded-full p-0.5 border border-slate-700"
/>
))}
</div>

<span className="text-slate-200 font-semibold">
{game.replace(" VS "," vs ")}
</span>

</div>

<div className="flex gap-2">

<button className="px-3 py-1 rounded text-xs font-bold bg-green-500 text-white">
WIN
</button>

<button className="px-3 py-1 rounded text-xs font-bold bg-blue-500 text-white">
1X
</button>

<button className="px-3 py-1 rounded text-xs font-bold bg-purple-500 text-white">
X2
</button>

<button
onClick={()=>{
setPicks(prev=>({
...prev,
combinadaFlex:(prev.combinadaFlex||[]).filter((_,i)=>i!==idx)
}))
}}
className="px-2 py-1 bg-red-500/20 text-red-400 rounded"
>
✕
</button>

</div>

</div>
)

})

):(

<p className="text-slate-500 italic text-sm">
Sem seleções ainda — adiciona acima.
</p>

)}
</div>
</div>

</div>
        <PickCard
          title="Triplete de Vitórias"
          icon="fa-award"
          gradient="bg-gradient-to-br from-amber-500 to-orange-600"
          badgeColor="bg-amber-500"
          description="Escolhe 3 equipas do dia para vencer (incl. OT)."
          max={3}
          options={tripleWinOptions}
          selectedItems={picks.tripleWin}
          placeholder="Seleciona equipa..."
          onAdd={addTeamToTripleWin}
          onRemove={(idx) => setPicks((p) => ({ ...p, tripleWin: (p.tripleWin || []).filter((_, i) => i !== idx) }))}
        />

        <PickCard
          title="Triplete Over 1.5 P1"
          icon="fa-fire-alt"
          gradient="bg-gradient-to-br from-red-500 to-rose-700"
          badgeColor="bg-red-500"
          description="Escolhe 3 jogos do dia para pelo menos 2 golos no 1º período."
          max={3}
          options={tripleOverOptions}
          selectedItems={picks.tripleOver15P1}
          placeholder="Seleciona jogo..."
          onAdd={addGameToTripleOver}
          onRemove={(idx) =>
            setPicks((p) => ({ ...p, tripleOver15P1: (p.tripleOver15P1 || []).filter((_, i) => i !== idx) }))
          }
        />

        <PickCard
          title="Dupla Over 1.5 P1"
          icon="fa-bolt"
          gradient="bg-gradient-to-br from-blue-500 to-indigo-700"
          badgeColor="bg-blue-500"
          description="Escolhe 2 jogos do dia (não pode repetir os do Triplete Over 1.5 P1)."
          max={2}
          options={doubleOverOptions}
          selectedItems={picks.doubleOver15P1}
          placeholder="Seleciona jogo..."
          onAdd={addGameToDoubleOver}
          onRemove={(idx) =>
            setPicks((p) => ({ ...p, doubleOver15P1: (p.doubleOver15P1 || []).filter((_, i) => i !== idx) }))
          }
        />

        <PickCard
          title="Quadriplete O4.5"
          icon="fa-hockey-puck"
          gradient="bg-gradient-to-br from-emerald-500 to-teal-700"
          badgeColor="bg-emerald-500"
          description="Escolhe 4 jogos do dia com tendência ofensiva (5+ golos)."
          max={4}
          options={over45Options}
          selectedItems={picks.quadrupleOver45}
          placeholder="Seleciona jogo..."
          onAdd={addGameToOver45}
          onRemove={(idx) =>
            setPicks((p) => ({ ...p, quadrupleOver45: (p.quadrupleOver45 || []).filter((_, i) => i !== idx) }))
          }
        />

        <div className="md:col-span-2 bg-slate-800/40 border border-slate-700 rounded-2xl p-6 relative overflow-visible group">
          <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
          <h3 className="text-xl font-bold flex items-center mb-4 text-indigo-400">
            <i className="fas fa-handshake mr-3 text-2xl" />
            Master Insight: Empate (TR)
          </h3>

          <div className="flex items-center gap-2 mb-5 max-w-[420px]">
            <IconDropdown
              placeholder="Seleciona jogo..."
              options={drawOptions}
              value={""}
              onChange={(v) => addGameToDrawTR(v)}
              disabled={drawOptions.length === 0}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(picks.drawSuggestions || []).length ? (
              (picks.drawSuggestions as any[]).map((d, idx) => (
                <div
                  key={`draw-${idx}`}
                  className="bg-slate-900/80 p-5 rounded-2xl border border-slate-700/50 hover:bg-slate-900 transition-all"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="bg-indigo-500/20 text-indigo-300 text-[10px] font-black px-2 py-0.5 rounded border border-indigo-500/30 uppercase tracking-widest">
                      Draw Candidate
                    </span>
                    <button
                      onClick={() =>
                        setPicks((p) => ({
                          ...p,
                          drawSuggestions: (p.drawSuggestions || []).filter((_, i) => i !== idx),
                        }))
                      }
                      className="px-2 py-1 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-[10px] font-black text-slate-300"
                      title="Remover"
                    >
                      <i className="fas fa-times" />
                    </button>
                  </div>

                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex -space-x-2">
                      {parseTeamsFromText(d?.game || "").map((abbr, i) => (
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
                    <p className="font-bold text-lg text-slate-100">{String(d?.game || "")}</p>
                  </div>

                  <div className="flex gap-3">
                    <i className="fas fa-quote-left text-indigo-500/30 text-2xl mt-1" />
                    <p className="text-sm text-slate-400 leading-relaxed italic line-clamp-4">
                      {d?.explanation ? String(d.explanation) : "—"}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-2 text-center py-8 text-slate-500">Sem seleções ainda — adiciona acima.</div>
            )}
          </div>
        </div>

        <PickCard
          title="Over 5.5 Plus"
          icon="fa-plus-circle"
          gradient="bg-gradient-to-br from-pink-500 to-fuchsia-700"
          badgeColor="bg-pink-500"
          description="Jogos com elevado potencial de chuva de golos."
          max={99}
          options={over55Options}
          selectedItems={picks.over55Suggestions}
          placeholder="Seleciona jogo..."
          onAdd={addGameToOver55}
          onRemove={(idx) =>
            setPicks((p) => ({ ...p, over55Suggestions: (p.over55Suggestions || []).filter((_, i) => i !== idx) }))
          }
        />
      </div>
    </div>
      
  );
};

export default MyPicksView;
