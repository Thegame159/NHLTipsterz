// components/AuthGate.tsx
// Protege a app: sem sessão mostra o login; com sessão mostra o conteúdo e expõe o utilizador (useAuth).

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import BrandLogo from './BrandLogo';
import { IceBackdrop, PuckIntro } from './LoginScene';

export type AuthUser = { username: string; role: 'admin' | 'user' };
type Ctx = { user: AuthUser; logout: () => void };

const AuthContext = createContext<Ctx | null>(null);
export const useAuth = () => useContext(AuthContext);

const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  // Introdução animada antes do formulário (toca para saltar). Com "reduzir movimento" fica só o desvanecer, sem deslocações.
  const [intro, setIntro] = useState(true);
  useEffect(() => {
    if (!intro) return;
    const t = setTimeout(() => setIntro(false), 3500);
    return () => clearTimeout(t);
  }, [intro]);

  useEffect(() => {
    let alive = true;
    fetch('/api/auth?action=me', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((d) => alive && setUser(d?.user ?? null))
      .catch(() => alive && setUser(null))
      .finally(() => alive && setChecking(false));
    return () => { alive = false; };
  }, []);

  const logout = useCallback(() => {
    fetch('/api/auth?action=logout', { method: 'POST' }).finally(() => setUser(null));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/auth?action=login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || 'Não foi possível entrar.');
      setPassword('');
      setUser(d.user);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível entrar.');
    } finally {
      setBusy(false);
    }
  };

  if (checking) return <div className="min-h-screen bg-[#020617]" />;

  if (!user) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[#020617] flex items-center justify-center px-5 py-10">
        <style>{`
                    @keyframes nhl-puck { 0% { transform: translateX(-60vw) scale(.8); opacity: 0; } 10% { opacity: 1; } 100% { transform: translateX(0) scale(1); opacity: 1; } }
          @keyframes nhl-scratch { 0% { transform: translateX(-60vw) scaleX(.1); opacity: 0; } 12% { opacity: 1; } 78% { opacity: .85; } 100% { transform: translateX(0) scaleX(1); opacity: .5; } }
          @keyframes nhl-title { from { letter-spacing: .3em; opacity: 0; filter: blur(6px); } to { letter-spacing: .06em; opacity: 1; filter: blur(0); } }
          @keyframes nhl-fade-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
          @keyframes nhl-fade-out { to { opacity: 0; transform: scale(1.03); } }
          .nhl-puck { animation: nhl-puck 1.15s cubic-bezier(.1,.8,.25,1) .2s both; }
          .nhl-scratch { animation: nhl-scratch 1.15s cubic-bezier(.1,.8,.25,1) .2s both; }
          .nhl-title { animation: nhl-title 1.2s cubic-bezier(.2,.7,.2,1) 1.35s both; }
          .nhl-intro-out { animation: nhl-fade-out .6s ease-in 2.9s forwards; }
          .nhl-form-in { animation: nhl-fade-in .7s cubic-bezier(.2,.7,.2,1) both; }
          @keyframes nhl-soft-in { from { opacity: 0; } to { opacity: 1; } }
          @keyframes nhl-soft-out { to { opacity: 0; } }
          @media (prefers-reduced-motion: reduce) {
            .nhl-puck, .nhl-scratch { animation: none; }
            .nhl-title { animation: nhl-soft-in 1s ease-out .2s both; filter: none; }
            .nhl-intro-out { animation: nhl-soft-out .6s ease-in 2.9s forwards; }
            .nhl-form-in { animation: nhl-soft-in .6s ease-out both; }
          }
          .nhl-field:-webkit-autofill { -webkit-box-shadow: 0 0 0 40px #0b1220 inset; -webkit-text-fill-color: #e2e8f0; caret-color: #e2e8f0; }
        `}</style>

        <IceBackdrop />

        {intro && (
          <div
            onClick={() => setIntro(false)}
            className="nhl-intro-out absolute inset-0 z-10 flex cursor-pointer flex-col items-center justify-center"
            aria-hidden="true"
          >
            <PuckIntro stopAtMs={1350} />
            <div className="nhl-title absolute top-[27%] whitespace-nowrap text-center text-[64px] leading-none text-white drop-shadow-[0_4px_24px_rgba(147,197,253,0.35)] sm:text-[88px]" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
              Bem-vindo
            </div>
            <div className="absolute top-[11%]"><BrandLogo size="sm" /></div>
          </div>
        )}

        {!intro && (
        <main className="nhl-form-in relative w-full max-w-[380px]">
          <div className="flex justify-center mb-8">
            <BrandLogo size="sm" />
          </div>

          <h1 className="text-center text-[40px] leading-none tracking-wide text-white" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
            Inicia sessão
          </h1>
          <p className="mt-3 mb-8 text-center text-sm text-slate-400">Estatísticas e dicas de NHL, todos os dias.</p>

          <form onSubmit={submit} className="rounded-2xl border border-white/10 bg-[#0b1220]/80 p-5 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] backdrop-blur-md sm:p-6">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-400">Utilizador</span>
              <input
                autoFocus
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="nhl-field w-full rounded-xl border border-slate-700/80 bg-[#060b16] px-3.5 py-3 text-[15px] text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/25"
              />
            </label>

            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-400">Palavra-passe</span>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="nhl-field w-full rounded-xl border border-slate-700/80 bg-[#060b16] py-3 pl-3.5 pr-16 text-[15px] text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/25"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-400 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500"
                >
                  {showPw ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </label>

            {error && (
              <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300">
                <span aria-hidden="true" className="mt-px">⚠</span>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy || !username || !password}
              className="mt-6 w-full rounded-xl bg-gradient-to-b from-orange-500 to-orange-600 py-3 text-sm font-bold text-white shadow-[0_8px_24px_-8px_rgba(249,115,22,0.7)] transition hover:from-orange-400 hover:to-orange-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              {busy ? 'A entrar…' : 'Entrar'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-300 [text-shadow:0_1px_8px_#020617,0_0_2px_#020617]">Só com convite. Não tens conta? Pede um link a quem gere o site.</p>
        </main>
        )}
      </div>
    );
  }

  return <AuthContext.Provider value={{ user, logout }}>{children}</AuthContext.Provider>;
};

export default AuthGate;
