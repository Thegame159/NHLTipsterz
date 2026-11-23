// components/RequestInviteForm.tsx
// Pedido de convite a partir do ecrã de login. O pedido aparece em Admin → Pedidos.

import React, { useState } from 'react';

const TELEGRAM_URL = 'https://t.me/eusouofabio';

const field =
  'nhl-field w-full rounded-xl border border-slate-700/80 bg-[#060b16] px-3.5 py-3 text-[15px] text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/25';

const RequestInviteForm: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/auth?action=invite-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, contact, message }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || 'Não foi possível enviar o pedido.');
      setSent(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const telegram = (
    <p className="mt-5 text-center text-xs text-slate-300 [text-shadow:0_1px_8px_#020617,0_0_2px_#020617]">
      Ou fala comigo no{' '}
      <a href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-sky-400 underline">
        Telegram (@eusouofabio)
      </a>
    </p>
  );

  if (sent) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#0b1220]/80 p-6 text-center backdrop-blur-md">
        <h1 className="text-[34px] leading-none text-white" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
          Pedido enviado
        </h1>
        <p className="mt-3 text-sm text-slate-400">Quando for aprovado, recebes o link do convite pelo contacto que deixaste.</p>
        <button onClick={onBack} className="mt-5 w-full rounded-xl bg-zinc-800 py-3 text-sm font-bold text-white hover:bg-zinc-700">
          Voltar ao login
        </button>
        {telegram}
      </div>
    );
  }

  return (
    <>
      <h1 className="text-center text-[40px] leading-none tracking-wide text-white" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
        Pedir acesso
      </h1>
      <p className="mt-3 mb-8 text-center text-sm text-slate-400">Deixa os teus dados e envio-te um convite.</p>

      <form
        onSubmit={submit}
        className="rounded-2xl border border-white/10 bg-[#0b1220]/80 p-5 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] backdrop-blur-md sm:p-6"
      >
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-400">Nome</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="name" className={field} />
        </label>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-400">Contacto</span>
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            maxLength={80}
            placeholder="@utilizador do Telegram ou email"
            autoCapitalize="none"
            className={field}
          />
        </label>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-400">Mensagem (opcional)</span>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={300} rows={3} className={`${field} resize-none`} />
        </label>

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || name.trim().length < 2 || contact.trim().length < 3}
          className="mt-6 w-full rounded-xl bg-gradient-to-b from-orange-500 to-orange-600 py-3 text-sm font-bold text-white shadow-[0_8px_24px_-8px_rgba(249,115,22,0.7)] transition hover:from-orange-400 hover:to-orange-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          {busy ? 'A enviar…' : 'Enviar pedido'}
        </button>
      </form>

      {telegram}
      <p className="mt-3 text-center text-xs">
        <button onClick={onBack} className="font-semibold text-orange-400 underline">
          ‹ Voltar ao login
        </button>
      </p>
    </>
  );
};

export default RequestInviteForm;
