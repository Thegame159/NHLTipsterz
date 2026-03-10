import React, { useEffect, useMemo, useState } from "react";
import { Suggestions } from "../types";

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
    stats?: {
      correct: number;
      total: number;
      percent: number | null;
    };
    markets?: Record<string, PickEval[]>;
  };
  
  mine: null | {
  savedAt: number;
  suggestions: Suggestions;
  stats?: {
    correct: number;
    total: number;
    percent: number | null;
  };
  markets?: Record<string, PickEval[]>;
};
};

// ----------------- TEAM NAME -> ABBR -----------------
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

const NHL_ABBRS = new Set(Object.keys(TEAM_FULLNAMES));

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

  const mm = (text || "").toUpperCase().match(/\b[A-Z]{2,4}\b/g) || [];
  const direct = mm.find((x) => NHL_ABBRS.has(x) && !["OT", "VS", "V"].includes(x));
  if (direct) return direct;

  for (const [abbr, names] of Object.entries(TEAM_FULLNAMES)) {
    for (const n of names) {
      if (t.includes(n)) return abbr;
    }
  }
  return null;
}

const normalizeGameText = (s: string) =>
  (s || "")
    .trim()
    .toUpperCase()
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
  const raw = cleaned.toUpperCase();

  const abbrMatches = raw.match(/\b[A-Z]{2,4}\b/g) || [];
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

// ----------------- Manual store (AGORA NO BACKEND) -----------------
type ManualValue = boolean | null;
type ManualSide = "auto" | "mine";
type ManualStore = {
  savedAt: number;
  auto: Record<string, Record<string, ManualValue>>;
  mine: Record<string, Record<string, ManualValue>>;
};

