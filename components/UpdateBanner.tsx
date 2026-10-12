// components/UpdateBanner.tsx
// Avisa quando há uma versão nova da app (compara o id desta versão com /version.json do servidor).

import React, { useEffect, useState } from 'react';

interface Props {
  /** Só para testes: por omissão recarrega a página. */
  onReload?: () => void;
}

const CHECK_EVERY_MS = 2 * 60 * 1000;

const UpdateBanner: React.FC<Props> = ({ onReload }) => {
  const [available, setAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let active = true;

    const check = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (active && data?.id && data.id !== __BUILD_ID__) setAvailable(true);
      } catch {
        /* sem rede ou em desenvolvimento: ignora */
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };

    check();
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', check);

    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', check);
    };
  }, []);

  const update = async () => {
    try {
      // Limpa o service worker e as caches antigas, para a página nova não ficar presa à versão velha
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      /* mesmo assim recarrega */
    }
    (onReload ?? (() => window.location.reload()))();
  };

  if (!available || dismissed) return null;

  return (
    <div
      role="status"
      className="fixed bottom-16 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-sm z-50 flex items-center gap-3 rounded-2xl border border-orange-500/40 bg-slate-900/95 backdrop-blur-md px-4 py-3 shadow-2xl"
    >
      <span className="flex-1 text-sm font-semibold text-slate-100">Nova versão disponível</span>
      <button
        onClick={update}
        className="rounded-lg bg-orange-600 hover:bg-orange-500 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-white"
      >
        Atualizar
      </button>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Fechar aviso"
        className="text-slate-500 hover:text-slate-300 text-lg leading-none"
      >
        ×
      </button>
    </div>
  );
};

export default UpdateBanner;
