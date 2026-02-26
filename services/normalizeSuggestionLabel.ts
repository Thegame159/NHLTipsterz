// services/normalizeSuggestionLabel.ts

export function normalizeSuggestionLabel(raw: string): string {
  if (!raw || typeof raw !== "string") return raw as any;

  // Ex: "2025020917 (EDM)" -> "(EDM)" ou "EDM"
  let s = raw.replace(/^\d+\s*/, "").trim();

  // Ex: "(EDM)" -> "EDM"
  s = s.replace(/^\((.*)\)$/, "$1").trim();

  // Ex: "anything (TBL vs TOR)" -> "TBL vs TOR"
  const m = s.match(/^\s*(.*?)\s*\((.*)\)\s*$/);
  if (m && m[2]) return m[2].trim();

  return s.trim();
}

export type SuggestionsLike = {
  tripleWin?: any;
  tripleOver15P1?: any;
  doubleOver15P1?: any;
  drawSuggestions?: any;
  quadrupleOver45?: any;
  over55Suggestions?: any;
  [k: string]: any;
};

/**
 * Normaliza o bloco suggestions mantendo o mesmo formato (strings).
 * Aceita:
 *  - payload = { predictions, suggestions }
 *  - payload = suggestions diretamente
 */
export function normalizeSuggestionsDeep<T extends SuggestionsLike>(payload: T): T {
  if (!payload || typeof payload !== "object") return payload;

  const hasWrapper = Object.prototype.hasOwnProperty.call(payload, "suggestions");
  const suggestions: any = hasWrapper ? (payload as any).suggestions : payload;

  const normalizeStringArray = (arr: any) =>
    Array.isArray(arr) ? arr.map((x) => (typeof x === "string" ? normalizeSuggestionLabel(x) : x)) : arr;

  const normalizeDraw = (arr: any) =>
    Array.isArray(arr)
      ? arr.map((x) => {
          if (!x || typeof x !== "object") return x;
          return {
            ...x,
            game: typeof x.game === "string" ? normalizeSuggestionLabel(x.game) : x.game,
            explanation: typeof x.explanation === "string" ? x.explanation : "",
          };
        })
      : arr;

  const normalizedSuggestions = {
    ...suggestions,
    tripleWin: normalizeStringArray(suggestions.tripleWin),
    tripleOver15P1: normalizeStringArray(suggestions.tripleOver15P1),
    doubleOver15P1: normalizeStringArray(suggestions.doubleOver15P1),
    quadrupleOver45: normalizeStringArray(suggestions.quadrupleOver45),
    over55Suggestions: normalizeStringArray(suggestions.over55Suggestions),
    drawSuggestions: normalizeDraw(suggestions.drawSuggestions),
  };

  if (hasWrapper) {
    return { ...(payload as any), suggestions: normalizedSuggestions };
  }
  return normalizedSuggestions as any;
}
