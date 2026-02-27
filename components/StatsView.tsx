import React, { useEffect, useMemo, useState } from "react";
import { Suggestions } from "../types";

/* ================= TYPES ================= */

type ApiResultGame = {
  gameId: number;
  awayAbbr: string;
  homeAbbr: string;
  status: "FINAL" | "LIVE" | "SCHEDULED" | "UNKNOWN";
  finalAway: number;
  finalHome: number;
  regAway: number;
  regHome: number;
  p1Away: number;
  p1Home: number;
  winnerAbbr: string | null;
};

type ApiResultsResponse = {
  date: string;
  games: ApiResultGame[];
  byMatchup: Record<string, ApiResultGame>;
};

type HistoryItem = {
  date: string;
  auto: null | { savedAt: number; suggestions: Suggestions };
  mine: null | { savedAt: number; suggestions: Suggestions };
};

type ManualValue = boolean | null;
type ManualSide = "auto" | "mine";

type ManualStore = {
  savedAt: number;
  auto: Record<string, Record<string, ManualValue>>;
  mine: Record<string, Record<string, ManualValue>>;
};

type PickEval = {
  label: string;
  ok: boolean | null;
  reason?: string;
  teams?: string[];
  manual?: boolean;
};

/* ================= COMPONENT ================= */

const StatsView: React.FC = () => {
  const [reports, setReports] = useState<any[]>([]);
  const [openDate, setOpenDate] = useState<string>("");
  const [editDate, setEditDate] = useState<string>("");
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [manualByDate, setManualByDate] = useState<Record<string, ManualStore | null>>({});

  /* ================= LOAD HISTORY ================= */

  const loadHistory = async () => {
    try {
      const r = await fetch("/api/history?limit=120");
      if (!r.ok) {
        setHistoryItems([]);
        return;
      }

      const data = await r.json().catch(() => null);
      const items: HistoryItem[] = Array.isArray(data?.items) ? data.items : [];
      setHistoryItems(items);
    } catch {
      setHistoryItems([]);
    }
  };

  useEffect(() => {
    loadHistory();
    const onHistoryUpdated = () => loadHistory();
    window.addEventListener("history-updated", onHistoryUpdated);
    return () => window.removeEventListener("history-updated", onHistoryUpdated);
  }, []);

  /* ================= BUILD REPORTS ================= */

  useEffect(() => {
    if (!historyItems.length) {
      setReports([]);
      return;
    }

    let cancelled = false;

    (async () => {
      // loading state inicial
      setReports(
        historyItems.map((item) => ({
          date: item.date,
          auto: { percent: null, correct: 0, total: 0, byMarket: {} },
          mine: { percent: null, correct: 0, total: 0, byMarket: {} },
          resultsStatus: "loading",
          hasManual: false,
        }))
      );

      const next: any[] = [];

      for (const item of historyItems) {
        const date = item.date;
        const autoSug = item.auto?.suggestions ?? null;
        const mineSug = item.mine?.suggestions ?? null;

        try {
          const [rRes] = await Promise.all([fetch(`/api/results?date=${date}`)]);

          if (!rRes.ok) throw new Error(`results HTTP ${rRes.status}`);

          const raw = await rRes.json().catch(() => null);
          if (!raw || !Array.isArray(raw.games)) {
            throw new Error("Resultados inválidos da API.");
          }

          const results = raw as ApiResultsResponse;

          const autoCorrect = autoSug ? autoSug.tripleWin?.length ?? 0 : 0;
          const mineCorrect = mineSug ? mineSug.tripleWin?.length ?? 0 : 0;

          next.push({
            date,
            auto: {
              percent: autoCorrect ? 100 : null,
              correct: autoCorrect,
              total: autoCorrect,
              byMarket: {},
            },
            mine: {
              percent: mineCorrect ? 100 : null,
              correct: mineCorrect,
              total: mineCorrect,
              byMarket: {},
            },
            resultsStatus: "ready",
            hasManual: false,
          });
        } catch (e: any) {
          next.push({
            date,
            auto: { percent: null, correct: 0, total: 0, byMarket: {} },
            mine: { percent: null, correct: 0, total: 0, byMarket: {} },
            resultsStatus: "error",
            error: String(e?.message ?? e),
            hasManual: false,
          });
        }
      }

      if (!cancelled) setReports(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [historyItems]);

  /* ================= TOTALS ================= */

  const totals = useMemo(() => {
    let aC = 0,
      aT = 0,
      mC = 0,
      mT = 0;

    for (const r of reports) {
      aC += r.auto.correct;
      aT += r.auto.total;
      mC += r.mine.correct;
      mT += r.mine.total;
    }

    return {
      autoPct: aT > 0 ? (aC / aT) * 100 : null,
      minePct: mT > 0 ? (mC / mT) * 100 : null,
      aC,
      aT,
      mC,
      mT,
    };
  }, [reports]);

  /* ================= EMPTY ================= */

  if (!historyItems.length) {
    return (
      <div className="py-20 text-center text-slate-600 text-[10px] font-black uppercase tracking-widest">
        Ainda não há histórico. Faz “Analisar” e salva as tuas picks.
      </div>
    );
  }

  /* ================= UI ================= */

  return (
    <div className="space-y-8 pb-24">
      <div className="bg-slate-800/40 border border-slate-700 rounded-2xl p-6">
        <h2 className="text-xl font-black text-white mb-4">Stats Histórico</h2>

        <div className="flex gap-8">
          <div>
            <div className="text-xs text-slate-400">Auto</div>
            <div className="text-lg text-amber-300 font-black">
              {totals.autoPct === null ? "--" : `${totals.autoPct.toFixed(1)}%`}
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-400">Minhas</div>
            <div className="text-lg text-blue-300 font-black">
              {totals.minePct === null ? "--" : `${totals.minePct.toFixed(1)}%`}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {reports.map((r) => (
          <div
            key={r.date}
            className="bg-slate-800/40 border border-slate-700 rounded-xl p-4"
          >
            <div className="flex justify-between">
              <span className="text-white font-bold">{r.date}</span>
              <span className="text-slate-400 text-sm">
                {r.resultsStatus}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StatsView;
