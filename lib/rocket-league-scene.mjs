/** Unknown or older saved values retain automatic feed-driven switching. */
export function normalizeRocketLeagueSceneMode(value) {
  return ["scoreboard", "vs", "stats"].includes(value) ? value : "auto";
}

export function resolveRocketLeagueScene(state) {
  const mode = normalizeRocketLeagueSceneMode(state?.sceneMode);
  if (mode !== "auto") return mode;
  if (state?.game?.hasGame) return "scoreboard";
  return state?.lobbyScene === "stats" ? "stats" : "vs";
}
