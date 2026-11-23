// components/LoginScene.tsx
// Cenário do login: pista de gelo em perspetiva sob um foco de luz e a introdução do disco (com lascas de gelo).

import React, { useEffect, useRef } from 'react';

/** Fundo estático: arena escura, foco de luz e gelo com riscos de patins e marcas do círculo de face-off. */
export const IceBackdrop: React.FC = React.memo(() => (
  <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
    {/* gelo em perspetiva */}
    <div
      className="absolute bottom-[-12%] left-1/2 h-[96%] w-[210%]"
      style={{ transform: 'translateX(-50%) perspective(900px) rotateX(47deg)', transformOrigin: '50% 100%' }}
    >
      <svg viewBox="0 0 1200 800" preserveAspectRatio="none" className="h-full w-full">
        <defs>
          <linearGradient id="nhl-ice" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0a1a33" />
            <stop offset="0.55" stopColor="#10294d" />
            <stop offset="1" stopColor="#173a66" />
          </linearGradient>
          <radialGradient id="nhl-sheen" cx="0.5" cy="0.42" r="0.55">
            <stop offset="0" stopColor="#cfe6ff" stopOpacity="0.34" />
            <stop offset="0.6" stopColor="#7fb2ee" stopOpacity="0.08" />
            <stop offset="1" stopColor="#7fb2ee" stopOpacity="0" />
          </radialGradient>
          <filter id="nhl-scratch" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.004 0.22" numOctaves="2" seed="11" result="n" />
            <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.9  0 0 0 0 0.95  0 0 0 0 1  0 0 0 5 -3.05" />
          </filter>
        </defs>
        <rect width="1200" height="800" fill="url(#nhl-ice)" />
        <rect width="1200" height="800" filter="url(#nhl-scratch)" opacity="0.28" />
        <g fill="none" strokeLinecap="round" opacity="0.7">
          <circle cx="600" cy="420" r="250" stroke="#b4232a" strokeWidth="6" />
          <circle cx="600" cy="420" r="16" fill="#b4232a" stroke="none" />
          <path d="M572 168v-34M628 168v-34M572 672v34M628 672v34" stroke="#b4232a" strokeWidth="6" />
          <path d="M330 420H120M870 420H1080" stroke="#b4232a" strokeWidth="6" />
          <path d="M0 150H1200" stroke="#2557a7" strokeWidth="10" opacity="0.55" />
        </g>
        <rect width="1200" height="800" fill="url(#nhl-sheen)" />
      </svg>
    </div>

    {/* o gelo perde-se na escuridão ao fundo */}
    <div className="absolute inset-x-0 top-0 h-[40%] bg-gradient-to-b from-[#020617] via-[#020617]/85 to-transparent" />
    {/* foco de luz do pavilhão */}
    <div
      className="absolute inset-0"
      style={{ background: 'radial-gradient(ellipse 75% 55% at 50% 4%, rgba(150,190,240,0.30), transparent 70%)' }}
    />
    {/* cantos escuros */}
    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_60%,transparent_35%,#020617_100%)]" />
  </div>
));

/** Lascas de gelo que saltam quando o disco trava. */
const IceSpray: React.FC<{ at: number; x: number; y: number; count?: number; full?: boolean }> = ({ at, x, y, count = 56, full = false }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    type P = { x: number; y: number; vx: number; vy: number; r: number; life: number; born: number };
    let parts: P[] = [];
    let raf = 0;
    const t0 = performance.now();

    const burst = () => {
      const now = performance.now();
      const cx = w * x;
      const cy = h * y;
      parts = Array.from({ length: count }, () => {
        const a = full ? Math.random() * Math.PI * 2 : Math.PI + Math.random() * Math.PI; // círculo completo ou meia-lua para cima
        const sp = 1.2 + Math.random() * 4.2;
        return { x: cx + (Math.random() - 0.5) * 36, y: cy + 6, vx: Math.cos(a) * sp * 1.5, vy: Math.sin(a) * sp, r: 0.6 + Math.random() * 1.9, life: 650 + Math.random() * 600, born: now };
      });
    };

    const tick = (now: number) => {
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        const age = now - p.born;
        if (age > p.life) continue;
        p.vy += 0.09;
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.985;
        ctx.globalAlpha = Math.max(0, 1 - age / p.life) * 0.9;
        ctx.fillStyle = Math.random() > 0.3 ? '#e6f2ff' : '#9cc7f5';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (now - t0 < at + 1500) raf = requestAnimationFrame(tick);
    };

    const timer = setTimeout(burst, at);
    raf = requestAnimationFrame(tick);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [at, x, y, count, full]);
  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" />;
};

