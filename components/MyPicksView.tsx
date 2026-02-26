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

const normalizeGameText = (s: string) =>
  (s || "")
    .trim()
    .toUpperCase()
    .replace(/\(\s*\d+(\.\d+)?%\s*\)/g, "")
    .replace(/\s+VS\s+/g, " VS ")
    .replace(/\s+@\s+/g, " VS ")
    .replace(/\s+V\s+/g, " VS ")
    .replace(/\s+/g, " ");

const splitMatchup = (text: string): [string, string] | null => {
  const cleaned = normalizeGameText(text);
  if (!cleaned.includes(" VS ")) return null;
  const parts = cleaned.split(" VS ").map((x) => x.trim());
  if (parts.length < 2) return null;
  return [parts[0], parts[1]];
};

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

const isEmptyPicks = (p: Suggestions) =>
  (p.tripleWin || []).length === 0 &&
  (p.tripleOver15P1 || []).length === 0 &&
  (p.doubleOver15P1 || []).length === 0 &&
  (p.quadrupleOver45 || []).length === 0 &&
  (p.over55Suggestions || []).length === 0 &&
  (p.drawSuggestions || []).length === 0;

const CardShell: React.FC<{
  iconBg: string;
  icon: React.ReactNode;
  badge?: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}> = ({ iconBg, icon, badge = "PICK DO ESPECIALISTA", title, subtitle, children }) => (
  <div className="bg-[#020617]/70 border border-white/10 rounded-2xl p-6 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl">
    <div className="flex items-start gap-4">
      <div className={`w-12 h-12 rounded-2xl ${iconBg} border border-white/10 flex items-center justify-center`}>
        {icon}
      </div>

      <div className="flex-1">
        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{badge}</div>
        <h3 className="text-white text-lg font-black mt-2">{title}</h3>
        <p className="text-slate-400 text-xs mt-2 leading-relaxed">{subtitle}</p>
      </div>
    </div>

    <div className="mt-5 space-y-3">{children}</div>
  </div>
);

