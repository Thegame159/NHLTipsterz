import React, { useEffect, useMemo, useState } from "react";
import { Suggestions } from "../types";

type HistoryItem = {
  date: string;
  auto: null | { savedAt: number; suggestions: Suggestions };
  mine: null | { savedAt: number; suggestions: Suggestions };
};

const StatsView: React.FC = () => {
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);

  const loadHistory = async () => {
    const r = await fetch("/api/history?limit=120");
    if (!r.ok) {
      setHistoryItems([]);
      return;
    }
    const data = await r.json().catch(() => null);
    const items: HistoryItem[] = Array.isArray(data?.items) ? data.items : [];
    setHistoryItems(items);
  };

  useEffect(() => {
    loadHistory();

    // 🔥 Ouve evento global
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

    return { autoCount, mineCount };
  }, [historyItems]);

  if (!historyItems.length) {
    return (
      <div className="py-20 text-center text-slate-600 text-[10px] font-black uppercase tracking-widest">
        Ainda não há histórico.
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="bg-slate-800/40 border border-slate-700 rounded-2xl p-6">
        <h2 className="text-2xl font-black text-white mb-4">Stats Histórico</h2>

        <div className="text-slate-300 text-sm space-y-2">
          <div>Datas guardadas: {historyItems.length}</div>
          <div>Snapshots Auto: {totals.autoCount}</div>
          <div>Picks Minhas: {totals.mineCount}</div>
        </div>
      </div>
    </div>
  );
};

export default StatsView;
