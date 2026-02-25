import React, { useEffect, useMemo, useState } from "react";
import { GamePrediction, Suggestions } from "../types";

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

const isEmptyPicks = (p: Suggestions) =>
  p.tripleWin.length === 0 &&
  p.tripleOver15P1.length === 0 &&
  p.doubleOver15P1.length === 0 &&
  p.quadrupleOver45.length === 0 &&
  p.over55Suggestions.length === 0 &&
  p.drawSuggestions.length === 0;

const MyPicksView: React.FC<Props> = ({ predictions, selectedDate }) => {
  // ⚠️ NUNCA ler localStorage aqui (SSR). Começa sempre “vazio”.
  const [picks, setPicks] = useState<Suggestions>(defaultSuggestions());

  // carrega do localStorage no cliente quando muda a data
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

  // --- EXEMPLOS: adiciona picks (mantém simples) ---
  const addOver45 = (game: string) => {
    const g = normalizeGameText(game);
    if (!g.includes(" VS ")) return;

    setPicks((prev) => {
      const cur = prev.quadrupleOver45 || [];
      if (cur.map(normalizeGameText).includes(g)) return prev;
      return { ...prev, quadrupleOver45: [...cur, g] };
    });
  };

  const addDrawTR = (game: string) => {
    const g = normalizeGameText(game);
    if (!g.includes(" VS ")) return;

    // ✅ drawSuggestions no StatsView espera { game: string }
    setPicks((prev) => {
      const cur = prev.drawSuggestions || [];
      const exists = cur.some((x: any) => normalizeGameText(x?.game ?? String(x)) === g);
      if (exists) return prev;
      return { ...prev, drawSuggestions: [...cur, { game: g }] as any };
    });
  };

  const savePicks = async () => {
    // 1) guarda SEMPRE em localStorage (backup)
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey(selectedDate), JSON.stringify(picks));
      }
    } catch {
      // ignore
    }

    // 2) tenta guardar no backend no formato que o Stats espera
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

      console.log("Saved ok:", data);
      alert("Picks guardadas!");
    } catch (err) {
      console.error("Failed to save picks:", err);
      alert("Falhou a guardar no servidor (ficou guardado no browser).");
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-white font-black">Minhas Picks</div>

      {/* botões rápidos só para testares */}
      <div className="flex flex-wrap gap-2">
        {gamesOfDay.slice(0, 6).map((g) => (
          <button
            key={`o45-${g}`}
            onClick={() => addOver45(g)}
            className="px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-[11px] font-black text-slate-200 hover:bg-white/10"
          >
            + Over 4.5: {g}
          </button>
        ))}
        {gamesOfDay.slice(0, 3).map((g) => (
          <button
            key={`dr-${g}`}
            onClick={() => addDrawTR(g)}
            className="px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-[11px] font-black text-slate-200 hover:bg-white/10"
          >
            + Empate TR: {g}
          </button>
        ))}
      </div>

      <button
        onClick={savePicks}
        disabled={isEmptyPicks(picks)}
        className={`px-4 py-2 rounded-lg border text-[11px] font-black uppercase tracking-widest ${
          isEmptyPicks(picks)
            ? "bg-white/5 border-white/10 text-slate-500 cursor-not-allowed"
            : "bg-amber-500/20 border-amber-500/30 text-amber-200 hover:bg-amber-500/25"
        }`}
      >
        Guardar Picks
      </button>

      <div className="space-y-3">
        <div>
          <div className="text-slate-300 font-black text-sm">Over 4.5</div>
          <div className="text-slate-400 text-xs">
            {(picks.quadrupleOver45 || []).length ? (picks.quadrupleOver45 || []).join("  •  ") : "—"}
          </div>
        </div>

        <div>
          <div className="text-slate-300 font-black text-sm">Empate TR</div>
          <div className="text-slate-400 text-xs">
            {(picks.drawSuggestions || []).length
              ? (picks.drawSuggestions as any[]).map((d) => d?.game ?? String(d)).join("  •  ")
              : "—"}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MyPicksView;
