// components/AdminPanel.tsx
// Separador de administração (só para o administrador): convites e utilizadores.

import React, { useCallback, useEffect, useState } from 'react';
import AdminUsers, { type UserRow } from './AdminUsers';

type Invite = { token: string; createdAt: number; expiresAt: number };
type InviteRequest = { id: string; name: string; contact: string; message?: string; createdAt: number };
const api = async (action: string, method = 'GET', body?: unknown) => {
  const r = await fetch(`/api/auth?action=${action}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || j?.message || 'Erro inesperado.');
  return j;
};

const inviteUrl = (token: string) => `${window.location.origin}/?convite=${token}`;
const fmtDate = (ms: number) =>
  ms ? new Date(ms).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const daysLeft = (ms: number) => Math.max(0, Math.ceil((ms - Date.now()) / 86400000));

const AdminPanel: React.FC = () => {
  const [tab, setTab] = useState<'requests' | 'invites' | 'users'>('requests');
  const [requests, setRequests] = useState<InviteRequest[]>([]);
  const [accepted, setAccepted] = useState<{ name: string; contact: string; token: string } | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null); // convite acabado de criar

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [i, u, q] = await Promise.all([api('invites'), api('users'), api('requests')]);
      setInvites(i.invites ?? []);
      setUsers(u.users ?? []);
      setRequests(q.requests ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const copy = async (token: string) => {
    const url = inviteUrl(token);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt('Copia o link:', url);
    }
    setCopied(token);
    setTimeout(() => setCopied((c) => (c === token ? null : c)), 2000);
  };

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const createInvite = () =>
    act(async () => {
      const inv = await api('invite-create', 'POST', {});
      setFresh(inv.token);
      await load();
      copy(inv.token);
    });

  const acceptRequest = (r: InviteRequest) =>
    act(async () => {
      const inv = await api('request-accept', 'POST', { id: r.id });
      setAccepted({ name: r.name, contact: r.contact, token: inv.token });
      setFresh(inv.token);
      await load();
      copy(inv.token);
    });

  const rejectRequest = (r: InviteRequest) =>
    act(async () => {
      if (!window.confirm(`Recusar o pedido de ${r.name}?`)) return;
      await api('request-reject', 'POST', { id: r.id });
      await load();
    });

  const cancelInvite = (token: string) =>
    act(async () => {
      await api('invite-cancel', 'POST', { token });
      if (fresh === token) setFresh(null);
      await load();
    });

  const tabBtn = (id: 'requests' | 'invites' | 'users', label: string, n?: number) => (
    <button
      onClick={() => setTab(id)}
      className={`flex-1 rounded-lg py-2 text-[11px] font-black uppercase tracking-wider transition ${
        tab === id ? 'bg-orange-600 text-white' : 'bg-zinc-800 text-slate-400 hover:text-white'
      }`}
    >
      {label} {n !== undefined && <span className="opacity-70">({n})</span>}
    </button>
  );

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-col rounded-2xl border border-white/10 bg-[#0b1220] shadow-2xl">
        <div className="border-b border-white/10 px-5 py-4">
          <h2 className="text-base font-black text-white">Administração</h2>
          <p className="text-[11px] text-slate-500">Convites, utilizadores e o que cada um pode ver.</p>
        </div>

        <div className="flex gap-2 px-5 pt-4">
          {tabBtn('requests', 'Pedidos', requests.length)}
          {tabBtn('invites', 'Convites', invites.length)}
          {tabBtn('users', 'Utilizadores', users.length)}
        </div>

        <div className="px-5 py-4">
          {error && (
            <p role="alert" className="mb-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300">
              {error}
            </p>
          )}

          {tab === 'requests' && (
            <>
              {accepted && (
                <div className="mb-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
                  Convite criado para <b>{accepted.name}</b> e link copiado. Envia-o para <b>{accepted.contact}</b>.
                  <div className="mt-2 flex items-center gap-2">
                    <code className="flex-1 truncate rounded bg-black/30 px-2 py-1 text-[11px] text-white">{inviteUrl(accepted.token)}</code>
                    <button
                      onClick={() => copy(accepted.token)}
                      className="shrink-0 rounded-lg bg-zinc-800 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-white hover:bg-zinc-700"
                    >
                      {copied === accepted.token ? 'Copiado ✓' : 'Copiar'}
                    </button>
                  </div>
                </div>
              )}
              <ul className="space-y-2">
                {loading && <li className="py-4 text-center text-xs text-slate-500">A carregar…</li>}
                {!loading && requests.length === 0 && (
                  <li className="rounded-xl border border-dashed border-white/10 py-6 text-center text-xs text-slate-500">
                    Sem pedidos de convite. Aparecem aqui quando alguém carrega em "Solicitar convite" no login.
                  </li>
                )}
                {requests.map((r) => (
                  <li key={r.id} className="rounded-xl border border-white/10 bg-zinc-900/60 px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-white">{r.name}</p>
                        <p className="truncate text-[11px] text-slate-400">
                          {r.contact} · {fmtDate(r.createdAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          onClick={() => acceptRequest(r)}
                          disabled={busy}
                          className="rounded-lg bg-orange-600 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-white hover:bg-orange-500 disabled:opacity-50"
                        >
                          Criar convite
                        </button>
                        <button
                          onClick={() => rejectRequest(r)}
                          disabled={busy}
                          className="rounded-lg bg-zinc-800 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-red-300 hover:bg-zinc-700 disabled:opacity-50"
                        >
                          Recusar
                        </button>
                      </div>
                    </div>
                    {r.message && <p className="mt-2 text-xs text-slate-300">{r.message}</p>}
                  </li>
                ))}
              </ul>
            </>
          )}

          {tab === 'invites' && (
            <>
              <button
                onClick={createInvite}
                disabled={busy}
                className="w-full rounded-xl bg-gradient-to-b from-orange-500 to-orange-600 py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                {busy ? 'A criar…' : 'Criar convite'}
              </button>
              <p className="mt-2 text-[11px] text-slate-400">
                Cada link serve para um registo e fica válido 7 dias. Envia-o à pessoa por mensagem.
              </p>

              <ul className="mt-4 space-y-2">
                {loading && <li className="py-4 text-center text-xs text-slate-500">A carregar…</li>}
                {!loading && invites.length === 0 && (
                  <li className="rounded-xl border border-dashed border-white/10 py-6 text-center text-xs text-slate-500">
                    Sem convites pendentes.
                  </li>
                )}
                {invites.map((inv) => (
                  <li
                    key={inv.token}
                    className={`rounded-xl border px-3 py-2.5 ${fresh === inv.token ? 'border-orange-500/50 bg-orange-500/5' : 'border-white/10 bg-zinc-900/60'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-[11px] text-slate-300">…{inv.token.slice(-8)}</p>
                        <p className="text-[10px] text-slate-500">
                          Criado {fmtDate(inv.createdAt)} · expira em {daysLeft(inv.expiresAt)} d
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          onClick={() => copy(inv.token)}
                          className="rounded-lg bg-zinc-800 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-white hover:bg-zinc-700"
                        >
                          {copied === inv.token ? 'Copiado ✓' : 'Copiar link'}
                        </button>
                        <button
                          onClick={() => cancelInvite(inv.token)}
                          disabled={busy}
                          className="rounded-lg bg-zinc-800 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-red-300 hover:bg-zinc-700 disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {tab === 'users' && (
            <AdminUsers users={users} setUsers={setUsers} loading={loading} api={api} reload={load} onError={setError} />
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
