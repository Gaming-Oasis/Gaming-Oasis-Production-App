"use client";

import { useEffect, useState } from "react";
import { resolveRocketLeagueSideTeams } from "../../../../lib/rocket-league-live.mjs";
import {
  isVsOverlaySponsors,
  isVsOverlayTeam,
  VsMatchupOverlay,
  type VsOverlaySponsor,
  type VsOverlayTeam,
} from "../../vs/VsMatchupOverlay";

type RocketLeagueVsState = {
  version: 1;
  flipSides: boolean;
  winsNeeded: number;
  leaguePrimary: string;
  leagueSecondary: string;
  sponsorWidgetEnabled: boolean;
  sponsors: VsOverlaySponsor[];
  teamOne: VsOverlayTeam;
  teamTwo: VsOverlayTeam;
};

const OVERLAY_ENDPOINT = "http://127.0.0.1:4877/api/overlays/rocket-league";

function isRocketLeagueVsState(value: unknown): value is RocketLeagueVsState {
  if (!value || typeof value !== "object") return false;
  const state = value as Record<string, unknown>;
  return state.version === 1
    && typeof state.flipSides === "boolean"
    && typeof state.winsNeeded === "number"
    && typeof state.leaguePrimary === "string"
    && typeof state.leagueSecondary === "string"
    && typeof state.sponsorWidgetEnabled === "boolean"
    && isVsOverlaySponsors(state.sponsors)
    && isVsOverlayTeam(state.teamOne)
    && isVsOverlayTeam(state.teamTwo);
}

export default function RocketLeagueVsOverlayPage() {
  const [overlay, setOverlay] = useState<RocketLeagueVsState | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function refresh() {
      try {
        const response = await fetch(OVERLAY_ENDPOINT, { cache: "no-store", signal: controller.signal });
        if (response.status === 204 || !response.ok) return;
        const next = await response.json();
        if (active && isRocketLeagueVsState(next)) {
          setOverlay({
            version: 1,
            flipSides: next.flipSides,
            winsNeeded: next.winsNeeded,
            leaguePrimary: next.leaguePrimary,
            leagueSecondary: next.leagueSecondary,
            sponsorWidgetEnabled: next.sponsorWidgetEnabled,
            sponsors: next.sponsors,
            teamOne: next.teamOne,
            teamTwo: next.teamTwo,
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

  if (!overlay) return (
    <main>
      <style>{"html,body{margin:0!important;width:100%!important;height:100%!important;overflow:hidden!important;background:transparent!important;}"}</style>
    </main>
  );

  const sides = resolveRocketLeagueSideTeams(overlay.flipSides, overlay.teamOne, overlay.teamTwo);

  return (
    <VsMatchupOverlay
      leftTeam={sides.left}
      rightTeam={sides.right}
      winsNeeded={overlay.winsNeeded}
      leaguePrimary={overlay.leaguePrimary}
      leagueSecondary={overlay.leagueSecondary}
      sponsors={overlay.sponsors}
      sponsorWidgetEnabled={overlay.sponsorWidgetEnabled}
      ariaLabel="Rocket League versus overlay"
    />
  );
}
