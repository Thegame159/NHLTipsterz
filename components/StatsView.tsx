import React, { useEffect, useMemo, useState } from "react";
import { Suggestions } from "../types";

type StoredAuto = { savedAt: number; suggestions: Suggestions };
type StoredMine = { savedAt?: number; suggestions: Suggestions } | Suggestions;

type ApiResultGame = {
  gameId: number;
  awayAbbr: string;
  homeAbbr: string;
  status: "FINAL" | "LIVE" | "SCHEDULED" | "UNKNOWN";
  finalAway: number;
  finalHome: number;
  regAway: number;
  regHome: number;
  p1Away: number;
  p1Home: number;
  winnerAbbr: string | null;
};

type ApiResultsResponse = {
  date: string;
  games: ApiResultGame[];
  byMatchup: Record<string, ApiResultGame>;
};

// ----------------- TEAM NAME -> ABBR (para Auto / nomes completos) -----------------
const TEAM_FULLNAMES: Record<string, string[]> = {
  ANA: ["anaheim ducks", "ducks", "anaheim"],
  BOS: ["boston bruins", "bruins", "boston"],
  BUF: ["buffalo sabres", "sabres", "buffalo"],
  CAR: ["carolina hurricanes", "hurricanes", "carolina"],
  CBJ: ["columbus blue jackets", "blue jackets", "bluejackets", "columbus"],
  CGY: ["calgary flames", "flames", "calgary"],
  CHI: ["chicago blackhawks", "blackhawks", "chicago"],
  COL: ["colorado avalanche", "avalanche", "colorado"],
  DAL: ["dallas stars", "stars", "dallas"],
  DET: ["detroit red wings", "red wings", "redwings", "detroit"],
  EDM: ["edmonton oilers", "oilers", "edmonton"],
  FLA: ["florida panthers", "panthers", "florida"],
  LAK: ["los angeles kings", "la kings", "kings", "los angeles"],
  MIN: ["minnesota wild", "wild", "minnesota"],
  MTL: ["montreal canadiens", "montréal canadiens", "canadiens", "montreal", "montréal"],
  NJD: ["new jersey devils", "devils", "new jersey", "nj devils"],
  NSH: ["nashville predators", "predators", "nashville"],
  NYI: ["new york islanders", "islanders", "ny islanders", "nyi"],
  // ✅ reforço para Rangers + variações comuns
  NYR: ["new york rangers", "rangers", "ny rangers", "nyr", "new york ranger"],
  OTT: ["ottawa senators", "senators", "ottawa"],
  PHI: ["philadelphia flyers", "flyers", "philadelphia"],
  PIT: ["pittsburgh penguins", "penguins", "pittsburgh"],
  SEA: ["seattle kraken", "kraken", "seattle"],
  SJS: ["san jose sharks", "sharks", "san jose"],
  STL: ["st. louis blues", "st louis blues", "blues", "st louis", "saint louis"],
  TBL: ["tampa bay lightning", "lightning", "tampa bay", "tampa"],
  TOR: ["toronto maple leafs", "maple leafs", "leafs", "toronto"],
  VAN: ["vancouver canucks", "canucks", "vancouver"],
  VGK: ["vegas golden knights", "golden knights", "knights", "vegas"],
  WPG: ["winnipeg jets", "jets", "winnipeg"],
  WSH: ["washington capitals", "capitals", "washington"],
  UTA: ["utah hockey club", "utah"],
};

const norm = (s: string) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();

function guessAbbrFromText(text: string): string | null {
  const t = norm(text);
  if (!t) return null;

  // abreviação direta (primeira ocorrência) — pode falhar se apanhar "VS", por isso filtramos
  const mm = (text || "").toUpperCase().match(/\b[A-Z]{2,4}\b/g) || [];
  const direct = mm.find((x) => !["OT", "VS", "V"].includes(x));
  if (direct) return direct;

  // nomes completos/curtos
  for (const [abbr, names] of Object.entries(TEAM_FULLNAMES)) {
    for (const n of names) {
      if (t.includes(n)) return abbr;
    }
  }
  return null;
}

// ----------------- Helpers -----------------
const normalizeGameText = (s: string) =>
  (s || "")
    .trim()
    .toUpperCase()
    .replace(/\(\s*\d+(\.\d+)?%\s*\)/g, "")
    .replace(/\s+VS\s+/g, " VS ")
    .replace(/\s+@\s+/g, " VS ")
    .replace(/\s+V\s+/g, " VS ")
    .replace(/\s+/g, " ")
    .replace(" vs ", " VS ");

