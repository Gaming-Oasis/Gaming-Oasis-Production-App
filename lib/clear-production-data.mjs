import { createLeagueDraftState } from "./league-of-legends.mjs";
import { resetLeagueScoreboardCounts } from "./league-scoreboard.mjs";

/** Clear show entries without changing the operator's workstation configuration. */
export function clearProductionData(current, empty) {
  return {
    ...empty,
    settings: current.settings,
    valorantMapData: current.valorantMapData,
    sponsors: empty.sponsors.map(sponsor => ({
      ...sponsor,
      enabled: current.sponsors.find(saved => saved.id === sponsor.id)?.enabled ?? sponsor.enabled,
    })),
    rocketLeague: {
      ...current.rocketLeague,
      scoreboardHeader: empty.rocketLeague.scoreboardHeader,
      games: empty.rocketLeague.games,
      savedGames: empty.rocketLeague.savedGames,
      lastLiveResultProposalKey: empty.rocketLeague.lastLiveResultProposalKey,
      debugLive: empty.rocketLeague.debugLive,
    },
    valorant: {
      ...current.valorant,
      scoreboardHeader: empty.valorant.scoreboardHeader,
      games: empty.valorant.games,
      savedGames: empty.valorant.savedGames,
      bo3: empty.valorant.bo3,
      bo5: empty.valorant.bo5,
    },
    leagueOfLegends: {
      ...current.leagueOfLegends,
      scoreboardHeader: empty.leagueOfLegends.scoreboardHeader,
      scoreboard: resetLeagueScoreboardCounts(current.leagueOfLegends.scoreboard),
      currentGame: empty.leagueOfLegends.currentGame,
      firstSelectionTeam: "",
      firstSelectionEntitlement: "",
      firstPickTeam: "",
      results: empty.leagueOfLegends.results,
      draft: createLeagueDraftState(current.leagueOfLegends.draft.timerSeconds),
      confirmedGames: empty.leagueOfLegends.confirmedGames,
      resultProposal: empty.leagueOfLegends.resultProposal,
      playerOverrides: empty.leagueOfLegends.playerOverrides,
    },
  };
}
