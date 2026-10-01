// src/components/ProbabilityBadge.tsx

import React from 'react';

interface Props {
  value?: number | null;
  label: string;
}

const ProbabilityBadge: React.FC<Props> = ({ value, label }) => {
  // Proteção contra undefined, null ou valores não numéricos (NaN)
  const numValue = typeof value === 'number' && !isNaN(value) ? value : 0;

  return (
    <div className="bg-slate-900/60 border border-slate-700/60 rounded-lg p-2 text-center">
      <span className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">
        {label}
      </span>
      <span className="text-xs font-black text-blue-400">
        {numValue.toFixed(0)}%
      </span>
    </div>
  );
};

export default ProbabilityBadge;