const PickRow: React.FC<{
  index: number;
  text: string;
  logos?: string[];
  onRemove?: () => void;
}> = ({ index, text, logos = [], onRemove }) => (
  <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
    <div className="flex items-center gap-3 min-w-0">
      <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-black text-white">
        {index}
      </div>

      {logos.length > 0 && (
        <div className="flex -space-x-2 shrink-0">
          {logos.slice(0, 2).map((abbr, i) => (
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
      )}

      <div className="text-white text-[12px] font-black truncate">{text}</div>
    </div>

    {onRemove && (
      <button
        onClick={onRemove}
        className="shrink-0 text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-200 hover:bg-rose-500/15"
        title="Remover"
      >
        Remover
      </button>
    )}
  </div>
);

const SelectAdd: React.FC<{
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  onAdd: () => void;
  disabledAdd?: boolean;
}> = ({ value, onChange, options, placeholder, onAdd, disabledAdd }) => (
  <div className="flex flex-col sm:flex-row gap-2">
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-[11px] font-black text-slate-200 outline-none"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>

    <button
      onClick={onAdd}
      disabled={disabledAdd}
      className={`px-4 py-3 rounded-xl border text-[10px] font-black uppercase tracking-widest ${
        disabledAdd
          ? "bg-white/5 border-white/10 text-slate-500 cursor-not-allowed"
          : "bg-orange-600/20 border-orange-600/30 text-orange-200 hover:bg-orange-600/25"
      }`}
    >
      Adicionar
    </button>
  </div>
);

const MyPicksView: React.FC<Props> = ({ predictions, selectedDate }) => {
  const [picks, setPicks] = useState<Suggestions>(defaultSuggestions());

  // inputs
  const [pickTripleWin, setPickTripleWin] = useState("");
  const [pickTripleOver15, setPickTripleOver15] = useState("");
  const [pickDoubleOver15, setPickDoubleOver15] = useState("");
  const [pickOver45, setPickOver45] = useState("");
  const [pickOver55, setPickOver55] = useState("");
  const [pickDrawTR, setPickDrawTR] = useState("");

  // load local backup on date change
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

  // helpers: prevent duplicates
  const hasTeam = (arr: string[], team: string) => arr.map((x) => String(x).toUpperCase()).includes(team.toUpperCase());
  const hasGame = (arr: string[], game: string) => arr.map(normalizeGameText).includes(normalizeGameText(game));

  // add/remove actions
  const addTripleWin = (team: string) => {
    const t = String(team || "").trim().toUpperCase();
    if (!t) return;
    setPicks((prev) => {
      const cur = (prev.tripleWin || []).map(String);
      if (cur.length >= 3) return prev;
      if (hasTeam(cur, t)) return prev;
      return { ...prev, tripleWin: [...cur, t] };
    });
  };

  const addTripleOver15 = (game: string) => {
    const g = normalizeGameText(game);
    if (!g.includes(" VS ")) return;
    setPicks((prev) => {
      const cur = (prev.tripleOver15P1 || []).map(String);
      if (cur.length >= 3) return prev;
      if (hasGame(cur, g)) return prev;
      return { ...prev, tripleOver15P1: [...cur, g] };
    });
  };

  const addDoubleOver15 = (game: string) => {
    const g = normalizeGameText(game);
    if (!g.includes(" VS ")) return;
    setPicks((prev) => {
      const cur = (prev.doubleOver15P1 || []).map(String);
      if (cur.length >= 2) return prev;
      if (hasGame(cur, g)) return prev;
      return { ...prev, doubleOver15P1: [...cur, g] };
    });
  };

  const addOver45 = (game: string) => {
    const g = normalizeGameText(game);
    if (!g.includes(" VS ")) return;
    setPicks((prev) => {
      const cur = (prev.quadrupleOver45 || []).map(String);
      if (cur.length >= 4) return prev;
      if (hasGame(cur, g)) return prev;
      return { ...prev, quadrupleOver45: [...cur, g] };
    });
  };

  const addOver55 = (game: string) => {
    const g = normalizeGameText(game);
    if (!g.includes(" VS ")) return;
    setPicks((prev) => {
      const cur = (prev.over55Suggestions || []).map(String);
      if (hasGame(cur, g)) return prev;
      return { ...prev, over55Suggestions: [...cur, g] };
    });
  };

  const addDrawTR = (game: string) => {
    const g = normalizeGameText(game);
    if (!g.includes(" VS ")) return;

    setPicks((prev) => {
      const cur = (prev.drawSuggestions || []) as any[];
      const exists = cur.some((x) => normalizeGameText(x?.game ?? String(x)) === g);
      if (exists) return prev;
      // StatsView espera { game: string, explanation?: string }
      return { ...prev, drawSuggestions: [...cur, { game: g, explanation: "" }] as any };
    });
  };

  const removeFromArray = (arr: any[], idx: number) => arr.filter((_, i) => i !== idx);

  const savePicks = async () => {
    // backup local
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey(selectedDate), JSON.stringify(picks));
      }
    } catch {
      // ignore
    }

    // save server (formato que o Stats espera)
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

  // options
  const teamOptions = useMemo(
    () => teamsOfDay.map((t) => ({ value: t, label: t })),
    [teamsOfDay]
  );

  const gameOptions = useMemo(
    () => gamesOfDay.map((g) => ({ value: g, label: g.replace(" VS ", " vs ") })),
    [gamesOfDay]
  );

  // logos for rows
  const logosFromGame = (g: string) => {
    const sp = splitMatchup(g);
    if (!sp) return [];
    const [a, b] = sp;
    const aa = String(a || "").trim().toUpperCase();
    const bb = String(b || "").trim().toUpperCase();
    return [aa, bb].filter(Boolean);
  };

  return (
    <div className="space-y-8 pb-24">
      {/* Banner como nas DICAS */}
      <div className="bg-gradient-to-r from-indigo-900/40 to-slate-900/40 border border-indigo-500/20 rounded-2xl p-6 sm:p-8 flex items-center gap-5">
        <div className="bg-indigo-600/20 p-4 rounded-2xl border border-indigo-500/30">
          <i className="fas fa-bolt text-3xl text-indigo-300" />
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-black italic text-white">
            <span className="text-indigo-300">COMBO</span> TIPSTERZ{" "}
            <span className="text-indigo-300">PREMIUM</span>
          </h2>
          <p className="text-slate-400 text-sm max-w-2xl">
            Aqui escolhes manualmente os jogos/equipas, mas com o mesmo layout das DICAS.
          </p>
        </div>

        <button
          onClick={savePicks}
          disabled={isEmptyPicks(picks)}
          className={`px-4 py-3 rounded-xl border text-[10px] font-black uppercase tracking-widest ${
            isEmptyPicks(picks)
              ? "bg-white/5 border-white/10 text-slate-500 cursor-not-allowed"
              : "bg-amber-500/20 border-amber-500/30 text-amber-200 hover:bg-amber-500/25"
          }`}
          title="Guarda no servidor (history) + backup no browser"
        >
          Guardar Picks
        </button>
      </div>

      {/* Grid igual às DICAS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Triplete Vitórias */}
        <CardShell
          iconBg="bg-orange-600/20"
          icon={<i className="fas fa-medal text-xl text-orange-300" />}
          title="Triplete de Vitórias"
          subtitle="Escolhe 3 equipas para vitória (incl. OT)."
        >
          <SelectAdd
            value={pickTripleWin}
            onChange={setPickTripleWin}
            options={teamOptions}
            placeholder="Escolhe uma equipa (ex: NJD)"
            onAdd={() => {
              addTripleWin(pickTripleWin);
              setPickTripleWin("");
            }}
            disabledAdd={!pickTripleWin || (picks.tripleWin || []).length >= 3}
          />

          {(picks.tripleWin || []).map((t, idx) => (
            <PickRow
              key={`tw-${t}-${idx}`}
              index={idx + 1}
              text={String(t)}
              logos={[String(t)]}
              onRemove={() =>
                setPicks((prev) => ({
                  ...prev,
                  tripleWin: removeFromArray(prev.tripleWin || [], idx),
                }))
              }
            />
          ))}

          <div className="text-[10px] font-black text-slate-500">
            {(picks.tripleWin || []).length}/3 selecionadas
          </div>
        </CardShell>

        {/* Triplete Over 1.5 P1 */}
        <CardShell
          iconBg="bg-rose-600/20"
          icon={<i className="fas fa-fire text-xl text-rose-300" />}
          title="Triplete Over 1.5 P1"
          subtitle="Escolhe 3 jogos com tendência para 2+ golos no 1º período."
        >
          <SelectAdd
            value={pickTripleOver15}
            onChange={setPickTripleOver15}
            options={gameOptions}
            placeholder="Escolhe um jogo (ex: ANA vs EDM)"
            onAdd={() => {
              addTripleOver15(pickTripleOver15);
              setPickTripleOver15("");
            }}
            disabledAdd={!pickTripleOver15 || (picks.tripleOver15P1 || []).length >= 3}
          />

          {(picks.tripleOver15P1 || []).map((g, idx) => (
            <PickRow
              key={`to15-${g}-${idx}`}
              index={idx + 1}
              text={String(g).replace(" VS ", " vs ")}
              logos={logosFromGame(String(g))}
              onRemove={() =>
                setPicks((prev) => ({
                  ...prev,
                  tripleOver15P1: removeFromArray(prev.tripleOver15P1 || [], idx),
                }))
              }
            />
          ))}

          <div className="text-[10px] font-black text-slate-500">
            {(picks.tripleOver15P1 || []).length}/3 selecionados
          </div>
        </CardShell>

        {/* Dupla Over 1.5 P1 */}
        <CardShell
          iconBg="bg-indigo-600/20"
          icon={<i className="fas fa-bolt text-xl text-indigo-300" />}
          title="Dupla Over 1.5 P1"
          subtitle="Escolhe 2 jogos secundários para 2+ golos no 1º período."
        >
          <SelectAdd
            value={pickDoubleOver15}
            onChange={setPickDoubleOver15}
            options={gameOptions}
            placeholder="Escolhe um jogo (ex: NJD vs BUF)"
            onAdd={() => {
              addDoubleOver15(pickDoubleOver15);
              setPickDoubleOver15("");
            }}
            disabledAdd={!pickDoubleOver15 || (picks.doubleOver15P1 || []).length >= 2}
          />

          {(picks.doubleOver15P1 || []).map((g, idx) => (
            <PickRow
              key={`do15-${g}-${idx}`}
              index={idx + 1}
              text={String(g).replace(" VS ", " vs ")}
              logos={logosFromGame(String(g))}
              onRemove={() =>
                setPicks((prev) => ({
                  ...prev,
                  doubleOver15P1: removeFromArray(prev.doubleOver15P1 || [], idx),
                }))
              }
            />
          ))}

          <div className="text-[10px] font-black text-slate-500">
            {(picks.doubleOver15P1 || []).length}/2 selecionados
          </div>
        </CardShell>
      </div>

      {/* Segunda linha (como nas DICAS) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quadriplete O4.5 */}
        <CardShell
          iconBg="bg-emerald-600/20"
          icon={<i className="fas fa-layer-group text-xl text-emerald-300" />}
          title="Quadriplete O4.5"
          subtitle="Escolhe 4 jogos com tendência ofensiva para 5+ golos."
        >
          <SelectAdd
            value={pickOver45}
            onChange={setPickOver45}
            options={gameOptions}
            placeholder="Escolhe um jogo"
            onAdd={() => {
              addOver45(pickOver45);
              setPickOver45("");
            }}
            disabledAdd={!pickOver45 || (picks.quadrupleOver45 || []).length >= 4}
          />

          {(picks.quadrupleOver45 || []).map((g, idx) => (
            <PickRow
              key={`o45-${g}-${idx}`}
              index={idx + 1}
              text={String(g).replace(" VS ", " vs ")}
              logos={logosFromGame(String(g))}
              onRemove={() =>
                setPicks((prev) => ({
                  ...prev,
                  quadrupleOver45: removeFromArray(prev.quadrupleOver45 || [], idx),
                }))
              }
            />
          ))}

          <div className="text-[10px] font-black text-slate-500">
            {(picks.quadrupleOver45 || []).length}/4 selecionados
          </div>
        </CardShell>

        {/* Over 5.5 */}
        <CardShell
          iconBg="bg-sky-600/20"
          icon={<i className="fas fa-chart-line text-xl text-sky-300" />}
          title="Over 5.5"
          subtitle="Escolhe jogos com tendência para 6+ golos."
        >
          <SelectAdd
            value={pickOver55}
            onChange={setPickOver55}
            options={gameOptions}
            placeholder="Escolhe um jogo"
            onAdd={() => {
              addOver55(pickOver55);
              setPickOver55("");
            }}
            disabledAdd={!pickOver55}
          />

          {(picks.over55Suggestions || []).map((g, idx) => (
            <PickRow
              key={`o55-${g}-${idx}`}
              index={idx + 1}
              text={String(g).replace(" VS ", " vs ")}
              logos={logosFromGame(String(g))}
              onRemove={() =>
                setPicks((prev) => ({
                  ...prev,
                  over55Suggestions: removeFromArray(prev.over55Suggestions || [], idx),
                }))
              }
            />
          ))}

          <div className="text-[10px] font-black text-slate-500">
            {(picks.over55Suggestions || []).length} selecionados
          </div>
        </CardShell>

        {/* Empate TR */}
        <CardShell
          iconBg="bg-purple-600/20"
          icon={<i className="fas fa-handshake text-xl text-purple-300" />}
          badge="MASTER INSIGHT"
          title="Sugestões de Empate (TR)"
          subtitle="Escolhe jogos para empate no tempo regulamentar."
        >
          <SelectAdd
            value={pickDrawTR}
            onChange={setPickDrawTR}
            options={gameOptions}
            placeholder="Escolhe um jogo"
            onAdd={() => {
              addDrawTR(pickDrawTR);
              setPickDrawTR("");
            }}
            disabledAdd={!pickDrawTR}
          />

          {((picks.drawSuggestions || []) as any[]).map((d, idx) => {
            const g = String(d?.game ?? "");
            return (
              <PickRow
                key={`dr-${g}-${idx}`}
                index={idx + 1}
                text={g.replace(" VS ", " vs ")}
                logos={logosFromGame(g)}
                onRemove={() =>
                  setPicks((prev) => ({
                    ...prev,
                    drawSuggestions: removeFromArray((prev.drawSuggestions || []) as any[], idx) as any,
                  }))
                }
              />
            );
          })}

          <div className="text-[10px] font-black text-slate-500">
            {(picks.drawSuggestions || []).length} selecionados
          </div>
        </CardShell>
      </div>

      {/* Estado vazio */}
      {isEmptyPicks(picks) && (
        <div className="py-10 text-center text-slate-600 text-[10px] font-black uppercase tracking-widest">
          Ainda não escolheste picks. Usa os dropdowns e clica em “Adicionar”.
        </div>
      )}
    </div>
  );
};

export default MyPicksView;
