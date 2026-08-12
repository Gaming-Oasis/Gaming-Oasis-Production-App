export function resolveScoreboardHeader(override, eventName) {
  return String(override ?? "").trim() || String(eventName ?? "").trim();
}