async function fetchManual(date: string): Promise<ManualStore | null> {
  const r = await fetch(`/api/manual?date=${date}&t=${Date.now()}`, {
    cache: "no-store",
  });

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
  await fetch(`/api/manual?date=${date}&t=${Date.now()}`, {
    method: "DELETE",
    cache: "no-store",
  });
}
async function saveHistoryStats(
  date: string,
  side: "auto" | "mine",
  stats: {
    correct: number;
    total: number;
    percent: number | null;
  },
  markets: Record<string, PickEval[]>
)
 {
  try {
    await fetch(`/api/history?t=${Date.now()}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({
        date,
        side,
        stats,
        markets
      }),
    });
  } catch {
    // ignorar erro
  }
}
function getManualValue(store: ManualStore | null, side: ManualSide, market: string, label: string): ManualValue | undefined {
  if (!store) return undefined;
  const byMarket = store[side] || {};
  const m = byMarket[market];
  if (!m) return undefined;
  return m[label];
}

function setManualValueInStore(store: ManualStore | null, side: ManualSide, market: string, label: string, value: ManualValue): ManualStore {
  const next: ManualStore = store ?? { savedAt: Date.now(), auto: {}, mine: {} };
  next.savedAt = Date.now();
  next[side] = next[side] || {};
  next[side][market] = next[side][market] || {};
  next[side][market][label] = value;
  return next;
}

// ----------------- Result matching (ROBUSTO) -----------------
function findGame(results: ApiResultsResponse, a: string, b: string): ApiResultGame | undefined {
  const A = (a || "").trim().toUpperCase();
  const B = (b || "").trim().toUpperCase();
  if (!A || !B) return undefined;

  const by = results.byMatchup || {};
  const k1 = `${A} VS ${B}`;
  const k2 = `${B} VS ${A}`;
  if (by[k1]) return by[k1];
  if (by[k2]) return by[k2];

  const games = results.games || [];
  return games.find(
    (g) =>
      (g.awayAbbr === A && g.homeAbbr === B) ||
      (g.awayAbbr === B && g.homeAbbr === A)
  );
}

// ----------------- Eval -----------------
type PickEval = { label: string; ok: boolean | null; reason?: string; teams?: string[]; manual?: boolean };

function evalMarkets(sug: Suggestions, results: ApiResultsResponse) {
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

    // ✅ NOVO: em vez de depender da string exata do byMatchup, encontra pelo par de equipas
    const g = findGame(results, teams[0], teams[1]);
    if (!g) return { label: text, ok: null, teams, reason: "Jogo não encontrado na API." };
    if (g.status !== "FINAL") return { label: text, ok: null, teams, reason: "Jogo ainda não terminou." };

    return { label: text, ok: fn(g), teams };
  };

  const evalWinTeam = (text: string): PickEval => {
    const team = parseTeamSingle(text);
    if (!team) return { label: text, ok: null, reason: "Não consegui ler a equipa." };

    // continua ok: procura qualquer jogo do dia onde essa equipa aparece
    const byMatchup = results.byMatchup || {};
    const game = Object.values(byMatchup).find((g) => g.awayAbbr === team || g.homeAbbr === team) || (results.games || []).find((g) => g.awayAbbr === team || g.homeAbbr === team);

    if (!game) {
      return { label: text, ok: null, teams: [team], reason: "Resultados do dia ainda não disponíveis para esta equipa." };
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

  return out;
}

function applyManualOverridesToByMarket(
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
        reason:
          manual === null
            ? "Marcado como pendente (manual)."
            : manual
            ? "Marcado como certo (manual)."
            : "Marcado como errado (manual).",
      };
    });
  }

  let correct = 0;
  let total = 0;
  for (const picks of Object.values(nextByMarket)) {
    for (const p of picks) {
      if (p.ok === null) continue;
      total++;
      if (p.ok) correct++;
    }
  }

  return { correct, total, byMarket: nextByMarket, hasManual };
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

const PickLine: React.FC<{
  p: PickEval;
  editable: boolean;
  onSet?: (val: ManualValue) => void;
}> = ({ p, editable, onSet }) => {
  const icon = p.ok === true ? "fa-check" : p.ok === false ? "fa-times" : "fa-clock";

  const color =
    p.ok === true
      ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
      : p.ok === false
      ? "text-rose-400 bg-rose-500/10 border-rose-500/20"
      : "text-slate-400 bg-white/5 border-white/10";

  let teams: string[] = p.teams && p.teams.length ? p.teams : parseTeamsFromText(p.label);

  if (!teams.length) {
    const single = guessAbbrFromText(p.label);
    if (single) teams = [single];
  }

  teams = teams.map((t) => (t || "").trim().toUpperCase()).filter((t) => NHL_ABBRS.has(t));

  return (
    <div className="bg-slate-900/50 border border-slate-700/40 rounded-xl p-3">
      <div className="flex items-start justify-between gap-3">
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
            <div className="text-sm font-bold text-slate-100 truncate flex items-center gap-2">
              <span className="truncate">{p.label}</span>
              {p.manual && (
                <span className="shrink-0 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300">
                  Manual
                </span>
              )}
            </div>

            {p.reason && <div className="text-[11px] text-slate-500 truncate">{p.reason}</div>}
          </div>
        </div>

        <div className={`shrink-0 px-2.5 py-1 rounded-lg border text-[11px] font-black flex items-center gap-2 ${color}`}>
          <i className={`fas ${icon}`} />
          {p.ok === true ? "Certo" : p.ok === false ? "Errado" : "Pendente"}
        </div>
      </div>

      {editable && onSet && (
        <div className="mt-3 flex flex-col sm:flex-row sm:justify-end gap-2">
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSet(true);
            }}
            className="w-full sm:w-auto px-3 py-2 rounded-lg border text-[10px] font-black bg-emerald-500/10 border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/15"
          >
            Certo
          </button>

          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSet(false);
            }}
            className="w-full sm:w-auto px-3 py-2 rounded-lg border text-[10px] font-black bg-rose-500/10 border-rose-500/20 text-rose-300 hover:bg-rose-500/15"
          >
            Errado
          </button>

          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSet(null);
            }}
            className="w-full sm:w-auto px-3 py-2 rounded-lg border text-[10px] font-black bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
          >
            Pend.
          </button>
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
}> = ({ title, picks, editable, onSetPick }) => (
  <div className="space-y-3">
    <div className="flex items-center justify-between">
      <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">{title}</h4>
      <span className="text-[10px] font-black text-slate-500">
        {picks.filter((p) => p.ok !== null).length}/{picks.length} avaliadas
      </span>
    </div>

    {picks.length ? (
      <div className="space-y-3">
        {picks.map((p, idx) => (
          <PickLine
            key={`${title}-${idx}`}
            p={p}
            editable={editable}
            onSet={
              editable && onSetPick
                ? (val) => {
                    onSetPick(p.label, val);
                  }
                : undefined
            }
          />
        ))}
      </div>
    ) : (
      <div className="text-[11px] text-slate-600 italic">Sem picks.</div>
    )}
  </div>
);

const StatsView: React.FC = () => {
  const [reports, setReports] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [openDate, setOpenDate] = useState<string>("");
  const [editDate, setEditDate] = useState<string>("");
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [manualByDate, setManualByDate] = useState<Record<string, ManualStore | null>>({});
async function loadAllManual() {

  try {

    const r = await fetch(`/api/manual-all?t=${Date.now()}`, {
      cache: "no-store"
    });

    if (!r.ok) return;

    const data = await r.json().catch(()=>null);

    if (!data?.items) return;

    setManualByDate(data.items);

  } catch {}

}
  
 // carrega histórico global
const loadHistory = async () => {
  try {
   const r = await fetch(`/api/history?limit=120&t=${Date.now()}`, {
  cache: "no-store",
});

    if (!r.ok) {
      setHistoryItems([]);
      return;
    }

    const data = await r.json().catch(() => null);
    const items: HistoryItem[] = Array.isArray(data?.items)
      ? data.items
      : [];

    setHistoryItems(items);
  } catch {
    setHistoryItems([]);
  }
};

useEffect(() => {

  loadHistory();
  loadAllManual();

  const handler = () => loadHistory();
  window.addEventListener("history-updated", handler);

  return () => {
    window.removeEventListener("history-updated", handler);
  };
}, []);
// 👇 COLA A FUNÇÃO AQUI
async function forceRefresh() {
  try {
    setRefreshing(true);

    // NÃO limpar reports
    // Apenas recarregar history (que vai disparar o useEffect)

    await loadHistory();

  } finally {
    setRefreshing(false);
  }
}

const dates = useMemo(
  () => historyItems.map((x) => x.date).sort((a, b) => (a < b ? 1 : -1)),
  [historyItems]
);
  const historyMap = useMemo(() => {
  const m: Record<string, HistoryItem> = {};
  for (const h of historyItems) {
    m[h.date] = h;
  }
  return m;
}, [historyItems]);

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
          hasManual: false,
        }))
      );
const next: any[] = new Array(dates.length);
const BATCH_SIZE = 5;

for (let start = 0; start < dates.length; start += BATCH_SIZE) {

  const batch = dates.slice(start, start + BATCH_SIZE);

await Promise.all(
  batch.map(async (date, i) => {

    const index = start + i;
      const history = historyMap[date] ?? null;

      const autoSug: Suggestions | null = history?.auto?.suggestions ?? null;
      const mineSug: Suggestions | null = history?.mine?.suggestions ?? null;
      const autoStats = history?.auto?.stats ?? null;
      const mineStats = history?.mine?.stats ?? null;

      const autoReady = autoStats && history?.auto?.markets;
      const mineReady = mineStats && history?.mine?.markets;

    if (autoReady || mineReady) {

  const manualStore = manualByDate[date] ?? null;



  const autoApplied = applyManualOverridesToByMarket(
  manualStore,
  "auto",
  history?.auto?.markets ?? {}
);

const mineApplied = applyManualOverridesToByMarket(
  manualStore,
  "mine",
  history?.mine?.markets ?? {}
);

next[index] = {
  date,
  auto: autoReady
    ? {
       percent:
  autoApplied.total > 0
    ? (autoApplied.correct / autoApplied.total) * 100
    : null,
        correct: autoApplied.correct,
        total: autoApplied.total,
        byMarket: autoApplied.byMarket,
      }
    : { percent: null, correct: 0, total: 0, byMarket: {} },

  mine: mineReady
    ? {
       percent:
  mineApplied.total > 0
    ? (mineApplied.correct / mineApplied.total) * 100
    : null,
        correct: mineApplied.correct,
        total: mineApplied.total,
        byMarket: mineApplied.byMarket,
      }
    : { percent: null, correct: 0, total: 0, byMarket: {} },

  resultsStatus: "ready",
  hasManual: autoApplied.hasManual || mineApplied.hasManual,
};

  return;
}

      try {

     const manualStore = manualByDate[date] ?? null;

const rRes = await fetch(`/api/results?date=${date}&t=${Date.now()}`, {
  cache: "no-store",
});

        if (!rRes.ok) throw new Error(`results HTTP ${rRes.status}`);

        const results = (await rRes.json()) as ApiResultsResponse;

    
        const autoByMarketBase = autoSug ? evalMarkets(autoSug, results) : {};
        const mineByMarketBase = mineSug ? evalMarkets(mineSug, results) : {};

        const autoApplied = applyManualOverridesToByMarket(manualStore, "auto", autoByMarketBase as any);
        const mineApplied = applyManualOverridesToByMarket(manualStore, "mine", mineByMarketBase as any);

        const autoPct = autoSug && autoApplied.total > 0 ? (autoApplied.correct / autoApplied.total) * 100 : null;
        const minePct = mineSug && mineApplied.total > 0 ? (mineApplied.correct / mineApplied.total) * 100 : null;

        next[index] = {
          date,
          auto: { percent: autoPct, correct: autoApplied.correct, total: autoApplied.total, byMarket: autoApplied.byMarket },
          mine: { percent: minePct, correct: mineApplied.correct, total: mineApplied.total, byMarket: mineApplied.byMarket },
          resultsStatus: "ready",
          hasManual: autoApplied.hasManual || mineApplied.hasManual,
        };

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

}
      if (!cancelled) setReports(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [dates, historyItems, manualByDate]);

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

  async function setManual(date: string, side: ManualSide, market: string, label: string, value: ManualValue) {
    const cur = manualByDate[date] ?? null;
    const next = setManualValueInStore(cur, side, market, label, value);

    setManualByDate((prev) => ({ ...prev, [date]: next }));

    try {
      await saveManual(date, next);
    } catch {
      // ignore
    }

    // re-run only this date UI by forcing full refresh of reports from current state
setReports((prev) =>
  prev.map((r) => {
    if (r.date !== date) return r;
    if (r.resultsStatus !== "ready") return r;

    const byMarket =
      side === "auto" ? r.auto.byMarket : r.mine.byMarket;

   const newMarkets: Record<string, PickEval[]> = {};

for (const [m, picks] of Object.entries(byMarket)) {
  newMarkets[m] = [...picks];
}

    for (const [m, picks] of Object.entries(newMarkets)) {
      newMarkets[m] = picks.map((p) =>
        p.label === label
          ? {
              ...p,
              ok: value,
              manual: true,
              reason:
                value === null
                  ? "Marcado como pendente (manual)."
                  : value
                  ? "Marcado como certo (manual)."
                  : "Marcado como errado (manual).",
            }
          : p
      );
    }

    let correct = 0;
    let total = 0;

    for (const picks of Object.values(newMarkets)) {
      for (const p of picks) {
        if (p.ok === null) continue;
        total++;
        if (p.ok) correct++;
      }
    }

    const percent = total > 0 ? (correct / total) * 100 : null;

    if (side === "auto") {
      return {
        ...r,
        auto: {
          ...r.auto,
          correct,
          total,
          percent,
          byMarket: newMarkets,
        },
      };
    }

    return {
      ...r,
      mine: {
        ...r.mine,
        correct,
        total,
        percent,
        byMarket: newMarkets,
      },
    };
  })
);
}
  async function clearManualForDate(date: string) {
    try {
      await clearManual(date);
    } catch {
      // ignore
    }
    setManualByDate((prev) => ({ ...prev, [date]: null }));

    // forçar reload das percentagens removendo manual (fica tudo automático)
    setReports((prev) =>
      prev.map((r) => {
        if (r.date !== date) return r;
        if (r.resultsStatus !== "ready") return r;

        const autoApplied = applyManualOverridesToByMarket(null, "auto", r.auto.byMarket);
        const mineApplied = applyManualOverridesToByMarket(null, "mine", r.mine.byMarket);

        const autoPct = autoApplied.total > 0 ? (autoApplied.correct / autoApplied.total) * 100 : r.auto.percent;
        const minePct = mineApplied.total > 0 ? (mineApplied.correct / mineApplied.total) * 100 : r.mine.percent;

        return {
          ...r,
          auto: { ...r.auto, correct: autoApplied.correct, total: autoApplied.total, percent: autoPct, byMarket: autoApplied.byMarket },
          mine: { ...r.mine, correct: mineApplied.correct, total: mineApplied.total, percent: minePct, byMarket: mineApplied.byMarket },
          hasManual: false,
        };
      })
    );
  }
  async function deleteHistoryDate(date: string) {
  const ok = window.confirm(
    `Eliminar histórico do dia ${date}? Esta ação é irreversível.`
  );
  if (!ok) return;

  try {
   const r = await fetch(`/api/history?date=${date}&t=${Date.now()}`, {
  method: "DELETE",
  cache: "no-store",
});

    if (!r.ok) {
      alert("Erro ao eliminar histórico.");
      return;
    }

    setHistoryItems((prev) => prev.filter((x) => x.date !== date));
    setReports((prev) => prev.filter((x) => x.date !== date));

    if (openDate === date) setOpenDate("");
    if (editDate === date) setEditDate("");

  } catch {
    alert("Erro ao eliminar histórico.");
  }
}

  if (!dates.length) {
    return (
      <div className="py-20 text-center text-slate-600 text-[10px] font-black uppercase tracking-widest">
        Ainda não há histórico. Faz “Analisar” e salva as tuas picks.
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-24">
     <div className="bg-gradient-to-r from-indigo-900/40 via-indigo-800/30 to-transparent border border-indigo-500/20 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="bg-indigo-600/20 p-4 rounded-2xl border border-indigo-500/30">
          <i className="fas fa-chart-line text-4xl text-indigo-300" />
        </div>
       <div className="flex-1">
  <div className="flex items-center justify-between">
    <h2 className="text-2xl font-black text-white italic flex items-center gap-3">
      <span>
        <span className="text-indigo-300">STATS</span> HISTÓRICO
      </span>

      
    </h2>
    <button
  onClick={forceRefresh}
  disabled={refreshing}
  className={`ml-4 w-9 h-9 flex items-center justify-center rounded-full border transition-all duration-200 shrink-0
    ${
      refreshing
        ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-300 cursor-not-allowed"
        : "bg-indigo-500/10 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20 hover:scale-105"
    }`}
  title="Atualizar stats"
>
  <i
    className={`fas fa-rotate-right text-sm ${
      refreshing ? "animate-spin" : ""
    }`}
  />
</button>
  </div>

  <p className="text-slate-400 text-sm max-w-2xl">
    Taxa de acerto das escolhas automáticas vs as tuas. Os jogos “pendentes” não contam para a percentagem.
  </p>
</div>

        <div className="flex items-center gap-6 self-end sm:self-auto">
          <div className="text-right">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Auto (geral)</div>
            <div className="text-sm font-black text-amber-300">
              {totals.autoPct === null ? "--" : `${totals.autoPct.toFixed(1)}%`}
              <span className="text-[10px] text-slate-500 ml-2">
                {totals.aC}/{totals.aT}
              </span>
              .
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
            {/* 👇 COLA AQUI (linha 808) */}
  

          </div>
          
        </div>
      </div>

      <div className="space-y-3">
        {reports.map((r: any) => {
          const isOpen = openDate === r.date;
          const isEditingThisDate = editDate === r.date;

          return (
            <div key={r.date} className="space-y-4">
    <div className="relative">
  <StatRow
    date={r.date}
    autoPct={r.auto.percent}
    minePct={r.mine.percent}
    isOpen={isOpen}
    onToggle={() => {
      const nextOpen = isOpen ? "" : r.date;
      setOpenDate(nextOpen);
      if (!nextOpen) setEditDate("");
    }}
  />

  <button
    onClick={(e) => {
      e.stopPropagation();
      deleteHistoryDate(r.date);
    }}
    className="absolute top-2 right-2 text-[10px] font-black text-rose-400 hover:text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-full w-6 h-6 flex items-center justify-center"
    title="Eliminar este dia do histórico"
  >
    ✕
  </button>
</div>

              {isOpen && (
                <div className="bg-slate-800/30 border border-slate-700/40 rounded-2xl p-5 space-y-8">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      {r.hasManual ? (
                        <span className="text-indigo-300">
                          <i className="fas fa-pen-nib mr-2" />
                          Este dia tem validações manuais
                        </span>
                      ) : (
                        <span>Validação automática ativa</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditDate(isEditingThisDate ? "" : r.date)}
                        className={`px-3 py-2 rounded-lg border text-[10px] font-black uppercase tracking-widest transition ${
                          isEditingThisDate
                            ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-200"
                            : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                        }`}
                      >
                        {isEditingThisDate ? "Fechar edição" : "Editar"}
                      </button>

                      <button
                        onClick={() => clearManualForDate(r.date)}
                        className="px-3 py-2 rounded-lg border text-[10px] font-black uppercase tracking-widest bg-rose-500/10 border-rose-500/20 text-rose-200 hover:bg-rose-500/15"
                        title="Apaga as marcações manuais deste dia"
                      >
                        Limpar manual
                      </button>
                    </div>
                  </div>

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
                            {Object.entries(r.auto.byMarket).map(([k, v]: any) => (
                              <MarketBlock
                                key={`a-${k}`}
                                title={k}
                                picks={v}
                                editable={isEditingThisDate}
                                onSetPick={isEditingThisDate ? (label, val) => setManual(r.date, "auto", k, label, val) : undefined}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-600 italic">Sem snapshot Auto para esta data (faz “Analisar” para guardar).</div>
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
                            {Object.entries(r.mine.byMarket).map(([k, v]: any) => (
                              <MarketBlock
                                key={`m-${k}`}
                                title={k}
                                picks={v}
                                editable={isEditingThisDate}
                                onSetPick={isEditingThisDate ? (label, val) => setManual(r.date, "mine", k, label, val) : undefined}
                              />
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