const splitMatchup = (text: string): [string, string] | null => {
  const cleaned = normalizeGameText(text);
  if (!cleaned.includes(" VS ")) return null;
  const parts = cleaned.split(" VS ").map((x) => x.trim());
  if (parts.length < 2) return null;
  return [parts[0], parts[1]];
};

// ✅ Melhorado: se não houver abreviações suficientes, tenta nomes completos
const parseTeamsFromText = (text: string): string[] => {
  const cleaned = normalizeGameText(text);
  const raw = cleaned.toUpperCase();

  const abbrMatches = raw.match(/\b[A-Z]{2,4}\b/g) || [];
  const abbr = abbrMatches.filter((s) => !["OT", "VS", "V"].includes(s));
  if (abbr.length >= 2) return abbr.slice(0, 2);

  // fallback: nomes completos tipo "New York Rangers"
  const sp = splitMatchup(cleaned);
  if (sp) {
    const a = guessAbbrFromText(sp[0]);
    const b = guessAbbrFromText(sp[1]);
    const out = [a, b].filter(Boolean) as string[];
    if (out.length >= 2) return out.slice(0, 2);
  }

  // fallback single
  const single = guessAbbrFromText(cleaned);
  return single ? [single] : [];
};

const parseTeamSingle = (text: string): string | null => {
  // 1) abreviação direta
  const raw = (text || "").toUpperCase();
  const mm = raw.match(/\b[A-Z]{2,4}\b/g) || [];
  const direct = mm.find((x) => !["OT", "VS", "V"].includes(x));
  if (direct) return direct;

  // 2) nome completo
  return guessAbbrFromText(text);
};

const getLogoUrl = (abbr: string) => {
  const map: Record<string, string> = {
    TBL: "tb",
    TB: "tb",
    SJS: "sj",
    SJ: "sj",
    LAK: "la",
    LA: "la",
    VGK: "vgs",
    VGS: "vgs",
    UTA: "utah",
    NJD: "nj",
    NJ: "nj",
    CBJ: "cbj",
    WSH: "wsh",
    WPG: "wpg",
    NSH: "nsh",
    MTL: "mtl",
    NYI: "nyi",
    NYR: "nyr",
    ANA: "ana",
    BOS: "bos",
    BUF: "buf",
    CGY: "cgy",
    CAR: "car",
    CHI: "chi",
    COL: "col",
    DAL: "dal",
    DET: "det",
    EDM: "edm",
    FLA: "fla",
    MIN: "min",
    OTT: "ott",
    PHI: "phi",
    PIT: "pit",
    SEA: "sea",
    STL: "stl",
    VAN: "van",
    TOR: "tor",
  };
  const normalized = (abbr || "").trim().toUpperCase();
  const code = map[normalized] || normalized.toLowerCase();
  return `https://a.espncdn.com/i/teamlogos/nhl/500/${code}.png`;
};

function readAllDates(prefix: string): string[] {
  const dates: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i) || "";
    if (!k.startsWith(prefix)) continue;
    const date = k.replace(prefix, "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) dates.push(date);
  }
  dates.sort((a, b) => (a < b ? 1 : -1));
  return dates;
}

function safeReadJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ----------------- Eval -----------------
type PickEval = { label: string; ok: boolean | null; reason?: string; teams?: string[] };

type DayReport = {
  date: string;
  auto: { percent: number | null; correct: number; total: number; byMarket: Record<string, PickEval[]> };
  mine: { percent: number | null; correct: number; total: number; byMarket: Record<string, PickEval[]> };
  resultsStatus: "loading" | "ready" | "error";
  error?: string;
};

