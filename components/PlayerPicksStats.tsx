// components/PlayerPicksStats.tsx
// Stats dos tripletes da aba "Jogadores": quantos jogadores sugeridos marcaram / pontuaram.
// Cada dia mostra os seus tripletes (dentro do dia aberto na aba Stats) e há um resumo numa linha.

import React, { useCallback, useEffect, useState } from 'react';

export type PPick = { id: number; name: string; abbr: string; opp: string; prob: number; r?: 'hit' | 'miss' | 'dnp'; g?: number; a?: number };
export type PRecord = { date: string; savedAt: number; goal: PPick[][]; point: PPick[][]; mine?: { goal: PPick[]; point: PPick[]; savedAt: number } };

const shortName = (full: string) => {
  const parts = full.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : full;
};

type Agg = { hit: number; done: number; pending: number; probSum: number; triples: number; fullTriples: number };
const emptyAgg = (): Agg => ({ hit: 0, done: 0, pending: 0, probSum: 0, triples: 0, fullTriples: 0 });

function aggregate(records: PRecord[], mode: 'goal' | 'point', option: number | 'mine'): Agg {
  const a = emptyAgg();
  for (const rec of records) {
    const list = option === 'mine' ? rec.mine?.[mode] : rec[mode][option];
    if (!list || list.length === 0) continue;
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

const Chip: React.FC<{ p: PPick }> = ({ p }) => {
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

/** Carrega os tripletes guardados (já com resultados conferidos), indexados por data. */
export function usePlayerPicks(): Record<string, PRecord> {
  const [map, setMap] = useState<Record<string, PRecord>>({});

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/player-picks?limit=60&t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) return;
      const data = await r.json().catch(() => null);
      const next: Record<string, PRecord> = {};
      for (const rec of Array.isArray(data?.items) ? (data.items as PRecord[]) : []) next[rec.date] = rec;
      setMap(next);
    } catch {
      /* sem dados de jogadores: o resto da aba continua a funcionar */
    }
  }, []);

  useEffect(() => {
    load();
    const h = () => load();
    window.addEventListener('history-updated', h);
    return () => window.removeEventListener('history-updated', h);
  }, [load]);

  return map;
}

/** Resumo de todos os dias: tripletes automáticos e os meus. */
/** Acerto acumulado dos tripletes de jogadores (golos/pontos), automáticos vs meus. */
export function playerMarketStats(records: Record<string, PRecord>) {
  const recs: PRecord[] = Object.keys(records).map((k) => records[k]);
  const sum = (a: Agg[]) => ({ hit: a.reduce((n, x) => n + x.hit, 0), done: a.reduce((n, x) => n + x.done, 0) });
  return {
    goal: { auto: sum([aggregate(recs, 'goal', 0), aggregate(recs, 'goal', 1)]), mine: sum([aggregate(recs, 'goal', 'mine')]) },
    point: { auto: sum([aggregate(recs, 'point', 0), aggregate(recs, 'point', 1)]), mine: sum([aggregate(recs, 'point', 'mine')]) },
  };
}

