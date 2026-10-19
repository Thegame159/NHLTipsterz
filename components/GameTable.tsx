// src/components/GameTable.tsx

import { MarketKey, tierOf, barPct, TIER_BADGE, TIER_BAR } from '../utils/marketScale';
import React, { useState } from 'react';
import { GamePrediction } from '../types';
import {
  getLogoUrl,
  FALLBACK_LOGO,
  teamLabel,
  formatTime,
} from '../utils/nhlUtils';

interface Props {
  predictions: GamePrediction[];
  totalGames?: number;
}

// ─── Helper de segurança numérica ──────────────────────────────────────────

const safeNum = (v: any): number => {
  return typeof v === 'number' && !isNaN(v) ? v : 0;
};

// ─── Célula de probabilidade ────────────────────────────────────────────────

const ProbabilityCell: React.FC<{ value?: number; market: MarketKey }> = ({ value, market }) => {
  const val = safeNum(value);
  const tier = tierOf(market, val);
  return (
    <div className="flex flex-col items-center justify-center min-w-[80px]">
      <div className={`px-4 py-1.5 rounded-lg border font-black text-sm mb-1.5 ${TIER_BADGE[tier]}`}>
        {Math.round(val)}%
      </div>
      <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden max-w-[60px]">
        <div
          className={`h-full ${TIER_BAR[tier]} transition-all duration-700`}
          style={{ width: `${barPct(market, val)}%` }}
        />
      </div>
    </div>
  );
};

// ─── Linha de jogo ───────────────────────────────────────────────────────────