/** Disco de borracha, com volume, brilho e sombra no gelo. */
const Puck: React.FC = () => (
  <div className="relative" style={{ width: 44, height: 24 }}>
    <div className="absolute left-1/2 top-[16px] h-3 w-[115%] -translate-x-1/2 rounded-[50%] bg-black/70 blur-md" />
    <div className="absolute inset-x-0 top-[8px] h-[15px] rounded-[50%/55%] bg-gradient-to-b from-[#16161a] to-black" />
    <div
      className="absolute inset-x-0 top-0 h-[17px] rounded-[50%] ring-1 ring-white/15"
      style={{ background: 'radial-gradient(ellipse at 34% 28%, #5b6270 0%, #2a2f3a 34%, #0d0e12 78%)' }}
    />
    <div className="absolute left-[16%] top-[2px] h-[4px] w-[34%] rotate-[-8deg] rounded-[50%] bg-white/35 blur-[1px]" />
  </div>
);

/** Jogador de perfil (silhueta estilizada) na posição de remate. O braço e o stick rodam em torno do ombro. */
const Player: React.FC = () => (
  <svg viewBox="0 0 260 230" width="200" height="177" className="block overflow-visible">
    <defs>
      <linearGradient id="nhl-jersey" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#fb7a2a" />
        <stop offset="1" stopColor="#c2410c" />
      </linearGradient>
    </defs>
    {/* sombra no gelo */}
    <ellipse cx="108" cy="219" rx="86" ry="6" fill="#000" opacity="0.45" />
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      {/* perna de trás */}
      <path d="M112 128 L86 168 L54 202" stroke="#1b2a44" strokeWidth="19" />
      <path d="M112 128 L86 168 L54 202" stroke="#334d78" strokeWidth="2" opacity="0.7" transform="translate(-4 -3)" />
      {/* perna da frente */}
      <path d="M112 128 L146 166 L150 202" stroke="#223250" strokeWidth="19" />
      <path d="M112 128 L146 166 L150 202" stroke="#3d5a8a" strokeWidth="2" opacity="0.7" transform="translate(-4 -3)" />
      {/* patins */}
      <path d="M36 207 h38 M130 207 h40" stroke="#e2e8f0" strokeWidth="3.5" transform="translate(0 8)" />
      <path d="M48 202 l-10 5 h30 l-4 -8 z M142 200 l-6 6 h34 l-6 -8 z" fill="#0b1220" stroke="#94a3b8" strokeWidth="1.5" />
      {/* tronco com camisola */}
      <path d="M112 128 L122 78" stroke="url(#nhl-jersey)" strokeWidth="36" />
      <path d="M104 104 L134 112" stroke="#f1f5f9" strokeWidth="6" opacity="0.9" />
      {/* calções */}
      <path d="M108 132 L116 128" stroke="#0f172a" strokeWidth="26" />
    </g>
    {/* cabeça com capacete */}
    <circle cx="128" cy="50" r="16" fill="#0b1220" stroke="#94a3b8" strokeWidth="1.5" />
    <path d="M131 52 q10 -2 13 6" fill="none" stroke="#f8fafc" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />
    <rect x="124" y="64" width="9" height="10" rx="3" fill="#ffd9b8" opacity="0.8" />
    {/* braço + stick: rodam em torno do ombro */}
    <g className="nhl-swing" style={{ transformBox: 'view-box', transformOrigin: '122px 78px' }}>
      <path d="M122 78 L152 96 L172 110" fill="none" stroke="url(#nhl-jersey)" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M168 106 L216 208" fill="none" stroke="#e8cfa4" strokeWidth="4" strokeLinecap="round" />
      <path d="M216 208 L242 211" fill="none" stroke="#e8cfa4" strokeWidth="8" strokeLinecap="round" />
      <circle cx="172" cy="110" r="8.5" fill="#111827" stroke="#64748b" strokeWidth="1.5" />
      <circle cx="154" cy="97" r="7.5" fill="#111827" stroke="#64748b" strokeWidth="1.5" />
    </g>
  </svg>
);

/** Introdução: o jogador chega, remata e o disco vem contra o ecrã com uma explosão de gelo. */
export const PlayerIntro: React.FC = () => (
  <>
    <IceSpray at={900} x={0.5} y={0.8} count={26} />
    <IceSpray at={1450} x={0.5} y={0.5} count={90} full />
    <div className="nhl-impact pointer-events-none absolute inset-0" />
    {/* ponto de referência: onde está o disco no gelo */}
    <div className="absolute left-1/2 top-[80%] h-0 w-0">
      <div className="nhl-player absolute" style={{ left: -184, top: -160 }}>
        <Player />
      </div>
      <div className="nhl-puck-shot absolute -left-[22px] -top-[14px]">
        <Puck />
      </div>
    </div>
  </>
);
