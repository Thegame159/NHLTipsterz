// components/PlayerPicksStats.tsx
// Stats dos tripletes da aba "Jogadores": quantos jogadores sugeridos marcaram / pontuaram.
// Cada dia mostra os seus tripletes (dentro do dia aberto na aba Stats) e há um resumo numa linha.

import React, { useCallback, useEffect, useState } from 'react';

export type PPick = { id: number; name: string; abbr: string; opp: string; prob: number; r?: 'hit' | 'miss' | 'dnp'; g?: number; a?: number };
export type PRecord = { date: string; savedAt: number; goal: PPick[][]; point: PPick[][] };

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

/** Resumo numa linha de todos os dias. */
export const PlayerPicksSummary: React.FC<{ records: Record<string, PRecord> }> = ({ records }) => {
  const recs: PRecord[] = Object.keys(records).map((k) => records[k]);
  const g = [aggregate(recs, 'goal', 0), aggregate(recs, 'goal', 1)];
  const p = [aggregate(recs, 'point', 0), aggregate(recs, 'point', 1)];
  const gHit = g[0].hit + g[1].hit, gDone = g[0].done + g[1].done;
  const pHit = p[0].hit + p[1].hit, pDone = p[0].done + p[1].done;
  if (gDone + pDone === 0) return null;
  const gr = pct(gHit, gDone), pr = pct(pHit, pDone);
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/40 px-4 py-2.5 text-[11px] text-slate-400">
      <span className="font-black uppercase tracking-widest text-[9px] text-slate-500 mr-2">Jogadores (tripletes)</span>
      Golos <b className="text-white">{gr === null ? '--' : `${gr}%`}</b> ({gHit}/{gDone}) · Pontos{' '}
      <b className="text-white">{pr === null ? '--' : `${pr}%`}</b> ({pHit}/{pDone})
    </div>
  );
};

/** Os tripletes de um dia (para mostrar dentro do dia aberto). */
export const PlayerDayPicks: React.FC<{ rec: PRecord | undefined }> = ({ rec }) => {
  if (!rec) return null;
  const rows = (['goal', 'point'] as const).flatMap((mode) => rec[mode].map((list, i) => ({ mode, i, list })));
  if (rows.length === 0) return null;
  const all = rows.flatMap((r) => r.list);
  const done = all.filter((p) => p.r === 'hit' || p.r === 'miss');
  const hits = done.filter((p) => p.r === 'hit').length;

  return (
    <div className="bg-slate-900/40 border border-orange-500/20 rounded-2xl p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-black uppercase tracking-widest text-orange-300/80">Jogadores · tripletes</h4>
        <span className="text-[10px] font-black text-slate-500">
          {done.length > 0 ? `${hits}/${done.length} acertos` : 'por conferir'}
        </span>
      </div>
      {rows.map(({ mode, i, list }) => (
        <div key={`${mode}-${i}`} className="flex flex-wrap items-center gap-1.5">
          <span className="w-24 text-[9px] font-black uppercase tracking-wider text-slate-500">
            {mode === 'goal' ? 'Golos' : 'Pontos'} · {i + 1}
          </span>
          {list.map((p) => (
            <Chip key={p.id} p={p} />
          ))}
        </div>
      ))}
    </div>
  );
};