function evalMarkets(
  sug: Suggestions,
  results: ApiResultsResponse
): { correct: number; total: number; byMarket: Record<string, PickEval[]> } {
  const byMatchup = results.byMatchup || {};

  const evalGamePick = (text: string, fn: (g: ApiResultGame) => boolean): PickEval => {
    const cleaned = normalizeGameText(text);

    // 1) tenta abreviações
    let teams = parseTeamsFromText(cleaned);

    // 2) fallback: nomes completos "Boston Bruins VS Toronto Maple Leafs"
    if (teams.length < 2) {
      const sp = splitMatchup(cleaned);
      if (!sp) return { label: text, ok: null, reason: "Não consegui ler as equipas." };
      const a = guessAbbrFromText(sp[0]);
      const b = guessAbbrFromText(sp[1]);
      teams = [a || "", b || ""].filter(Boolean);
    }

    if (teams.length < 2) return { label: text, ok: null, reason: "Não consegui ler as equipas." };

    const key = `${teams[0]} VS ${teams[1]}`;
    const g = byMatchup[key];
    if (!g) return { label: text, ok: null, teams, reason: "Jogo não encontrado na API." };
    if (g.status !== "FINAL") return { label: text, ok: null, teams, reason: "Jogo ainda não terminou." };

    return { label: text, ok: fn(g), teams };
  };

  const evalWinTeam = (text: string): PickEval => {
    // ✅ agora suporta abreviação OU nome completo (ex: New York Rangers)
    const team = parseTeamSingle(text);

    if (!team) return { label: text, ok: null, reason: "Não consegui ler a equipa." };

    const game = Object.values(byMatchup).find((g) => g.awayAbbr === team || g.homeAbbr === team);

    // ✅ em vez de “equipa não encontrada”, tratamos como “dados ainda não disponíveis”
    if (!game) {
      return {
        label: text,
        ok: null,
        teams: [team],
        reason: "Resultados do dia ainda não disponíveis para esta equipa.",
      };
    }

    if (game.status !== "FINAL") return { label: text, ok: null, teams: [team], reason: "Jogo ainda não terminou." };

    return { label: text, ok: game.winnerAbbr === team, teams: [team] };
  };

  const out: Record<string, PickEval[]> = {
    "Vitória (incl. OT)": (sug.tripleWin || []).map(evalWinTeam),
    "Over 1.5 P1 (Triplete)": (sug.tripleOver15P1 || []).map((t) => evalGamePick(t, (g) => g.p1Away + g.p1Home >= 2)),
    "Over 1.5 P1 (Dupla)": (sug.doubleOver15P1 || []).map((t) => evalGamePick(t, (g) => g.p1Away + g.p1Home >= 2)),
    "Empate TR": (sug.drawSuggestions || []).map((d) => evalGamePick(d.game, (g) => g.regAway === g.regHome)),
    "Over 4.5": (sug.quadrupleOver45 || []).map((t) => evalGamePick(t, (g) => g.finalAway + g.finalHome >= 5)),
    "Over 5.5": (sug.over55Suggestions || []).map((t) => evalGamePick(t, (g) => g.finalAway + g.finalHome >= 6)),
  };

  let correct = 0;
  let total = 0;

  for (const market of Object.keys(out)) {
    for (const p of out[market]) {
      if (p.ok === null) continue; // pendentes não contam
      total++;
      if (p.ok) correct++;
    }
  }

  return { correct, total, byMarket: out };
}

// ----------------- UI blocks -----------------
const StatRow: React.FC<{
  date: string;
  autoPct: number | null;
  minePct: number | null;
  isOpen: boolean;
  onToggle: () => void;
}> = ({ date, autoPct, minePct, isOpen, onToggle }) => (
  <button
    onClick={onToggle}
    className="w-full text-left bg-slate-800/40 border border-slate-700/50 rounded-2xl p-4 sm:p-5 hover:bg-slate-800/60 transition flex items-center justify-between gap-4"
  >
    <div className="flex flex-col">
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Data</span>
      <span className="text-lg font-black text-white">{date}</span>
    </div>

    <div className="flex items-center gap-3 sm:gap-6">
      <div className="text-right">
        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Auto</div>
        <div className="text-sm font-black text-amber-300">{autoPct === null ? "--" : `${autoPct.toFixed(1)}%`}</div>
      </div>

      <div className="text-right">
        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Minhas</div>
        <div className="text-sm font-black text-blue-300">{minePct === null ? "--" : `${minePct.toFixed(1)}%`}</div>
      </div>

      <div className="text-slate-500">
        <i className={`fas ${isOpen ? "fa-chevron-up" : "fa-chevron-down"}`} />
      </div>
    </div>
  </button>
);

