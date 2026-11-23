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
const IceSpray: React.FC<{ at: number; x: number; y: number }> = ({ at, x, y }) => {
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
      parts = Array.from({ length: 56 }, () => {
        const a = Math.PI + Math.random() * Math.PI; // meia-lua para cima
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
  }, [at, x, y]);
  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" />;
};

/** Disco de borracha, com volume, brilho e sombra no gelo. */
const Puck: React.FC = () => (
  <div className="relative" style={{ width: 70, height: 38 }}>
    <div className="absolute left-1/2 top-[26px] h-4 w-[115%] -translate-x-1/2 rounded-[50%] bg-black/70 blur-md" />
    <div className="absolute inset-x-0 top-[12px] h-[24px] rounded-[50%/55%] bg-gradient-to-b from-[#16161a] to-black shadow-[0_2px_0_rgba(255,255,255,0.06)_inset]" />
    <div
      className="absolute inset-x-0 top-0 h-[26px] rounded-[50%] ring-1 ring-white/15"
      style={{ background: 'radial-gradient(ellipse at 34% 28%, #5b6270 0%, #2a2f3a 34%, #0d0e12 78%)' }}
    />
    <div className="absolute left-[16%] top-[3px] h-[6px] w-[34%] rotate-[-8deg] rounded-[50%] bg-white/35 blur-[2px]" />
  </div>
);

/** Introdução: o disco desliza pelo gelo, deixa um risco e trava com uma nuvem de lascas. */
export const PuckIntro: React.FC<{ stopAtMs: number }> = ({ stopAtMs }) => (
  <>
    <IceSpray at={stopAtMs} x={0.5} y={0.78} />
    <div className="absolute left-1/2 top-[78%] h-0 w-0">
      <div className="nhl-scratch absolute right-0 top-[18px] h-[2px] w-[62vw] origin-right rounded-full bg-gradient-to-l from-white/70 via-sky-200/25 to-transparent" />
      <div className="nhl-puck absolute -left-[35px] -top-[6px]">
        <Puck />
      </div>
    </div>
  </>
);
