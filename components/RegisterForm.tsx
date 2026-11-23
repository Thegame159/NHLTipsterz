// components/RegisterForm.tsx
// Registo por convite (link ?convite=...). Utilizador + palavra-passe, nada mais.

import React, { useEffect, useState } from 'react';
import type { AuthUser } from './AuthGate';

const field =
  'nhl-field w-full rounded-xl border border-slate-700/80 bg-[#060b16] px-3.5 py-3 text-[15px] text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/25';

const RegisterForm: React.FC<{ token: string; onDone: (u: AuthUser) => void; onCancel: () => void }> = ({ token, onDone, onCancel }) => {
  const [valid, setValid] = useState<boolean | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/auth?action=invite-check&token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((j) => alive && setValid(!!j.valid))
      .catch(() => alive && setValid(true)); // sem rede: deixa tentar; o servidor valida
    return () => {
      alive = false;
    };
  }, [token]);

  const submit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!e.nativeEvent.isTrusted || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/auth?action=register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, username, password }),
        credentials: 'same-origin',
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || 'Não foi possível criar a conta.');
      if (j.user) onDone(j.user);
      else onCancel(); // conta criada mas sem sessão: segue para o login
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (valid === false) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#0b1220]/80 p-6 text-center backdrop-blur-md">
        <h1 className="text-[34px] leading-none text-white" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
          Convite inválido
        </h1>
        <p className="mt-3 text-sm text-slate-400">Este link já foi usado, foi cancelado ou expirou. Pede um novo a quem gere o site.</p>
        <button onClick={onCancel} className="mt-5 w-full rounded-xl bg-zinc-800 py-3 text-sm font-bold text-white hover:bg-zinc-700">
          Ir para o login
        </button>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-center text-[40px] leading-none tracking-wide text-white" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
        Cria a tua conta
      </h1>
      <p className="mt-3 mb-8 text-center text-sm text-slate-400">Foste convidado. Escolhe um utilizador e uma palavra-passe.</p>

      <form onSubmit={(e) => e.preventDefault()} className="rounded-2xl border border-white/10 bg-[#0b1220]/80 p-5 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] backdrop-blur-md sm:p-6">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-400">Utilizador</span>
          <input
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={field}
          />
          <span className="mt-1 block text-[11px] text-slate-500">3 a 24 caracteres: letras, números, ponto, _ ou -</span>
        </label>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-400">Palavra-passe</span>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit(e);
              }}
              className={`${field} pr-16`}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-400 hover:text-white"
            >
              {showPw ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
          <span className="mt-1 block text-[11px] text-slate-500">Mínimo 8 caracteres.</span>
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
          disabled={busy || valid === null || !username || password.length < 8}
          className="mt-6 w-full rounded-xl bg-gradient-to-b from-orange-500 to-orange-600 py-3 text-sm font-bold text-white shadow-[0_8px_24px_-8px_rgba(249,115,22,0.7)] transition hover:from-orange-400 hover:to-orange-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          {busy ? 'A criar…' : 'Criar conta'}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-slate-300 [text-shadow:0_1px_8px_#020617,0_0_2px_#020617]">
        Já tens conta?{' '}
        <button onClick={onCancel} className="font-semibold text-orange-400 underline">
          Iniciar sessão
        </button>
      </p>
    </>
  );
};

export default RegisterForm;
