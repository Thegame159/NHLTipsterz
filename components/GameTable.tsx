// src/components/GameTable.tsx

import React, { useState } from 'react';
import { GamePrediction } from '../types';
import { ScaleKey, levelOf, hasStar, barWidth, SCALE_BADGE, SCALE_BAR } from '../utils/marketScale';
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

const getColorClass = (v: number) => {
  if (v <= 30) return 'text-rose-400 border-rose-500/30 bg-rose-500/10';
  if (v <= 49) return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
  if (v <= 69) return 'text-green-400 border-green-500/30 bg-green-500/10';
  return 'text-emerald-400 border-emerald-600/40 bg-emerald-500/10';
};

const getBarColor = (v: number) => {
  if (v <= 30) return 'bg-gradient-to-r from-rose-500 to-red-500';
  if (v <= 49) return 'bg-gradient-to-r from-yellow-500 to-amber-500';
  if (v <= 69) return 'bg-gradient-to-r from-green-500 to-emerald-500';
  return 'bg-gradient-to-r from-emerald-500 to-green-600';
};

const ProbabilityCell: React.FC<{ value?: number; scale?: ScaleKey; top?: boolean }> = ({ value, scale, top }) => {
  const val = safeNum(value);
  const lvl = scale ? levelOf(scale, val) : 0;
  const badgeCls = scale ? SCALE_BADGE[lvl] : getColorClass(val);
  const barCls = scale ? SCALE_BAR[lvl] : getBarColor(val);
  const barW = scale ? barWidth(scale, val) : val;
  return (
    <div className="flex flex-col items-center justify-center min-w-[80px]">
      <div className="relative">
        <div className={`px-4 py-1.5 rounded-lg border font-black text-sm mb-1.5 ${badgeCls} ${top ? 'outline outline-2 outline-offset-2 outline-amber-200/30' : ''}`}>
          {Math.round(val)}%
        </div>
        {scale && hasStar(scale, val) && (
          <span
            title="Acima da média neste mercado"
            className={`absolute -top-2 -right-2 w-[18px] h-[18px] rounded-full bg-slate-950 border flex items-center justify-center text-[10px] leading-none ${lvl >= 2 ? 'border-emerald-400 text-emerald-300' : 'border-amber-400 text-amber-300'}`}
          >
            ★
          </span>
        )}
      </div>
      <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden max-w-[60px]">
        <div
          className={`h-full ${barCls} transition-all duration-700`}
          style={{ width: `${barW}%` }}
        />
      </div>
      <div className={`mt-1 text-[8px] font-black tracking-widest text-amber-200 ${top ? '' : 'invisible'}`}>▲ TOP</div>
    </div>
  );
};

type Tops = { draw: number; p1: number; btts: number; p2: number; o45: number; multi: boolean };

// ─── Equipa (logo, nome, registo e jogos por baixo) ─────────────────────────

