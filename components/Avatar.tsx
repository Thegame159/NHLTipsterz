// components/Avatar.tsx
// Avatares ilustrados de hóquei (desenhos próprios, sem logótipos da NHL nem das equipas).
// Ids: "mask", "puck", "helmet", "skate", "sticks", "lamp", "cup" e "jersey-cor-número" (ex.: "jersey-red-87").
// Sem avatar escolhido mostra a inicial do nome.

import React, { useId } from 'react';

export const JERSEY_COLORS: { id: string; label: string; c: [string, string, string]; trim: string }[] = [
  { id: 'red', label: 'Vermelho', c: ['#ef4444', '#dc2626', '#991b1b'], trim: '#ffffff' },
  { id: 'blue', label: 'Azul', c: ['#3b82f6', '#2563eb', '#1e3a8a'], trim: '#ffffff' },
  { id: 'green', label: 'Verde', c: ['#22c55e', '#16a34a', '#14532d'], trim: '#ffffff' },
  { id: 'orange', label: 'Laranja', c: ['#fb923c', '#f97316', '#c2410c'], trim: '#111111' },
  { id: 'gold', label: 'Dourado', c: ['#facc15', '#eab308', '#a16207'], trim: '#111111' },
  { id: 'black', label: 'Preto', c: ['#3f3f46', '#27272a', '#09090b'], trim: '#f59e0b' },
  { id: 'white', label: 'Branco', c: ['#ffffff', '#e5e7eb', '#9ca3af'], trim: '#1d4ed8' },
];

export const AVATARS: { id: string; label: string }[] = [
  { id: 'mask', label: 'Máscara' },
  { id: 'puck', label: 'Disco' },
  { id: 'helmet', label: 'Capacete' },
  { id: 'jersey', label: 'Camisola' },
  { id: 'skate', label: 'Patim' },
  { id: 'sticks', label: 'Sticks' },
  { id: 'lamp', label: 'Luz de golo' },
  { id: 'cup', label: 'Taça' },
];

export const parseAvatar = (id?: string | null) => {
  const [kind, color, num] = String(id ?? '').split('-');
  if (!AVATARS.some((a) => a.id === kind)) return null;
  if (kind !== 'jersey') return { kind, color: null, num: null };
  const jc = JERSEY_COLORS.find((x) => x.id === color) ?? JERSEY_COLORS[0];
  return { kind, color: jc.id, num: num && /^\d{1,2}$/.test(num) ? num : '9' };
};