const GameRow: React.FC<{ game: GamePrediction }> = ({ game }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Leitura segura de valores numéricos
  const winHome = safeNum(game.winProbabilityHome ?? (game as any).homeWinProb);
  const winAway = safeNum(game.winProbabilityAway ?? (game as any).awayWinProb);
  const drawProb = safeNum(game.drawTRProb ?? (game as any).drawProb);
  const over15P1 = safeNum(game.over15P1Prob);
  const bttsP1 = safeNum(game.bttsP1Prob);
  const over45 = safeNum(game.over45Prob ?? (game as any).over55Prob);

  const isHomeFav = winHome >= winAway;
  // Jogo equilibrado: nenhuma das equipas tem destaque (dados antigos, sem o campo, usam a diferença de pontos)
  const isEven = game.favorite ? game.favorite === 'even' : Math.abs(winHome - winAway) <= 2;
  const maxProb = Math.max(winHome, winAway);
  const winTier = isEven ? 'normal' : tierOf('win', maxProb);

  const homeTeam = game.homeTeamAbbr || game.homeTeam || '';
  const awayTeam = game.awayTeamAbbr || game.awayTeam || '';

  return (
    <>
      <tr
        onClick={() => setIsExpanded(!isExpanded)}
        className="group border-b border-slate-800/50 hover:bg-blue-500/5 transition-colors cursor-pointer"
      >
        {/* COLUNA: Jogo */}
        <td className="py-6 pl-4">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-slate-500 mb-3 flex items-center gap-1.5">
              <i className="far fa-clock"></i>
              {formatTime(game.dateTime)}
            </span>

            <div className="space-y-4">
              {/* CASA */}
              <div className="flex items-center gap-3">
                <img
                  src={getLogoUrl(homeTeam)}
                  className="w-7 h-7 object-contain drop-shadow-sm"
                  alt={homeTeam}
                  onError={(e) => (e.currentTarget.src = FALLBACK_LOGO)}
                />
                <div className="flex items-center gap-2">
                  <span className={`font-black text-lg ${isEven || isHomeFav ? 'text-white' : 'text-slate-400'}`}>
                    {teamLabel(homeTeam)}
                  </span>
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-bold uppercase">
                    {game.homeRecordL10 || '0-0-0'}
                  </span>
                  {typeof game.homeGames === 'number' && (
                    <span
                      title={`Estimativa baseada nos últimos ${game.homeGames} jogo(s)`}
                      className="text-[10px] bg-slate-800/60 text-slate-500 px-1.5 py-0.5 rounded font-bold"
                    >
                      {game.homeGames}J
                    </span>
                  )}
                  {game.homeB2B && (
                    <span
                      title="Jogou ontem (2.ª noite seguida)"
                      className="text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded font-black uppercase"
                    >
                      B2B
                    </span>
                  )}
                </div>
              </div>

              <div className="pl-2.5">
                <span className="text-slate-600 font-bold text-xs">vs</span>
              </div>

              {/* VISITANTE */}
              <div className="flex items-center gap-3">
                <img
                  src={getLogoUrl(awayTeam)}
                  className="w-7 h-7 object-contain drop-shadow-sm"
                  alt={awayTeam}
                  onError={(e) => (e.currentTarget.src = FALLBACK_LOGO)}
                />
                <div className="flex items-center gap-2">
                  <span className={`font-black text-lg ${isEven || !isHomeFav ? 'text-white' : 'text-slate-400'}`}>
                    {teamLabel(awayTeam)}
                  </span>
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-bold uppercase">
                    {game.awayRecordL10 || '0-0-0'}
                  </span>
                  {typeof game.awayGames === 'number' && (
                    <span
                      title={`Estimativa baseada nos últimos ${game.awayGames} jogo(s)`}
                      className="text-[10px] bg-slate-800/60 text-slate-500 px-1.5 py-0.5 rounded font-bold"
                    >
                      {game.awayGames}J
                    </span>
                  )}
                  {game.awayB2B && (
                    <span
                      title="Jogou ontem (2.ª noite seguida)"
                      className="text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded font-black uppercase"
                    >
                      B2B
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </td>

        {/* COLUNA: Prob. Vitória */}
        <td className="text-right py-6 pr-8">
          <div className="flex flex-col items-end gap-1">
            <div className="flex gap-4 text-[10px] font-bold text-slate-500 uppercase mb-2">
              <span>Casa: {winHome.toFixed(1)}%</span>
              <span>Fora: {winAway.toFixed(1)}%</span>
            </div>

            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border font-black text-xs min-w-[100px] justify-center ${TIER_BADGE[winTier]}`}>
              {Math.round(maxProb)}%
              <span className="text-[8px] opacity-60 ml-1">
                {isEven ? 'EQUIL.' : isHomeFav ? 'CASA' : 'FORA'}
              </span>
            </div>

            <div className="w-full h-1 bg-slate-800 rounded-full mt-2 max-w-[100px] overflow-hidden">
              <div
                className={`h-full transition-all duration-700 ${TIER_BAR[winTier]}`}
                style={{ width: `${barPct('win', maxProb)}%` }}
              />
            </div>

            {/* Seta indicadora de expansão */}
            <span className={`text-slate-500 text-[10px] mt-1 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''} inline-block`}>
              ▶
            </span>
          </div>
        </td>

        {/* COLUNAS: Probabilidades */}
        <td className="py-6 text-center"><ProbabilityCell value={drawProb} market="draw" /></td>
        <td className="py-6 text-center"><ProbabilityCell value={over15P1} market="over15P1" /></td>
        <td className="py-6 text-center"><ProbabilityCell value={bttsP1} market="btts1P" /></td>
        <td className="py-6 text-center">
          {typeof game.over15P2Prob === 'number' ? <ProbabilityCell value={game.over15P2Prob} market="over15P2" /> : <span className="text-slate-700">–</span>}
        </td>
        <td className="py-6 text-center pr-4"><ProbabilityCell value={over45} market="over45" /></td>
      </tr>

      {/* PAINEL EXPANDIDO */}
      {isExpanded && (
        <tr className="bg-slate-900/40 border-b border-slate-800">
          <td colSpan={7} className="p-6 space-y-4">

            {/* Resumo */}
            <div className="text-sm text-slate-300">
              <span className="text-blue-500 font-black uppercase mr-2">Resumo:</span>
              <span className="italic text-slate-400">{game.analysisSummary || (game as any).analysis || 'Sem resumo disponível.'}</span>
            </div>

            {/* Estimativas do modelo */}
            {(game.scoreGuess || game.homeP1) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="text-blue-400 font-bold text-[11px] uppercase tracking-wide">Palpite do modelo</div>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-slate-300">
                    {game.scoreGuess && (
                      <span>
                        Resultado: <b className="text-white">{teamLabel(homeTeam)} {game.scoreGuess} {teamLabel(awayTeam)}</b>
                        {game.favorite === 'even' && <span className="ml-2 text-slate-500 text-xs">(jogo equilibrado, decide-se no prolongamento)</span>}
                      </span>
                    )}
                    {typeof game.totalLine === 'number' && (
                      <span>
                        Total: <b className="text-white">{game.totalLine.toFixed(1)}</b> golos
                      </span>
                    )}
                  </div>
                  {typeof game.p1WinHome === 'number' && (
                    <div className="text-sm text-slate-300">
                      A ganhar no fim do 1.º período:{' '}
                      <b className="text-white">{teamLabel(homeTeam)} {game.p1WinHome}%</b> · empate{' '}
                      <b className="text-white">{game.p1Draw}%</b> ·{' '}
                      <b className="text-white">{teamLabel(awayTeam)} {game.p1WinAway}%</b>
                    </div>
                  )}
                </div>

                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="text-blue-400 font-bold text-[11px] uppercase tracking-wide">1.º período, por equipa</div>
                  {[
                    { name: teamLabel(homeTeam), s: game.homeP1 },
                    { name: teamLabel(awayTeam), s: game.awayP1 },
                  ].map(({ name, s }) => (
                    <div key={name} className="text-sm text-slate-400">
                      <span className="font-bold text-slate-200">{name}</span>
                      {s && s.n > 0 ? (
                        <span>
                          {' '}· marcou em <b className="text-white">{s.scored}/{s.n}</b> · sofreu em{' '}
                          <b className="text-white">{s.conceded}/{s.n}</b> · ambas marcaram em{' '}
                          <b className="text-white">{s.btts}/{s.n}</b> · prob. de marcar hoje{' '}
                          <b className="text-emerald-400">{s.scoreProb}%</b>
                        </span>
                      ) : (
                        <span> · sem dados do 1.º período</span>
                      )}
                    </div>
                  ))}
                  <p className="text-[10px] text-slate-600 leading-tight">
                    Contagens nos últimos jogos de cada equipa (os números da equipa e do adversário combinam-se no modelo).
                  </p>
                </div>
              </div>
            )}

            {/* 2.º período */}
            {game.homeP2 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-start-2 bg-slate-900/50 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="text-blue-400 font-bold text-[11px] uppercase tracking-wide">2.º período, por equipa</div>
                  {[
                    { name: teamLabel(homeTeam), s: game.homeP2 },
                    { name: teamLabel(awayTeam), s: game.awayP2 },
                  ].map(({ name, s }) => (
                    <div key={name} className="text-sm text-slate-400">
                      <span className="font-bold text-slate-200">{name}</span>
                      {s && s.n > 0 ? (
                        <span>
                          {' '}· marcou em <b className="text-white">{s.scored}/{s.n}</b> · sofreu em{' '}
                          <b className="text-white">{s.conceded}/{s.n}</b> · prob. de marcar hoje{' '}
                          <b className="text-emerald-400">{s.scoreProb}%</b>
                        </span>
                      ) : (
                        <span> · sem dados do 2.º período</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Lesões */}
            <div className="grid grid-cols-2 gap-6 text-sm">
              <div>
                <div className="text-rose-400 font-bold mb-2 text-[11px] uppercase tracking-wide">
                  Lesões {teamLabel(homeTeam)}
                  {(game.injuryAdj?.home ?? 0) >= 0.05 && (
                    <span className="ml-2 text-amber-400 normal-case">· ajuste −{game.injuryAdj!.home.toFixed(2)} golos/jogo</span>
                  )}
                </div>
                {game.injuries?.home?.length > 0
                  ? <ul className="space-y-1 text-slate-400">
                      {game.injuries.home.map((inj, i) => <li key={i}>• {inj}</li>)}
                    </ul>
                  : <p className="text-slate-600 text-[11px]">Sem lesões registadas</p>
                }
              </div>
              <div>
                <div className="text-rose-400 font-bold mb-2 text-[11px] uppercase tracking-wide">
                  Lesões {teamLabel(awayTeam)}
                  {(game.injuryAdj?.away ?? 0) >= 0.05 && (
                    <span className="ml-2 text-amber-400 normal-case">· ajuste −{game.injuryAdj!.away.toFixed(2)} golos/jogo</span>
                  )}
                </div>
                {game.injuries?.away?.length > 0
                  ? <ul className="space-y-1 text-slate-400">
                      {game.injuries.away.map((inj, i) => <li key={i}>• {inj}</li>)}
                    </ul>
                  : <p className="text-slate-600 text-[11px]">Sem lesões registadas</p>
                }
              </div>
            </div>

          </td>
        </tr>
      )}
    </>
  );
};

// ─── Tabela principal ────────────────────────────────────────────────────────

const GameTable: React.FC<Props> = ({ predictions, totalGames }) => {
  const gamesList = predictions || [];

  return (
    <div className="space-y-8 pb-8">

      {/* Cabeçalho de secção com contador */}
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          Jogos Agendados
        </span>
        <span className="ml-auto text-[10px] text-slate-600 font-bold">
          {gamesList.length} {gamesList.length === 1 ? 'jogo' : 'jogos'}
          {typeof totalGames === 'number' && totalGames > gamesList.length ? ` (de ${totalGames} hoje)` : ''}
        </span>
      </div>

      {/* Legenda das cores (relativas a cada mercado) */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-slate-500">
        <span className="font-black uppercase tracking-widest text-[9px]">Cores</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded border border-slate-700 bg-slate-800/60" /> normal</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded border border-amber-500/50 bg-amber-500/20" /> acima da média</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded border border-emerald-400/70 bg-emerald-500/30" /> forte (critério das Escolhas Fortes)</span>
        <span className="text-slate-600">· cada coluna tem a sua escala: 27% de empate pesa mais que 47% em 1ºP &gt; 1.5</span>
      </div>

      {/* Estado vazio */}
      {gamesList.length === 0 ? (
        <div className="w-full rounded-2xl border border-slate-800 bg-slate-800/20 py-16 text-center">
          <p className="text-slate-500 text-sm">Sem jogos disponíveis para esta data.</p>
        </div>
      ) : (
        <div className="w-full overflow-x-auto rounded-2xl border border-slate-800 bg-slate-800/20 shadow-2xl backdrop-blur-sm">
          <table className="w-full text-left border-collapse min-w-[990px]">
            <thead>
              <tr className="bg-slate-900/60 border-b border-slate-800">
                <th className="py-4 pl-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Jogo
                </th>
                <th className="py-4 text-right pr-8 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Prob. Vitória
                </th>
                <th className="py-4 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Empate OT
                </th>
                <th className="py-4 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  1ºP &gt; 1.5
                </th>
                <th className="py-4 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  1ºP BTTS
                </th>
                <th className="py-4 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  2ºP &gt; 1.5
                </th>
                <th className="py-4 text-center pr-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Jogo &gt; 4.5
                </th>
              </tr>
            </thead>
            <tbody>
              {gamesList.map((game, idx) => (
                <GameRow key={game.id ?? idx} game={game} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default GameTable;
