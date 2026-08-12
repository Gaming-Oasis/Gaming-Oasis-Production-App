export const ROCKET_LEAGUE_GAME_COUNT = 7;

export function createRocketLeagueGames() {
  return Array.from({ length: ROCKET_LEAGUE_GAME_COUNT }, () => ({ home: "", away: "" }));
}

export function formatRocketLeagueScore(game) {
  const home = String(game?.home ?? "").trim();
  const away = String(game?.away ?? "").trim();
  return `${home || "X"} - ${away || "X"}`;
}

export function calculateRocketLeagueSeries(games) {
  let completedGames = 0;
  let homeWins = 0;
  let awayWins = 0;

  games.slice(0, ROCKET_LEAGUE_GAME_COUNT).forEach((game) => {
    const home = String(game?.home ?? "").trim();
    const away = String(game?.away ?? "").trim();
    if (!home || !away) return;

    completedGames += 1;
    const homeScore = Number.parseInt(home, 10) || 0;
    const awayScore = Number.parseInt(away, 10) || 0;
    if (homeScore > awayScore) homeWins += 1;
    if (awayScore > homeScore) awayWins += 1;
  });

  return {
    roundNumber: completedGames === 0 ? 1 : completedGames + 1,
    homeWins,
    awayWins,
    completedGames,
  };
}
