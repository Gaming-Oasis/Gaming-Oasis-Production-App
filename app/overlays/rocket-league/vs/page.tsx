"use client";

import { resolveRocketLeagueSideTeams } from "../../../../lib/rocket-league-live.mjs";
import { usePollingJson } from "../../usePollingJson";
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

function normalizeRocketLeagueVsState(next: RocketLeagueVsState): RocketLeagueVsState {
  return {
    version: 1,
    flipSides: next.flipSides,
    winsNeeded: next.winsNeeded,
    leaguePrimary: next.leaguePrimary,
    leagueSecondary: next.leagueSecondary,
    sponsorWidgetEnabled: next.sponsorWidgetEnabled,
    sponsors: next.sponsors,
    teamOne: next.teamOne,
    teamTwo: next.teamTwo,
  };
}

export default function RocketLeagueVsOverlayPage() {
  const overlay = usePollingJson({
    endpoint: OVERLAY_ENDPOINT,
    intervalMs: 1000,
    validate: isRocketLeagueVsState,
    normalize: normalizeRocketLeagueVsState,
  });

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
