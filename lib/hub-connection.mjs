/** Connection health is separate from draft progress and the retained snapshot. */
export function hubConnectionState({ owner, reason, mode, status, hasSnapshot }) {
  if (!owner) return { label: "Standby", detail: "Live updates run in the browser with production control.", tone: "neutral" };
  if (reason) return { label: "Match setup needed", detail: reason, tone: "neutral" };
  if (mode !== "live") return { label: "Manual", detail: hasSnapshot
    ? "Updates paused. The last imported selections are available for editing."
    : "Choose Live to fill the draft from Match 1 in League Hub.", tone: "neutral" };
  if (status.error) return { label: hasSnapshot ? "Updates interrupted" : "Unable to connect", detail: `${status.error.trim()}${/[.!?]$/.test(status.error.trim()) ? "" : "."} ${hasSnapshot
    ? "Keeping the last successful import. Retrying automatically." : "Retrying automatically."}`, tone: "error" };
  if (!status.connected) return { label: "Connecting", detail: hasSnapshot
    ? "Checking League Hub. Showing the last imported draft until it responds."
    : "Requesting the public draft for Match 1…", tone: "neutral" };
  return { label: "Connected", detail: "Live updates every 2 seconds. Switch to Manual to edit selections.", tone: "live" };
}

export function hubDraftProgress(collection, gameKey, gameNumber) {
  if (!collection.required) return "Drafting is disabled for this match in League Hub.";
  const session = gameKey === "valorant" ? collection.veto : collection.sessions.find((s) => s.gameIndex === gameNumber);
  if (!session) return gameKey === "valorant"
    ? "No map veto has been published in League Hub yet."
    : `No draft has been published for Game ${gameNumber} yet.`;
  return session.phase === "complete" ? gameKey === "valorant" ? "Map veto complete" : "Draft complete" : session.progress;
}
