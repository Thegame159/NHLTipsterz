import React, { useMemo, useState } from "react";
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

const normalizeGameText = (s: string) =>
  (s || "")
    .trim()
    .toUpperCase()
    .replace(/\(\s*\d+(\.\d+)?%\s*\)/g, "")
    .replace(/\s+VS\s+/g, " VS ")
    .replace(/\s+@\s+/g, " VS ")
    .replace(/\s+V\s+/g, " VS ")
    .replace(/\s+/g, " ");

const isEmptyPicks = (p: Suggestions) =>
  p.tripleWin.length === 0 &&
  p.tripleOver15P1.length === 0 &&
  p.doubleOver15P1.length === 0 &&
  p.quadrupleOver45.length === 0 &&
  p.over55Suggestions.length === 0 &&
  p.drawSuggestions.length === 0;

const MyPicksView: React.FC<Props> = ({ predictions, selectedDate }) => {
  const [picks, setPicks] = useState<Suggestions>(() => {
    // tenta carregar do localStorage ao entrar (útil se recarregares a página)
    try {
      const raw = localStorage.getItem(storageKey(selectedDate));
      if (!raw) return defaultSuggestions();
      const parsed = JSON.parse(raw);
      // merge para garantir chaves existentes
      return { ...defaultSuggestions(), ...(parsed || {}) };
    } catch {
      return defaultSuggestions();
    }
  });

  // se trocares a data, podes querer carregar picks dessa data do localStorage
  // (opcional, mas ajuda)
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(selectedDate));
      if (!raw) {
        setPicks(defaultSuggestions());
        return;
      }
      const parsed = JSON.parse(raw);
      setPicks({ ...defaultSuggestions(), ...(parsed || {}) });
    } catch {
      setPicks(defaultSuggestions());
    }
  }, [selectedDate]);

  const predictionsOfDay = useMemo(() => predictions || [], [predictions]);

  const gamesOfDay = useMemo(() => {
    const set = new Set<string>();
    for (const g of predictionsOfDay as any[]) {
      const away = String((g as any).awayTeamAbbr || "").trim().toUpperCase();
      const home = String((g as any).homeTeamAbbr || "").trim().toUpperCase();
      if (!away || !home) continue;
      const txt = normalizeGameText(`${away} VS ${home}`);
      if (txt.includes(" VS ")) set.add(txt);
    }
    return Array.from(set).sort();
  }, [predictionsOfDay]);

  // --------- EXEMPLOS MÍNIMOS DE UI (mantive o teu stub) ---------
  // Nota: no StatsView, drawSuggestions espera objetos com .game
  // Se tu estiveres a guardar draws como string, corrige para: { game: "AAA VS BBB" }
  // Aqui fica um exemplo simples de como adicionar um draw:
  const addDraw = (game: string) => {
    const g = normalizeGameText(game);
    if (!g.includes(" VS ")) return;

    setPicks((prev) => ({
      ...prev,
      drawSuggestions: [...(prev.drawSuggestions || []), { game: g }],
    }));
  };

  const addOver45 = (game: string) => {
    const g = normalizeGameText(game);
    if (!g.includes(" VS ")) return;

    setPicks((prev) => ({
      ...prev,
      quadrupleOver45: [...(prev.quadrupleOver45 || []), g],
    }));
  };

  const savePicks = async () => {
  try {
    const res = await fetch("/api/history", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        date: selectedDate,
        mine: {
          savedAt: Date.now(),
          suggestions: picks,
        },
      }),
    });

    const data = await res.json();
    console.log("SAVE RESPONSE:", data);

    if (!res.ok) {
      alert("Erro ao guardar picks");
      return;
    }

    alert("Picks guardadas com sucesso!");
  } catch (err) {
    console.error("Failed to save picks:", err);
  }
};

  return (
    <div>
      <h2>Minhas Picks</h2>

      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {gamesOfDay.slice(0, 6).map((g) => (
          <button key={g} onClick={() => addOver45(g)}>
            + Over 4.5: {g}
          </button>
        ))}
        {gamesOfDay.slice(0, 3).map((g) => (
          <button key={`d-${g}`} onClick={() => addDraw(g)}>
            + Empate TR: {g}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        <button onClick={savePicks} disabled={isEmptyPicks(picks)}>
          Guardar Picks
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        <h4>Over 4.5</h4>
        <ul>
          {(picks.quadrupleOver45 || []).map((p, i) => (
            <li key={`o45-${i}`}>{p}</li>
          ))}
        </ul>

        <h4>Empate TR</h4>
        <ul>
          {(picks.drawSuggestions || []).map((d: any, i: number) => (
            <li key={`dr-${i}`}>{d?.game ?? String(d)}</li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default MyPicksView;
