// components/Watermark.tsx
// Marca de água para utilizadores (não admin): nome + data/hora em diagonal, muito ténue, por cima de tudo.
// Não impede capturas de ecrã, mas identifica quem partilhou. Também bloqueia seleção de texto e o clique direito.

import React, { useEffect, useState } from 'react';

const stamp = () =>
  new Date().toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '');

const Watermark: React.FC<{ username: string }> = ({ username }) => {
  const [now, setNow] = useState(stamp);

  useEffect(() => {
    const t = window.setInterval(() => setNow(stamp()), 60 * 1000);
    const noMenu = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest('input, textarea')) return; // deixa colar/editar nos campos
      e.preventDefault();
    };
    document.addEventListener('contextmenu', noMenu);
    document.documentElement.classList.add('nhl-noselect');
    return () => {
      window.clearInterval(t);
      document.removeEventListener('contextmenu', noMenu);
      document.documentElement.classList.remove('nhl-noselect');
    };
  }, []);

  const text = `${username} · ${now}`;
  return (
    <>
      <style>{`.nhl-noselect, .nhl-noselect body { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
.nhl-noselect input, .nhl-noselect textarea { -webkit-user-select: text; user-select: text; }`}</style>
      <svg
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[60] h-full w-full print:block"
      >
        <defs>
          <pattern id="nhl-wm" width="240" height="130" patternUnits="userSpaceOnUse" patternTransform="rotate(-28)">
            <text x="10" y="65" fill="#ffffff" fillOpacity="0.08" fontSize="16" fontWeight={700} fontFamily="system-ui, sans-serif">
              {text}
            </text>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#nhl-wm)" />
      </svg>
    </>
  );
};

export default Watermark;
