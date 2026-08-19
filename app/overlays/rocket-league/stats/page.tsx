"use client";

import { useEffect, useState } from "react";
import { resolveRocketLeagueSideTeams } from "../../../../lib/rocket-league-live.mjs";
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

export default function RocketLeagueStatsOverlayPage() {
  const [overlay, setOverlay] = useState<RocketLeagueStatsState | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function refresh() {
      try {
        const response = await fetch(OVERLAY_ENDPOINT, { cache: "no-store", signal: controller.signal });
        if (response.status === 204 || !response.ok) return;
        const next = await response.json();
        if (active && isRocketLeagueStatsState(next)) {
          setOverlay({
            version: 1,
            bestOf: next.bestOf,
            flipSides: next.flipSides,
            leaguePrimary: next.leaguePrimary,
            leagueSecondary: next.leagueSecondary,
            statsSceneBackground: next.statsSceneBackground === "team-split" ? "team-split" : "transparent",
            teamOne: next.teamOne,
            teamTwo: next.teamTwo,
            matchTeamStats: next.matchTeamStats ?? null,
          });
        }
      } catch {
        // Keep the last valid graphic through temporary writer or network failures.
      }
    }

    refresh();
    const timer = window.setInterval(refresh, 250);
    return () => {
      active = false;
      window.clearInterval(timer);
      controller.abort();
    };
  }, []);

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
