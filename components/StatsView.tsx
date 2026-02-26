import React, { useEffect, useMemo, useRef, useState } from "react";
import { Suggestions } from "../types";

type HistoryItem = {
  date: string;
  auto: null | { savedAt: number; suggestions: Suggestions };
  mine: null | { savedAt: number; suggestions: Suggestions };
};

/* =========================
   Animated Percentage Hook
   ========================= */

function useAnimatedNumber(value: number | null, duration = 700) {
  const [display, setDisplay] = useState<number | null>(value);
  const prevRef = useRef<number | null>(value);
  const [direction, setDirection] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (value === null) {
      setDisplay(null);
      return;
    }

    const start = prevRef.current ?? value;
    const end = value;

    if (start === end) {
      setDisplay(end);
      return;
    }

    setDirection(end > start ? "up" : "down");

    const startTime = performance.now();

    const animate = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      const current = start + (end - start) * eased;

      setDisplay(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        prevRef.current = end;
        setTimeout(() => setDirection(null), 600);
      }
    };

    requestAnimationFrame(animate);
  }, [value, duration]);

  return { display, direction };
}

/* ========================= */

const AnimatedPercent: React.FC<{ value: number | null }> = ({ value }) => {
  const { display, direction } = useAnimatedNumber(value, 700);

  const glow =
    direction === "up"
      ? "shadow-[0_0_18px_rgba(34,197,94,0.9)] text-emerald-300"
      : direction === "down"
      ? "shadow-[0_0_18px_rgba(239,68,68,0.9)] text-rose-300"
      : "text-white";

  return (
    <span
      className={`transition-all duration-300 font-black text-lg ${glow}`}
    >
      {display === null ? "--" : `${display.toFixed(1)}%`}
    </span>
  );
};

/* ========================= */

const StatsView: React.FC = () => {
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);

  const loadHistory = async () => {
    const r = await fetch("/api/history?limit=120");
    if (!r.ok) {
      setHistoryItems([]);
      return;
    }
    const data = await r.json().catch(() => null);
    const items: HistoryItem[] = Array.isArray(data?.items)
      ? data.items
      : [];
    setHistoryItems(items);
  };

  useEffect(() => {
    loadHistory();

    const onHistoryUpdated = () => {
      loadHistory();
    };

    window.addEventListener("history-updated", onHistoryUpdated);

    return () => {
      window.removeEventListener("history-updated", onHistoryUpdated);
    };
  }, []);

  const totals = useMemo(() => {
    let autoCount = 0;
    let mineCount = 0;

    historyItems.forEach((h) => {
      if (h.auto) autoCount++;
      if (h.mine) mineCount++;
    });

    const autoPct =
      historyItems.length > 0
        ? (autoCount / historyItems.length) * 100
        : null;

    const minePct =
      historyItems.length > 0
        ? (mineCount / historyItems.length) * 100
        : null;

    return { autoPct, minePct };
  }, [historyItems]);

  if (!historyItems.length) {
    return (
      <div className="py-20 text-center text-slate-600 text-[10px] font-black uppercase tracking-widest">
        Ainda não há histórico.
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-24">
      <div className="bg-slate-800/40 border border-slate-700 rounded-2xl p-6">
        <h2 className="text-2xl font-black text-white mb-6">
          Stats Histórico
        </h2>

        <div className="flex gap-12">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
              Auto
            </div>
            <AnimatedPercent value={totals.autoPct} />
          </div>

          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
              Minhas
            </div>
            <AnimatedPercent value={totals.minePct} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatsView;
