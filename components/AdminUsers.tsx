// components/AdminUsers.tsx
// Gestão de utilizadores no painel de admin: lista com pesquisa à esquerda; à direita o utilizador
// escolhido com os sub-separadores "Dados" (acesso, sessões, palavra-passe) e "Módulos".
// No telemóvel: lista → toque → detalhe (com botão para voltar).

import React, { useEffect, useMemo, useState } from 'react';

export type UserRow = {
  username: string;
  createdAt: number;
  disabled: boolean;
  modules: string[];
  accessUntil: string | null; // AAAA-MM-DD (inclusive) ou null = sem limite
  expired: boolean;
  lastLogin: number | null;
  activeSessions: number;
};

// Mesma ordem e nomes dos separadores da app
export const MODULES: { key: string; label: string }[] = [
  { key: 'schedule', label: 'Jogos' },
  { key: 'suggestions', label: 'Dicas' },
  { key: 'players', label: 'Jogadores' },
  { key: 'mypicks', label: 'Minhas Picks' },
  { key: 'stats', label: 'Stats' },
  { key: 'calibration', label: 'Calibração' },
];

type Api = (action: string, method?: string, body?: unknown) => Promise<any>;

const fmtDateTime = (ms: number | null) =>
  ms ? new Date(ms).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Nunca';
