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

/** Live Blue (scoreOne) / Orange (scoreTwo) → Match 1 home/away result cells. */
export function mapLiveScoresToResult(scoreOne, scoreTwo, flipSides = false) {
  const blue = String(Math.max(0, Number.parseInt(String(scoreOne ?? 0), 10) || 0));
  const orange = String(Math.max(0, Number.parseInt(String(scoreTwo ?? 0), 10) || 0));
  // Default: home plays Blue. Swap assignment: home plays Orange / away plays Blue.
  return flipSides
    ? { home: orange, away: blue }
    : { home: blue, away: orange };
}

/**
 * Propose a finished live game into the next Results row.
 * When autoAccept is true and the score is not a tie, also copy into savedGames.
 */
export function proposeRocketLeagueLiveResult(rocketLeague, finishedGame) {
  const empty = {
    changed: false,
    proposed: false,
    accepted: false,
    gameIndex: -1,
    proposalKey: "",
    rocketLeague,
  };
  if (!rocketLeague || typeof rocketLeague !== "object" || !finishedGame || typeof finishedGame !== "object") {
    return empty;
  }

  const scoreOne = Number.parseInt(String(finishedGame.scoreOne ?? ""), 10);
  const scoreTwo = Number.parseInt(String(finishedGame.scoreTwo ?? ""), 10);
  if (!Number.isFinite(scoreOne) || !Number.isFinite(scoreTwo)) return empty;
  if (scoreOne === scoreTwo) return empty;

  const proposalId = String(finishedGame.id || "").trim();
  const games = Array.isArray(rocketLeague.games) ? rocketLeague.games.map((game) => ({ ...game })) : createRocketLeagueGames();
  const savedGames = Array.isArray(rocketLeague.savedGames)
    ? rocketLeague.savedGames.map((game) => ({ ...game }))
    : createRocketLeagueGames();
  const series = calculateRocketLeagueSeries(savedGames);
  const gameIndex = series.completedGames;
  if (gameIndex < 0 || gameIndex >= ROCKET_LEAGUE_GAME_COUNT) return empty;

  const proposalKey = proposalId || `${gameIndex}:${scoreOne}-${scoreTwo}`;
  if (proposalKey && proposalKey === String(rocketLeague.lastLiveResultProposalKey || "")) {
    return { ...empty, proposalKey, gameIndex };
  }

  const mapped = mapLiveScoresToResult(scoreOne, scoreTwo, Boolean(rocketLeague.flipSides));
  const current = games[gameIndex] || { home: "", away: "" };
  const homeFilled = String(current.home || "").trim();
  const awayFilled = String(current.away || "").trim();

  // Already matches — stamp the proposal key only.
  if (homeFilled === mapped.home && awayFilled === mapped.away) {
    return {
      changed: true,
      proposed: false,
      accepted: false,
      gameIndex,
      proposalKey,
      rocketLeague: {
        ...rocketLeague,
        lastLiveResultProposalKey: proposalKey,
      },
    };
  }

  // Do not overwrite a row the operator already filled with different scores.
  if (homeFilled || awayFilled) {
    return {
      changed: true,
      proposed: false,
      accepted: false,
      gameIndex,
      proposalKey,
      rocketLeague: {
        ...rocketLeague,
        lastLiveResultProposalKey: proposalKey,
      },
    };
  }

  games[gameIndex] = mapped;
  const autoAccept = Boolean(rocketLeague.autoAcceptLiveResults);
  let accepted = false;
  let nextSaved = savedGames;
  if (autoAccept) {
    nextSaved = games.map((game) => ({ ...game }));
    accepted = true;
  }

  return {
    changed: true,
    proposed: true,
    accepted,
    gameIndex,
    proposalKey,
    rocketLeague: {
      ...rocketLeague,
      games,
      savedGames: nextSaved,
      lastLiveResultProposalKey: proposalKey,
    },
  };
}