const TeamBlock: React.FC<{ abbr: string; strong: boolean; record?: string; games?: number; b2b?: boolean }> = ({ abbr, strong, record, games, b2b }) => (
  <div className="flex items-center gap-2.5">
    <img
      src={getLogoUrl(abbr)}
      className="w-7 h-7 object-contain drop-shadow-sm shrink-0"
      alt={abbr}
      onError={(e) => (e.currentTarget.src = FALLBACK_LOGO)}
    />
    <div>
      <div className={`font-black text-base leading-tight whitespace-nowrap ${strong ? 'text-white' : 'text-slate-400'}`}>{teamLabel(abbr)}</div>
      <div className="flex items-center gap-1.5 mt-1">
        <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-bold uppercase">{record || '0-0-0'}</span>
        {typeof games === 'number' && (
          <span
            title={`Estimativa baseada nos últimos ${games} jogo(s)`}
            className="text-[10px] bg-slate-800/60 text-slate-500 px-1.5 py-0.5 rounded font-bold"
          >
            {games}J
          </span>
        )}
        {b2b && (
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
);

// ─── Linha de jogo ───────────────────────────────────────────────────────────

const GameRow: React.FC<{ game: GamePrediction; tops: Tops }> = ({ game, tops }) => {
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

  const homeTeam = game.homeTeamAbbr || game.homeTeam || '';
  const awayTeam = game.awayTeamAbbr || game.awayTeam || '';
  const favTeam = isHomeFav ? homeTeam : awayTeam;
  const dogTeam = isHomeFav ? awayTeam : homeTeam;
  const isTop = (v: number, max: number) => tops.multi && v > 0 && v === max;

  return (
    <>
      <tr
        onClick={() => setIsExpanded(!isExpanded)}
        className="group border-b border-slate-800/50 hover:bg-blue-500/5 transition-colors cursor-pointer"
      >
        {/* COLUNA: Jogo */}
        <td className="relative py-4 pl-4 pr-12 w-[1%] whitespace-nowrap">
          <div className="flex items-start gap-3">
            <div>
              <span className="text-[10px] font-bold text-slate-500 mb-2 flex items-center gap-1.5">
                <i className="far fa-clock"></i>
                {formatTime(game.dateTime)}
              </span>
              <div className="flex items-center gap-3">
                <TeamBlock abbr={homeTeam} strong={isEven || isHomeFav} record={game.homeRecordL10} games={game.homeGames} b2b={game.homeB2B} />
                <span className="text-slate-600 font-bold text-xs shrink-0">vs</span>
                <TeamBlock abbr={awayTeam} strong={isEven || !isHomeFav} record={game.awayRecordL10} games={game.awayGames} b2b={game.awayB2B} />
              </div>
            </div>
            <span
              aria-hidden
              className={`absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full border text-[10px] leading-none transition-all duration-200 ${
                isExpanded ? 'rotate-180 border-orange-500/60 text-orange-400 bg-orange-500/10' : 'border-slate-600 text-slate-400 group-hover:border-orange-500/50 group-hover:text-orange-400'
              }`}
            >
              ▾
            </span>
          </div>
        </td>

        {/* COLUNA: Prob. Vitória (favorito em pílula, barra e o outro lado por baixo) */}
        <td className="py-4 pl-3 pr-6">
          <div className="flex flex-col items-start gap-1.5">
            <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border font-black text-sm ${getColorClass(maxProb)}`}>
              <img
                src={getLogoUrl(favTeam)}
                className="w-5 h-5 object-contain shrink-0"
                alt={favTeam}
                onError={(e) => (e.currentTarget.src = FALLBACK_LOGO)}
              />
              {Math.round(maxProb)}%
              <span className="text-[8px] opacity-70">{isEven ? 'EQUIL.' : isHomeFav ? 'CASA' : 'FORA'}</span>
            </div>

            <div className="w-full h-1 bg-slate-800 rounded-full max-w-[130px] overflow-hidden">
              <div
                className={`h-full transition-all duration-700 ${
                  maxProb <= 30 ? 'bg-rose-500' :
                  maxProb <= 49 ? 'bg-amber-500' :
                  maxProb <= 69 ? 'bg-green-500' :
                  'bg-emerald-500'
                }`}
                style={{ width: `${maxProb}%` }}
              />
            </div>

            <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
              <img
                src={getLogoUrl(dogTeam)}
                className="w-3.5 h-3.5 object-contain shrink-0 opacity-80"
                alt={dogTeam}
                onError={(e) => (e.currentTarget.src = FALLBACK_LOGO)}
              />
              {teamLabel(dogTeam)} {100 - Math.round(maxProb)}%
            </div>
          </div>
        </td>

        {/* COLUNAS: Probabilidades */}
        <td className="py-4 text-center"><ProbabilityCell value={drawProb} scale="draw" top={isTop(drawProb, tops.draw)} /></td>
        <td className="py-4 text-center"><ProbabilityCell value={over15P1} scale="p1" top={isTop(over15P1, tops.p1)} /></td>
        <td className="py-4 text-center"><ProbabilityCell value={bttsP1} scale="btts" top={isTop(bttsP1, tops.btts)} /></td>
        <td className="py-4 text-center">
          {typeof game.over15P2Prob === 'number' ? <ProbabilityCell value={game.over15P2Prob} scale="p2" top={isTop(game.over15P2Prob, tops.p2)} /> : <span className="text-slate-700">–</span>}
        </td>
        <td className="py-4 text-center pr-4"><ProbabilityCell value={over45} scale="o45" top={isTop(over45, tops.o45)} /></td>
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
  const maxOf = (f: (g: GamePrediction) => number) => Math.max(0, ...gamesList.map(f));
  const tops: Tops = {
    draw: maxOf((g) => safeNum(g.drawTRProb ?? (g as any).drawProb)),
    p1: maxOf((g) => safeNum(g.over15P1Prob)),
    btts: maxOf((g) => safeNum(g.bttsP1Prob)),
    p2: maxOf((g) => safeNum(g.over15P2Prob)),
    o45: maxOf((g) => safeNum(g.over45Prob ?? (g as any).over55Prob)),
    multi: gamesList.length > 1,
  };

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

      {/* Legenda */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] font-semibold text-slate-400">
        <span className="flex items-center gap-1.5"><span className="text-amber-300 text-xs">★</span> acima da média do mercado</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded border border-rose-500/60 bg-rose-500/30"></span>abaixo</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded border border-amber-500/60 bg-amber-500/30"></span>normal</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded border border-green-500/60 bg-green-500/30"></span>acima</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded border border-emerald-400/70 bg-emerald-400/40"></span>muito acima</span>
        <span className="flex items-center gap-1.5"><span className="font-black tracking-widest text-amber-200 text-[9px]">▲ TOP</span> valor mais alto do dia na coluna</span>
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
              <tr className="bg-slate-900/80 border-b border-slate-700">
                <th className="py-4 pl-4 pr-4 w-[1%] text-[10px] font-black text-slate-300 uppercase tracking-widest">
                  Jogo
                </th>
                <th className="py-4 pl-3 text-left text-[10px] font-black text-slate-300 uppercase tracking-widest">
                  Prob. Vitória
                </th>
                <th className="py-4 text-center text-[10px] font-black text-slate-300 uppercase tracking-widest">
                  Empate OT
                  <span className="block mt-1 text-[10px] font-bold tracking-normal text-slate-300">(22%)</span>
                </th>
                <th className="py-4 text-center text-[10px] font-black text-slate-300 uppercase tracking-widest">
                  1ºP &gt; 1.5
                  <span className="block mt-1 text-[10px] font-bold tracking-normal text-slate-300">(48%)</span>
                </th>
                <th className="py-4 text-center text-[10px] font-black text-slate-300 uppercase tracking-widest">
                  1ºP BTTS
                  <span className="block mt-1 text-[10px] font-bold tracking-normal text-slate-300">(31%)</span>
                </th>
                <th className="py-4 text-center text-[10px] font-black text-slate-300 uppercase tracking-widest">
                  2ºP &gt; 1.5
                  <span className="block mt-1 text-[10px] font-bold tracking-normal text-slate-300">(62%)</span>
                </th>
                <th className="py-4 text-center pr-4 text-[10px] font-black text-slate-300 uppercase tracking-widest">
                  Jogo &gt; 4.5
                  <span className="block mt-1 text-[10px] font-bold tracking-normal text-slate-300">(72%)</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {gamesList.map((game, idx) => (
                <GameRow key={game.id ?? idx} game={game} tops={tops} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default GameTable;