const fmtDay = (d: string) => d.split('-').reverse().join('/');
const ago = (ms: number | null) => {
  if (!ms) return 'nunca entrou';
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 60) return `há ${Math.max(1, m)} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
};

const status = (u: UserRow) =>
  u.disabled
    ? { dot: 'bg-red-500', text: 'Desativado', cls: 'text-red-300' }
    : u.expired
      ? { dot: 'bg-amber-500', text: 'Acesso expirado', cls: 'text-amber-300' }
      : { dot: 'bg-emerald-500', text: 'Ativo', cls: 'text-emerald-300' };

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="rounded-xl border border-white/10 bg-zinc-900/60 p-3">
    <h4 className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-500">{title}</h4>
    {children}
  </section>
);

const smallBtn =
  'rounded-lg bg-zinc-800 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider hover:bg-zinc-700 disabled:opacity-50';

const AdminUsers: React.FC<{
  users: UserRow[];
  setUsers: React.Dispatch<React.SetStateAction<UserRow[]>>;
  loading: boolean;
  api: Api;
  reload: () => Promise<void>;
  onError: (msg: string | null) => void;
}> = ({ users, setUsers, loading, api, reload, onError }) => {
  const [query, setQuery] = useState('');
  const [selName, setSelName] = useState<string | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [sub, setSub] = useState<'dados' | 'modulos'>('dados');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newPw, setNewPw] = useState<{ user: string; pw: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<string[] | null>(null); // módulos por gravar do utilizador escolhido

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? users.filter((u) => u.username.includes(q)) : users;
  }, [users, query]);
  const sel = users.find((u) => u.username === selName) ?? filtered[0] ?? null;

  useEffect(() => {
    setNotice(null);
    setCopied(false);
  }, [sel?.username, sub]);

  const patch = (name: string, p: Partial<UserRow>) =>
    setUsers((list) => list.map((x) => (x.username === name ? { ...x, ...p } : x)));

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    onError(null);
    try {
      await fn();
    } catch (e: any) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // Módulos: muda só o rascunho; grava-se com o botão 💾
  const toggleDraft = (u: UserRow, mod: string) => {
    const cur = draft ?? u.modules;
    const next = cur.includes(mod) ? cur.filter((m) => m !== mod) : [...cur, mod];
    const same = next.length === u.modules.length && next.every((m) => u.modules.includes(m));
    setDraft(same ? null : next);
    setNotice(null);
  };

  const saveModules = async (u: UserRow) => {
    if (!draft) return;
    setSaving(true);
    onError(null);
    try {
      const r = await api('user-modules', 'POST', { username: u.username, modules: draft });
      patch(u.username, { modules: r.modules ?? draft });
      setDraft(null);
      setNotice('Módulos gravados. A pessoa vê a mudança quando recarregar o site.');
    } catch (e: any) {
      onError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Ao mudar de utilizador com alterações por gravar, pergunta antes
  const pick = (name: string) => {
    if (draft && name !== sel?.username && !window.confirm('Tens alterações aos módulos por gravar. Sair sem gravar?')) return false;
    setDraft(null);
    setSelName(name);
    return true;
  };

  const setExpiry = (u: UserRow, accessUntil: string | null) =>
    run(async () => {
      const r = await api('user-expiry', 'POST', { username: u.username, accessUntil });
      patch(u.username, { accessUntil: r.accessUntil, expired: r.expired, ...(r.expired ? { activeSessions: 0 } : {}) });
      setNotice(accessUntil ? `Acesso válido até ${fmtDay(accessUntil)}.` : 'Acesso sem data de fim.');
    });

  const resetPassword = (u: UserRow) =>
    run(async () => {
      if (!window.confirm(`Gerar uma palavra-passe nova para ${u.username}? A atual deixa de funcionar e a sessão dele termina.`)) return;
      const r = await api('user-reset-password', 'POST', { username: u.username });
      setNewPw({ user: u.username, pw: r.password });
      patch(u.username, { activeSessions: 0 });
    });

  const endSessions = (u: UserRow) =>
    run(async () => {
      const r = await api('user-logout', 'POST', { username: u.username });
      patch(u.username, { activeSessions: 0 });
      setNotice(r.ended ? 'Sessão terminada.' : 'Não tinha nenhuma sessão aberta.');
    });

  const toggleDisabled = (u: UserRow) =>
    run(async () => {
      await api('user-disable', 'POST', { username: u.username, disabled: !u.disabled });
      await reload();
    });

  const copyPw = async () => {
    if (!newPw) return;
    try {
      await navigator.clipboard.writeText(newPw.pw);
    } catch {
      window.prompt('Copia a palavra-passe:', newPw.pw);
    }
    setCopied(true);
  };

  if (loading) return <p className="py-6 text-center text-xs text-slate-500">A carregar…</p>;
  if (users.length === 0)
    return (
      <p className="rounded-xl border border-dashed border-white/10 py-6 text-center text-xs text-slate-500">
        Ainda ninguém se registou. Cria um convite no separador Convites.
      </p>
    );

  const list = (
    <div className={`${mobileDetail ? 'hidden' : 'block'} sm:block sm:w-[34%] sm:shrink-0`}>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Pesquisar…"
        autoCapitalize="none"
        className="mb-2 w-full rounded-lg border border-white/10 bg-[#060b16] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-orange-500"
      />
      <ul className="space-y-1.5">
        {filtered.length === 0 && <li className="py-4 text-center text-xs text-slate-500">Nenhum resultado.</li>}
        {filtered.map((u) => {
          const st = status(u);
          const active = sel?.username === u.username;
          return (
            <li key={u.username}>
              <button
                onClick={() => {
                  if (!pick(u.username)) return;
                  setMobileDetail(true);
                  setNewPw(null);
                }}
                className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition ${
                  active ? 'sm:border-orange-500/60 sm:bg-orange-600/15 border-white/10 bg-zinc-900/60' : 'border-white/10 bg-zinc-900/60 hover:bg-zinc-800/80'
                }`}
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${st.dot}`} title={st.text} />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm font-bold ${u.disabled ? 'text-slate-500 line-through' : 'text-white'}`}>{u.username}</span>
                  <span className="block text-[10px] text-slate-500">
                    {u.modules.length}/{MODULES.length} módulos · {ago(u.lastLogin)}
                  </span>
                </span>
                <span className="text-slate-600 sm:hidden">›</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );

  if (!sel) return list;
  const st = status(sel);

  const detail = (
    <div className={`${mobileDetail ? 'block' : 'hidden'} min-w-0 flex-1 sm:block`}>
      <button
        onClick={() => {
          if (draft && !window.confirm('Tens alterações aos módulos por gravar. Sair sem gravar?')) return;
          setDraft(null);
          setMobileDetail(false);
        }}
        className="mb-2 text-xs font-semibold text-orange-400 sm:hidden"
      >
        ‹ Utilizadores
      </button>

      {/* Cabeçalho do utilizador */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-base font-black text-white">{sel.username}</p>
          <p className={`text-[11px] font-semibold ${st.cls}`}>
            <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${st.dot}`} />
            {st.text}
          </p>
        </div>
        <button onClick={() => toggleDisabled(sel)} disabled={busy} className={`${smallBtn} ${sel.disabled ? 'text-emerald-300' : 'text-red-300'}`}>
          {sel.disabled ? 'Reativar' : 'Desativar'}
        </button>
      </div>

      {/* Sub-separadores */}
      <div className="mb-3 flex gap-4 border-b border-white/10">
        {(
          [
            ['dados', 'Dados'],
            ['modulos', `Módulos (${sel.modules.length})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setSub(id)}
            className={`-mb-px border-b-2 pb-2 text-xs font-bold transition ${
              sub === id ? 'border-orange-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {notice && <p className="mb-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">{notice}</p>}

      {sub === 'dados' && (
        <div className="space-y-3">
          <Section title="Atividade">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-slate-500">Registado</dt>
              <dd className="text-slate-200">{fmtDateTime(sel.createdAt)}</dd>
              <dt className="text-slate-500">Último acesso</dt>
              <dd className="text-slate-200">{fmtDateTime(sel.lastLogin)}</dd>
              <dt className="text-slate-500">Sessão</dt>
              <dd className={sel.activeSessions ? 'text-emerald-300' : 'text-slate-400'}>
                {sel.activeSessions ? `Aberta${sel.activeSessions > 1 ? ` (${sel.activeSessions})` : ''}` : 'Nenhuma aberta'}
              </dd>
            </dl>
            <button onClick={() => endSessions(sel)} disabled={busy || !sel.activeSessions} className={`${smallBtn} mt-3 text-slate-200`}>
              Terminar sessão
            </button>
          </Section>

          <Section title="Validade do acesso">
            <p className="mb-2 text-xs text-slate-300">
              {sel.accessUntil ? (
                <>
                  Válido até <b className="text-white">{fmtDay(sel.accessUntil)}</b>
                  {sel.expired ? <span className="text-amber-300"> (expirado)</span> : ''}
                </>
              ) : (
                'Sem data de fim.'
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={sel.accessUntil ?? ''}
                onChange={(e) => e.target.value && setExpiry(sel, e.target.value)}
                disabled={busy}
                className="rounded-lg border border-white/10 bg-[#060b16] px-2 py-1.5 text-xs text-slate-100 [color-scheme:dark]"
              />
              {sel.accessUntil && (
                <button onClick={() => setExpiry(sel, null)} disabled={busy} className={`${smallBtn} text-slate-200`}>
                  Sem limite
                </button>
              )}
            </div>
            <p className="mt-2 text-[10px] text-slate-500">Depois desse dia a conta deixa de entrar e a sessão termina.</p>
          </Section>

          <Section title="Palavra-passe">
            {newPw?.user === sel.username ? (
              <div className="rounded-lg border border-orange-500/40 bg-orange-500/10 p-2.5">
                <p className="text-[10px] text-slate-400">Nova palavra-passe (só aparece agora):</p>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 select-all break-all font-mono text-sm text-white">{newPw.pw}</code>
                  <button onClick={copyPw} className={`${smallBtn} text-white`}>
                    {copied ? 'Copiado ✓' : 'Copiar'}
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => resetPassword(sel)} disabled={busy} className={`${smallBtn} text-orange-300`}>
                Repor palavra-passe
              </button>
            )}
            <p className="mt-2 text-[10px] text-slate-500">Gera uma temporária para enviares à pessoa. A anterior deixa de funcionar.</p>
          </Section>
        </div>
      )}

      {sub === 'modulos' && (() => {
        const mods = draft ?? sel.modules;
        return (
          <Section title="Separadores que vê">
            <ul className="space-y-0.5">
              {MODULES.map((m) => {
                const on = mods.includes(m.key);
                const changed = on !== sel.modules.includes(m.key);
                return (
                  <li key={m.key}>
                    <button
                      onClick={() => toggleDraft(sel, m.key)}
                      disabled={saving}
                      role="switch"
                      aria-checked={on}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-1.5 py-2 text-left hover:bg-white/5"
                    >
                      <span className={`text-[13px] font-bold ${on ? 'text-white' : 'text-slate-500'}`}>
                        {m.label}
                        {changed && <span className="ml-1.5 text-orange-400" title="Alterado, por gravar">•</span>}
                      </span>
                      <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${on ? 'bg-orange-600' : 'bg-zinc-700'}`}>
                        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {mods.length === 0 && <p className="mt-2 text-[10px] text-amber-400">Sem módulos: entra mas não vê nada.</p>}

            <div className="mt-3 flex items-center gap-2 border-t border-white/10 pt-3">
              <button
                onClick={() => saveModules(sel)}
                disabled={!draft || saving}
                className="flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-2 text-[11px] font-black uppercase tracking-wider text-white hover:bg-orange-500 disabled:bg-zinc-800 disabled:text-slate-500"
              >
                <span aria-hidden="true">💾</span>
                {saving ? 'A gravar…' : 'Gravar'}
              </button>
              {draft && (
                <button onClick={() => setDraft(null)} disabled={saving} className={`${smallBtn} text-slate-300`}>
                  Anular
                </button>
              )}
              <span className="ml-auto text-[10px] text-slate-500">{draft ? 'Alterações por gravar' : 'Sem alterações'}</span>
            </div>
          </Section>
        );
      })()}
    </div>
  );

  return (
    <div className="sm:flex sm:gap-4">
      {list}
      {detail}
    </div>
  );
};

export default AdminUsers;
