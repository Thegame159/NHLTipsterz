// src/App.tsx

import { setLeagueBaseline } from './utils/marketScale';
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { fetchNHLAnalysis } from './services/geminiService';
import { NHLAnalysisData, GamePrediction } from './types';
import GameTable from './components/GameTable';
import SuggestionsView from './components/SuggestionsView';
import MyPicksView from './components/MyPicksView';
import StatsView from './components/StatsView';
import BrandLogo from './components/BrandLogo';
import UpdateBanner from './components/UpdateBanner';
import PlayersView from './components/PlayersView';
import TabIcon from './components/TabIcon';
import CalibrationView from './components/CalibrationView';
import TabHeader from './components/TabHeader';
import AuthGate, { useAuth } from './components/AuthGate';
import AdminPanel from './components/AdminPanel';
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

type Tab = 'schedule' | 'suggestions' | 'players' | 'mypicks' | 'stats' | 'calibration' | 'admin';

// ─── Helpers de data ─────────────────────────────────────────────────────────

const toDateStringLocal = (d: Date): string => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

// ─── App ─────────────────────────────────────────────────────────────────────

const AppMain: React.FC = () => {
  const auth = useAuth();
  // Módulos (separadores) a que o utilizador tem acesso; o administrador vê todos
  const allowedTabs = useMemo<Set<string> | null>(
    () => (!auth || auth.user.role === 'admin' ? null : new Set(auth.user.modules ?? ['schedule', 'suggestions'])),
    [auth]
  );
  const isAdmin = auth?.user.role === 'admin';
  // 'admin' só para o administrador; os outros separadores conforme os módulos
  const canSee = (t: Tab) => (t === 'admin' ? isAdmin : !allowedTabs || allowedTabs.has(t));
  const [data, setData]               = useState<NHLAnalysisData | null>(null);
  const [loading, setLoading]         = useState(false);
  const [progress, setProgress]       = useState(0);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [error, setError]             = useState<string | null>(null);
  const [activeTab, setActiveTab]     = useState<Tab>('schedule');
  // Se o separador aberto não estiver autorizado, salta para o primeiro que o utilizador pode ver
  useEffect(() => {
    if (!allowedTabs || allowedTabs.has(activeTab)) return;
    const first = (['schedule', 'suggestions', 'players', 'mypicks', 'stats', 'calibration'] as Tab[]).find(t => allowedTabs.has(t));
    if (first) setActiveTab(first);
  }, [allowedTabs, activeTab]);
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
    setToastMessage(null);

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

      setLeagueBaseline(analysisData?.leagueBaseline);
      setProgress(100);
      setData({
        leagueBaseline: analysisData?.leagueBaseline,
        predictions: filteredPredictions,
        suggestions: suggestionsList,
        lastUpdated: analysisData?.lastUpdated || new Date().toISOString(),
        totalGames: rawPredictions.length,
      });
      setLoadedDate(date);

      // Só guarda o Auto enquanto o dia ainda não começou: se o primeiro jogo já arrancou
      // (ex.: analisar hoje um dia anterior), não escreve por cima do que já estava guardado.
      const firstStart = filteredPredictions
        .map((g) => (g?.dateTime ? new Date(g.dateTime).getTime() : NaN))
        .filter((t) => !Number.isNaN(t))
        .sort((a, b) => a - b)[0];
      if (firstStart !== undefined && Date.now() >= firstStart) {
        // fica visível até à próxima análise
        setToastMessage('ℹ️ Dia já começou — o Auto guardado no histórico não foi alterado.');
        return;
      }

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
        } else {
          setToastMessage('⚠️ Não consegui guardar o Auto no histórico.');
          setTimeout(() => setToastMessage(null), 4000);
        }
      } catch {
        setToastMessage('⚠️ Não consegui guardar o Auto no histórico.');
        setTimeout(() => setToastMessage(null), 4000);
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

  const [clearing, setClearing] = useState(false);
  const handleGlobalRefreshClick = async () => {
    if (clearing) return;
    setClearing(true);
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
    } finally {
      setClearing(false);
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
    <div className="max-w-7xl mx-auto p-4 sm:p-6 pb-32 sm:pb-32">

      {/* Header */}
      <header className="flex flex-wrap items-center justify-between mb-8 gap-x-4 gap-y-3 border-b border-white/5 pb-4">
        <div className="flex items-center">
          <div className="origin-left transform -ml-4 sm:-ml-2">
            <BrandLogo size="sm" />
          </div>
        </div>

        {auth && (
          <div className="order-2 md:order-3 flex items-center gap-1.5">
            <button
              onClick={auth.logout}
              className="bg-zinc-800 text-slate-300 px-2.5 py-2 rounded-lg hover:bg-zinc-700 transition border border-white/10 text-[10px] font-black uppercase tracking-wider whitespace-nowrap"
              title={`Sessão iniciada como ${auth.user.username}`}
            >
              Sair
            </button>
          </div>
        )}

        <div className="order-3 md:order-2 md:mx-auto flex items-center gap-3 justify-between md:justify-center w-full md:w-auto">
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

            {isAdmin && (
              <button
                onClick={handleGlobalRefreshClick}
                disabled={clearing}
                aria-label="Limpar cache"
                title="Limpar toda a cache e histórico guardado"
                className="p-2 rounded-lg text-slate-500 hover:text-slate-200 transition flex items-center justify-center disabled:opacity-60"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`w-4 h-4 ${clearing ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                >
                  <path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" />
                  <path d="M4 4v4h4" />
                  <path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" />
                  <path d="M20 20v-4h-4" />
                </svg>
              </button>
            )}
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
          <div className="bg-[#020617]/80 backdrop-blur-3xl p-1 rounded-xl border border-white/5 mb-8 flex gap-1 shadow-xl max-w-[720px] mx-auto">
            {(
              [
                { key: 'schedule',    label: 'Jogos'        },
                { key: 'suggestions', label: 'Dicas'        },
                { key: 'players',     label: 'Jogadores'    },
                { key: 'mypicks',     label: 'Minhas Picks' },
                { key: 'stats',       label: 'Stats'        },
                { key: 'calibration', label: 'Calibração'   },
                { key: 'admin',       label: 'Admin'        },
              ] as { key: Tab; label: string }[]
            ).filter(tab => canSee(tab.key)).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 py-2 rounded-lg font-black text-[9px] uppercase tracking-wider transition-all flex flex-col items-center gap-1 ${
                  activeTab === tab.key
                    ? 'bg-orange-600 text-white'
                    : tab.key === 'calibration'
                      ? 'text-violet-400 hover:text-violet-300'
                      : tab.key === 'admin'
                        ? 'text-orange-400/80 hover:text-orange-300'
                      : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <TabIcon name={tab.key} className="w-[18px] h-[18px]" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Conteúdo */}
          <main className="animate-in fade-in duration-500">
            {allowedTabs && allowedTabs.size === 0 && (
              <div className="py-24 text-center text-slate-500 text-xs">
                Ainda não tens separadores atribuídos. Fala com quem gere o site.
              </div>
            )}

            {activeTab === 'schedule' && canSee('schedule') && (
              <div className="space-y-6">
                {loadedDate && data && predictionsCount > 0 && (
                  <TabHeader
                    kind="schedule"
                    title="Jogos"
                    subtitle={`${predictionsCount} ${predictionsCount === 1 ? 'jogo' : 'jogos'} da madrugada · probabilidades do modelo`}
                  />
                )}
                {loadedDate && data && predictionsCount > 0 && (
                  <GameTable predictions={data.predictions} totalGames={data.totalGames} />
                )}
                {(!loadedDate || predictionsCount === 0) && (
                  <div className="py-24 text-center text-slate-600 text-[10px] font-black uppercase tracking-widest">
                    {loadedDate ? 'Sem jogos no intervalo 23:00 – 05:00' : 'Escolhe uma data e clica em Analisar'}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'suggestions' && canSee('suggestions') && (
              loadedDate && data ? (
                <>
                  <TabHeader kind="suggestions" title="Dicas"
                    subtitle={
                      typeof data.totalGames === 'number' && data.totalGames > 0
                        ? `Hoje: ${data.totalGames} ${data.totalGames === 1 ? 'jogo' : 'jogos'}${
                            predictionsCount !== data.totalGames ? ` (${predictionsCount} na janela noturna)` : ''
                          } · escolhas fortes, combos e oportunidades`
                        : 'Escolhas fortes, combos e oportunidades do dia'
                    }
                  />
                  <SuggestionsView
                    suggestions={data.suggestions}
                    predictions={data.predictions}
                    totalGames={data.totalGames}
                  />
                </>
              ) : (
                <div className="py-24 text-center text-slate-600 text-[10px] font-black uppercase tracking-widest">
                  Escolhe uma data e clica em Analisar
                </div>
              )
            )}

            {activeTab === 'players' && canSee('players') && (
              loadedDate && data ? (
                <PlayersView predictions={data.predictions} date={loadedDate} />
              ) : (
                <div className="py-24 text-center text-slate-600 text-[10px] font-black uppercase tracking-widest">
                  Escolhe uma data e clica em Analisar
                </div>
              )
            )}

            {activeTab === 'mypicks' && canSee('mypicks') && (
              loadedDate && data ? (
                <MyPicksView
                  predictions={data.predictions}
                  selectedDate={loadedDate}
                  autoSuggestions={data.suggestions}
                />
              ) : (
                <div className="py-24 text-center text-slate-600 text-[10px] font-black uppercase tracking-widest">
                  Escolhe uma data e clica em Analisar
                </div>
              )
            )}

            {activeTab === 'stats' && canSee('stats') && <StatsView />}
            {activeTab === 'calibration' && canSee('calibration') && <CalibrationView />}
            {activeTab === 'admin' && canSee('admin') && <AdminPanel />}
          </main>
        </>
      )}

      {/* Aviso de nova versão */}
      <UpdateBanner />

      {/* Footer fixo */}
      <footer className="fixed bottom-0 left-0 right-0 bg-black/80 backdrop-blur-md border-t border-white/5 p-4 text-center z-40">
        <p className="text-[8px] text-slate-500 uppercase tracking-[0.4em] font-black">
          NHL Tipsterz &copy; {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  );
};

const App: React.FC = () => (
  <AuthGate>
    <AppMain />
  </AuthGate>
);

export default App;
