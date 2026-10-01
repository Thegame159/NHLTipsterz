// api/gemini.ts
// Análise estatística de NHL via Groq API (Llama 3.3 70B)

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

    // Aceita qualquer formato de payload enviado pelo frontend (prompt, contents, payload, etc.)
    let promptText = "";

    if (typeof body === "string") {
      promptText = body;
    } else if (body && typeof body === "object") {
      promptText =
        body.prompt ||
        body.contents ||
        body.message ||
        body.data ||
        body.payload ||
        body.games ||
        JSON.stringify(body);
    }

    if (!promptText || promptText === "{}") {
      return new Response(
        JSON.stringify({ error: "Nenhum prompt ou dados fornecidos." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "GROQ_API_KEY não configurada na Vercel." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Chamada à API da Groq com o modelo Llama 3.3 70B Versatile
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              "És um analista estatístico e especialista pragmático em Hóquei no Gelo (NHL). " +
              "A tua única prioridade é a exatidão e a objetividade com base em estatísticas e métricas reais (forma recente, 1st period goals, Over/Under, H2H, xG e ausências). " +
              "Não uses linguagem vaga ou emocional de palpites. Apresenta análises frias, calculadas e estruturadas.",
          },
          {
            role: "user",
            content: promptText,
          },
        ],
        temperature: 0.2, // Temperatura baixa para garantir rigor e consistência estatística
      }),
    });

    const data = (await res.json()) as GroqChatResponse;

    if (!res.ok || data.error) {
      console.error("Erro na API Groq:", data.error || res.statusText);
      return new Response(
        JSON.stringify({ error: data.error?.message || "Erro no processamento da Groq API." }),
        { status: res.status || 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const outputText = data.choices?.[0]?.message?.content || "";

    // Retorna a resposta no formato esperado pelo frontend
    return new Response(JSON.stringify({ text: outputText, result: outputText }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Erro interno no endpoint de análise:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Erro interno na análise." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
