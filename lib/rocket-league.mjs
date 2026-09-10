export const ROCKET_LEAGUE_GAME_COUNT = 7;

export function rocketLeagueGameLimit(bestOf) {
  const parsed = Number.parseInt(String(bestOf ?? "").replace(/\D/g, ""), 10);
  return [1, 3, 5, 7].includes(parsed) ? parsed : ROCKET_LEAGUE_GAME_COUNT;
}

export function createRocketLeagueGames() {
  return Array.from({ length: ROCKET_LEAGUE_GAME_COUNT }, () => ({ home: "", away: "" }));
}

export function formatRocketLeagueScore(game) {
  const home = String(game?.home ?? "").trim();
  const away = String(game?.away ?? "").trim();
  return `${home || "X"} - ${away || "X"}`;
}

function parseSeriesScore(value) {
  const score = String(value ?? "").trim();
  if (!/^\d+$/.test(score)) return null;
  const parsed = Number(score);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function calculateRocketLeagueSeries(games, bestOf = "Bo7") {
  const gameLimit = rocketLeagueGameLimit(bestOf);
  const winsNeeded = Math.floor(gameLimit / 2) + 1;
  let completedGames = 0;
  let homeWins = 0;
  let awayWins = 0;

  for (const game of (Array.isArray(games) ? games : []).slice(0, gameLimit)) {
    const homeScore = parseSeriesScore(game?.home);
    const awayScore = parseSeriesScore(game?.away);
    if (homeScore === null || awayScore === null) break;
    if (homeScore === awayScore) break;
    completedGames += 1;
    if (homeScore > awayScore) homeWins += 1;
    if (awayScore > homeScore) awayWins += 1;
    if (homeWins >= winsNeeded || awayWins >= winsNeeded) break;
  }

  const seriesComplete = homeWins >= winsNeeded || awayWins >= winsNeeded;

  return {
    roundNumber: completedGames === 0
      ? 1
      : seriesComplete ? completedGames : Math.min(completedGames + 1, gameLimit),
    homeWins,
    awayWins,
    completedGames,
  };
}

/** Live Blue (scoreOne) / Orange (scoreTwo) → Match 1 home/away result cells. */
export function mapLiveScoresToResult(scoreOne, scoreTwo, flipSides = false) {
  const blue = String(parseSeriesScore(scoreOne) ?? 0);
  const orange = String(parseSeriesScore(scoreTwo) ?? 0);
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

  const scoreOne = parseSeriesScore(finishedGame.scoreOne);
  const scoreTwo = parseSeriesScore(finishedGame.scoreTwo);
  if (scoreOne === null || scoreTwo === null) return empty;
  if (scoreOne === scoreTwo) return empty;

  const proposalId = String(finishedGame.id || "").trim();
  const games = Array.isArray(rocketLeague.games) ? rocketLeague.games.map((game) => ({ ...game })) : createRocketLeagueGames();
  const savedGames = Array.isArray(rocketLeague.savedGames)
    ? rocketLeague.savedGames.map((game) => ({ ...game }))
    : createRocketLeagueGames();
  const gameLimit = rocketLeagueGameLimit(rocketLeague.bestOf);
  const winsNeeded = Math.floor(gameLimit / 2) + 1;
  const series = calculateRocketLeagueSeries(savedGames, rocketLeague.bestOf);
  if (series.homeWins >= winsNeeded || series.awayWins >= winsNeeded) return empty;
  const gameIndex = series.completedGames;
  if (gameIndex < 0 || gameIndex >= gameLimit) return empty;

  const proposalKey = proposalId || `${gameIndex}:${scoreOne}-${scoreTwo}`;
  if (proposalKey && proposalKey === String(rocketLeague.lastLiveResultProposalKey || "")) {
    return { ...empty, proposalKey, gameIndex };
  }

  const mapped = mapLiveScoresToResult(scoreOne, scoreTwo, Boolean(rocketLeague.flipSides));
  const current = games[gameIndex] || { home: "", away: "" };
  const homeFilled = String(current.home || "").trim();
  const awayFilled = String(current.away || "").trim();
  const autoAccept = Boolean(rocketLeague.autoAcceptLiveResults);
  const acceptMappedResult = () => {
    const acceptedGames = savedGames.map((game) => ({ ...game }));
    acceptedGames[gameIndex] = { ...mapped };
    const completedGames = calculateRocketLeagueSeries(acceptedGames, `Bo${ROCKET_LEAGUE_GAME_COUNT}`).completedGames;
    const nextSaved = createRocketLeagueGames();
    for (let index = 0; index < completedGames; index += 1) {
      nextSaved[index] = { ...acceptedGames[index] };
    }
    return nextSaved;
  };

  // A matching draft row still needs to advance the published series when
  // live auto-accept is enabled.
  if (homeFilled === mapped.home && awayFilled === mapped.away) {
    const accepted = autoAccept;
    return {
      changed: true,
      proposed: accepted,
      accepted,
      gameIndex,
      proposalKey,
      rocketLeague: {
        ...rocketLeague,
        games,
        savedGames: accepted ? acceptMappedResult() : savedGames,
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
  let accepted = false;
  let nextSaved = savedGames;
  if (autoAccept) {
    nextSaved = acceptMappedResult();
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
