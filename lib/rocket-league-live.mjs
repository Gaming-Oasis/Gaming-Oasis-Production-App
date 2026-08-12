import { calculateRocketLeagueSeries } from "./rocket-league.mjs";

export const ROCKET_LEAGUE_OVERLAY_DEFAULTS = {
  teamOneColor: "#1A75FD",
  teamTwoColor: "#F8871E",
  leaguePrimary: "#1A75FD",
  leagueSecondary: "#FCC500",
  logoBackground: "#FFFFFF",
  skin: "nel",
};

function overlayColor(value, fallback) {
  const normalized = String(value ?? "").trim();
  if (/^#[0-9a-f]{6}$/i.test(normalized) || /^#[0-9a-f]{3}$/i.test(normalized)) return normalized;
  if (/^rgb\(\s*(?:\d{1,3}\s*,\s*){2}\d{1,3}\s*\)$/i.test(normalized)) return normalized;
  return fallback;
}

function winsNeededForBestOf(bestOf) {
  const match = String(bestOf || "").match(/^Bo(\d+)$/i);
  const total = match ? Number.parseInt(match[1], 10) : 5;
  return Math.max(1, Math.ceil(total / 2));
}

function buildOverlayTeam(team, seriesScore, colorFallback) {
  return {
    name: String(team?.name || "").trim(),
    standing: String(team?.standing || "").trim(),
    logo: String(team?.logo || "").trim(),
    color: overlayColor(team?.color, colorFallback),
    logoBackground: overlayColor(team?.logoBackground, ROCKET_LEAGUE_OVERLAY_DEFAULTS.logoBackground),
    seriesScore: String(seriesScore ?? "0"),
  };
}

export function buildRocketLeagueOverlayState(rocketLeague, home, away, league = {}) {
  // Prefer the live editor scores so series pills fill as soon as a game winner is entered.
  // Fall back to savedGames when the draft board is empty.
  const draftGames = Array.isArray(rocketLeague?.games) ? rocketLeague.games : [];
  const savedGames = Array.isArray(rocketLeague?.savedGames) ? rocketLeague.savedGames : [];
  const draftSeries = calculateRocketLeagueSeries(draftGames);
  const series = draftSeries.completedGames > 0
    ? draftSeries
    : calculateRocketLeagueSeries(savedGames);
  const bestOf = ["Bo1", "Bo3", "Bo5", "Bo7"].includes(rocketLeague?.bestOf)
    ? rocketLeague.bestOf
    : "Bo5";

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    skin: ROCKET_LEAGUE_OVERLAY_DEFAULTS.skin,
    header: String(rocketLeague?.scoreboardHeader || "").trim(),
    bestOf,
    flipSides: Boolean(rocketLeague?.flipSides),
    playerCardEnabled: rocketLeague?.playerCardEnabled !== false,
    roundNumber: series.roundNumber,
    winsNeeded: winsNeededForBestOf(bestOf),
    leaguePrimary: overlayColor(league.primaryColor, ROCKET_LEAGUE_OVERLAY_DEFAULTS.leaguePrimary),
    leagueSecondary: overlayColor(league.secondaryColor, ROCKET_LEAGUE_OVERLAY_DEFAULTS.leagueSecondary),
    teamOne: buildOverlayTeam(home, series.homeWins, ROCKET_LEAGUE_OVERLAY_DEFAULTS.teamOneColor),
    teamTwo: buildOverlayTeam(away, series.awayWins, ROCKET_LEAGUE_OVERLAY_DEFAULTS.teamTwoColor),
    connection: {
      connected: false,
      lastEventAt: null,
    },
    game: {
      hasGame: false,
      hasWinner: false,
      isOT: false,
      isReplay: false,
      timeSeconds: 0,
      target: "",
      scoreOne: 0,
      scoreTwo: 0,
      targetPlayer: null,
    },
  };
}
