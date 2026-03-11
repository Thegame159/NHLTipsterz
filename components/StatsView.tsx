import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Suggestions } from "../types";

// ─── Types ───────────────────────────────────────────────────────────────────

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

type HistoryItem = {
  date: string;
  auto: null | {
    savedAt: number;
    suggestions: Suggestions;
    stats?: { correct: number; total: number; percent: number | null };
    markets?: Record<string, PickEval[]>;
  };
  mine: null | {
    savedAt: number;
    suggestions: Suggestions;
    stats?: { correct: number; total: number; percent: number | null };
    markets?: Record<string, PickEval[]>;
  };
};

type ManualValue = boolean | null;
type ManualSide = "auto" | "mine";
type ManualStore = {
  savedAt: number;
  auto: Record<string, Record<string, ManualValue>>;
  mine: Record<string, Record<string, ManualValue>>;
};

type PickEval = {
  label: string;
  ok: boolean | null;
  reason?: string;
  teams?: string[];
  manual?: boolean;
};

type ReportEntry = {
  date: string;
  auto: { percent: number | null; correct: number; total: number; byMarket: Record<string, PickEval[]> };
  mine: { percent: number | null; correct: number; total: number; byMarket: Record<string, PickEval[]> };
  resultsStatus: "loading" | "ready" | "error";
  error?: string;
  hasManual: boolean;
};

// ─── Team helpers ─────────────────────────────────────────────────────────────

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
  NYR: ["new york rangers", "rangers", "ny rangers", "nyr"],
  OTT: ["ottawa senators", "senators", "ottawa"],
  PHI: ["philadelphia flyers", "flyers", "philadelphia"],
  PIT: ["pittsburgh penguins", "penguins", "pittsburgh"],
  SEA: ["seattle kraken", "kraken", "seattle"],
  SJS: ["san jose sharks", "sharks", "san jose"],
  STL: ["st. louis blues", "st louis blues", "blues", "st louis"],
  TBL: ["tampa bay lightning", "lightning", "tampa bay", "tampa"],
  TOR: ["toronto maple leafs", "maple leafs", "leafs", "toronto"],
  VAN: ["vancouver canucks", "canucks", "vancouver"],
  VGK: ["vegas golden knights", "golden knights", "knights", "vegas"],
  WPG: ["winnipeg jets", "jets", "winnipeg"],
  WSH: ["washington capitals", "capitals", "washington"],
  UTA: ["utah hockey club", "utah"],
};

const TEAM_SHORT_NAMES: Record<string, string> = {
  ANA: "Ducks", BOS: "Bruins", BUF: "Sabres", CAR: "Hurricanes",
  CBJ: "Blue Jackets", CGY: "Flames", CHI: "Blackhawks", COL: "Avalanche",
  DAL: "Stars", DET: "Red Wings", EDM: "Oilers", FLA: "Panthers",
  LAK: "Kings", MIN: "Wild", MTL: "Canadiens", NJD: "Devils",
  NSH: "Predators", NYI: "Islanders", NYR: "Rangers", OTT: "Senators",
  PHI: "Flyers", PIT: "Penguins", SEA: "Kraken", SJS: "Sharks",
  STL: "Blues", TBL: "Lightning", TOR: "Leafs", UTA: "Utah",
  VAN: "Canucks", VGK: "Vegas", WPG: "Jets", WSH: "Capitals",
};

const NHL_ABBRS = new Set(Object.keys(TEAM_FULLNAMES));

const norm = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim();

function guessAbbrFromText(text: string): string | null {
  const t = norm(text);
  if (!t) return null;
  const mm = (text || "").toUpperCase().match(/\b[A-Z]{2,4}\b/g) || [];
  const direct = mm.find((x) => NHL_ABBRS.has(x) && !["OT", "VS", "V"].includes(x));
  if (direct) return direct;
  for (const [abbr, names] of Object.entries(TEAM_FULLNAMES)) {
    for (const n of names) if (t.includes(n)) return abbr;
  }
  return null;
}

const normalizeGameText = (s: string) =>
  (s || "").trim().toUpperCase()
    .replace(/\(\s*\d+(\.\d+)?%\s*\)/g, "")
    .replace(/\s+VS\s+/g, " VS ")
    .replace(/\s+@\s+/g, " VS ")
    .replace(/\s+V\s+/g, " VS ")
    .replace(/\s+/g, " ");

const splitMatchup = (text: string): [string, string] | null => {
  const cleaned = normalizeGameText(text);
  if (!cleaned.includes(" VS ")) return null;
  const parts = cleaned.split(" VS ").map((x) => x.trim());
  if (parts.length < 2) return null;
  return [parts[0], parts[1]];
};

