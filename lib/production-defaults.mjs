import { normalizeLeagueScoreboard } from "./league-scoreboard.mjs";

export const ROCKET_LEAGUE_PRODUCTION_DEFAULTS = {
  playerCardEnabled: true,
  sponsorWidgetEnabled: true,
  broadcastSetupEnabled: true,
  lobbyScene: "stats",
  statsSceneBackground: "team-split",
};
export const VALORANT_PRODUCTION_DEFAULTS = { mapWidgetEnabled: true, sponsorWidgetEnabled: true };

/** Apply only production controls; retain match data, manual values, and timers. */
export function applyProductionDefaults(state, conferences) {
  const scoreboard = normalizeLeagueScoreboard(state.leagueOfLegends.scoreboard);
  return {
    ...state,
    rocketLeague: { ...state.rocketLeague, ...ROCKET_LEAGUE_PRODUCTION_DEFAULTS },
    valorant: { ...state.valorant, ...VALORANT_PRODUCTION_DEFAULTS },
    leagueOfLegends: {
      ...state.leagueOfLegends,
      sponsorWidgetEnabled: true,
      vsScreenEnabled: !conferences,
      scoreboard: {
        ...scoreboard,
        hideScoreboard: false,
        hideCountdowns: conferences,
        goldSource: "disabled",
        clockSource: "disabled",
        stats: Object.fromEntries(Object.entries(scoreboard.stats).map(([key, stat]) => [key, { ...stat, source: "manual" }])),
      },
    },
  };
}

export function matchesProductionDefaults(state, conferences) {
  const matches = (value, defaults) => Object.entries(defaults).every(([key, expected]) => value[key] === expected);
  const league = state.leagueOfLegends;
  const scoreboard = league.scoreboard;
  return matches(state.rocketLeague, ROCKET_LEAGUE_PRODUCTION_DEFAULTS)
    && matches(state.valorant, VALORANT_PRODUCTION_DEFAULTS)
    && league.sponsorWidgetEnabled && league.vsScreenEnabled === !conferences
    && !scoreboard.hideScoreboard && scoreboard.hideCountdowns === conferences
    && scoreboard.goldSource === "disabled" && scoreboard.clockSource === "disabled"
    && Object.values(scoreboard.stats).every(stat => stat.source === "manual");
}
