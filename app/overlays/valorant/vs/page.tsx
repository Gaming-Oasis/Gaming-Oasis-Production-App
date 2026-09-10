"use client";

import { usePollingJson } from "../../usePollingJson";
import {
  isVsOverlaySponsors,
  isVsOverlayTeam,
  VsMatchupOverlay,
  type VsOverlaySponsor,
  type VsOverlayTeam,
} from "../../vs/VsMatchupOverlay";

type ValorantVsState = {
  version: 1;
  bestOf?: string;
  leaguePrimary: string;
  leagueSecondary: string;
  sponsorWidgetEnabled: boolean;
  sponsors: VsOverlaySponsor[];
  teamOne: VsOverlayTeam;
  teamTwo: VsOverlayTeam;
};

const OVERLAY_ENDPOINT = "http://127.0.0.1:4877/api/overlays/valorant";

function isValorantVsState(value: unknown): value is ValorantVsState {
  if (!value || typeof value !== "object") return false;
  const state = value as Record<string, unknown>;
  return state.version === 1
    && typeof state.leaguePrimary === "string"
    && typeof state.leagueSecondary === "string"
    && typeof state.sponsorWidgetEnabled === "boolean"
    && isVsOverlaySponsors(state.sponsors)
    && isVsOverlayTeam(state.teamOne)
    && isVsOverlayTeam(state.teamTwo);
}

function normalizeValorantVsState(next: ValorantVsState): ValorantVsState {
  return {
    version: 1,
    bestOf: typeof next.bestOf === "string" ? next.bestOf : undefined,
    leaguePrimary: next.leaguePrimary,
    leagueSecondary: next.leagueSecondary,
    sponsorWidgetEnabled: next.sponsorWidgetEnabled,
    sponsors: next.sponsors,
    teamOne: next.teamOne,
    teamTwo: next.teamTwo,
  };
}

function winsNeededFromBestOf(bestOf: string | undefined, winsOne: number, winsTwo: number) {
  const match = String(bestOf || "").match(/^Bo(\d+)$/i);
  const fromFormat = match ? Math.ceil(Number(match[1]) / 2) : 0;
  const leading = Math.max(winsOne, winsTwo);
  return Math.max(fromFormat || (leading >= 3 ? 3 : 2), leading, 1);
}

export default function ValorantVsOverlayPage() {
  const overlay = usePollingJson({
    endpoint: OVERLAY_ENDPOINT,
    intervalMs: 1000,
    validate: isValorantVsState,
    normalize: normalizeValorantVsState,
  });

  if (!overlay) return (
    <main>
      <style>{"html,body{margin:0!important;width:100%!important;height:100%!important;overflow:hidden!important;background:transparent!important;}"}</style>
    </main>
  );

  const winsOne = Number.parseInt(overlay.teamOne.seriesScore || "0", 10) || 0;
  const winsTwo = Number.parseInt(overlay.teamTwo.seriesScore || "0", 10) || 0;

  return (
    <VsMatchupOverlay
      leftTeam={overlay.teamOne}
      rightTeam={overlay.teamTwo}
      winsNeeded={winsNeededFromBestOf(overlay.bestOf, winsOne, winsTwo)}
      leaguePrimary={overlay.leaguePrimary}
      leagueSecondary={overlay.leagueSecondary}
      sponsors={overlay.sponsors}
      sponsorWidgetEnabled={overlay.sponsorWidgetEnabled}
      ariaLabel="VALORANT versus overlay"
    />
  );
}
