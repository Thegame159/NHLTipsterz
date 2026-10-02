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
1. Identifica os jogos oficiais da NHL agendados para a data ${selectedDate} (ou madrugada correspondente em Portugal).
2. Se não houver jogos oficiais da NHL para esta data exata, devolve um array de previsões vazio ("predictions": []). NUNCA inventes jogos ou equipes que não joguem nesta data.
3. Os horários em "dateTime" DEVEM situar-se preferencialmente entre as 22:00 de ${selectedDate} e as 06:00 da madrugada do dia seguinte (fuso de Portugal/WEST).
4. Responde EXCLUSIVAMENTE num único objeto JSON válido, seguindo rigorosamente a estrutura abaixo.

ESTRUTURA JSON EXIGIDA:
{
  "predictions": [
    {
      "id": "game-1",
      "homeTeam": "Nome da Equipa da Casa (ex: Flyers)",
      "awayTeam": "Nome da Equipa de Fora (ex: Penguins)",
      "homeTeamAbbr": "PHI",
      "awayTeamAbbr": "PIT",
      "dateTime": "${selectedDate}T23:00:00Z",
      "winProbabilityHome": 50,
      "winProbabilityAway": 50,
      "over15P1Prob": 70,
      "bttsP1Prob": 30,
      "drawTRProb": 20,
      "over45Prob": 80,
      "homeRecordL10": "0-0-0",
      "awayRecordL10": "0-0-0",
      "analysisSummary": "Breve resumo da análise para este encontro."
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