const parseTeamsFromText = (text: string): string[] => {
  const cleaned = normalizeGameText(text);
  const abbrMatches = cleaned.match(/\b[A-Z]{2,4}\b/g) || [];
  const abbr = abbrMatches.filter((s) => NHL_ABBRS.has(s) && !["OT", "VS", "V"].includes(s));
  if (abbr.length >= 2) return abbr.slice(0, 2);
  const sp = splitMatchup(cleaned);
  if (sp) {
    const a = guessAbbrFromText(sp[0]);
    const b = guessAbbrFromText(sp[1]);
    const out = [a, b].filter(Boolean) as string[];
    if (out.length >= 2) return out.slice(0, 2);
  }
  const single = guessAbbrFromText(cleaned);
  return single ? [single] : [];
};

const parseTeamSingle = (text: string): string | null => {
  const raw = (text || "").toUpperCase();
  const mm = raw.match(/\b[A-Z]{2,4}\b/g) || [];
  const direct = mm.find((x) => NHL_ABBRS.has(x) && !["OT", "VS", "V"].includes(x));
  if (direct) return direct;
  return guessAbbrFromText(text);
};

const teamLabel = (abbr: string) => TEAM_SHORT_NAMES[(abbr || "").toUpperCase()] || abbr;

const getLogoUrl = (abbr: string) => {
  const map: Record<string, string> = {
    TBL: "tb", SJS: "sj", LAK: "la", VGK: "vgs", UTA: "utah",
    NJD: "nj", CBJ: "cbj", WSH: "wsh", WPG: "wpg", NSH: "nsh",
    MTL: "mtl", NYI: "nyi", NYR: "nyr", ANA: "ana", BOS: "bos",
    BUF: "buf", CGY: "cgy", CAR: "car", CHI: "chi", COL: "col",
    DAL: "dal", DET: "det", EDM: "edm", FLA: "fla", MIN: "min",
    OTT: "ott", PHI: "phi", PIT: "pit", SEA: "sea", STL: "stl",
    VAN: "van", TOR: "tor",
  };
  const normalized = (abbr || "").trim().toUpperCase();
  const code = map[normalized] || normalized.toLowerCase();
  return `https://a.espncdn.com/i/teamlogos/nhl/500/${code}.png`;
};

// ─── Manual API ───────────────────────────────────────────────────────────────

async function fetchManual(date: string): Promise<ManualStore | null> {
  const r = await fetch(`/api/manual?date=${date}&t=${Date.now()}`, { cache: "no-store" });
  if (!r.ok) return null;
  const data = await r.json().catch(() => null);
  return data?.store ?? null;
}

async function saveManual(date: string, store: ManualStore) {
  await fetch(`/api/manual?date=${date}&t=${Date.now()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ store }),
  });
}

async function clearManual(date: string) {
  await fetch(`/api/manual?date=${date}&t=${Date.now()}`, { method: "DELETE", cache: "no-store" });
}

async function loadAllManualFromApi(): Promise<Record<string, ManualStore | null>> {
  try {
    const r = await fetch(`/api/manual-all?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return {};
    const data = await r.json().catch(() => null);
    return data?.items ?? {};
  } catch {
    return {};
  }
}

