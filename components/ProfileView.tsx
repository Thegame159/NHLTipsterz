// components/ProfileView.tsx
// Separador "Perfil": avatar, dados da conta e mudança da palavra-passe. Disponível para todos.

import React, { useState } from 'react';
import { useAuth } from './AuthGate';
import Avatar, { AVATARS, JERSEY_COLORS, parseAvatar } from './Avatar';

const post = async (action: string, body: unknown) => {
  const r = await fetch(`/api/auth?action=${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'same-origin',
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || 'Erro inesperado.');
  return j;
};

const fmtDay = (d: string) => d.split('-').reverse().join('/');

const card = 'rounded-2xl border border-white/10 bg-[#0b1220] p-5';
const h3 = 'mb-3 text-[10px] font-black uppercase tracking-wider text-slate-500';
const field =
  'w-full rounded-xl border border-slate-700/80 bg-[#060b16] px-3.5 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/25';

const ProfileView: React.FC = () => {
  const auth = useAuth();
  const user = auth?.user;
  const initial = parseAvatar(user?.avatar);
  const [kind, setKind] = useState(initial?.kind ?? 'jersey');
  const [num, setNum] = useState(initial?.num ?? '9');
  const [color, setColor] = useState(initial?.color ?? 'red');
  const [savingAv, setSavingAv] = useState(false);
  const [avMsg, setAvMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [nw2, setNw2] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!auth || !user) return null;
  const isAdmin = user.role === 'admin';
  const isJersey = kind === 'jersey';
  const idFor = (k: string) => (k === 'jersey' ? `jersey-${color}-${num || '0'}` : `${k}-${color}`);
  const chosen = idFor(kind);
  const dirty = chosen !== (user.avatar ?? '');

  const saveAvatar = async () => {
    setSavingAv(true);
    setAvMsg(null);
    try {
      const r = await post('profile-avatar', { avatar: chosen });
      auth.update({ avatar: r.avatar });
      setAvMsg({ ok: true, text: 'Avatar gravado.' });
    } catch (e: any) {
      setAvMsg({ ok: false, text: e.message });
    } finally {
      setSavingAv(false);
    }
  };

  const changePw = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    if (nw !== nw2) return setPwMsg({ ok: false, text: 'As duas palavras-passe novas não são iguais.' });
    setSavingPw(true);
    try {
      await post('change-password', { current: cur, next: nw });
      setCur('');
      setNw('');
      setNw2('');
      setPwMsg({ ok: true, text: 'Palavra-passe mudada. Usa a nova no próximo login.' });
    } catch (err: any) {
      setPwMsg({ ok: false, text: err.message });
    } finally {
      setSavingPw(false);
    }
  };

  const msg = (m: { ok: boolean; text: string } | null) =>
    m && (
      <p
        role={m.ok ? 'status' : 'alert'}
        className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
          m.ok ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' : 'border-red-500/25 bg-red-500/10 text-red-300'
        }`}
      >
        {m.text}
      </p>
    );

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* Cabeçalho do perfil */}
      <div className={`${card} flex items-center gap-4`}>
        <Avatar avatar={user.avatar} name={user.username} size={64} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-black text-white">{user.username}</p>
          <p className="text-xs text-slate-400">
            {isAdmin ? 'Administrador' : 'Utilizador'}
            {!isAdmin && (user.accessUntil ? ` · acesso válido até ${fmtDay(user.accessUntil)}` : ' · acesso sem data de fim')}
          </p>
        </div>
        <button
          onClick={auth.logout}
          className="shrink-0 rounded-lg border border-white/10 bg-zinc-800 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-300 hover:bg-zinc-700"
        >
          Sair
        </button>
      </div>

      {/* Avatar */}
      <div className={card}>
        <h3 className={h3}>Avatar</h3>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex flex-col items-center gap-2 sm:w-28">
            <Avatar avatar={chosen} name={user.username} size={88} />
            <span className="text-[10px] text-slate-500">Pré-visualização</span>
          </div>
          <div className="flex-1 space-y-4">
            <div>
              <p className="mb-2 text-xs font-semibold text-slate-400">Escolhe um avatar</p>
              <div className="grid grid-cols-4 gap-2">
                {AVATARS.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setKind(g.id)}
                    aria-pressed={kind === g.id}
                    title={g.label}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border py-2.5 transition ${
                      kind === g.id ? 'border-orange-500/70 bg-orange-600/15' : 'border-white/10 bg-zinc-900/60 hover:bg-zinc-800'
                    }`}
                  >
                    <Avatar avatar={idFor(g.id)} name={user.username} size={48} />
                    <span className="text-[10px] text-slate-400">{g.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-5">
              {isJersey && (
                <div>
                  <p className="mb-2 text-xs font-semibold text-slate-400">Número</p>
                  <input
                    inputMode="numeric"
                    value={num}
                    onChange={(e) => setNum(e.target.value.replace(/\D/g, '').slice(0, 2))}
                    placeholder="0–99"
                    className="w-20 rounded-xl border border-slate-700/80 bg-[#060b16] px-3 py-2 text-center text-lg font-black text-white outline-none focus:border-orange-500"
                  />
                </div>
              )}
                <div>
                  <p className="mb-2 text-xs font-semibold text-slate-400">{isJersey ? 'Cor da camisola' : 'Cor'}</p>
                  <div className="flex flex-wrap gap-2.5">
                    {JERSEY_COLORS.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setColor(c.id)}
                        aria-pressed={color === c.id}
                        aria-label={c.label}
                        title={c.label}
                        className={`h-8 w-8 rounded-full ring-1 ring-white/20 transition ${
                          color === c.id ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0b1220]' : 'opacity-80 hover:opacity-100'
                        }`}
                        style={{ background: `linear-gradient(135deg, ${c.c[0]}, ${c.c[2]})` }}
                      />
                    ))}
                  </div>
                </div>
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 border-t border-white/10 pt-4">
          <button
            onClick={saveAvatar}
            disabled={!dirty || savingAv}
            className="flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-2 text-[11px] font-black uppercase tracking-wider text-white hover:bg-orange-500 disabled:bg-zinc-800 disabled:text-slate-500"
          >
            <span aria-hidden="true">💾</span>
            {savingAv ? 'A gravar…' : 'Gravar'}
          </button>
          <span className="ml-auto text-[10px] text-slate-500">{dirty ? 'Alterações por gravar' : 'Sem alterações'}</span>
        </div>
        {msg(avMsg)}
      </div>

      {/* Palavra-passe */}
      <div className={card}>
        <h3 className={h3}>Palavra-passe</h3>
        {isAdmin ? (
          <p className="text-xs text-slate-400">
            A palavra-passe do administrador está na Vercel, em Settings → Environment Variables (<code className="text-slate-300">ADMIN_PASSWORD</code>).
          </p>
        ) : (
          <form onSubmit={changePw} className="space-y-3">
            <input type="password" autoComplete="current-password" placeholder="Palavra-passe atual" value={cur} onChange={(e) => setCur(e.target.value)} className={field} />
            <input type="password" autoComplete="new-password" placeholder="Nova palavra-passe (mínimo 8)" value={nw} onChange={(e) => setNw(e.target.value)} className={field} />
            <input type="password" autoComplete="new-password" placeholder="Repetir a nova palavra-passe" value={nw2} onChange={(e) => setNw2(e.target.value)} className={field} />
            <button
              type="submit"
              disabled={savingPw || !cur || nw.length < 8 || !nw2}
              className="flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-2 text-[11px] font-black uppercase tracking-wider text-white hover:bg-orange-500 disabled:bg-zinc-800 disabled:text-slate-500"
            >
              <span aria-hidden="true">💾</span>
              {savingPw ? 'A mudar…' : 'Mudar palavra-passe'}
            </button>
          </form>
        )}
        {msg(pwMsg)}
      </div>
    </div>
  );
};

export default ProfileView;
