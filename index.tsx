import React, { useState, useEffect } from "react";

// Helper para extrair a data original da jornada da NHL (fuso ET / UTC)
function getNHLGameDateString(gameDateInput: string | Date): string {
  const dateObj = new Date(gameDateInput);
  
  // Se o jogo for na madrugada em Portugal (ex: entre 00:00 e 06:00 UTC),
  // ajusta o fuso para a data oficial da jornada norte-americana (subtrai horas para alinhar ao ET)
  const adjustedDate = new Date(dateObj.getTime() - 5 * 60 * 60 * 1000);
  
  return adjustedDate.toISOString().split("T")[0];
}

export default function App() {
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [games, setGames] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Exemplo de filtragem de jogos ajustada para fusos horários
  const filteredGames = games.filter((game: any) => {
    if (!game) return false;

    const rawDate = game.date || game.startTime || game.gameDate;
    if (!rawDate) return false;

    // 1. Data em formato YYYY-MM-DD original sem conversão local
    const gameDateUTC = typeof rawDate === "string" ? rawDate.split("T")[0] : "";
    
    // 2. Data ajustada para a jornada oficial da NHL
    const gameJornadaDate = getNHLGameDateString(rawDate);

    // Aceita o jogo se a data corresponder à jornada selecionada
    return (
      gameDateUTC === selectedDate ||
      gameJornadaDate === selectedDate ||
      game.gameDate === selectedDate
    );
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4">
      {/* Container Principal da Aplicação */}
      <header className="flex flex-col items-center my-6">
        <h1 className="text-4xl font-bold font-nhl-block text-orange-500">
          NHL TIPSTERZ
        </h1>
      </header>

      {/* Seletor de Data e Ações */}
      <div className="flex justify-center items-center gap-4 my-4">
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="bg-slate-900 border border-slate-700 text-white px-3 py-2 rounded-lg"
        />
      </div>

      {/* Lista de Jogos */}
      <main className="max-w-4xl mx-auto">
        {filteredGames.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <p>Sem jogos para a data selecionada ({selectedDate}).</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredGames.map((game: any, index: number) => (
              <div
                key={game.id || index}
                className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex justify-between items-center"
              >
                <div>
                  <span className="font-semibold text-lg">
                    {game.homeTeam || game.home} vs {game.awayTeam || game.away}
                  </span>
                  <p className="text-sm text-slate-400">
                    {new Date(game.date || game.startTime).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
