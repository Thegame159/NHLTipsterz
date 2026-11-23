// components/CopyGuard.tsx
// Para utilizadores (não admin): bloqueia a seleção de texto e o clique direito, para dificultar copiar as dicas.
// Os campos de escrever (input/textarea) continuam a funcionar.

import React, { useEffect } from 'react';

const CopyGuard: React.FC = () => {
  useEffect(() => {
    const noMenu = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest('input, textarea')) return; // deixa colar/editar nos campos
      e.preventDefault();
    };
    document.addEventListener('contextmenu', noMenu);
    document.documentElement.classList.add('nhl-noselect');
    return () => {
      document.removeEventListener('contextmenu', noMenu);
      document.documentElement.classList.remove('nhl-noselect');
    };
  }, []);

  return (
    <style>{`.nhl-noselect, .nhl-noselect body { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
.nhl-noselect input, .nhl-noselect textarea { -webkit-user-select: text; user-select: text; }`}</style>
  );
};

export default CopyGuard;
