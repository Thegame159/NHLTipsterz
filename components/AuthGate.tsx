// components/AuthGate.tsx
// Protege a app: sem sessão mostra o login; com sessão mostra o conteúdo e expõe o utilizador (useAuth).

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import BrandLogo from './BrandLogo';
import { IceBackdrop, PlayerIntro } from './LoginScene';
import RegisterForm from './RegisterForm';

export type AuthUser = { username: string; role: 'admin' | 'user'; modules?: string[] };
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
  const [invite, setInvite] = useState<string | null>(() => {
    try {
      const t = new URLSearchParams(window.location.search).get('convite');
      return t && /^[0-9a-f]{32}$/.test(t) ? t : null;
    } catch {
      return null;
    }
  });
  const leaveInvite = () => {
    setInvite(null);
    try {
      window.history.replaceState(null, '', window.location.pathname);
    } catch {
      /* ignora */
    }
  };
  const [intro, setIntro] = useState(!invite);
  useEffect(() => {
    if (!intro || checking) return; // a contagem só começa quando a abertura está visível
    const t = setTimeout(() => setIntro(false), 2800);
    return () => clearTimeout(t);
  }, [intro, checking]);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      for (let i = 0; i < 2; i++) {
        try {
          const r = await fetch('/api/auth?action=me', { cache: 'no-store' });
          if (r.ok) {
            const d = await r.json();
            if (alive) setUser(d?.user ?? null);
            return;
          }
          if (r.status < 500) break; // 401 etc.: sem sessão, não vale a pena repetir
        } catch {
          /* tenta de novo */
        }
        await new Promise((res) => setTimeout(res, 300));
      }
      if (alive) setUser(null);
    };
    check().finally(() => alive && setChecking(false));
    return () => { alive = false; };
  }, []);

  // Vigia a conta enquanto o site está aberto (de 2 em 2 minutos e ao voltar ao separador):
  // módulos diferentes -> aviso "Conta atualizada"; conta desativada/expirada -> volta ao login.
  const [pending, setPending] = useState<AuthUser | null>(null);
  useEffect(() => {
    if (!user || user.role === 'admin') return;
    let alive = true;
    const same = (a?: string[], b?: string[]) => (a ?? []).length === (b ?? []).length && (a ?? []).every((m) => (b ?? []).includes(m));
    const check = async () => {
      try {
        const r = await fetch('/api/auth?action=me', { cache: 'no-store' });
        if (!r.ok || !alive) return; // falhas de rede/servidor: ignora e tenta mais tarde
        const d = await r.json();
        if (!alive) return;
        if (!d?.user) {
          setPending(null);
          setError('A tua sessão terminou. Inicia sessão de novo.');
          setUser(null);
          return;
        }
        setPending(same(d.user.modules, user.modules) ? null : d.user);
      } catch {
        /* sem rede: ignora */
      }
    };
    const onVisible = () => document.visibilityState === 'visible' && check();
    const timer = window.setInterval(check, 2 * 60 * 1000);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', check);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', check);
    };
  }, [user]);

  const logout = useCallback(() => {
    fetch('/api/auth?action=logout', { method: 'POST' }).finally(() => setUser(null));
  }, []);

  // Só entra com um toque/clique real no botão (ou Enter no teclado). O preenchimento automático e os
  // gestores de palavras-passe que submetem sozinhos geram eventos não genuínos e são ignorados.
  const submit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!e.nativeEvent.isTrusted) return;
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

  if (checking || !user) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[#020617] flex items-center justify-center px-5 py-10">
        <style>{`
                    @keyframes nhl-player { 0% { transform: translateX(-85vw); } 100% { transform: translateX(0); } }
          @keyframes nhl-swing { 0%, 45% { transform: rotate(0deg); } 58% { transform: rotate(-44deg); } 66% { transform: rotate(3deg); } 82%, 100% { transform: rotate(20deg); } }
          @keyframes nhl-puck-appear { from { opacity: 0; } to { opacity: 1; } }
          @keyframes nhl-shot { 0% { transform: translate(0,0) scale(1); opacity: 1; filter: blur(0); } 70% { opacity: 1; } 100% { transform: translate(0,-34vh) scale(11); opacity: 0; filter: blur(2px); } }
          @keyframes nhl-impact { 0% { opacity: 0; } 12% { opacity: .95; } 100% { opacity: 0; } }
          @keyframes nhl-shake { 0%, 100% { transform: translate(0,0); } 20% { transform: translate(-5px,3px); } 40% { transform: translate(4px,-3px); } 60% { transform: translate(-3px,2px); } 80% { transform: translate(2px,-1px); } }
          @keyframes nhl-title { from { letter-spacing: .3em; opacity: 0; filter: blur(8px); } to { letter-spacing: .06em; opacity: 1; filter: blur(0); } }
          @keyframes nhl-fade-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
          @keyframes nhl-fade-out { to { opacity: 0; transform: scale(1.03); } }
          .nhl-player { animation: nhl-player 1s cubic-bezier(.1,.75,.25,1) .1s both; }
          .nhl-swing { animation: nhl-swing 1.75s linear .1s both; }
          .nhl-puck-shot { animation: nhl-puck-appear .2s ease-out both, nhl-shot .34s cubic-bezier(.55,0,1,.7) 1.2s forwards; }
          .nhl-impact { background: radial-gradient(circle at 50% 50%, rgba(255,255,255,.95), rgba(180,215,255,.4) 35%, transparent 65%); opacity: 0; animation: nhl-impact .5s ease-out 1.5s both; }
          .nhl-shake { animation: nhl-shake .22s linear 1.5s both; }
          .nhl-title { animation: nhl-title 1s cubic-bezier(.2,.7,.2,1) 1.55s both; }
          .nhl-intro-out { animation: nhl-fade-out .45s ease-in 2.3s forwards; }
          .nhl-form-in { animation: nhl-fade-in .7s cubic-bezier(.2,.7,.2,1) both; }
          @keyframes nhl-soft-in { from { opacity: 0; } to { opacity: 1; } }
          @keyframes nhl-soft-out { to { opacity: 0; } }
          @media (prefers-reduced-motion: reduce) {
            .nhl-player, .nhl-puck-shot, .nhl-impact, .nhl-shake { display: none; }
            .nhl-title { animation: nhl-soft-in 1s ease-out .2s both; filter: none; }
            .nhl-intro-out { animation: nhl-soft-out .45s ease-in 2.3s forwards; }
            .nhl-form-in { animation: nhl-soft-in .6s ease-out both; }
          }
          .nhl-field:-webkit-autofill { -webkit-box-shadow: 0 0 0 40px #0b1220 inset; -webkit-text-fill-color: #e2e8f0; caret-color: #e2e8f0; }
        `}</style>

        <IceBackdrop />

        {!checking && intro && (
          <div
            onClick={() => setIntro(false)}
            className="nhl-intro-out nhl-shake absolute inset-0 z-10 flex cursor-pointer flex-col items-center justify-center"
            aria-hidden="true"
          >
            <PlayerIntro />
            <div className="nhl-title absolute top-[27%] whitespace-nowrap text-center text-[64px] leading-none text-white drop-shadow-[0_4px_24px_rgba(147,197,253,0.35)] sm:text-[88px]" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
              Bem-vindo
            </div>
            <div className="absolute top-[11%] [&_img]:mix-blend-lighten"><BrandLogo size="sm" /></div>
          </div>
        )}

        {!checking && !intro && (
        <main className="nhl-form-in relative w-full max-w-[380px]">
          <div className="flex justify-center mb-8 [&_img]:mix-blend-lighten">
            <BrandLogo size="sm" />
          </div>

          {invite ? (
            <RegisterForm
              token={invite}
              onDone={(u) => {
                leaveInvite();
                setUser(u);
              }}
              onCancel={leaveInvite}
            />
          ) : (
          <>
          <h1 className="text-center text-[40px] leading-none tracking-wide text-white" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
            Iniciar sessão
          </h1>
          <p className="mt-3 mb-8 text-center text-sm text-slate-400">Estatísticas e dicas de NHL, todos os dias.</p>

          <form onSubmit={(e) => e.preventDefault()} className="rounded-2xl border border-white/10 bg-[#0b1220]/80 p-5 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] backdrop-blur-md sm:p-6">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-400">Utilizador</span>
              <input
                autoFocus
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submit(e); }}
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
                onKeyDown={(e) => { if (e.key === 'Enter') submit(e); }}
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
              type="button"
              onClick={submit}
              disabled={busy || !username || !password}
              className="mt-6 w-full rounded-xl bg-gradient-to-b from-orange-500 to-orange-600 py-3 text-sm font-bold text-white shadow-[0_8px_24px_-8px_rgba(249,115,22,0.7)] transition hover:from-orange-400 hover:to-orange-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              {busy ? 'A entrar…' : 'Entrar'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-300 [text-shadow:0_1px_8px_#020617,0_0_2px_#020617]">Só com convite. Não tens conta? Pede um link a quem gere o site.</p>
          </>
          )}
        </main>
        )}
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, logout }}>
      {children}
      {pending && (
        <div
          role="status"
          className="fixed bottom-32 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-sm z-50 flex items-center gap-3 rounded-2xl border border-orange-500/40 bg-slate-900/95 backdrop-blur-md px-4 py-3 shadow-2xl"
        >
          <span className="flex-1 text-sm font-semibold text-slate-100">
            Conta atualizada
            <span className="block text-[11px] font-normal text-slate-400">Os teus separadores mudaram.</span>
          </span>
          <button
            onClick={() => {
              setUser(pending);
              setPending(null);
            }}
            className="rounded-lg bg-orange-600 hover:bg-orange-500 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-white"
          >
            Atualizar
          </button>
        </div>
      )}
    </AuthContext.Provider>
  );
};

export default AuthGate;