const Art: React.FC<{ kind: string; color: string | null; num: string | null; p: string }> = ({ kind, color, num, p }) => {
  const u = (n: string) => `url(#${p}${n})`;
  switch (kind) {
    case 'mask':
      return (
        <>
          <defs>
            <radialGradient id={`${p}a`} cx="50%" cy="35%" r="70%"><stop offset="0" stopColor="#1e3a8a" /><stop offset="1" stopColor="#0b1530" /></radialGradient>
            <linearGradient id={`${p}b`} x1="0" x2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#c7d2de" /></linearGradient>
          </defs>
          <circle cx="50" cy="50" r="50" fill={u('a')} />
          <path d="M30 20 Q50 10 70 20 Q79 44 73 66 Q63 87 50 91 Q37 87 27 66 Q21 44 30 20Z" fill={u('b')} />
          <path d="M33 24 Q50 16 67 24 L63 33 Q50 27 37 33Z" fill="#f97316" />
          <path d="M37 33 Q50 27 63 33 L61 38 Q50 33 39 38Z" fill="#1e3a8a" />
          <ellipse cx="41" cy="46" rx="6.5" ry="4.2" fill="#0f172a" />
          <ellipse cx="59" cy="46" rx="6.5" ry="4.2" fill="#0f172a" />
          <g stroke="#64748b" strokeWidth="2.4" strokeLinecap="round" fill="none">
            <path d="M34 58 H66M35 66 H65M38 74 H62" />
            <path d="M42 54 V82M50 54 V86M58 54 V82" />
          </g>
          <path d="M33 26 Q30 44 34 62" stroke="#fff" strokeWidth="3" opacity=".7" fill="none" strokeLinecap="round" />
        </>
      );
    case 'puck':
      return (
        <>
          <defs>
            <linearGradient id={`${p}a`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e0f2fe" /><stop offset="1" stopColor="#60a5fa" /></linearGradient>
            <linearGradient id={`${p}b`} x1="0" x2="1"><stop offset="0" stopColor="#3a3a3a" /><stop offset=".5" stopColor="#111" /><stop offset="1" stopColor="#000" /></linearGradient>
          </defs>
          <circle cx="50" cy="50" r="50" fill={u('a')} />
          <g stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity=".9"><path d="M8 46 H20M10 56 H22M14 66 H24" /></g>
          <ellipse cx="52" cy="72" rx="28" ry="6" fill="#0c4a6e" opacity=".25" />
          <path d="M26 50 V62 A26 9 0 0 0 78 62 V50" fill={u('b')} />
          <ellipse cx="52" cy="50" rx="26" ry="9" fill="#2b2b2b" />
          <ellipse cx="46" cy="48" rx="13" ry="3.2" fill="#555" opacity=".8" />
        </>
      );
    case 'helmet':
      return (
        <>
          <defs>
            <radialGradient id={`${p}a`} cx="50%" cy="40%" r="70%"><stop offset="0" stopColor="#334155" /><stop offset="1" stopColor="#0f172a" /></radialGradient>
            <linearGradient id={`${p}b`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ef4444" /><stop offset="1" stopColor="#7f1d1d" /></linearGradient>
          </defs>
          <circle cx="50" cy="50" r="50" fill={u('a')} />
          <path d="M20 62 Q18 28 50 24 Q78 22 82 50 L82 60 L64 60 Q61 52 54 52 L40 52 Q36 62 20 62Z" fill={u('b')} />
          <path d="M54 52 L84 52 Q87 62 80 68 L60 68 Q58 60 54 52Z" fill="#bae6fd" opacity=".55" stroke="#e0f2fe" strokeWidth="1.2" />
          <rect x="40" y="31" width="14" height="4" rx="2" fill="#450a0a" />
          <rect x="57" y="31" width="9" height="4" rx="2" fill="#450a0a" />
          <circle cx="34" cy="50" r="4" fill="#450a0a" />
          <path d="M28 34 Q38 26 52 27" stroke="#fff" strokeWidth="3" opacity=".55" fill="none" strokeLinecap="round" />
          <path d="M30 62 Q34 74 46 76" stroke="#111" strokeWidth="2" fill="none" />
        </>
      );
    case 'jersey': {
      const jc = JERSEY_COLORS.find((x) => x.id === color) ?? JERSEY_COLORS[0];
      const n = num ?? '9';
      return (
        <>
          <defs>
            <linearGradient id={`${p}a`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1f2937" /><stop offset="1" stopColor="#030712" /></linearGradient>
            <linearGradient id={`${p}b`} x1="0" x2="1"><stop offset="0" stopColor={jc.c[0]} /><stop offset=".55" stopColor={jc.c[1]} /><stop offset="1" stopColor={jc.c[2]} /></linearGradient>
          </defs>
          <circle cx="50" cy="50" r="50" fill={u('a')} />
          <path d="M31 22 L42 17 Q50 23 58 17 L69 22 L85 40 L74 51 L68 45 V84 H32 V45 L26 51 L15 40Z" fill={u('b')} />
          <path d="M20 45 L25 40 L29 44 L24 49Z M80 45 L75 40 L71 44 L76 49Z" fill={jc.trim} />
          <path d="M32 74 H68 V78 H32Z" fill={jc.trim} />
          <path d="M42 17 Q50 27 58 17 L56 16 Q50 22 44 16Z" fill={jc.trim} />
          <text x="50" y="64" textAnchor="middle" fontSize={n.length > 1 ? 22 : 26} fontWeight={800} fill={jc.trim} fontFamily="system-ui, sans-serif">
            {n}
          </text>
        </>
      );
    }
    case 'skate':
      return (
        <>
          <defs>
            <radialGradient id={`${p}a`} cx="50%" cy="40%" r="70%"><stop offset="0" stopColor="#0e7490" /><stop offset="1" stopColor="#083344" /></radialGradient>
            <linearGradient id={`${p}b`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3f3f46" /><stop offset="1" stopColor="#09090b" /></linearGradient>
            <linearGradient id={`${p}c`} x1="0" x2="1"><stop offset="0" stopColor="#f8fafc" /><stop offset=".5" stopColor="#94a3b8" /><stop offset="1" stopColor="#e2e8f0" /></linearGradient>
          </defs>
          <circle cx="50" cy="50" r="50" fill={u('a')} />
          <path d="M26 24 H50 Q55 24 56 31 L59 47 Q76 51 81 59 Q83 66 76 68 H26Z" fill={u('b')} />
          <path d="M44 24 H52 L55 46 H46Z" fill="#52525b" />
          <g fill="#f4f4f5"><circle cx="49" cy="30" r="1.4" /><circle cx="50" cy="36" r="1.4" /><circle cx="51" cy="42" r="1.4" /></g>
          <path d="M26 68 H80 L76 74 H28Z" fill="#e5e7eb" />
          <path d="M20 79 Q50 76 84 79" stroke={u('c')} strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M30 27 V60" stroke="#fff" strokeWidth="2.5" opacity=".35" strokeLinecap="round" />
        </>
      );
    case 'sticks':
      return (
        <>
          <defs>
            <radialGradient id={`${p}a`} cx="50%" cy="35%" r="70%"><stop offset="0" stopColor="#14532d" /><stop offset="1" stopColor="#052e16" /></radialGradient>
            <linearGradient id={`${p}b`} x1="0" x2="1"><stop offset="0" stopColor="#f5d0a0" /><stop offset="1" stopColor="#b7874f" /></linearGradient>
          </defs>
          <circle cx="50" cy="50" r="50" fill={u('a')} />
          <g transform="rotate(-32 50 50)">
            <rect x="46" y="10" width="7" height="62" rx="3" fill={u('b')} />
            <path d="M46 70 H53 L56 80 H34 Q32 75 37 72Z" fill="#18181b" />
            <rect x="46" y="12" width="7" height="10" fill="#fff" />
          </g>
          <g transform="rotate(32 50 50)">
            <rect x="47" y="10" width="7" height="62" rx="3" fill={u('b')} />
            <path d="M47 70 H54 L66 72 Q68 76 66 80 H44Z" fill="#18181b" />
            <rect x="47" y="12" width="7" height="10" fill="#fff" />
          </g>
          <ellipse cx="50" cy="86" rx="9" ry="3" fill="#111" />
        </>
      );
    case 'lamp':
      return (
        <>
          <defs>
            <radialGradient id={`${p}a`} cx="50%" cy="45%" r="60%"><stop offset="0" stopColor="#7f1d1d" /><stop offset="1" stopColor="#111827" /></radialGradient>
            <radialGradient id={`${p}b`} cx="40%" cy="30%" r="80%"><stop offset="0" stopColor="#fecaca" /><stop offset=".35" stopColor="#ef4444" /><stop offset="1" stopColor="#7f1d1d" /></radialGradient>
          </defs>
          <circle cx="50" cy="50" r="50" fill={u('a')} />
          <circle cx="50" cy="52" r="34" fill="#ef4444" opacity=".18" />
          <path d="M30 64 V52 A20 20 0 0 1 70 52 V64Z" fill={u('b')} />
          <rect x="24" y="64" width="52" height="12" rx="3" fill="#27272a" />
          <rect x="24" y="64" width="52" height="3" fill="#52525b" />
          <g stroke="#fca5a5" strokeWidth="3" strokeLinecap="round"><path d="M50 14 V24M22 28 L29 35M78 28 L71 35" /></g>
        </>
      );
    case 'cup':
      return (
        <>
          <defs>
            <radialGradient id={`${p}a`} cx="50%" cy="35%" r="70%"><stop offset="0" stopColor="#3730a3" /><stop offset="1" stopColor="#1e1b4b" /></radialGradient>
            <linearGradient id={`${p}b`} x1="0" x2="1"><stop offset="0" stopColor="#f1f5f9" /><stop offset=".45" stopColor="#94a3b8" /><stop offset=".7" stopColor="#e2e8f0" /><stop offset="1" stopColor="#64748b" /></linearGradient>
          </defs>
          <circle cx="50" cy="50" r="50" fill={u('a')} />
          <path d="M30 18 H70 Q70 38 56 44 L54 52 H46 L44 44 Q30 38 30 18Z" fill={u('b')} />
          <rect x="40" y="52" width="20" height="8" rx="2" fill={u('b')} />
          <rect x="36" y="60" width="28" height="9" rx="2" fill={u('b')} />
          <rect x="32" y="69" width="36" height="12" rx="2" fill={u('b')} />
          <path d="M36 22 Q36 34 44 40" stroke="#fff" strokeWidth="3" opacity=".7" fill="none" strokeLinecap="round" />
        </>
      );
    default:
      return null;
  }
};

const Avatar: React.FC<{ avatar?: string | null; name: string; size?: number; className?: string }> = ({
  avatar,
  name,
  size = 32,
  className = '',
}) => {
  const p = 'av' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const a = parseAvatar(avatar);
  if (!a) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-full ring-1 ring-white/15 text-white ${className}`}
        style={{ width: size, height: size, background: 'linear-gradient(135deg, #3f3f46, #18181b)' }}
        aria-hidden="true"
      >
        <span className="font-black uppercase" style={{ fontSize: size * 0.42 }}>
          {name.slice(0, 1)}
        </span>
      </span>
    );
  }
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={`shrink-0 rounded-full ring-1 ring-white/15 ${className}`}
      aria-hidden="true"
    >
      <Art kind={a.kind} color={a.color} num={a.num} p={p} />
    </svg>
  );
};

export default Avatar;
