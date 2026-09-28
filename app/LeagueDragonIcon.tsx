"use client";

import { useId } from "react";
import { LEAGUE_DRAGON_TYPES } from "../lib/league-scoreboard.mjs";

/** Share the same locally bundled dragon symbols between controls and graphics. */
export default function LeagueDragonIcon({ type }: { type: string }) {
  const id = useId();
  const known = type === "elder" || LEAGUE_DRAGON_TYPES.some(dragon => dragon.value === type);
  const src = "/league-of-legends-overlay/" + (known ? "dragon-" + type : "score-dragon") + ".png";
  // Luminance removes the black backing in Riot's originals, keeping white symbols.
  return <svg width="100%" height="100%" viewBox={known ? "8 6 48 52" : "0 0 64 64"} aria-hidden="true" style={{ display: "block" }}>
    <defs><mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64" style={{ maskType: "luminance" }}><image href={src} xlinkHref={src} width="64" height="64" style={{ filter: "brightness(2)" }} /></mask></defs>
    <rect width="64" height="64" fill="currentColor" mask={`url(#${id})`} />
  </svg>;
}
