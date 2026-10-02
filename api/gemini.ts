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
    const body = await req.json().catch(() => ({}));
    const selectedDate = body.selectedDate || body.date || "2026-10-02";
    const forceRefresh = body.force === true;

    if (forceRefresh) {
      console.log(`[CACHE CLEARED] A limpar cache manualmente para a data: ${selectedDate}`);
      predictionCache.delete(selectedDate);
    }

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
        `- ${g.homeTeam?.commonName?.default || g.homeTeam?.abbrev} (${g.homeTeam?.abbrev}) vs ${g.awayTeam?.commonName?.default || g.awayTeam?.abbrev} (${g.awayTeam?.abbrev}) às ${g.startTimeUTC}`
      ).join("\n");
    }

    const systemPrompt = `És o motor estatístico e analítico do NHL Tipsterz.
A tua tarefa é analisar os jogos REAIS da NHL fornecidos abaixo para a data ${selectedDate}.

JOGOS OFICIAIS DA NHL PARA ESTA DATA:
${gamesListText}

REGRAS OBRIGATÓRIAS DE ESTRUTURAÇÃO:
1. Se a lista indicar que não há jogos, devolve "predictions": []. Caso contrário, gera as previsões para cada confronto.
2. **CAMPOS DE LESÕES (OBRIGATÓRIO):** 
   - Os campos "homeInjuries" e "awayInjuries" **DEVEM OBRIGATORIAMENTE** ser arrays de strings preenchidos com os jogadores lesionados ou em dúvida para cada equipa (ex: ["Moritz Seider (Entorse no tornozelo)", "Filip Hronek (Concussão)"]). 
   - **NUNCA** deixes estes arrays vazios `[]` nem ponhas apenas "Sem lesões registadas" se houver ausências habituais. Se não houver lesões conhecidas, coloca pelo menos `["Gestão de plantel / Sem lesões graves"]`.
   - Certifica-te de que os jogadores mencionados no resumo analítico ("analysisSummary") constam também nos arrays "homeInjuries" e "awayInjuries".
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
      "analysisSummary": "Resumo analítico detalhado...",
      "homeInjuries": ["Jogador A (Tipo de Lesão)", "Jogador B (Dúvida)"],
      "awayInjuries": ["Jogador C (Lesão)"]
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
          { role: "user", content: `Analisa os jogos da jornada de ${selectedDate} e garante que preenches corretamente os arrays de lesões de cada equipa.` }
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

    predictionCache.set(selectedDate, {
      data: parsedContent,
      timestamp: Date.now(),
    });

    return new Response(JSON.stringify(parsedContent), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Erro crítico na API route:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Erro no servidor." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function DELETE() {
  try {
    predictionCache.clear();
    console.log("[CACHE GLOBAL CLEARED] Toda a cache foi limpa.");
    return new Response(
      JSON.stringify({ success: true, message: "Cache limpa!" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error?.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
