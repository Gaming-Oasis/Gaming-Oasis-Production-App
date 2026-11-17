import { removeGameLabels } from "./team-name.mjs";

export function resolveScoreboardHeader(override, eventName) {
  const header = String(override ?? "").trim() || String(eventName ?? "").trim();
  return removeGameLabels(header);
}
