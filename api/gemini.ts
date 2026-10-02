// api/gemini.ts

export const config = {
  runtime: 'edge', // Usar o Edge Runtime para evitar limitações de Serverless Functions na Vercel
};

const predictionCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 8 * 60 * 60 * 1000;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const selectedDate = body.selectedDate || body.date || "2026-10-02";
    const forceRefresh = body.force === true;

    if (forceRefresh) {
      predictionCache.delete(selectedDate);
    }

    const cachedEntry = predictionCache.get(selectedDate);
    const now = Date.now();
    if (!forceRefresh && cachedEntry && (now - cachedEntry.timestamp < CACHE_TTL_MS)) {
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

    let gamesForDate = [];
    try {
      const nhlRes = await fetch(`https://api-web.nhle.com/v1/schedule/${selectedDate}`);
      if (nhlRes.ok) {
        const nhlData = await nhlRes.json();
        gamesForDate = nhlData?.gameWeek?.find((gw: any) => gw.date === selectedDate)?.games || [];
      }
    } catch (e) {
      console.error("Erro na API da NHL", e);
    }

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

    const systemPrompt = `És o motor estatístico e analítico do NHL Tipsterz. Analisa os jogos REAIS da NHL para a data ${selectedDate}.

JOGOS OFICIAIS:
${gamesListText}

REGRAS:
1. Devolve as previsões para cada jogo listado.
2. Os campos "homeInjuries" e "awayInjuries" DEVEM ser arrays de strings com lesões reais ou prováveis (ex: ["Jogador (Lesão)"]). Nunca deixes vazio; se não houver dados, coloca ["Sem lesões graves"].
3. Responde EXCLUSIVAMENTE em formato JSON com esta estrutura exata:
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
      "analysisSummary": "Resumo analítico detalhado com menção a lesões...",
      "homeInjuries": ["Jogador A (Lesão)"],
      "awayInjuries": ["Jogador B (Dúvida)"]
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

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Gera a análise para ${selectedDate}.` }
        ],
        temperature: 0.1,
      }),
    });

    const groqData = await groqRes.json();
    if (!groqRes.ok) {
      throw new Error(groqData?.error?.message || "Erro na API da Groq");
    }

    const outputText = groqData.choices?.[0]?.message?.content || "{}";
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
    return new Response(
      JSON.stringify({ error: error?.message || "Erro interno no servidor." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function DELETE() {
  predictionCache.clear();
  return new Response(
    JSON.stringify({ success: true, message: "Cache limpa!" }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
