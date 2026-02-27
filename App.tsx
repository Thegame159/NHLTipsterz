import React, { useState, useEffect, useRef } from 'react';
import { fetchNHLAnalysis } from './services/geminiService';
import { NHLAnalysisData } from './types';
import GameTable from './components/GameTable';
import SuggestionsView from './components/SuggestionsView';
import MyPicksView from './components/MyPicksView';
import StatsView from './components/StatsView';

/* -------------------- LOGO (igual ao teu) -------------------- */
const BrandLogo: React.FC<{ size?: 'sm' | 'lg' }> = ({ size = 'sm' }) => {
  const isLarge = size === 'lg';

  return (
    <div
      className={`relative flex flex-col items-center justify-center select-none ${
        isLarge ? 'p-6 scale-90 sm:scale-100' : 'p-1 scale-[0.5] sm:scale-[0.65]'
      } overflow-visible`}
    >
      <div className={`absolute left-[-20%] w-[140%] pointer-events-none ${isLarge ? 'top-[45%]' : 'top-[42%]'}`}>
        <svg viewBox="0 0 400 50" className="w-full h-auto opacity-100 drop-shadow-[0_0_5px_rgba(249,115,22,0.5)]">
          <path d="M 0 25 Q 200 35 400 22" stroke="#f97316" strokeWidth="1.2" fill="transparent" />
          <path d="M 10 32 Q 205 42 390 30" stroke="#f97316" strokeWidth="1.8" fill="transparent" />
          <path d="M 20 38 Q 210 48 380 36" stroke="#f97316" strokeWidth="2.2" fill="transparent" />
          <path d="M 35 44 Q 215 54 365 44" stroke="#f97316" strokeWidth="1.0" fill="transparent" opacity="0.6" />
        </svg>
      </div>

      <div className="relative flex items-center">
        <h1
          className={`${
            isLarge ? 'text-[100px] sm:text-[160px]' : 'text-[80px] sm:text-[100px]'
          } font-nhl-block text-white relative z-10 leading-none tracking-tight`}
        >
          NHL
        </h1>
      </div>
    </div>
  );
};

/* -------------------- APP -------------------- */

const getYesterdayString = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const App: React.FC = () => {
  const [data, setData] = useState<NHLAnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'schedule' | 'suggestions' | 'mypicks' | 'stats'>('schedule');

  const [selectedDate, setSelectedDate] = useState<string>(getYesterdayString());
  const [loadedDate, setLoadedDate] = useState<string>('');

  const requestIdRef = useRef(0);

  const loadData = async (date: string) => {
    const reqId = ++requestIdRef.current;

    try {
      setLoading(true);
      setError(null);

      const analysis = await fetchNHLAnalysis(date);
      if (reqId !== requestIdRef.current) return;

      setData(analysis);
      setLoadedDate(date);

      // 🔥 GUARDA SNAPSHOT AUTO + NOTIFICA STATS
      try {
        await fetch("/api/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date,
            side: "auto",
            suggestions: analysis.suggestions,
          }),
        });

        // 🔥 AVISA A STATS
        window.dispatchEvent(new Event("history-updated"));

      } catch {
        // ignore
      }

      setLoading(false);
    } catch (err: any) {
      if (reqId !== requestIdRef.current) return;
      setError(err?.message || "Erro ao carregar dados.");
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#020617]">
        <BrandLogo size="lg" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 pb-24">

      <header className="flex justify-between items-center mb-8">
        <BrandLogo size="sm" />

        <div className="flex gap-3 items-center">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-zinc-900 border border-white/10 rounded px-3 py-2 text-xs font-black text-white"
          />
          <button
            onClick={() => loadData(selectedDate)}
            className="bg-orange-600 px-4 py-2 rounded text-xs font-black uppercase"
          >
            Analisar
          </button>
        </div>
      </header>

      <div className="flex gap-2 mb-8">
        {["schedule","suggestions","mypicks","stats"].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`px-4 py-2 rounded text-xs font-black uppercase ${
              activeTab === tab ? "bg-orange-600 text-white" : "text-slate-500"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {error ? (
        <div className="text-red-500">{error}</div>
      ) : activeTab === "schedule" ? (
        loadedDate && data ? (
          <GameTable predictions={data.predictions} />
        ) : (
          <div className="text-slate-500 text-xs uppercase">Escolhe uma data e clica em Analisar</div>
        )
      ) : activeTab === "suggestions" ? (
        loadedDate && data ? (
          <SuggestionsView suggestions={data.suggestions} />
        ) : null
      ) : activeTab === "mypicks" ? (
        loadedDate && data ? (
          <MyPicksView
            predictions={data.predictions}
            selectedDate={loadedDate}
          />
        ) : null
      ) : (
        <StatsView />
      )}
    </div>
  );
};

export default App;
