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
A tua tarefa é analisar os confrontos e métricas históricas de equipas da NHL para a jornada da data ${selectedDate}.

INSTRUÇÕES OBRIGATÓRIAS DE HORÁRIO E DATA:
1. Todos os horários na propriedade "dateTime" DEVEM estar no formato ISO UTC (ex: "${selectedDate}T23:30:00Z").
2. Na jornada noturna da NHL de ${selectedDate}, em horário de Portugal (UTC/WEST), os jogos iniciam-se estritamente entre as 22:00 / 23:00 (da noite de ${selectedDate}) e as 05:00 / 05:30 (da madrugada do dia seguinte).
3. NUNCA dês horários como 07:00, 08:00, 09:30 ou durante a manhã/tarde.
4. Responde EXCLUSIVAMENTE num único objeto JSON válido.

ESTRUTURA JSON EXIGIDA:
{
  "predictions": [
    {
      "id": "game-1",
      "homeTeam": "TOR",
      "awayTeam": "NYI",
      "homeTeamAbbr": "TOR",
      "awayTeamAbbr": "NYI",
      "dateTime": "${selectedDate}T23:30:00Z",
      "winProbabilityHome": 58,
      "winProbabilityAway": 42,
      "over15P1Prob": 70,
      "bttsP1Prob": 25,
      "drawTRProb": 22,
      "over45Prob": 65,
      "homeRecordL10": "7-2-1",
      "awayRecordL10": "5-4-1",
      "analysisSummary": "Toronto mostra superioridade no ataque com +12 golos de saldo nos últimos 10 jogos."
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
          { role: "user", content: `Gera o relatório estatístico em JSON para a jornada NHL de ${selectedDate}.` }
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
      JSON.stringify({ error: error?.message || "Erro interno no servidor." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
