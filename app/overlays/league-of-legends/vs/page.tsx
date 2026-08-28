"use client";

import { useEffect, useState } from "react";
import {
  isVsOverlaySponsors,
  isVsOverlayTeam,
  VsMatchupOverlay,
  type VsOverlaySponsor,
  type VsOverlayTeam,
} from "../../vs/VsMatchupOverlay";

type LeagueVsState = {
  version: 1;
  bestOf: string;
  leaguePrimary: string;
  leagueSecondary: string;
  sponsorWidgetEnabled: boolean;
  sponsors: VsOverlaySponsor[];
  blueTeam: VsOverlayTeam;
  redTeam: VsOverlayTeam;
};

const OVERLAY_ENDPOINT = "http://127.0.0.1:4877/api/overlays/league-of-legends";

function isLeagueVsState(value: unknown): value is LeagueVsState {
  if (!value || typeof value !== "object") return false;
  const state = value as Record<string, unknown>;
  return state.version === 1
    && typeof state.bestOf === "string"
    && typeof state.leaguePrimary === "string"
    && typeof state.leagueSecondary === "string"
    && typeof state.sponsorWidgetEnabled === "boolean"
    && isVsOverlaySponsors(state.sponsors)
    && isVsOverlayTeam(state.blueTeam)
    && isVsOverlayTeam(state.redTeam);
}

function winsNeeded(bestOf: string) {
  const match = String(bestOf || "").match(/^Bo(\d+)$/i);
  return match ? Math.max(1, Math.ceil(Number(match[1]) / 2)) : 2;
}

export default function LeagueVsOverlayPage() {
  const [overlay, setOverlay] = useState<LeagueVsState | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function refresh() {
      try {
        const response = await fetch(OVERLAY_ENDPOINT, { cache: "no-store", signal: controller.signal });
        if (response.status === 204 || !response.ok) return;
        const next = await response.json();
        if (active && isLeagueVsState(next)) setOverlay(next);
      } catch {
        // Keep the last valid graphic through temporary writer or network failures.
      }
    }

    void refresh();
    const timer = window.setInterval(refresh, 500);
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

  return (
    <VsMatchupOverlay
      leftTeam={overlay.blueTeam}
      rightTeam={overlay.redTeam}
      winsNeeded={winsNeeded(overlay.bestOf)}
      leaguePrimary={overlay.leaguePrimary}
      leagueSecondary={overlay.leagueSecondary}
      sponsors={overlay.sponsors}
      sponsorWidgetEnabled={overlay.sponsorWidgetEnabled}
      ariaLabel="League of Legends versus overlay"
    />
  );
}
