// components/TabHeader.tsx
// Cabeçalho das abas Jogos e Dicas: ícone grande + título + subtítulo (mesmo estilo da aba Jogadores).

import React from 'react';

const glow = 'w-12 h-12 drop-shadow-[0_2px_6px_rgba(249,115,22,0.35)]';

// Dois sticks cruzados com disco
const SticksIcon: React.FC = () => (
  <svg viewBox="0 0 48 48" className={glow} aria-hidden="true">
    <path d="M8 6l17 28h9" fill="none" stroke="#64748b" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M40 6L23 34h-9" fill="none" stroke="#94a3b8" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M25 34h9" fill="none" stroke="#f97316" strokeWidth="3.2" strokeLinecap="round" opacity="0.9" />
    <ellipse cx="24" cy="41.5" rx="8" ry="3" fill="#020617" stroke="#64748b" strokeWidth="1.5" />
    <ellipse cx="24" cy="40.5" rx="8" ry="3" fill="#1e293b" stroke="#64748b" strokeWidth="1.5" />
  </svg>
);

// Lâmpada
const BulbIcon: React.FC = () => (
  <svg viewBox="0 0 48 48" className={glow} aria-hidden="true">
    <path
      d="M24 5a13 13 0 0 0-7.5 23.6c1.3 1 2 2.4 2 4v1.4h11v-1.4c0-1.6.7-3 2-4A13 13 0 0 0 24 5z"
      fill="#1e293b"
      stroke="#64748b"
      strokeWidth="2.2"
      strokeLinejoin="round"
    />
    <path d="M19 39h10M21 43h6" stroke="#64748b" strokeWidth="2.6" strokeLinecap="round" />
    <path d="M18 17a7 7 0 0 1 6-5" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" opacity="0.85" />
    <ellipse cx="24" cy="20" rx="6" ry="6.5" fill="none" stroke="#f97316" strokeWidth="1.2" opacity="0.45" />
  </svg>
);

const TabHeader: React.FC<{ kind: 'schedule' | 'suggestions'; title: string; subtitle: string }> = ({ kind, title, subtitle }) => (
  <div className="flex items-center gap-3 mb-6">
    {kind === 'schedule' ? <SticksIcon /> : <BulbIcon />}
    <div>
      <h2 className="text-lg font-black text-white leading-tight">{title}</h2>
      <p className="text-[11px] text-slate-500">{subtitle}</p>
    </div>
  </div>
);

export default TabHeader;
