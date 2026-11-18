// components/CalibrationView.tsx
// Calibração do modelo: probabilidade prevista (nas sugestões do Auto) vs taxa de acerto real.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { evalMarkets } from './StatsView';
import type { ApiResultsResponse, HistoryItem, PickEval } from './StatsView';

type Sample = { market: string; p: number; ok: boolean; date: string };

const MIN_N = 10;
const MIN_MARKET_N = 30; // mínimo de picks por mercado para sugerir correção
const PRIOR_N = 30; // peso da "prudência": a correção sugerida encolhe com amostras pequenas // abaixo disto a banda fica a cinzento (amostra pequena)

const parseProb = (label: string): number | null => {
  const m = /\((\d{1,3}(?:[.,]\d+)?)\s*%\)/.exec(label || '');
  if (!m) return null;
  const v = parseFloat(m[1].replace(',', '.'));
  return v > 0 && v < 100 ? v : null;
};

const CalibrationView: React.FC = () => {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [days, setDays] = useState(0);
  const [market, setMarket] = useState<string>('Todos');
  const [showFix, setShowFix] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const r = await fetch(`/api/history?limit=120&t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) throw new Error('history');
      const data = await r.json();
      const items: HistoryItem[] = Array.isArray(data?.items) ? data.items : [];
      const out: Sample[] = [];
      let usedDays = 0;

      const withAuto = items.filter((i) => i.auto?.suggestions);
      let idx = 0;
      const worker = async () => {
        while (idx < withAuto.length) {
          const it = withAuto[idx++];
          try {
            let byMarket: Record<string, PickEval[]> | undefined;
            const stored = it.auto?.markets;
            const storedOk = stored && Object.keys(stored).length > 0 && (it.auto?.stats as any)?.v === 2;
            if (storedOk) byMarket = stored;
            else {
              const rr = await fetch(`/api/results?date=${it.date}&t=${Date.now()}`, { cache: 'no-store' });
              if (!rr.ok) continue;
              byMarket = evalMarkets(it.auto!.suggestions, (await rr.json()) as ApiResultsResponse);
            }
            let any = false;
            for (const [mk, picks] of Object.entries(byMarket || {})) {
              for (const p of picks || []) {
                if (p.ok === null || p.ok === undefined) continue;
                const prob = parseProb(p.label);
                if (prob === null) continue;
                out.push({ market: mk, p: prob, ok: !!p.ok, date: it.date });
                any = true;
              }
            }
            if (any) usedDays++;
          } catch {
            /* ignora o dia */
          }
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      setSamples(out);
      setDays(usedDays);
      setStatus('ok');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const markets = useMemo(() => ['Todos', ...Array.from(new Set(samples.map((s) => s.market)))], [samples]);

  const rows = useMemo(() => {
    const sel = samples.filter((s) => market === 'Todos' || s.market === market);
    const map = new Map<number, Sample[]>();
    for (const s of sel) {
      const b = Math.floor(s.p / 5) * 5;
      map.set(b, [...(map.get(b) || []), s]);
    }
    const bands = Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([lo, arr]) => {
        const n = arr.length;
        const hits = arr.filter((x) => x.ok).length;
        return { lo, n, hits, pred: arr.reduce((a, x) => a + x.p, 0) / n, real: (hits / n) * 100 };
      });
    const n = sel.length;
    const hits = sel.filter((x) => x.ok).length;
    return {
      bands,
      n,
      pred: n ? sel.reduce((a, x) => a + x.p, 0) / n : 0,
      real: n ? (hits / n) * 100 : 0,
    };
  }, [samples, market]);

  const fixRows = useMemo(() => {
    const names = Array.from(new Set(samples.map((x) => x.market)));
    return names.map((m) => {
      const arr = samples.filter((x) => x.market === m);
      const n = arr.length;
      const hits = arr.filter((x) => x.ok).length;
      const pred = arr.reduce((a, x) => a + x.p, 0) / n;
      const real = (hits / n) * 100;
      const dev = real - pred;
      const enough = n >= MIN_MARKET_N;
      const fix = enough ? dev * (n / (n + PRIOR_N)) : null;
      return { m, n, pred, real, dev, enough, fix };
    }).sort((a, b) => b.n - a.n);
  }, [samples]);

  const W = 300, H = 300, PAD = 30;
  const xs = (v: number) => PAD + (v / 100) * (W - PAD * 2);
  const ys = (v: number) => H - PAD - (v / 100) * (H - PAD * 2);
  const diff = rows.real - rows.pred;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Calibração do modelo</h2>
          <p className="text-xs text-slate-400">Quando o Auto diz 70%, acerta mesmo ~70% das vezes?</p>
        </div>
        <button onClick={load} className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 border border-slate-700">🔄</button>
      </div>

      {status === 'loading' && <div className="text-sm text-slate-400">A carregar histórico…</div>}
      {status === 'error' && <div className="text-sm text-red-400">Não consegui carregar o histórico.</div>}

      {status === 'ok' && samples.length === 0 && (
        <div className="text-sm text-slate-400">Ainda não há picks do Auto com probabilidade e resultado.</div>
      )}

      {status === 'ok' && samples.length > 0 && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {markets.map((m) => (
              <button
                key={m}
                onClick={() => setMarket(m)}
                className={`text-xs px-2.5 py-1 rounded-full border ${market === m ? 'bg-sky-600 border-sky-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300'}`}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-slate-800/70 border border-slate-700 p-2.5">
              <div className="text-[11px] text-slate-400">Picks · dias</div>
              <div className="text-base font-semibold text-slate-100">{rows.n} · {days}</div>
            </div>
            <div className="rounded-xl bg-slate-800/70 border border-slate-700 p-2.5">
              <div className="text-[11px] text-slate-400">Previsto → Real</div>
              <div className="text-base font-semibold text-slate-100">{rows.pred.toFixed(0)}% → {rows.real.toFixed(0)}%</div>
            </div>
            <div className="rounded-xl bg-slate-800/70 border border-slate-700 p-2.5">
              <div className="text-[11px] text-slate-400">Desvio</div>
              <div className={`text-base font-semibold ${Math.abs(diff) < 5 ? 'text-emerald-400' : diff > 0 ? 'text-sky-400' : 'text-amber-400'}`}>
                {diff > 0 ? '+' : ''}{diff.toFixed(1)} pp
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
            <span><span className="text-emerald-400">●</span> Verde: certo (±5 pp)</span>
            <span><span className="text-amber-400">●</span> Laranja: abaixo do que diz (otimista)</span>
            <span><span className="text-sky-400">●</span> Azul: acima do que diz (prudente)</span>
          </div>

          <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-3">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-sm mx-auto">
              {[0, 25, 50, 75, 100].map((t) => (
                <g key={t}>
                  <line x1={xs(t)} y1={ys(0)} x2={xs(t)} y2={ys(100)} stroke="#334155" strokeWidth="0.5" />
                  <line x1={xs(0)} y1={ys(t)} x2={xs(100)} y2={ys(t)} stroke="#334155" strokeWidth="0.5" />
                  <text x={xs(t)} y={H - 12} fontSize="9" fill="#94a3b8" textAnchor="middle">{t}</text>
                  <text x={PAD - 6} y={ys(t) + 3} fontSize="9" fill="#94a3b8" textAnchor="end">{t}</text>
                </g>
              ))}
              <line x1={xs(0)} y1={ys(0)} x2={xs(100)} y2={ys(100)} stroke="#64748b" strokeDasharray="4 3" />
              <polyline
                fill="none"
                stroke="#38bdf8"
                strokeWidth="1.5"
                points={rows.bands.filter((b) => b.n >= MIN_N).map((b) => `${xs(b.pred)},${ys(b.real)}`).join(' ')}
              />
              {rows.bands.map((b) => (
                <circle
                  key={b.lo}
                  cx={xs(b.pred)}
                  cy={ys(b.real)}
                  r={Math.min(9, 3 + Math.sqrt(b.n) * 0.7)}
                  fill={b.n >= MIN_N ? '#38bdf8' : '#64748b'}
                  fillOpacity={b.n >= MIN_N ? 0.9 : 0.5}
                />
              ))}
              <text x={W / 2} y={H - 1} fontSize="9" fill="#94a3b8" textAnchor="middle">previsto %</text>
              <text x={8} y={H / 2} fontSize="9" fill="#94a3b8" textAnchor="middle" transform={`rotate(-90 8 ${H / 2})`}>real %</text>
            </svg>
            <p className="text-[11px] text-slate-400 mt-1 text-center">
              Sobre a diagonal = bem calibrado · acima = o modelo é prudente · abaixo = otimista. Cinzento = menos de {MIN_N} picks.
            </p>
          </div>

          <button
            onClick={() => setShowFix((v) => !v)}
            className="w-full text-sm font-semibold px-3 py-2.5 rounded-xl bg-orange-600 text-white"
          >
            {showFix ? 'Esconder correção sugerida' : '📐 Correção sugerida'}
          </button>

          {showFix && (
            <div className="rounded-xl border border-orange-500/40 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-800 text-slate-400 text-[11px]">
                  <tr>
                    <th className="text-left px-3 py-2">Mercado</th>
                    <th className="text-right px-2 py-2">Picks</th>
                    <th className="text-right px-2 py-2">Prev→Real</th>
                    <th className="text-right px-3 py-2">Corrigir</th>
                  </tr>
                </thead>
                <tbody>
                  {fixRows.map((r) => (
                    <tr key={r.m} className={`border-t border-slate-700/60 ${r.enough ? 'text-slate-200' : 'text-slate-500'}`}>
                      <td className="px-3 py-1.5">{r.m}</td>
                      <td className="text-right px-2">{r.n}</td>
                      <td className="text-right px-2">{r.pred.toFixed(0)}→{r.real.toFixed(0)}%</td>
                      <td className={`text-right px-3 font-semibold ${r.fix === null ? '' : Math.abs(r.fix) < 2 ? 'text-emerald-400' : r.fix > 0 ? 'text-sky-400' : 'text-amber-400'}`}>
                        {r.fix === null ? "aguardar" : Math.abs(r.fix) < 2 ? 'manter' : `${r.fix > 0 ? '+' : ''}${r.fix.toFixed(1)} pp`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] text-slate-400 px-3 py-2 border-t border-slate-700/60">
                Corrigir = desvio × n/(n+{PRIOR_N}): encolhe quando há poucas picks. Positivo = subir a probabilidade do modelo, negativo = baixar. Menos de 2 pp = manter. Só sugere com {MIN_MARKET_N}+ picks no mercado.
              </p>
            </div>
          )}

          <div className="rounded-xl border border-slate-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-800 text-slate-400 text-[11px]">
                <tr>
                  <th className="text-left px-3 py-2">Banda</th>
                  <th className="text-right px-2 py-2">Picks</th>
                  <th className="text-right px-2 py-2">Previsto</th>
                  <th className="text-right px-2 py-2">Real</th>
                  <th className="text-right px-3 py-2">Desvio</th>
                </tr>
              </thead>
              <tbody>
                {rows.bands.map((b) => {
                  const d = b.real - b.pred;
                  const low = b.n < MIN_N;
                  return (
                    <tr key={b.lo} className={`border-t border-slate-700/60 ${low ? 'text-slate-500' : 'text-slate-200'}`}>
                      <td className="px-3 py-1.5">{b.lo}–{b.lo + 5}%</td>
                      <td className="text-right px-2">{b.hits}/{b.n}</td>
                      <td className="text-right px-2">{b.pred.toFixed(0)}%</td>
                      <td className="text-right px-2">{b.real.toFixed(0)}%</td>
                      <td className={`text-right px-3 ${low ? '' : Math.abs(d) < 5 ? 'text-emerald-400' : d > 0 ? 'text-sky-400' : 'text-amber-400'}`}>
                        {d > 0 ? '+' : ''}{d.toFixed(0)} pp
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default CalibrationView;
