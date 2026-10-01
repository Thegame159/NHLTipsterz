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
A tua tarefa é analisar os confrontos e métricas históricas de equipas da NHL para a data ${selectedDate}.

INSTRUÇÕES OBRIGATÓRIAS:
1. Responde EXCLUSIVAMENTE num único objeto JSON válido.
2. NUNCA incluas avisos de limitações de dados, recusas, nem texto fora do JSON.
3. Se a data for ${selectedDate}, gera as previsões e odds calculadas para os jogos dessa jornada com base no histórico real de confrontos diretos, métricas de xG, ataque/defesa e forma recente das equipas.

ESTRUTURA JSON EXIGIDA:
{
  "predictions": [
    {
      "id": "game-1",
      "homeTeam": "TOR",
      "awayTeam": "NYI",
      "dateTime": "${selectedDate}T23:30:00Z",
      "homeWinProb": 58,
      "awayWinProb": 42,
      "over55Prob": 65,
      "over15P1Prob": 70,
      "drawProb": 22,
      "analysis": "Análise baseada no histórico recente e métricas de ataque/defesa."
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

    return new Response(JSON.stringify({ text: outputText, result: outputText }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error?.message || "Erro interno." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
