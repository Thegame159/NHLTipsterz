import React, { useState, useEffect, useRef } from "react";
import { fetchNHLAnalysis } from "./services/geminiService";
import { NHLAnalysisData } from "./types";
import GameTable from "./components/GameTable";
import SuggestionsView from "./components/SuggestionsView";
import MyPicksView from "./components/MyPicksView";

const BrandLogo: React.FC<{ size?: "sm" | "lg" }> = ({ size = "sm" }) => {
  const isLarge = size === "lg";

  return (
    <div
      className={`relative flex flex-col items-center justify-center select-none ${
        isLarge ? "p-6 scale-90 sm:scale-100" : "p-1 scale-[0.5] sm:scale-[0.65]"
      } overflow-visible`}
    >
      <div className={`absolute left-[-20%] w-[140%] pointer-events-none ${isLarge ? "top-[45%]" : "top-[42%]"}`}>
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
            isLarge ? "text-[100px] sm:text-[160px]" : "text-[80px] sm:text-[100px]"
          } font-nhl-block text-white relative z-10 leading-none tracking-tight`}
        >
          NHL
        </h1>

        <div
          className={`absolute z-30 transform rotate-[-12deg] ${
            isLarge ? "right-[-45px] sm:right-[-60px] top-[10px] sm:top-[15px]" : "right-[-35px] top-[8px]"
          }`}
        >
          <div
            className={`${
              isLarge ? "w-36 h-20 sm:w-44 sm:h-28" : "w-24 h-14"
            } bg-[#1a1a1a] rounded-full shadow-[0_10px_20px_rgba(0,0,0,0.8),inset_0_2px_4px_rgba(255,255,255,0.1)] border-b-[6px] border-black relative overflow-hidden flex items-center justify-center`}
          >
            <div className={`${isLarge ? "w-16 h-16 sm:w-20 sm:h-20" : "w-12 h-12"} relative flex flex-col items-center justify-center`}>
              <svg viewBox="0 0 100 100" className="w-full h-full p-2">
                <path d="M 50 20 L 25 75 L 38 75 L 50 55 L 62 75 L 75 75 Z" fill="white" />
                <rect x="60" y="65" width="22" height="8" fill="#ea580c" rx="1" />
              </svg>
            </div>

            <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/5 to-transparent" />
          </div>
        </div>
      </div>

      <div className={`z-40 ${isLarge ? "mt-[-40px] sm:mt-[-55px] ml-16 sm:ml-24" : "mt-[-35px] ml-14"}`}>
        <span
          className={`${isLarge ? "text-[65px] sm:text-[90px]" : "text-[55px] sm:text-[65px]"} font-tipsterz text-white drop-shadow-[0_3px_6px_rgba(0,0,0,1)]`}
        >
          Tipsterz
        </span>
      </div>
    </div>
  );
};

const loadingMessages = [
  "Sincronizando estatísticas...",
  "Jogadores em aquecimento...",
  "Analisando o gelo...",
  "Estudando os últimos 10 jogos...",
  "Verificando boletim clínico...",
  "Processando fator casa vs fora...",
  "Refinando odds táticas...",
  "Preparando face-off...",
];

const toDateStringLocal = (d: Date) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const getYesterdayString = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toDateStringLocal(d);
};

