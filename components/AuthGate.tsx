// components/AuthGate.tsx
// Protege a app: sem sessão mostra o login; com sessão mostra o conteúdo e expõe o utilizador (useAuth).

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import BrandLogo from './BrandLogo';

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
      <div className="min-h-screen bg-[#020617] flex items-center justify-center p-4">
        <form onSubmit={submit} className="w-full max-w-sm bg-slate-900/70 border border-white/10 rounded-2xl p-6 space-y-4">
          <div className="flex justify-center -mb-2">
            <BrandLogo size="sm" />
          </div>
          <h1 className="text-center text-sm font-black uppercase tracking-widest text-slate-300">Entrar</h1>
          <input
            autoFocus
            autoComplete="username"
            autoCapitalize="none"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Utilizador"
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-orange-500"
          />
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Palavra-passe"
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-orange-500"
          />
          {error && <p className="text-xs font-bold text-red-400 text-center">{error}</p>}
          <button
            type="submit"
            disabled={busy || !username || !password}
            className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-black py-2.5 rounded-lg text-xs uppercase tracking-wider transition"
          >
            {busy ? 'A entrar…' : 'Entrar'}
          </button>
        </form>
      </div>
    );
  }

  return <AuthContext.Provider value={{ user, logout }}>{children}</AuthContext.Provider>;
};

export default AuthGate;