const PickLine: React.FC<{ p: PickEval }> = ({ p }) => {
  const icon = p.ok === true ? "fa-check" : p.ok === false ? "fa-times" : "fa-clock";

  const color =
    p.ok === true
      ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
      : p.ok === false
      ? "text-rose-400 bg-rose-500/10 border-rose-500/20"
      : "text-slate-400 bg-white/5 border-white/10";

  // ✅ Agora tenta:
  // 1) p.teams (já resolvido no eval)
  // 2) parseTeamsFromText (abreviações OU nomes completos)
  // 3) guessAbbrFromText (single team)
  let teams: string[] = p.teams && p.teams.length ? p.teams : parseTeamsFromText(p.label);

  if (!teams.length) {
    const single = guessAbbrFromText(p.label);
    if (single) teams = [single];
  }

  // Normaliza para abreviações e remove vazios
  teams = teams.map((t) => (t || "").trim().toUpperCase()).filter(Boolean);

  return (
    <div className="flex items-center justify-between gap-3 bg-slate-900/50 border border-slate-700/40 rounded-xl p-3">
      <div className="flex items-center gap-3 overflow-hidden">
        {teams.length > 0 && (
          <div className="flex -space-x-2">
            {teams.map((abbr, i) => (
              <img
                key={`${abbr}-${i}`}
                src={getLogoUrl(abbr)}
                className="w-6 h-6 object-contain drop-shadow-md bg-slate-800 rounded-full p-0.5 border border-slate-700"
                alt={abbr}
                loading="lazy"
                decoding="async"
                onError={(e) => (e.currentTarget.style.display = "none")}
                style={{ zIndex: 10 - i }}
              />
            ))}
          </div>
        )}

        <div className="min-w-0">
          <div className="text-sm font-bold text-slate-100 truncate">{p.label}</div>
          {p.ok === null && p.reason && <div className="text-[11px] text-slate-500 truncate">{p.reason}</div>}
        </div>
      </div>

      <div className={`shrink-0 px-2.5 py-1 rounded-lg border text-[11px] font-black flex items-center gap-2 ${color}`}>
        <i className={`fas ${icon}`} />
        {p.ok === true ? "Certo" : p.ok === false ? "Errado" : "Pendente"}
      </div>
    </div>
  );
};

const MarketBlock: React.FC<{ title: string; picks: PickEval[] }> = ({ title, picks }) => (
  <div className="space-y-3">
    <div className="flex items-center justify-between">
      <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">{title}</h4>
      <span className="text-[10px] font-black text-slate-500">
        {picks.filter((p) => p.ok !== null).length}/{picks.length} avaliadas
      </span>
    </div>

    {picks.length ? (
      <div className="space-y-3">{picks.map((p, idx) => <PickLine key={`${title}-${idx}`} p={p} />)}</div>
    ) : (
      <div className="text-[11px] text-slate-600 italic">Sem picks.</div>
    )}
  </div>
);

