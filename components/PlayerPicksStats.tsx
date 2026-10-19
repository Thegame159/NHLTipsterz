// components/PlayerPicksStats.tsx
// Stats dos tripletes da aba "Jogadores": quantos jogadores sugeridos marcaram / pontuaram.
// Vem fechado (só um resumo numa linha); abre para ver os números por opção e por dia.

import React, { useCallback, useEffect, useState } from 'react';

type PPick = { id: number; name: string; abbr: string; opp: string; prob: number; r?: 'hit' | 'miss' | 'dnp'; g?: number; a?: number };
type PRecord = { date: string; savedAt: number; goal: PPick[][]; point: PPick[][] };

const shortName = (full: string) => {
  const parts = full.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : full;
};

type Agg = { hit: number; done: number; pending: number; probSum: number; triples: number; fullTriples: number };
const emptyAgg = (): Agg => ({ hit: 0, done: 0, pending: 0, probSum: 0, triples: 0, fullTriples: 0 });

function aggregate(records: PRecord[], mode: 'goal' | 'point', option: number): Agg {
  const a = emptyAgg();
  for (const rec of records) {
    const list = rec[mode][option];
    if (!list) continue;
    let allDone = true;
    let allHit = true;
    for (const p of list) {
      if (p.r === 'hit' || p.r === 'miss') {
        a.done++;
        a.probSum += p.prob;
        if (p.r === 'hit') a.hit++;
        else allHit = false;
      } else if (p.r === 'dnp') {
        allDone = false; // jogador não jogou: o triplete não conta
      } else {
        a.pending++;
        allDone = false;
      }
    }
    if (allDone && list.length > 0) {
      a.triples++;
      if (allHit) a.fullTriples++;
    }
  }
  return a;
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : null);

const Tile: React.FC<{ title: string; agg: Agg }> = ({ title, agg }) => {
  const rate = pct(agg.hit, agg.done);
  const expected = agg.done > 0 ? Math.round(agg.probSum / agg.done) : null;
  return (
    <div className="rounded-xl bg-slate-900/70 border border-slate-800 px-3 py-2.5">
      <div className="text-[9px] font-black uppercase tracking-widest text-slate-500">{title}</div>
      <div className="flex items-baseline gap-2 mt-0.5">
        <span className="text-xl font-black text-white">{rate === null ? '--' : `${rate}%`}</span>
        <span className="text-[10px] text-slate-500">
          {agg.hit}/{agg.done} jogadores
        </span>
      </div>
      <div className="text-[10px] text-slate-500">
        {expected !== null ? `previsto ${expected}% · ` : ''}
        trios completos {agg.fullTriples}/{agg.triples}
        {agg.pending > 0 ? ` · ${agg.pending} pend.` : ''}
      </div>
    </div>
  );
};

const Chip: React.FC<{ p: PPick; mode: 'goal' | 'point' }> = ({ p, mode }) => {
  const cls =
    p.r === 'hit'
      ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10'
      : p.r === 'miss'
      ? 'text-red-300 border-red-500/30 bg-red-500/10'
      : 'text-slate-400 border-slate-700 bg-slate-800/50';
  const mark = p.r === 'hit' ? '✓' : p.r === 'miss' ? '✗' : p.r === 'dnp' ? 'n/j' : '…';
  const detail = p.r === 'hit' || p.r === 'miss' ? ` · ${p.g ?? 0}G ${p.a ?? 0}A` : '';
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${cls}`} title={`${p.name} (${p.prob}% previsto${detail})`}>
      {mark} {shortName(p.name)} <span className="opacity-60">{p.prob}%</span>
    </span>
  );
};

const PlayerPicksStats: React.FC = () => {
  const [records, setRecords] = useState<PRecord[] | null>(null);
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/player-picks?limit=60&t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) return setRecords([]);
      const data = await r.json().catch(() => null);
      setRecords(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setRecords([]);
    }
  }, []);

  useEffect(() => {
    load();
    const h = () => load();
    window.addEventListener('history-updated', h);
    return () => window.removeEventListener('history-updated', h);
  }, [load]);

  const recs = records ?? [];
  const g1 = aggregate(recs, 'goal', 0);
  const g2 = aggregate(recs, 'goal', 1);
  const p1 = aggregate(recs, 'point', 0);
  const p2 = aggregate(recs, 'point', 1);
  const goalAll = { hit: g1.hit + g2.hit, done: g1.done + g2.done };
  const pointAll = { hit: p1.hit + p2.hit, done: p1.done + p2.done };
  const gr = pct(goalAll.hit, goalAll.done);
  const pr = pct(pointAll.hit, pointAll.done);

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800/40 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-800/60 transition-colors"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <div className="font-black text-white">Jogadores · tripletes</div>
          <div className="text-[11px] text-slate-500">
            {records === null
              ? 'A carregar…'
              : recs.length === 0
              ? 'Ainda sem dados: abre a aba Jogadores num dia de jogos para começar a registar.'
              : `Golos ${gr === null ? '--' : gr + '%'} (${goalAll.hit}/${goalAll.done}) · Pontos ${pr === null ? '--' : pr + '%'} (${pointAll.hit}/${pointAll.done})`}
          </div>
        </div>
        <span className="text-slate-500 text-[10px]">{open ? '▲' : '▼'}</span>
      </button>

      {open && recs.length > 0 && (
        <div className="px-5 pb-5 pt-1 space-y-4 border-t border-slate-700/60">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <Tile title="Golos · opção 1" agg={g1} />
            <Tile title="Golos · opção 2" agg={g2} />
            <Tile title="Pontos · opção 1" agg={p1} />
            <Tile title="Pontos · opção 2" agg={p2} />
          </div>

          <div className="space-y-2">
            {(showAll ? recs : recs.slice(0, 5)).map((rec) => (
              <div key={rec.date} className="rounded-xl bg-slate-900/60 border border-slate-800 px-3 py-2.5 space-y-1.5">
                <div className="text-[11px] font-black text-slate-300">{rec.date}</div>
                {(['goal', 'point'] as const).map((mode) =>
                  rec[mode].map((list, i) => (
                    <div key={`${mode}-${i}`} className="flex flex-wrap items-center gap-1.5">
                      <span className="w-24 text-[9px] font-black uppercase tracking-wider text-slate-500">
                        {mode === 'goal' ? 'Golos' : 'Pontos'} · {i + 1}
                      </span>
                      {list.map((p) => (
                        <Chip key={p.id} p={p} mode={mode} />
                      ))}
                    </div>
                  ))
                )}
              </div>
            ))}
            {recs.length > 5 && (
              <button onClick={() => setShowAll((v) => !v)} className="w-full text-[10px] font-black uppercase tracking-wider text-slate-500 hover:text-slate-300 py-1">
                {showAll ? 'Ver menos' : `Ver mais dias (${recs.length - 5})`}
              </button>
            )}
          </div>
          <p className="text-[10px] text-slate-600">
            "previsto" é a média das probabilidades que a app deu; "trios completos" são os dias em que os 3 acertaram. n/j = não jogou (não conta).
          </p>
        </div>
      )}
    </div>
  );
};

export default PlayerPicksStats;
