// components/TabIcon.tsx
// Ícones do menu de abas (desenho próprio, traço com a cor do texto → ficam brancos na aba ativa).

import React from 'react';

export type TabIconKey = 'schedule' | 'suggestions' | 'players' | 'mypicks' | 'stats';

const TabIcon: React.FC<{ name: TabIconKey; className?: string }> = ({ name, className = 'w-5 h-5' }) => {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
  };

  switch (name) {
    case 'schedule': // dois sticks cruzados + disco
      return (
        <svg {...common}>
          <path d="M4 3l9 15h4" />
          <path d="M20 3l-9 15H7" />
          <ellipse cx="12" cy="21" rx="3" ry="1.2" />
        </svg>
      );
    case 'suggestions': // lâmpada
      return (
        <svg {...common}>
          <path d="M9 18h6" />
          <path d="M10 21h4" />
          <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
        </svg>
      );
    case 'players': // disco de hóquei
      return (
        <svg {...common}>
          <ellipse cx="12" cy="9" rx="8.5" ry="3.8" />
          <path d="M3.5 9v5c0 2.1 3.8 3.8 8.5 3.8s8.5-1.7 8.5-3.8V9" />
          <path d="M8 8.4c2.5-1 5.5-1 8 0" />
        </svg>
      );
    case 'mypicks': // estrela
      return (
        <svg {...common}>
          <path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8 6.8 19.5l1-5.8L3.6 9.6l5.8-.8L12 3.5z" />
        </svg>
      );
    case 'stats': // barras
      return (
        <svg {...common}>
          <path d="M5 20V11" />
          <path d="M12 20V5" />
          <path d="M19 20v-6" />
        </svg>
      );
  }
};

export default TabIcon;
