// api/gemini.ts

type GroqChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

// Cache em memória no servidor (válida por 8 horas)
const predictionCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 8 * 60 * 60 * 1000;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const selectedDate = body.selectedDate || body.date || "2026-10-02";
    const forceRefresh = body.force === true;

    // Se o botão de refresh foi clicado, limpa a cache desta data específica
    if (forceRefresh) {
      console.log(`[CACHE CLEARED] A limpar cache manualmente para a data: ${selectedDate}`);
      predictionCache.delete(selectedDate);
    }

    // Verificar se existe cache válida (se não for forceRefresh)
    const cachedEntry = predictionCache.get(selectedDate);
    const now = Date.now();
    if (!forceRefresh && cachedEntry && (now - cachedEntry.timestamp < CACHE_TTL_MS)) {
      console.log(`[CACHE HIT] A retornar dados em cache para a data: ${selectedDate}`);
      return new Response(JSON.stringify(cachedEntry.data), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "GROQ_API_KEY não configurada na Vercel." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Ir buscar os jogos reais à API oficial da NHL
    let nhlGamesData: any = null;
    try {
      const nhlRes = await fetch(`https://api-web.nhle.com/v1/schedule/${selectedDate}`);
      if (nhlRes.ok) {
        nhlGamesData = await nhlRes.json();
      }
    } catch (e) {
      console.error("Erro ao contactar a API da NHL", e);
    }

    let gamesForDate = nhlGamesData?.gameWeek?.find((gw: any) => gw.date === selectedDate)?.games || [];

    // Salvaguarda para 30-09 (garantir os 3 jogos oficiais se a API da NHL falhar)
    if (selectedDate === "2026-09-30" && gamesForDate.length < 3) {
      gamesForDate = [
        { homeTeam: { commonName: { default: "Flyers" }, abbrev: "PHI" }, awayTeam: { commonName: { default: "Penguins" }, abbrev: "PIT" }, startTimeUTC: "2026-09-30T23:00:00Z" },
        { homeTeam: { commonName: { default: "Maple Leafs" }, abbrev: "TOR" }, awayTeam: { commonName: { default: "Islanders" }, abbrev: "NYI" }, startTimeUTC: "2026-10-01T00:00:00Z" },
        { homeTeam: { commonName: { default: "Avalanche" }, abbrev: "COL" }, awayTeam: { commonName: { default: "Kings" }, abbrev: "LAK" }, startTimeUTC: "2026-10-01T02:30:00Z" }
      ];
    }

    let gamesListText = "Nenhum jogo oficial encontrado para esta data.";
    if (gamesForDate.length > 0) {
      gamesListText = gamesForDate.map((g: any) => 
        `- ${g.homeTeam.commonName.default} (${g.homeTeam.abbrev}) vs ${g.awayTeam.commonName.default} (${g.awayTeam.abbrev}) às ${g.startTimeUTC}`
      ).join("\n");
    }

    const systemPrompt = `És o motor estatístico e analítico do NHL Tipsterz.
A tua tarefa é analisar os jogos REAIS da NHL fornecidos abaixo para a data ${selectedDate}.

JOGOS OFICIAIS DA NHL PARA ESTA DATA:
${gamesListText}

REGRAS OBRIGATÓRIAS:
1. Se a lista indicar que não há jogos, devolve "predictions": []. Caso contrário, gera as previsões para cada confronto.
2. **LESÕES (MUITO IMPORTANTE):** Deves preencher obrigatoriamente os campos "homeInjuries" e "awayInjuries" com jogadores ausentes, lesionados ou em dúvida conhecidos para cada equipa (ex: nomes reais de jogadores importantes lesionados ou em dúvida, ou "Gestão de plantel / Sem lesões graves"). NUNCA deixes isto vazio ou apenas com "Sem lesões significativas" se houver ausências habituais na equipa.
3. Responde EXCLUSIVAMENTE num único objeto JSON válido seguindo exatamente esta estrutura:
{
  "predictions": [
    {
      "id": "game-1",
      "homeTeam": "Nome",
      "awayTeam": "Nome",
      "homeTeamAbbr": "ABC",
      "awayTeamAbbr": "XYZ",
      "dateTime": "${selectedDate}T23:00:00Z",
      "winProbabilityHome": 50,
      "winProbabilityAway": 50,
      "over15P1Prob": 70,
      "bttsP1Prob": 30,
      "drawTRProb": 20,
      "over45Prob": 80,
      "homeRecordL10": "5-4-1",
      "awayRecordL10": "6-3-1",
      "analysisSummary": "Resumo analítico...",
      "homeInjuries": ["Nome do Jogador (Lesão no Joelho)", "Outro Jogador (Dúvida)"],
      "awayInjuries": ["Nome do Jogador (Concussão)"]
    }
  ],
  "suggestions": {
    "tripleWin": [],
    "tripleOver15P1": [],
    "doubleOver15P1": [],
    "drawSuggestions": [],
    "quadrupleOver45": [],
    "over55Suggestions": []
  },
  "lastUpdated": "${new Date().toISOString()}"
}`;

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analisa os jogos da jornada de ${selectedDate}.` }
        ],
        temperature: 0.1,
      }),
    });

    const data = (await res.json()) as GroqChatResponse;
    const outputText = data.choices?.[0]?.message?.content || "{}";

    let parsedContent;
    try {
      parsedContent = JSON.parse(outputText);
    } catch {
      parsedContent = { predictions: [], suggestions: {} };
    }

    // Guardar na cache
    predictionCache.set(selectedDate, {
      data: parsedContent,
      timestamp: Date.now(),
    });

    return new Response(JSON.stringify(parsedContent), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error?.message || "Erro no servidor." }),
      { status: 500, headers: { "Content-Type": "application/json" }, }
    );
  }
}

// ─── DELETE: Limpar toda a cache global ao carregar no botão de refresh ───
export async function DELETE() {
  try {
    predictionCache.clear();
    console.log("[CACHE GLOBAL CLEARED] Toda a cache de previsões foi limpa com sucesso.");

    return new Response(
      JSON.stringify({ success: true, message: "Histórico e cache limpos com sucesso!" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error?.message || "Erro ao limpar a cache." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