async function saveHistoryStats(
  date: string,
  side: "auto" | "mine",
  stats: { correct: number; total: number; percent: number | null },
  markets: Record<string, PickEval[]>
) {
  try {
    await fetch(`/api/history?t=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ date, side, stats, markets }),
    });
  } catch {}
}

function getManualValue(store: ManualStore | null, side: ManualSide, market: string, label: string): ManualValue | undefined {
  if (!store) return undefined;
  return store[side]?.[market]?.[label];
}

function setManualValueInStore(store: ManualStore | null, side: ManualSide, market: string, label: string, value: ManualValue): ManualStore {
  const next: ManualStore = store
    ? JSON.parse(JSON.stringify(store))
    : { savedAt: Date.now(), auto: {}, mine: {} };
  next.savedAt = Date.now();
  next[side] = next[side] || {};
  next[side][market] = next[side][market] || {};
  next[side][market][label] = value;
  return next;
}

// ─── Result matching ──────────────────────────────────────────────────────────

function findGame(results: ApiResultsResponse, a: string, b: string): ApiResultGame | undefined {
  const A = (a || "").trim().toUpperCase();
  const B = (b || "").trim().toUpperCase();
  if (!A || !B) return undefined;
  const by = results.byMatchup || {};
  if (by[`${A} VS ${B}`]) return by[`${A} VS ${B}`];
  if (by[`${B} VS ${A}`]) return by[`${B} VS ${A}`];
  return (results.games || []).find(
    (g) => (g.awayAbbr === A && g.homeAbbr === B) || (g.awayAbbr === B && g.homeAbbr === A)
  );
}

// ─── Eval markets (including Combinada) ───────────────────────────────────────

function evalMarkets(sug: Suggestions, results: ApiResultsResponse): Record<string, PickEval[]> {
  const evalGamePick = (text: string, fn: (g: ApiResultGame) => boolean): PickEval => {
    const cleaned = normalizeGameText(text);
    let teams = parseTeamsFromText(cleaned);
    if (teams.length < 2) {
      const sp = splitMatchup(cleaned);
      if (!sp) return { label: text, ok: null, reason: "Não consegui ler as equipas." };
      const a = guessAbbrFromText(sp[0]);
      const b = guessAbbrFromText(sp[1]);
      teams = [a || "", b || ""].filter(Boolean);
    }
    if (teams.length < 2) return { label: text, ok: null, reason: "Não consegui ler as equipas." };
    const g = findGame(results, teams[0], teams[1]);
    if (!g) return { label: text, ok: null, teams, reason: "Jogo não encontrado na API." };
    if (g.status !== "FINAL") return { label: text, ok: null, teams, reason: "Jogo ainda não terminou." };
    return { label: text, ok: fn(g), teams };
  };

  const evalWinTeam = (text: string): PickEval => {
    const team = parseTeamSingle(text);
    if (!team) return { label: text, ok: null, reason: "Não consegui ler a equipa." };
    const game =
      Object.values(results.byMatchup || {}).find((g) => g.awayAbbr === team || g.homeAbbr === team) ||
      (results.games || []).find((g) => g.awayAbbr === team || g.homeAbbr === team);
    if (!game) return { label: text, ok: null, teams: [team], reason: "Resultados ainda não disponíveis." };
    if (game.status !== "FINAL") return { label: text, ok: null, teams: [team], reason: "Jogo ainda não terminou." };
    return { label: text, ok: game.winnerAbbr === team, teams: [team] };
  };

  // ── Combinada ──
  const evalCombinada = (): PickEval[] => {
    const flex = (sug as any).combinadaFlex;
    if (!Array.isArray(flex) || !flex.length) return [];

    return flex.map((item: any) => {
      const teams = parseTeamsFromText(item.game);
      const [home, away] = teams;
      const pick: "HOME" | "AWAY" | "1X" | "X2" = item.pick;

      const labelText =
        pick === "HOME" ? `${teamLabel(home)} (Home Win)`
        : pick === "AWAY" ? `${teamLabel(away)} (Away Win)`
        : pick === "1X" ? `${teamLabel(home)} 1X`
        : `${teamLabel(away)} X2`;

      if (!home || !away) return { label: labelText, ok: null, reason: "Não consegui ler as equipas." };

      const g = findGame(results, home, away);
      if (!g) return { label: labelText, ok: null, teams, reason: "Jogo não encontrado na API." };
      if (g.status !== "FINAL") return { label: labelText, ok: null, teams, reason: "Jogo ainda não terminou." };

      // home = teams[0] (normalizeGameText: HOME VS AWAY format)
      const homeWon = g.winnerAbbr === home;
      const awayWon = g.winnerAbbr === away;
      const draw = g.regHome === g.regAway;

      let ok: boolean;
      if (pick === "HOME") ok = homeWon;
      else if (pick === "AWAY") ok = awayWon;
      else if (pick === "1X") ok = homeWon || draw;
      else ok = awayWon || draw; // X2

      return { label: labelText, ok, teams };
    });
  };

  const combinadaPicks = evalCombinada();

  const out: Record<string, PickEval[]> = {
    "Vitória (incl. OT)": (sug.tripleWin || []).map(evalWinTeam),
    "Over 1.5 P1 (Triplete)": (sug.tripleOver15P1 || []).map((t) => evalGamePick(t, (g) => g.p1Away + g.p1Home >= 2)),
    "Over 1.5 P1 (Dupla)": (sug.doubleOver15P1 || []).map((t) => evalGamePick(t, (g) => g.p1Away + g.p1Home >= 2)),
    "Empate TR": (sug.drawSuggestions || []).map((d) => evalGamePick(d.game, (g) => g.regAway === g.regHome)),
    "Over 4.5": (sug.quadrupleOver45 || []).map((t) => evalGamePick(t, (g) => g.finalAway + g.finalHome >= 5)),
    "Over 5.5": (sug.over55Suggestions || []).map((t) => evalGamePick(t, (g) => g.finalAway + g.finalHome >= 6)),
  };

  if (combinadaPicks.length > 0) out["Combinada"] = combinadaPicks;

  // remove markets with no picks
  for (const k of Object.keys(out)) {
    if (!out[k].length) delete out[k];
  }

  return out;
}

function applyManualOverrides(
  store: ManualStore | null,
  side: ManualSide,
  byMarket: Record<string, PickEval[]>
): { correct: number; total: number; byMarket: Record<string, PickEval[]>; hasManual: boolean } {
  let hasManual = false;
  const nextByMarket: Record<string, PickEval[]> = {};

  for (const [market, picks] of Object.entries(byMarket || {})) {
    nextByMarket[market] = (picks || []).map((p) => {
      const manual = getManualValue(store, side, market, p.label);
      if (manual === undefined) return p;
      hasManual = true;
      return {
        ...p,
        ok: manual,
        manual: true,
        reason: manual === null ? "Marcado como pendente (manual)." : manual ? "Marcado como certo (manual)." : "Marcado como errado (manual).",
      };
    });
  }

  let correct = 0, total = 0;
  for (const picks of Object.values(nextByMarket)) {
    for (const p of picks) {
      if (p.ok === null) continue;
      total++;
      if (p.ok) correct++;
    }
  }

  return { correct, total, byMarket: nextByMarket, hasManual };
}

// ─── UI Components ────────────────────────────────────────────────────────────

const TeamLogo: React.FC<{ abbr: string; size?: string }> = ({ abbr, size = "w-6 h-6" }) => (
  <img
    src={getLogoUrl(abbr)}
    className={`${size} object-contain bg-slate-800 rounded-full p-0.5 border border-slate-700 drop-shadow-md`}
    alt={abbr}
    loading="lazy"
    decoding="async"
    onError={(e) => (e.currentTarget.style.display = "none")}
  />
);

const StatRow: React.FC<{
  date: string;
  autoPct: number | null;
  minePct: number | null;
  autoCorrect: number;
  autoTotal: number;
  mineCorrect: number;
  mineTotal: number;
  isOpen: boolean;
  hasManual: boolean;
  resultsStatus: string;
  onToggle: () => void;
  onDelete: () => void;
}> = ({ date, autoPct, minePct, autoCorrect, autoTotal, mineCorrect, mineTotal, isOpen, hasManual, resultsStatus, onToggle, onDelete }) => (
  <div className="relative">
    <button
      onClick={onToggle}
      className="w-full text-left bg-slate-800/40 border border-slate-700/50 rounded-2xl p-4 sm:p-5 hover:bg-slate-800/60 transition-all flex items-center justify-between gap-4 pr-12"
    >
      <div className="flex flex-col">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Data</span>
        <div className="flex items-center gap-2">
          <span className="text-lg font-black text-white">{date}</span>
          {hasManual && (
            <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300">
              Manual
            </span>
          )}
          {resultsStatus === "loading" && (
            <i className="fas fa-circle-notch fa-spin text-slate-500 text-xs" />
          )}
          {resultsStatus === "error" && (
            <i className="fas fa-exclamation-triangle text-rose-400 text-xs" title="Erro a obter resultados" />
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-6">
        <div className="text-right">
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Auto</div>
          <div className="text-sm font-black text-amber-300">
            {autoPct === null ? "--" : `${autoPct.toFixed(1)}%`}
          </div>
          <div className="text-[10px] text-slate-500">{autoCorrect}/{autoTotal}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Minhas</div>
          <div className="text-sm font-black text-blue-300">
            {minePct === null ? "--" : `${minePct.toFixed(1)}%`}
          </div>
          <div className="text-[10px] text-slate-500">{mineCorrect}/{mineTotal}</div>
        </div>
        <div className="text-slate-500">
          <i className={`fas ${isOpen ? "fa-chevron-up" : "fa-chevron-down"}`} />
        </div>
      </div>
    </button>

    <button
      onClick={(e) => { e.stopPropagation(); onDelete(); }}
      className="absolute top-1/2 -translate-y-1/2 right-3 text-[10px] font-black text-rose-400 hover:text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-full w-7 h-7 flex items-center justify-center transition hover:bg-rose-500/20"
      title="Eliminar este dia do histórico"
    >
      <i className="fas fa-trash-alt text-[10px]" />
    </button>
  </div>
);

const PickLine: React.FC<{
  p: PickEval;
  editable: boolean;
  onSet?: (val: ManualValue) => void;
}> = ({ p, editable, onSet }) => {
  const icon = p.ok === true ? "fa-check" : p.ok === false ? "fa-times" : "fa-clock";
  const color =
    p.ok === true ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
    : p.ok === false ? "text-rose-400 bg-rose-500/10 border-rose-500/20"
    : "text-slate-400 bg-white/5 border-white/10";

  let teams: string[] = (p.teams || []).filter((t) => NHL_ABBRS.has((t || "").toUpperCase()));
  if (!teams.length) {
    teams = parseTeamsFromText(p.label).filter((t) => NHL_ABBRS.has(t));
  }
  if (!teams.length) {
    const s = guessAbbrFromText(p.label);
    if (s) teams = [s];
  }

  return (
    <div className="bg-slate-900/50 border border-slate-700/40 rounded-xl p-3 transition hover:border-slate-600/60">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 overflow-hidden flex-1 min-w-0">
          {teams.length > 0 && (
            <div className="flex -space-x-2 shrink-0">
              {teams.map((abbr, i) => (
                <TeamLogo key={`${abbr}-${i}`} abbr={abbr} />
              ))}
            </div>
          )}
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-100 truncate flex items-center gap-2">
              <span className="truncate">{p.label}</span>
              {p.manual && (
                <span className="shrink-0 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300">
                  Manual
                </span>
              )}
            </div>
            {p.reason && <div className="text-[11px] text-slate-500 truncate mt-0.5">{p.reason}</div>}
          </div>
        </div>

        <div className={`shrink-0 px-2.5 py-1 rounded-lg border text-[11px] font-black flex items-center gap-1.5 ${color}`}>
          <i className={`fas ${icon}`} />
          {p.ok === true ? "Certo" : p.ok === false ? "Errado" : "Pendente"}
        </div>
      </div>

      {editable && onSet && (
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {[
            { val: true, label: "✓ Certo", cls: "bg-emerald-500/10 border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20" },
            { val: false, label: "✕ Errado", cls: "bg-rose-500/10 border-rose-500/20 text-rose-300 hover:bg-rose-500/20" },
            { val: null, label: "⏳ Pendente", cls: "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10" },
          ].map(({ val, label, cls }) => (
            <button
              key={String(val)}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSet(val as ManualValue); }}
              className={`px-3 py-1.5 rounded-lg border text-[10px] font-black transition ${cls}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const MarketBlock: React.FC<{
  title: string;
  picks: PickEval[];
  editable: boolean;
  onSetPick?: (label: string, val: ManualValue) => void;
}> = ({ title, picks, editable, onSetPick }) => {
  const evaluated = picks.filter((p) => p.ok !== null).length;
  const correct = picks.filter((p) => p.ok === true).length;

  const marketIcon: Record<string, string> = {
    "Vitória (incl. OT)": "fa-award",
    "Over 1.5 P1 (Triplete)": "fa-fire-alt",
    "Over 1.5 P1 (Dupla)": "fa-bolt",
    "Empate TR": "fa-handshake",
    "Over 4.5": "fa-hockey-puck",
    "Over 5.5": "fa-plus-circle",
    "Combinada": "fa-layer-group",
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
          {marketIcon[title] && <i className={`fas ${marketIcon[title]} text-slate-500`} />}
          {title}
        </h4>
        <span className="text-[10px] font-black text-slate-500">
          {correct}/{evaluated} certas
        </span>
      </div>
      {picks.length ? (
        <div className="space-y-2">
          {picks.map((p, idx) => (
            <PickLine
              key={`${title}-${idx}`}
              p={p}
              editable={editable}
              onSet={editable && onSetPick ? (val) => onSetPick(p.label, val) : undefined}
            />
          ))}
        </div>
      ) : (
        <div className="text-[11px] text-slate-600 italic">Sem picks.</div>
      )}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const StatsView: React.FC = () => {
  const [reports, setReports] = useState<ReportEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [openDate, setOpenDate] = useState<string>("");
  const [editDate, setEditDate] = useState<string>("");
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [manualByDate, setManualByDate] = useState<Record<string, ManualStore | null>>({});
  const processingRef = useRef(false);

  const loadHistory = useCallback(async () => {
    try {
      const r = await fetch(`/api/history?limit=120&t=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) { setHistoryItems([]); return; }
      const data = await r.json().catch(() => null);
      setHistoryItems(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setHistoryItems([]);
    }
  }, []);

  const loadAllManual = useCallback(async () => {
    const items = await loadAllManualFromApi();
    setManualByDate(items);
  }, []);

  useEffect(() => {
    loadHistory();
    loadAllManual();

    const handler = () => { loadHistory(); };
    window.addEventListener("history-updated", handler);

    const interval = setInterval(() => {
      if (!editDate) { loadHistory(); loadAllManual(); }
    }, 60_000);

    return () => {
      window.removeEventListener("history-updated", handler);
      clearInterval(interval);
    };
  }, [loadHistory, loadAllManual, editDate]);

  const dates = useMemo(
    () => historyItems.map((x) => x.date).sort((a, b) => (a < b ? 1 : -1)),
    [historyItems]
  );

  const historyMap = useMemo(() => {
    const m: Record<string, HistoryItem> = {};
    for (const h of historyItems) m[h.date] = h;
    return m;
  }, [historyItems]);

  // ── Build reports ──
  useEffect(() => {
    if (editDate || !dates.length) {
      if (!dates.length) setReports([]);
      return;
    }

    let cancelled = false;
    processingRef.current = true;

    // init with loading state — preserve existing ready entries to avoid flash
    setReports((prev) => {
      const prevMap: Record<string, ReportEntry> = {};
      for (const r of prev) prevMap[r.date] = r;

      return dates.map((d) =>
        prevMap[d] ?? {
          date: d,
          auto: { percent: null, correct: 0, total: 0, byMarket: {} },
          mine: { percent: null, correct: 0, total: 0, byMarket: {} },
          resultsStatus: "loading",
          hasManual: false,
        }
      );
    });

    (async () => {
      const next: ReportEntry[] = new Array(dates.length);
      const BATCH = 4;

      for (let start = 0; start < dates.length; start += BATCH) {
        if (cancelled) break;
        const batch = dates.slice(start, start + BATCH);

        await Promise.all(
          batch.map(async (date, i) => {
            const index = start + i;
            const history = historyMap[date] ?? null;
            const autoSug: Suggestions | null = history?.auto?.suggestions ?? null;
            const mineSug: Suggestions | null = history?.mine?.suggestions ?? null;
            const manualStore = manualByDate[date] ?? null;

            // Use cached markets if available
            const autoReady = history?.auto?.markets && Object.keys(history.auto.markets).length > 0;
            const mineReady = history?.mine?.markets && Object.keys(history.mine.markets).length > 0;

            if (autoReady || mineReady) {
              const autoApplied = applyManualOverrides(manualStore, "auto", history?.auto?.markets ?? {});
              const mineApplied = applyManualOverrides(manualStore, "mine", history?.mine?.markets ?? {});

              next[index] = {
                date,
                auto: autoReady ? {
                  percent: autoApplied.total > 0 ? (autoApplied.correct / autoApplied.total) * 100 : null,
                  correct: autoApplied.correct, total: autoApplied.total, byMarket: autoApplied.byMarket,
                } : { percent: null, correct: 0, total: 0, byMarket: {} },
                mine: mineReady ? {
                  percent: mineApplied.total > 0 ? (mineApplied.correct / mineApplied.total) * 100 : null,
                  correct: mineApplied.correct, total: mineApplied.total, byMarket: mineApplied.byMarket,
                } : { percent: null, correct: 0, total: 0, byMarket: {} },
                resultsStatus: "ready",
                hasManual: autoApplied.hasManual || mineApplied.hasManual,
              };
              return;
            }

            try {
              const rRes = await fetch(`/api/results?date=${date}&t=${Date.now()}`, { cache: "no-store" });
              if (!rRes.ok) throw new Error(`HTTP ${rRes.status}`);
              const results = await rRes.json() as ApiResultsResponse;

              const autoByMarketBase = autoSug ? evalMarkets(autoSug, results) : {};
              const mineByMarketBase = mineSug ? evalMarkets(mineSug, results) : {};

              const autoApplied = applyManualOverrides(manualStore, "auto", autoByMarketBase);
              const mineApplied = applyManualOverrides(manualStore, "mine", mineByMarketBase);

              const autoPct = autoApplied.total > 0 ? (autoApplied.correct / autoApplied.total) * 100 : null;
              const minePct = mineApplied.total > 0 ? (mineApplied.correct / mineApplied.total) * 100 : null;

              next[index] = {
                date,
                auto: { percent: autoPct, correct: autoApplied.correct, total: autoApplied.total, byMarket: autoApplied.byMarket },
                mine: { percent: minePct, correct: mineApplied.correct, total: mineApplied.total, byMarket: mineApplied.byMarket },
                resultsStatus: "ready",
                hasManual: autoApplied.hasManual || mineApplied.hasManual,
              };

              // persist markets
              if (autoSug && autoPct !== null) saveHistoryStats(date, "auto", { correct: autoApplied.correct, total: autoApplied.total, percent: autoPct }, autoByMarketBase as any);
              if (mineSug && minePct !== null) saveHistoryStats(date, "mine", { correct: mineApplied.correct, total: mineApplied.total, percent: minePct }, mineByMarketBase as any);

            } catch (e: any) {
              next[index] = {
                date,
                auto: { percent: null, correct: 0, total: 0, byMarket: {} },
                mine: { percent: null, correct: 0, total: 0, byMarket: {} },
                resultsStatus: "error",
                error: String(e?.message ?? e),
                hasManual: false,
              };
            }
          })
        );

        // update progressively after each batch
        if (!cancelled) {
          const partial = next.filter(Boolean);
          setReports((prev) => {
            const m: Record<string, ReportEntry> = {};
            for (const r of prev) m[r.date] = r;
            for (const r of partial) if (r) m[r.date] = r;
            return dates.map((d) => m[d]).filter(Boolean) as ReportEntry[];
          });
        }
      }

      processingRef.current = false;
    })();

    return () => { cancelled = true; };
  }, [dates, historyMap, manualByDate, editDate]);

  const totals = useMemo(() => {
    let aC = 0, aT = 0, mC = 0, mT = 0;
    for (const r of reports) { aC += r.auto.correct; aT += r.auto.total; mC += r.mine.correct; mT += r.mine.total; }
    return {
      autoPct: aT > 0 ? (aC / aT) * 100 : null,
      minePct: mT > 0 ? (mC / mT) * 100 : null,
      aC, aT, mC, mT,
    };
  }, [reports]);

  const forceRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([loadHistory(), loadAllManual()]);
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, loadHistory, loadAllManual]);

  const setManual = useCallback(async (date: string, side: ManualSide, market: string, label: string, value: ManualValue) => {
    const cur = manualByDate[date] ?? null;
    const next = setManualValueInStore(cur, side, market, label, value);
    setManualByDate((prev) => ({ ...prev, [date]: next }));
    try { await saveManual(date, next); } catch {}

    setReports((prev) =>
      prev.map((r) => {
        if (r.date !== date || r.resultsStatus !== "ready") return r;
        const byMarket = side === "auto" ? r.auto.byMarket : r.mine.byMarket;
        const newMarkets: Record<string, PickEval[]> = {};
        for (const [m, picks] of Object.entries(byMarket)) {
          newMarkets[m] = picks.map((p) =>
            p.label === label ? { ...p, ok: value, manual: true, reason: value === null ? "Marcado como pendente (manual)." : value ? "Marcado como certo (manual)." : "Marcado como errado (manual)." } : p
          );
        }
        let correct = 0, total = 0;
        for (const picks of Object.values(newMarkets)) for (const p of picks) { if (p.ok === null) continue; total++; if (p.ok) correct++; }
        const percent = total > 0 ? (correct / total) * 100 : null;
        if (side === "auto") return { ...r, auto: { ...r.auto, correct, total, percent, byMarket: newMarkets } };
        return { ...r, mine: { ...r.mine, correct, total, percent, byMarket: newMarkets } };
      })
    );
  }, [manualByDate]);

  const clearManualForDate = useCallback(async (date: string) => {
    try { await clearManual(date); } catch {}
    setManualByDate((prev) => ({ ...prev, [date]: null }));
    setReports((prev) =>
      prev.map((r) => {
        if (r.date !== date || r.resultsStatus !== "ready") return r;
        const autoApplied = applyManualOverrides(null, "auto", r.auto.byMarket);
        const mineApplied = applyManualOverrides(null, "mine", r.mine.byMarket);
        return {
          ...r,
          auto: { ...r.auto, correct: autoApplied.correct, total: autoApplied.total, percent: autoApplied.total > 0 ? (autoApplied.correct / autoApplied.total) * 100 : null, byMarket: autoApplied.byMarket },
          mine: { ...r.mine, correct: mineApplied.correct, total: mineApplied.total, percent: mineApplied.total > 0 ? (mineApplied.correct / mineApplied.total) * 100 : null, byMarket: mineApplied.byMarket },
          hasManual: false,
        };
      })
    );
  }, []);

  const deleteHistoryDate = useCallback(async (date: string) => {
    if (!window.confirm(`Eliminar histórico do dia ${date}? Esta ação é irreversível.`)) return;
    try {
      const r = await fetch(`/api/history?date=${date}&t=${Date.now()}`, { method: "DELETE", cache: "no-store" });
      if (!r.ok) { alert("Erro ao eliminar histórico."); return; }
      setHistoryItems((prev) => prev.filter((x) => x.date !== date));
      setReports((prev) => prev.filter((x) => x.date !== date));
      if (openDate === date) setOpenDate("");
      if (editDate === date) setEditDate("");
    } catch { alert("Erro ao eliminar histórico."); }
  }, [openDate, editDate]);

  if (!dates.length) {
    return (
      <div className="py-20 text-center text-slate-600 text-[10px] font-black uppercase tracking-widest">
        Ainda não há histórico. Faz "Analisar" e guarda as tuas picks.
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-24">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-900/40 via-indigo-800/30 to-transparent border border-indigo-500/20 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="bg-indigo-600/20 p-4 rounded-2xl border border-indigo-500/30 shrink-0">
            <i className="fas fa-chart-line text-4xl text-indigo-300" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-black text-white italic">
                <span className="text-indigo-300">STATS</span> HISTÓRICO
              </h2>
              <button
                onClick={forceRefresh}
                disabled={refreshing}
                className={`w-8 h-8 flex items-center justify-center rounded-full border transition-all shrink-0 ${
                  refreshing ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-300 cursor-not-allowed" : "bg-indigo-500/10 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20 hover:scale-105"
                }`}
                title="Atualizar stats"
              >
                <i className={`fas fa-rotate-right text-sm ${refreshing ? "animate-spin" : ""}`} />
              </button>
            </div>
            <p className="text-slate-400 text-sm max-w-2xl">
              Taxa de acerto das escolhas automáticas vs as tuas. Os jogos "pendentes" não contam para a percentagem.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6 self-end sm:self-auto">
          <div className="text-right">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Auto (geral)</div>
            <div className="text-2xl font-black text-amber-300">
              {totals.autoPct === null ? "--" : `${totals.autoPct.toFixed(1)}%`}
            </div>
            <div className="text-[10px] text-slate-500">{totals.aC}/{totals.aT} picks</div>
          </div>
          <div className="w-px h-12 bg-slate-700" />
          <div className="text-right">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Minhas (geral)</div>
            <div className="text-2xl font-black text-blue-300">
              {totals.minePct === null ? "--" : `${totals.minePct.toFixed(1)}%`}
            </div>
            <div className="text-[10px] text-slate-500">{totals.mC}/{totals.mT} picks</div>
          </div>
        </div>
      </div>

      {/* Report rows */}
      <div className="space-y-3">
        {reports.map((r) => {
          const isOpen = openDate === r.date;
          const isEditing = editDate === r.date;

          return (
            <div key={r.date} className="space-y-2">
              <StatRow
                date={r.date}
                autoPct={r.auto.percent}
                minePct={r.mine.percent}
                autoCorrect={r.auto.correct}
                autoTotal={r.auto.total}
                mineCorrect={r.mine.correct}
                mineTotal={r.mine.total}
                isOpen={isOpen}
                hasManual={r.hasManual}
                resultsStatus={r.resultsStatus}
                onToggle={() => { const next = isOpen ? "" : r.date; setOpenDate(next); if (!next) setEditDate(""); }}
                onDelete={() => deleteHistoryDate(r.date)}
              />

              {isOpen && (
                <div className="bg-slate-800/30 border border-slate-700/40 rounded-2xl p-5 space-y-6">
                  {/* Controls */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="text-[10px] font-black uppercase tracking-widest">
                      {r.hasManual ? (
                        <span className="text-indigo-300"><i className="fas fa-pen-nib mr-2" />Validações manuais ativas</span>
                      ) : (
                        <span className="text-slate-500">Validação automática</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const closing = isEditing;
                          setEditDate(closing ? "" : r.date);
                          if (closing) { loadHistory(); loadAllManual(); }
                        }}
                        className={`px-3 py-2 rounded-lg border text-[10px] font-black uppercase tracking-widest transition ${
                          isEditing ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-200" : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                        }`}
                      >
                        <i className={`fas ${isEditing ? "fa-lock" : "fa-pen"} mr-1.5`} />
                        {isEditing ? "Fechar edição" : "Editar"}
                      </button>
                      <button
                        onClick={() => clearManualForDate(r.date)}
                        className="px-3 py-2 rounded-lg border text-[10px] font-black uppercase tracking-widest bg-rose-500/10 border-rose-500/20 text-rose-200 hover:bg-rose-500/15 transition"
                        title="Apaga as marcações manuais deste dia"
                      >
                        <i className="fas fa-eraser mr-1.5" />Limpar manual
                      </button>
                    </div>
                  </div>

                  {r.resultsStatus === "loading" && (
                    <div className="flex items-center gap-3 text-slate-500">
                      <i className="fas fa-circle-notch fa-spin" />
                      <span className="text-[11px] font-black uppercase tracking-widest">A carregar resultados…</span>
                    </div>
                  )}

                  {r.resultsStatus === "error" && (
                    <div className="flex items-center gap-3 text-rose-400 bg-rose-500/5 border border-rose-500/20 rounded-xl p-4">
                      <i className="fas fa-exclamation-triangle" />
                      <span className="text-[11px] font-black">Erro a obter resultados: {r.error}</span>
                    </div>
                  )}

                  {r.resultsStatus === "ready" && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      {/* Auto */}
                      <div className="space-y-5">
                        <div className="flex items-end justify-between border-b border-slate-700/50 pb-3">
                          <h3 className="text-lg font-black text-amber-200 flex items-center gap-2">
                            <i className="fas fa-bolt text-amber-400/50" /> Auto
                          </h3>
                          <div className="text-right">
                            <div className="text-lg font-black text-amber-300">
                              {r.auto.percent === null ? "--" : `${r.auto.percent.toFixed(1)}%`}
                            </div>
                            <div className="text-[10px] text-slate-500">{r.auto.correct}/{r.auto.total} certas</div>
                          </div>
                        </div>
                        {Object.keys(r.auto.byMarket).length ? (
                          <div className="space-y-6">
                            {Object.entries(r.auto.byMarket).map(([k, v]) => (
                              <MarketBlock
                                key={`a-${k}`} title={k} picks={v} editable={isEditing}
                                onSetPick={isEditing ? (label, val) => setManual(r.date, "auto", k, label, val) : undefined}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-600 italic py-4 text-center">Sem snapshot Auto para esta data.</div>
                        )}
                      </div>

                      {/* Mine */}
                      <div className="space-y-5">
                        <div className="flex items-end justify-between border-b border-slate-700/50 pb-3">
                          <h3 className="text-lg font-black text-blue-200 flex items-center gap-2">
                            <i className="fas fa-user text-blue-400/50" /> Minhas
                          </h3>
                          <div className="text-right">
                            <div className="text-lg font-black text-blue-300">
                              {r.mine.percent === null ? "--" : `${r.mine.percent.toFixed(1)}%`}
                            </div>
                            <div className="text-[10px] text-slate-500">{r.mine.correct}/{r.mine.total} certas</div>
                          </div>
                        </div>
                        {r.mine.total > 0 || Object.keys(r.mine.byMarket || {}).length > 0 ? (
                          <div className="space-y-6">
                            {Object.entries(r.mine.byMarket).map(([k, v]) => (
                              <MarketBlock
                                key={`m-${k}`} title={k} picks={v} editable={isEditing}
                                onSetPick={isEditing ? (label, val) => setManual(r.date, "mine", k, label, val) : undefined}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-600 italic py-4 text-center">Sem picks guardadas para esta data.</div>
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
