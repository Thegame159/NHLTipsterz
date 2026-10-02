// src/App.tsx

import React, { useState, useRef } from 'react';
import { fetchNHLAnalysis } from './services/geminiService';
import { NHLAnalysisData, GamePrediction } from './types';
import GameTable from './components/GameTable';
import SuggestionsView from './components/SuggestionsView';
import MyPicksView from './components/MyPicksView';
import StatsView from './components/StatsView';
import BrandLogo from './components/BrandLogo';
import { buildSuggestions } from './utils/suggestions';

// ─── Constantes ──────────────────────────────────────────────────────────────

const LOADING_MESSAGES = [
  'Sincronizando estatísticas...',
  'Jogadores em aquecimento...',
  'Analisando o gelo...',
  'Estudando os últimos 10 jogos...',
  'Verificando boletim clínico...',
  'Processando fator casa vs fora...',
  'Refining odds táticas...',
  'Preparando face-off...',
];

type Tab = 'schedule' | 'suggestions' | 'mypicks' | 'stats';

// ─── Helpers de data ─────────────────────────────────────────────────────────

const toDateStringLocal = (d: Date): string => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

// ─── App ─────────────────────────────────────────────────────────────────────

const App: React.FC = () => {
  const [data, setData]               = useState<NHLAnalysisData | null>(null);
  const [loading, setLoading]         = useState(false);
  const [progress, setProgress]       = useState(0);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [error, setError]             = useState<string | null>(null);
  const [activeTab, setActiveTab]     = useState<Tab>('schedule');
  // Inicializa com a data de hoje por predefinição
  const [selectedDate, setSelectedDate] = useState<string>(toDateStringLocal(new Date()));
  const [loadedDate, setLoadedDate]   = useState<string>('');
  
  // Estado para o feedback visual de limpeza de cache
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const requestIdRef = useRef(0);

  const minDate = toDateStringLocal(new Date(Date.now() - 30 * 86400000));
  const maxDate = toDateStringLocal(new Date(Date.now() + 5 * 86400000));

  // ─── Carregar dados ─────────────────────────────────────────────────────────

  const loadData = async (date: string) => {
    const reqId = ++requestIdRef.current;

    let progressInterval: ReturnType<typeof setInterval> | null = null;
    let msgInterval:      ReturnType<typeof setInterval> | null = null;

    setLoading(true);
    setProgress(0);
    setError(null);

    try {
      progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 99) return prev;
          const diff = 100 - prev;
          const increment = diff > 50 ? 3 : diff > 10 ? 0.8 : 0.05;
          return prev + increment;
        });
      }, 100);

      msgInterval = setInterval(() => {
        setLoadingMsgIdx(prev => (prev + 1) % LOADING_MESSAGES.length);
      }, 1800);

      const rawAnalysis = await fetchNHLAnalysis(date);

      if (reqId !== requestIdRef.current) return;

      const analysisData = (rawAnalysis as any)?.predictions
        ? rawAnalysis
        : (rawAnalysis as any)?.data || rawAnalysis;

      const rawPredictions: GamePrediction[] = analysisData?.predictions || [];

           // Filtra apenas jogos que fiquem na janela noturna em Portugal (22:00 - 06:00)
      const filteredPredictions = rawPredictions.filter((game) => {
        if (!game || !game.dateTime) return true;
        const dateObj = new Date(game.dateTime);
        const hour = dateObj.getHours();
        return hour >= 22 || hour <= 6;
      });

      // As dicas são calculadas sobre os jogos visíveis
      const suggestionsList = buildSuggestions(filteredPredictions);

      setProgress(100);
      setData({
        predictions: filteredPredictions,
        suggestions: suggestionsList,
        lastUpdated: analysisData?.lastUpdated || new Date().toISOString(),
      });
      setLoadedDate(date);

      // Guarda snapshot automático no histórico
      try {
        const res = await fetch('/api/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date,
            side: 'auto',
            suggestions: suggestionsList,
          }),
        });
        if (res.ok) {
          window.dispatchEvent(new Event('history-updated'));
        }
      } catch {
        // Falha silenciosa
      }
    } catch (err: any) {
      if (reqId !== requestIdRef.current) return;
      setError(err?.message || 'Erro ao carregar dados. Tente novamente.');
    } finally {
      if (progressInterval) clearInterval(progressInterval);
      if (msgInterval)      clearInterval(msgInterval);
      if (reqId === requestIdRef.current) setLoading(false);
    }
  };

  const handleAnalyzeClick = () => loadData(selectedDate);

  // ─── Função de Limpeza Global de Cache ─────────────────────────────────────

  const handleGlobalRefreshClick = async () => {
    try {
      const res = await fetch('/api/gemini', {
        method: 'DELETE',
      });

      if (res.ok) {
        // Limpa os dados atuais e data selecionada do ecrã
        setData(null);
        setLoadedDate('');
        
        // Dispara mensagem de feedback visual
        setToastMessage('🔄 Histórico e cache limpos com sucesso!');
        setTimeout(() => {
          setToastMessage(null);
        }, 4000);
      } else {
        setToastMessage('⚠️ Erro ao limpar a cache.');
        setTimeout(() => setToastMessage(null), 4000);
      }
    } catch (err) {
      console.error('Erro ao comunicar com o servidor para limpar cache', err);
      setToastMessage('⚠️ Erro de ligação ao limpar cache.');
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  // ─── Loading screen ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#020617] overflow-hidden">
        <div className="animate-in fade-in zoom-in duration-700">
          <BrandLogo size="lg" />
        </div>

        <div className="text-center space-y-8 w-full max-w-[280px] mt-8">
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
                {LOADING_MESSAGES[loadingMsgIdx]}
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

  // ─── Render principal ────────────────────────────────────────────────        

  const predictionsCount = data?.predictions?.length ?? 0;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 pb-20">

      {/* Header */}
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
              min={minDate}
              max={maxDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="bg-transparent text-white text-[11px] font-black p-2 outline-none cursor-pointer [color-scheme:dark] w-full"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleAnalyzeClick}
              className="bg-orange-600 text-white font-black px-4 py-2 rounded-lg text-[10px] uppercase tracking-wider hover:bg-orange-500 transition"
              title={loadedDate ? `Carregado: ${loadedDate}` : 'Ainda não analisado'}
            >
              Analisar
            </button>

            <button
              onClick={handleGlobalRefreshClick}
              className="bg-zinc-800 text-white p-2 rounded-lg hover:bg-zinc-700 transition border border-white/10 flex items-center justify-center cursor-pointer"
              title="Limpar toda a cache e histórico guardado"
            >
              🔄
            </button>
          </div>

          <div className="bg-orange-600/5 px-3 py-1.5 rounded-lg border border-orange-600/10 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
            <span className="text-[9px] font-black text-slate-400">LIVE</span>
          </div>
        </div>
      </header>

      {/* Toast de Feedback Visual da Limpeza */}
      {toastMessage && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-4 py-3 rounded-xl text-xs font-bold text-center mb-6 backdrop-blur-md animate-in fade-in duration-300 shadow-lg">
          {toastMessage}
        </div>
      )}

      {/* Erro */}
      {error ? (
        <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-12 text-center my-10 backdrop-blur-xl">
          <i className="fas fa-exclamation-circle text-2xl text-red-600 mb-4" />
          <h2 className="text-lg font-black text-white mb-3 uppercase tracking-widest">
            Erro
          </h2>
          <p className="text-slate-300 text-xs font-bold max-w-xl mx-auto mb-6">
            {error}
          </p>
          <button
            onClick={() => loadData(selectedDate)}
            className="bg-white text-black font-black py-2.5 px-8 rounded-lg text-xs uppercase"
          >
            Repetir
          </button>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="bg-[#020617]/80 backdrop-blur-3xl p-1 rounded-xl border border-white/5 mb-8 flex gap-1 shadow-xl max-w-[520px] mx-auto">
            {(
              [
                { key: 'schedule',    label: 'Jogos'        },
                { key: 'suggestions', label: 'Dicas'        },
                { key: 'mypicks',     label: 'Minhas Picks' },
                { key: 'stats',       label: 'Stats'        },
              ] as { key: Tab; label: string }[]
            ).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 py-2.5 rounded-lg font-black text-[9px] uppercase tracking-wider transition-all ${
                  activeTab === tab.key
                    ? 'bg-orange-600 text-white'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Conteúdo */}
          <main className="animate-in fade-in duration-500">
            {activeTab === 'schedule' && (
              <div className="space-y-6">
                {loadedDate && data && predictionsCount > 0 && (
                  <GameTable predictions={data.predictions} />
                )}
                {(!loadedDate || predictionsCount === 0) && (
                  <div className="py-24 text-center text-slate-600 text-[10px] font-black uppercase tracking-widest">
                    {loadedDate ? 'Sem jogos no intervalo 23:00 – 05:00' : 'Escolhe uma data e clica em Analisar'}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'suggestions' && (
              loadedDate && data ? (
                <SuggestionsView
                  suggestions={data.suggestions}
                  predictions={data.predictions}
                />
              ) : (
                <div className="py-24 text-center text-slate-600 text-[10px] font-black uppercase tracking-widest">
                  Escolhe uma data e clica em Analisar
                </div>
              )
            )}

            {activeTab === 'mypicks' && (
              loadedDate && data ? (
                <MyPicksView
                  predictions={data.predictions}
                  selectedDate={loadedDate}
                />
              ) : (
                <div className="py-24 text-center text-slate-600 text-[10px] font-black uppercase tracking-widest">
                  Escolhe uma data e clica em Analisar
                </div>
              )
            )}

            {activeTab === 'stats' && <StatsView />}
          </main>
        </>
      )}

      {/* Footer fixo */}
      <footer className="fixed bottom-0 left-0 right-0 bg-black/80 backdrop-blur-md border-t border-white/5 p-4 text-center z-40">
        <p className="text-[8px] text-slate-500 uppercase tracking-[0.4em] font-black">
          NHL Tipsterz &copy; {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  );
};

export default App;