export const PlayerPicksSummary: React.FC<{ records: Record<string, PRecord>; embedded?: boolean }> = ({ records, embedded }) => {
  const recs: PRecord[] = Object.keys(records).map((k) => records[k]);
  const line = (label: string, g: Agg[], p: Agg[]) => {
    const gHit = g.reduce((n, x) => n + x.hit, 0), gDone = g.reduce((n, x) => n + x.done, 0);
    const pHit = p.reduce((n, x) => n + x.hit, 0), pDone = p.reduce((n, x) => n + x.done, 0);
    if (gDone + pDone === 0) return null;
    const gr = pct(gHit, gDone), pr = pct(pHit, pDone);
    return (
      <div key={label}>
        <span className="font-black uppercase tracking-widest text-[9px] text-slate-500 mr-2">{label}</span>
        Golos <b className="text-white">{gr === null ? '--' : `${gr}%`}</b> ({gHit}/{gDone}) · Pontos{' '}
        <b className="text-white">{pr === null ? '--' : `${pr}%`}</b> ({pHit}/{pDone})
      </div>
    );
  };
  const auto = line('Jogadores · automáticos', [aggregate(recs, 'goal', 0), aggregate(recs, 'goal', 1)], [aggregate(recs, 'point', 0), aggregate(recs, 'point', 1)]);
  const mine = line('Jogadores · meus', [aggregate(recs, 'goal', 'mine')], [aggregate(recs, 'point', 'mine')]);
  if (!auto && !mine) return null;
  if (embedded) {
    const sum = (a: Agg[]) => ({ hit: a.reduce((n, x) => n + x.hit, 0), done: a.reduce((n, x) => n + x.done, 0) });
    const Stat: React.FC<{ label: string; v: { hit: number; done: number }; color: string }> = ({ label, v, color }) => {
      const r = pct(v.hit, v.done);
      return (
        <div className="text-center min-w-[64px]">
          <div className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</div>
          <div className={`text-lg font-black leading-tight ${color}`}>{r === null ? '--' : `${r}%`}</div>
          <div className="text-[10px] text-slate-500">{v.hit}/{v.done}</div>
        </div>
      );
    };
    const col = (title: string, g: Agg[], p: Agg[], color: string) => (
      <div className="flex-1 text-center">
        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">{title}</div>
        <div className="flex items-start justify-center gap-4">
          <Stat label="Golos" v={sum(g)} color={color} />
          <Stat label="Pontos" v={sum(p)} color={color} />
        </div>
      </div>
    );
    return (
      <div className="border-t border-indigo-500/20 pt-4">
        <div className="text-center text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Jogadores</div>
        <div className="flex items-center gap-4">
          {col('Auto', [aggregate(recs, 'goal', 0), aggregate(recs, 'goal', 1)], [aggregate(recs, 'point', 0), aggregate(recs, 'point', 1)], 'text-amber-300')}
          <div className="w-px h-14 bg-slate-700" />
          {col('Meus', [aggregate(recs, 'goal', 'mine')], [aggregate(recs, 'point', 'mine')], 'text-blue-300')}
        </div>
      </div>
    );
  }
  return (
    <div className={embedded ? 'border-t border-indigo-500/20 pt-4 text-[11px] text-slate-400 space-y-1' : 'rounded-xl border border-slate-700 bg-slate-800/40 px-4 py-2.5 text-[11px] text-slate-400 space-y-1'}>
      {auto}
      {mine}
    </div>
  );
};

/** Os tripletes de um dia (para mostrar dentro do dia aberto). */
export const PlayerDayPicks: React.FC<{ rec: PRecord | undefined }> = ({ rec }) => {
  const [open, setOpen] = React.useState(false);
  if (!rec) return null;
  const rows = [
    ...(['goal', 'point'] as const).flatMap((mode) => rec[mode].map((list, i) => ({ mode, i, list, mine: false }))),
    ...(['goal', 'point'] as const).flatMap((mode) => (rec.mine && rec.mine[mode].length > 0 ? [{ mode, i: 0, list: rec.mine[mode], mine: true }] : [])),
  ];
  if (rows.length === 0) return null;
  const all = rows.flatMap((r) => r.list);
  const done = all.filter((p) => p.r === 'hit' || p.r === 'miss');
  const hits = done.filter((p) => p.r === 'hit').length;

  return (
    <div className="bg-slate-900/40 border border-orange-500/20 rounded-2xl p-4 space-y-2">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between gap-2 text-left">
        <h4 className="text-xs font-black uppercase tracking-widest text-orange-300/80">Jogadores · tripletes</h4>
        <span className="flex items-center gap-2 text-[10px] font-black text-slate-500">
          {done.length > 0 ? `${hits}/${done.length} acertos` : 'por conferir'}
          <i className={`fas ${open ? 'fa-chevron-up' : 'fa-chevron-down'}`} />
        </span>
      </button>
      {open && rows.map(({ mode, i, list, mine }) => (
        <div key={`${mine ? 'm' : 'a'}-${mode}-${i}`} className="flex flex-wrap items-center gap-1.5">
          <span className={`w-24 text-[9px] font-black uppercase tracking-wider ${mine ? 'text-orange-300/80' : 'text-slate-500'}`}>
            {mine ? 'Meu · ' : ''}{mode === 'goal' ? 'Golos' : 'Pontos'}{mine ? '' : ` · ${i + 1}`}
          </span>
          {list.map((p) => (
            <Chip key={p.id} p={p} />
          ))}
        </div>
      ))}
    </div>
  );
};
