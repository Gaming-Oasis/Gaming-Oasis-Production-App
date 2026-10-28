const DRAFT_CONNECTION_COPY = {
  setup: "Match setup needed",
  manual: "Manual",
  manualRetained: "Updates paused. The last imported selections are available for editing.",
  manualEmpty: "Turn Live on to fill the draft from Match 1 in League Hub.",
  retained: "Keeping the last successful import.",
  checkingRetained: "Checking League Hub. Showing the last imported draft until it responds.",
  checkingEmpty: "Requesting the public draft for Match 1…",
  connected: "Live updates every 2 seconds. Turn Live off to edit selections.",
};

/** Brackets use Hold as their manual mode and need a loaded stage before anything refreshes. */
export const BRACKET_CONNECTION_COPY = {
  setup: "No bracket loaded",
  manual: "Updates held",
  manualRetained: "Scores and progression are frozen. Release Hold to fetch the latest bracket.",
  manualEmpty: "Release Hold to fetch the latest bracket.",
  retained: "The current bracket stays on air.",
  checkingRetained: "Checking League Hub. The current bracket stays on air until it responds.",
  checkingEmpty: "Requesting the bracket from League Hub…",
  connected: "Live updates every 2 seconds. Hold freezes scores and progression.",
};

/** Connection health is separate from draft progress and the retained snapshot. */
export function hubConnectionState({ owner, reason, mode, status, hasSnapshot, copy = DRAFT_CONNECTION_COPY }) {
  if (!owner) return { label: "Standby", detail: "Live updates run in the browser with production control.", tone: "neutral" };
  if (reason) return { label: copy.setup, detail: reason, tone: "neutral" };
  if (mode !== "live") return { label: copy.manual, detail: hasSnapshot ? copy.manualRetained : copy.manualEmpty, tone: "neutral" };
  if (status.error) return { label: hasSnapshot ? "Updates interrupted" : "Unable to connect", detail: `${status.error.trim()}${/[.!?]$/.test(status.error.trim()) ? "" : "."} ${hasSnapshot
    ? `${copy.retained} Retrying automatically.` : "Retrying automatically."}`, tone: "error" };
  if (!status.connected) return { label: "Connecting", detail: hasSnapshot ? copy.checkingRetained : copy.checkingEmpty, tone: "neutral" };
  return { label: "Connected", detail: copy.connected, tone: "live" };
}

export function hubDraftProgress(collection, gameKey, gameNumber) {
  if (!collection.required) return "Drafting is disabled for this match in League Hub.";
  const session = gameKey === "valorant" ? collection.veto : collection.sessions.find((s) => s.gameIndex === gameNumber);
  if (!session) return gameKey === "valorant"
    ? "No map veto has been published in League Hub yet."
    : `No draft has been published for Game ${gameNumber} yet.`;
  return session.phase === "complete" ? gameKey === "valorant" ? "Map veto complete" : "Draft complete" : session.progress;
}
