"use client";

import { resolveRocketLeagueSideTeams } from "../../../../lib/rocket-league-live.mjs";
import { usePollingJson } from "../../usePollingJson";
import {
  isMatchTeamStats,
  isStatsOverlayTeam,
  PostMatchTeamStatsOverlay,
  type MatchTeamStats,
  type StatsOverlayTeam,
  type StatsSceneBackground,
} from "./PostMatchTeamStats";

type RocketLeagueStatsState = {
  version: 1;
  bestOf: string;
  flipSides: boolean;
  leaguePrimary: string;
  leagueSecondary: string;
  statsSceneBackground: StatsSceneBackground;
  teamOne: StatsOverlayTeam;
  teamTwo: StatsOverlayTeam;
  matchTeamStats: MatchTeamStats | null;
};

const OVERLAY_ENDPOINT = "http://127.0.0.1:4877/api/overlays/rocket-league";

function isRocketLeagueStatsState(value: unknown): value is RocketLeagueStatsState {
  if (!value || typeof value !== "object") return false;
  const state = value as Record<string, unknown>;
  return state.version === 1
    && typeof state.bestOf === "string"
    && typeof state.flipSides === "boolean"
    && typeof state.leaguePrimary === "string"
    && typeof state.leagueSecondary === "string"
    && (state.statsSceneBackground === undefined
      || state.statsSceneBackground === "transparent"
      || state.statsSceneBackground === "team-split")
    && isStatsOverlayTeam(state.teamOne)
    && isStatsOverlayTeam(state.teamTwo)
    && (state.matchTeamStats === null
      || state.matchTeamStats === undefined
      || isMatchTeamStats(state.matchTeamStats));
}

function normalizeRocketLeagueStatsState(next: RocketLeagueStatsState): RocketLeagueStatsState {
  return {
    version: 1,
    bestOf: next.bestOf,
    flipSides: next.flipSides,
    leaguePrimary: next.leaguePrimary,
    leagueSecondary: next.leagueSecondary,
    statsSceneBackground: next.statsSceneBackground === "team-split" ? "team-split" : "transparent",
    teamOne: next.teamOne,
    teamTwo: next.teamTwo,
    matchTeamStats: next.matchTeamStats ?? null,
  };
}

export default function RocketLeagueStatsOverlayPage() {
  const overlay = usePollingJson({
    endpoint: OVERLAY_ENDPOINT,
    intervalMs: 1000,
    validate: isRocketLeagueStatsState,
    normalize: normalizeRocketLeagueStatsState,
  });

  if (!overlay) {
    return (
      <main>
        <style>{"html,body{margin:0!important;width:100%!important;height:100%!important;overflow:hidden!important;background:transparent!important;}"}</style>
      </main>
    );
  }

  const sides = resolveRocketLeagueSideTeams(overlay.flipSides, overlay.teamOne, overlay.teamTwo);

  return (
    <PostMatchTeamStatsOverlay
      leftTeam={sides.left}
      rightTeam={sides.right}
      bestOf={overlay.bestOf}
      leaguePrimary={overlay.leaguePrimary}
      leagueSecondary={overlay.leagueSecondary}
      statsSceneBackground={overlay.statsSceneBackground}
      matchTeamStats={overlay.matchTeamStats}
      ariaLabel="Rocket League post-match team stats overlay"
    />
  );
}