const App: React.FC = () => {
  const [data, setData] = useState<NHLAnalysisData | null>(null);
  const [loading, setLoading] = useState(false);

  const [progress, setProgress] = useState(0);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"schedule" | "suggestions" | "mypicks">("schedule");

  const [selectedDate, setSelectedDate] = useState<string>(getYesterdayString());
  const [loadedDate, setLoadedDate] = useState<string>("");
  const [lastRequestedDate, setLastRequestedDate] = useState<string>("");

  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const loadData = async (date: string) => {
    const reqId = ++requestIdRef.current;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let progressInterval: ReturnType<typeof setInterval> | null = null;
    let msgInterval: ReturnType<typeof setInterval> | null = null;

    try {
      setLoading(true);
      setProgress(0);
      setError(null);
      setLastRequestedDate(date);

      progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 95) return prev;
          const diff = 95 - prev;
          const inc = diff > 50 ? 3 : diff > 10 ? 0.8 : 0.2;
          return prev + inc;
        });
      }, 120);

      msgInterval = setInterval(() => {
        setLoadingMsgIdx((prev) => (prev + 1) % loadingMessages.length);
      }, 1800);

      const analysis = await fetchNHLAnalysis(date, controller.signal);
      if (reqId !== requestIdRef.current) return;

      setProgress(100);
      setData(analysis);
      setLoadedDate(date);
      setLoading(false);
    } catch (err: any) {
      if (controller.signal.aborted) return;
      if (reqId !== requestIdRef.current) return;

      setError(err?.message || "Erro ao carregar dados. Tente novamente.");
      setLoading(false);
    } finally {
      if (progressInterval) clearInterval(progressInterval);
      if (msgInterval) clearInterval(msgInterval);
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const handleAnalyzeClick = () => loadData(selectedDate);

  const predictionsCount = data?.predictions?.length ?? 0;

  // ✅ min/max do calendário alinhados com backend (past 30 / future 20)
  const minDate = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
  const maxDate = new Date(Date.now() + 20 * 86400000).toISOString().split("T")[0];

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#020617] overflow-hidden">
        <div className="animate-in fade-in zoom-in duration-700">
          <BrandLogo size="lg" />
        </div>

        <div className="text-center space-y-8 w-full max-w-[280px] mt-8" role="status" aria-live="polite">
          <div className="flex flex-col items-center gap-4">
            <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden relative">
              <div
                className="h-full bg-orange-600 transition-all duration-300 shadow-[0_0_15px_rgba(249,115,22,0.6)]"
                style={{ width: `${progress}%` }}
              >
                <div className="absolute top-0 right-0 h-full w-12 bg-white/20 blur-md animate-[pulse_1s_infinite]" />
              </div>
            </div>

            <div className="flex flex-col items-center gap-1.5">
              <p className="text-[10px] font-black text-slate-400 tracking-[0.2em] uppercase italic animate-pulse">
                {loadingMessages[loadingMsgIdx]}
              </p>
              <span className="text-[9px] font-black text-slate-600 tracking-[0.5em] uppercase">
                {Math.round(progress)}%
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const statusLabel = loading ? "LIVE" : "READY";

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4 border-b border-white/5 pb-4">
        <div className="flex items-center">
          <div className="origin-left transform -ml-4 sm:-ml-2">
            <BrandLogo size="sm" />
          </div>
        </div>

        <div className="flex items-center gap-3 justify-between md:justify-end w-full md:w-auto">
          <div className="flex items-center bg-zinc-900/50 border border-white/10 rounded-lg overflow-hidden flex-1 md:flex-none">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              min={minDate}
              max={maxDate}
              className="bg-transparent text-white text-[11px] font-black p-2 outline-none cursor-pointer [color-scheme:dark] w-full"
            />
          </div>

          <button
            onClick={handleAnalyzeClick}
            className="bg-orange-600 text-white font-black px-4 py-2 rounded-lg text-[10px] uppercase tracking-wider hover:bg-orange-500 transition"
            title={loadedDate ? `Carregado: ${loadedDate}` : "Ainda não analisado"}
          >
            Analisar
          </button>

          <div className="bg-orange-600/5 px-3 py-1.5 rounded-lg border border-orange-600/10 flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${loading ? "bg-orange-500 animate-pulse" : "bg-slate-500"}`} />
            <span className="text-[9px] font-black text-slate-400">{statusLabel}</span>
          </div>
        </div>
      </header>

      {error ? (
        <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-12 text-center my-10 backdrop-blur-xl">
          <i className="fas fa-exclamation-circle text-2xl text-red-600 mb-4" />
          <h2 className="text-lg font-black text-white mb-3 uppercase tracking-widest">ERRO</h2>
          <p className="text-slate-300 text-xs font-bold max-w-xl mx-auto mb-6">{error}</p>

          <button
            onClick={() => loadData(lastRequestedDate || loadedDate || selectedDate)}
            className="bg-white text-black font-black py-2.5 px-8 rounded-lg text-xs uppercase"
          >
            Repetir
          </button>
        </div>
      ) : (
        <>
          {/* ✅ 3 tabs */}
          <div className="bg-[#020617]/80 backdrop-blur-3xl p-1 rounded-xl border border-white/5 mb-8 flex gap-1 shadow-xl max-w-[420px] mx-auto">
            <button
              onClick={() => setActiveTab("schedule")}
              aria-pressed={activeTab === "schedule"}
              className={`flex-1 py-2.5 rounded-lg font-black text-[9px] uppercase tracking-wider transition-all ${
                activeTab === "schedule" ? "bg-orange-600 text-white" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              Jogos
            </button>
            <button
              onClick={() => setActiveTab("suggestions")}
              aria-pressed={activeTab === "suggestions"}
              className={`flex-1 py-2.5 rounded-lg font-black text-[9px] uppercase tracking-wider transition-all ${
                activeTab === "suggestions" ? "bg-orange-600 text-white" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              Dicas
            </button>
            <button
              onClick={() => setActiveTab("mypicks")}
              aria-pressed={activeTab === "mypicks"}
              className={`flex-1 py-2.5 rounded-lg font-black text-[9px] uppercase tracking-wider transition-all ${
                activeTab === "mypicks" ? "bg-orange-600 text-white" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              Minhas Picks
            </button>
          </div>

          <main className="animate-in fade-in duration-500">
            {activeTab === "schedule" ? (
              <div className="space-y-6">
                {loadedDate && data && <GameTable predictions={data.predictions} />}

                {!loadedDate && (
                  <div className="py-24 text-center text-slate-600 text-[10px] font-black uppercase tracking-widest">
                    Escolhe uma data e clica em Analisar
                  </div>
                )}

                {loadedDate && predictionsCount === 0 && (
                  <div className="py-24 text-center text-slate-600 text-[10px] font-black uppercase tracking-widest">
                    Sem jogos para esta data
                  </div>
                )}
              </div>
            ) : activeTab === "suggestions" ? (
              <>
                {loadedDate && data ? (
                  <SuggestionsView suggestions={data.suggestions} />
                ) : (
                  <div className="py-24 text-center text-slate-600 text-[10px] font-black uppercase tracking-widest">
                    Escolhe uma data e clica em Analisar
                  </div>
                )}
              </>
            ) : (
              <>
                {loadedDate && data ? (
                  <MyPicksView predictions={data.predictions} selectedDate={loadedDate} />
                ) : (
                  <div className="py-24 text-center text-slate-600 text-[10px] font-black uppercase tracking-widest">
                    Escolhe uma data e clica em Analisar
                  </div>
                )}
              </>
            )}
          </main>
        </>
      )}

      <footer className="fixed bottom-0 left-0 right-0 bg-black/80 backdrop-blur-md border-t border-white/5 p-4 text-center z-40">
        <p className="text-[8px] text-slate-500 uppercase tracking-[0.4em] font-black">
          NHL Tipsterz &copy; {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  );
};

export default App;
