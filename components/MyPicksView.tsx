import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

  const isEmptyPicks = (p: Suggestions) =>
    p.tripleWin.length === 0 &&
    p.tripleOver15P1.length === 0 &&
    p.doubleOver15P1.length === 0 &&
    p.quadrupleOver45.length === 0 &&
    p.over55Suggestions.length === 0 &&
    p.drawSuggestions.length === 0;

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
          suggestions: picks,
        }),
      });

      if (!res.ok) {
        alert("Erro ao guardar no servidor.");
        return;
      }

      // 🔥 DISPARA EVENTO GLOBAL
      window.dispatchEvent(
        new CustomEvent("history-updated", {
          detail: { date: selectedDate },
        })
      );

      alert("Picks guardadas!");
    } catch {
      alert("Erro ao guardar.");
    }
  };

  return (
    <div className="space-y-8 pb-24">
      <div className="bg-slate-800/40 border border-slate-700 rounded-2xl p-6 flex justify-between items-center">
        <h2 className="text-xl font-black text-white">Minhas Picks</h2>

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
      </div>
    </div>
  );
};

export default MyPicksView;
