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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const selectedDate = body.selectedDate || body.date || "2026-09-30";

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "GROQ_API_KEY não configurada na Vercel." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `És o motor estatístico do NHL Tipsterz.
A tua tarefa é analisar exclusivamente os jogos REAIS e OFICIAIS da jornada da NHL para a data ${selectedDate}.

REGRA FUNDAMENTAL DE JORNADA E FUSO HORÁRIO:
1. Quando a data selecionada for "2026-09-30", a jornada oficial da NHL (correspondente à madrugada de 01/10 em fuso de Portugal) é composta APENAS por estes 3 confrontos:
   - Philadelphia Flyers (PHI) vs Pittsburgh Penguins (PIT)
   - Toronto Maple Leafs (TOR) vs New York Islanders (NYI)
   - Colorado Avalanche (COL) vs Los Angeles Kings (LAK)
2. NUNCA inventes outros jogos (como Wild, Blackhawks, Sharks, Vegas) para esta data.
3. Os horários em "dateTime" DEVEM situar-se entre as 23:00 de ${selectedDate} e as 04:30 da madrugada do dia seguinte (fuso de Portugal/WEST). Exemplo: "${selectedDate}T23:00:00Z", "2026-10-01T00:00:00Z", "2026-10-01T02:30:00Z".
4. Responde EXCLUSIVAMENTE num único objeto JSON válido.

ESTRUTURA JSON EXIGIDA:
{
  "predictions": [
    {
      "id": "game-1",
      "homeTeam": "Flyers",
      "awayTeam": "Penguins",
      "homeTeamAbbr": "PHI",
      "awayTeamAbbr": "PIT",
      "dateTime": "${selectedDate}T23:00:00Z",
      "winProbabilityHome": 42,
      "winProbabilityAway": 58,
      "over15P1Prob": 75,
      "bttsP1Prob": 30,
      "drawTRProb": 20,
      "over45Prob": 80,
      "homeRecordL10": "4-5-1",
      "awayRecordL10": "7-2-1",
      "analysisSummary": "Penguins demonstram forte eficácia ofensiva contra a defesa dos Flyers."
    },
    {
      "id": "game-2",
      "homeTeam": "Maple Leafs",
      "awayTeam": "Islanders",
      "homeTeamAbbr": "TOR",
      "awayTeamAbbr": "NYI",
      "dateTime": "2026-10-01T00:00:00Z",
      "winProbabilityHome": 60,
      "winProbabilityAway": 40,
      "over15P1Prob": 65,
      "bttsP1Prob": 22,
      "drawTRProb": 25,
      "over45Prob": 60,
      "homeRecordL10": "6-3-1",
      "awayRecordL10": "5-4-1",
      "analysisSummary": "Toronto mantém ligeiro favoritismo jogando em casa no Air Canada Centre."
    },
    {
      "id": "game-3",
      "homeTeam": "Avalanche",
      "awayTeam": "Kings",
      "homeTeamAbbr": "COL",
      "awayTeamAbbr": "LAK",
      "dateTime": "2026-10-01T02:30:00Z",
      "winProbabilityHome": 62,
      "winProbabilityAway": 38,
      "over15P1Prob": 82,
      "bttsP1Prob": 35,
      "drawTRProb": 18,
      "over45Prob": 88,
      "homeRecordL10": "8-2-0",
      "awayRecordL10": "4-4-2",
      "analysisSummary": "Confronto de alto volume de golos perspetivado com forte pendor para Colorado."
    }
  ],
  "suggestions": {
    "tripleWin": ["PIT", "TOR", "COL"],
    "tripleOver15P1": ["PHI VS PIT", "COL VS LAK"],
    "doubleOver15P1": ["TOR VS NYI"],
    "drawSuggestions": [],
    "quadrupleOver45": [],
    "over55Suggestions": ["COL VS LAK", "PHI VS PIT"]
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
          { role: "user", content: `Gera a análise e probabilidades em JSON para os jogos da jornada NHL de ${selectedDate}.` }
        ],
        temperature: 0.1,
      }),
    });

    const data = (await res.json()) as GroqChatResponse;

    if (!res.ok || data.error) {
      return new Response(
        JSON.stringify({ error: data.error?.message || "Erro na API Groq." }),
        { status: res.status || 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const outputText = data.choices?.[0]?.message?.content || "{}";

    let parsedContent;
    try {
      parsedContent = JSON.parse(outputText);
    } catch {
      parsedContent = { predictions: [], suggestions: {} };
    }

    return new Response(JSON.stringify(parsedContent), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error?.message || "Erro no servidor." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