const StatsView: React.FC = () => {
  const [reports, setReports] = useState<DayReport[]>([]);
  const [openDate, setOpenDate] = useState<string>("");

  const dates = useMemo(() => {
    const autoDates = typeof window !== "undefined" ? readAllDates("auto_picks_") : [];
    const myDates = typeof window !== "undefined" ? readAllDates("my_picks_") : [];
    const set = new Set<string>([...autoDates, ...myDates]);
    return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
  }, []);

  useEffect(() => {
    if (!dates.length) {
      setReports([]);
      return;
    }

    let cancelled = false;

    (async () => {
      setReports(
        dates.map((d) => ({
          date: d,
          auto: { percent: null, correct: 0, total: 0, byMarket: {} },
          mine: { percent: null, correct: 0, total: 0, byMarket: {} },
          resultsStatus: "loading",
        }))
      );

      const next: DayReport[] = [];

      for (const date of dates) {
        try {
          const r = await fetch(`/api/results?date=${date}`);
          if (!r.ok) throw new Error(`results HTTP ${r.status}`);
          const results = (await r.json()) as ApiResultsResponse;

          const autoRaw = safeReadJson<StoredAuto>(`auto_picks_${date}`);
          const myRaw = safeReadJson<StoredMine>(`my_picks_${date}`);

          const autoSug: Suggestions | null = autoRaw?.suggestions ?? null;

          const mineSug: Suggestions | null =
            myRaw && (myRaw as any).suggestions
              ? (myRaw as any).suggestions
              : myRaw && (myRaw as any).tripleWin
              ? ((myRaw as any) as Suggestions)
              : null;

          const autoEval = autoSug ? evalMarkets(autoSug, results) : { correct: 0, total: 0, byMarket: {} };
          const mineEval = mineSug ? evalMarkets(mineSug, results) : { correct: 0, total: 0, byMarket: {} };

          const autoPct = autoSug && autoEval.total > 0 ? (autoEval.correct / autoEval.total) * 100 : null;
          const minePct = mineSug && mineEval.total > 0 ? (mineEval.correct / mineEval.total) * 100 : null;

          next.push({
            date,
            auto: { percent: autoPct, correct: autoEval.correct, total: autoEval.total, byMarket: autoEval.byMarket },
            mine: { percent: minePct, correct: mineEval.correct, total: mineEval.total, byMarket: mineEval.byMarket },
            resultsStatus: "ready",
          });
        } catch (e: any) {
          next.push({
            date,
            auto: { percent: null, correct: 0, total: 0, byMarket: {} },
            mine: { percent: null, correct: 0, total: 0, byMarket: {} },
            resultsStatus: "error",
            error: String(e?.message ?? e),
          });
        }
      }

      if (!cancelled) setReports(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [dates]);

  const totals = useMemo(() => {
    let aC = 0,
      aT = 0,
      mC = 0,
      mT = 0;
    for (const r of reports) {
      aC += r.auto.correct;
      aT += r.auto.total;
      mC += r.mine.correct;
      mT += r.mine.total;
    }
    return {
      autoPct: aT > 0 ? (aC / aT) * 100 : null,
      minePct: mT > 0 ? (mC / mT) * 100 : null,
      aC,
      aT,
      mC,
      mT,
    };
  }, [reports]);

  if (!dates.length) {
    return (
      <div className="py-20 text-center text-slate-600 text-[10px] font-black uppercase tracking-widest">
        Ainda não há histórico. Faz “Analisar” e salva as tuas picks.
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-24">
      <div className="bg-gradient-to-r from-indigo-900/40 to-slate-900/40 border border-indigo-500/20 rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-6">
        <div className="bg-indigo-600/20 p-4 rounded-2xl border border-indigo-500/30">
          <i className="fas fa-chart-line text-4xl text-indigo-300" />
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-black text-white italic">
            <span className="text-indigo-300">STATS</span> HISTÓRICO
          </h2>
          <p className="text-slate-400 text-sm max-w-2xl">
            Taxa de acerto das escolhas automáticas vs as tuas. Os jogos “pendentes” não contam para a percentagem.
          </p>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Auto (geral)</div>
            <div className="text-sm font-black text-amber-300">
              {totals.autoPct === null ? "--" : `${totals.autoPct.toFixed(1)}%`}
              <span className="text-[10px] text-slate-500 ml-2">
                {totals.aC}/{totals.aT}
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Minhas (geral)</div>
            <div className="text-sm font-black text-blue-300">
              {totals.minePct === null ? "--" : `${totals.minePct.toFixed(1)}%`}
              <span className="text-[10px] text-slate-500 ml-2">
                {totals.mC}/{totals.mT}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {reports.map((r) => {
          const isOpen = openDate === r.date;
          return (
            <div key={r.date} className="space-y-4">
              <StatRow
                date={r.date}
                autoPct={r.auto.percent}
                minePct={r.mine.percent}
                isOpen={isOpen}
                onToggle={() => setOpenDate(isOpen ? "" : r.date)}
              />

              {isOpen && (
                <div className="bg-slate-800/30 border border-slate-700/40 rounded-2xl p-5 space-y-8">
                  {r.resultsStatus === "loading" && (
                    <div className="text-[11px] text-slate-500 font-black uppercase tracking-widest">A carregar resultados…</div>
                  )}

                  {r.resultsStatus === "error" && (
                    <div className="text-[11px] text-rose-400 font-black">Erro a obter resultados: {r.error}</div>
                  )}

                  {r.resultsStatus === "ready" && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      <div className="space-y-5">
                        <div className="flex items-end justify-between">
                          <h3 className="text-lg font-black text-amber-200">Auto</h3>
                          <div className="text-[11px] font-black text-slate-500">
                            {r.auto.percent === null ? "--" : `${r.auto.percent.toFixed(1)}%`} ({r.auto.correct}/{r.auto.total})
                          </div>
                        </div>

                        {Object.keys(r.auto.byMarket).length ? (
                          <div className="space-y-6">
                            {Object.entries(r.auto.byMarket).map(([k, v]) => (
                              <MarketBlock key={`a-${k}`} title={k} picks={v} />
                            ))}
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-600 italic">
                            Sem snapshot Auto para esta data (faz “Analisar” para guardar).
                          </div>
                        )}
                      </div>

                      <div className="space-y-5">
                        <div className="flex items-end justify-between">
                          <h3 className="text-lg font-black text-blue-200">Minhas</h3>
                          <div className="text-[11px] font-black text-slate-500">
                            {r.mine.percent === null ? "--" : `${r.mine.percent.toFixed(1)}%`} ({r.mine.correct}/{r.mine.total})
                          </div>
                        </div>

                        {Object.keys(r.mine.byMarket).length ? (
                          <div className="space-y-6">
                            {Object.entries(r.mine.byMarket).map(([k, v]) => (
                              <MarketBlock key={`m-${k}`} title={k} picks={v} />
                            ))}
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-600 italic">Sem picks guardadas para esta data.</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StatsView;
