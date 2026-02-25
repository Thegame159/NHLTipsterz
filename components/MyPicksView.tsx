import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GamePrediction, Suggestions } from "../types";

interface Props {
  predictions: GamePrediction[];
  selectedDate: string;
}

const defaultSuggestions = (): Suggestions => ({
  tripleWin: [],
  tripleOver15P1: [],
  doubleOver15P1: [],
  drawSuggestions: [],
  quadrupleOver45: [],
  over55Suggestions: [],
});

const storageKey = (date: string) => `my_picks_${date}`;

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

const normalizeGameText = (s: string) =>
  (s || "")
    .trim()
    .toUpperCase()
    .replace(/\s+VS\s+/g, " VS ")
    .replace(/\s+@\s+/g, " VS ")
    .replace(/\s+V\s+/g, " VS ")
    .replace(/\s+/g, " ")
    .replace(" vs ", " VS ");

const parseTeamsFromText = (text: string): string[] => {
  const raw = (text || "").trim();
  const abbrMatches = raw.match(/\b[A-Z]{2,4}\b/g) || [];
  const cleaned = abbrMatches
    .map((s) => s.toUpperCase())
    .filter((s) => s !== "OT" && s !== "VS" && s !== "V");
  if (cleaned.length >= 2) return cleaned.slice(0, 2);
  if (cleaned.length === 1) return cleaned;
  return [];
};

const isEmptyPicks = (p: Suggestions) =>
  p.tripleWin.length === 0 &&
  p.tripleOver15P1.length === 0 &&
  p.doubleOver15P1.length === 0 &&
  p.quadrupleOver45.length === 0 &&
  p.over55Suggestions.length === 0 &&
  p.drawSuggestions.length === 0;

// --- COMPONENTE PRINCIPAL ---
const MyPicksView: React.FC<Props> = ({ predictions, selectedDate }) => {
  const [picks, setPicks] = useState<Suggestions>(defaultSuggestions());

  const [teamPick, setTeamPick] = useState<string>("");
  const [gamePickOver15Triple, setGamePickOver15Triple] = useState<string>("");
  const [gamePickOver15Double, setGamePickOver15Double] = useState<string>("");
  const [gamePickOver45Quad, setGamePickOver45Quad] = useState<string>("");
  const [gamePickOver55, setGamePickOver55] = useState<string>("");
  const [drawPick, setDrawPick] = useState<string>("");

  const predictionsOfDay = useMemo(() => predictions || [], [predictions]);

  const gamesOfDay = useMemo(() => {
    const set = new Set<string>();
    for (const g of predictionsOfDay as any[]) {
      const away = String((g as any).awayTeamAbbr || "").trim().toUpperCase();
      const home = String((g as any).homeTeamAbbr || "").trim().toUpperCase();
      if (!away || !home) continue;
      const txt = normalizeGameText(`${away} vs ${home}`);
      if (txt.includes(" VS ")) set.add(txt);
    }
    return Array.from(set).sort();
  }, [predictionsOfDay]);

  const availableQuadOver45 = useMemo(() => {
    const chosen = new Set(picks.quadrupleOver45.map(normalizeGameText));
    return gamesOfDay.filter((g) => !chosen.has(normalizeGameText(g)));
  }, [gamesOfDay, picks.quadrupleOver45]);

  const savePicks = async () => {
    try {
      localStorage.setItem(storageKey(selectedDate), JSON.stringify(picks));
      await fetch("/api/history", {
        method: "POST",
        body: JSON.stringify({ date: selectedDate, picks }),
      });
      console.log("Picks saved!");
    } catch (err) {
      console.error("Failed to save picks:", err);
    }
  };

  return (
    <div>
      <h2>Minhas Picks</h2>
      {/* Aqui podes adicionar os dropdowns e lista de picks */}
      <button onClick={savePicks}>Guardar Picks</button>
      <ul>
        {picks.quadrupleOver45.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>
    </div>
  );
};

export default MyPicksView;