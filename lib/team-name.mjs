export const TEAM_NAME_LIMIT = 13;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function shortTeamName(value, gameTitle = "") {
  const original = String(value ?? "").trim();
  if (!original) return "";

  let shortName = original.replace(/^#\d+\s+/, "");
  shortName = shortName.split(/\s+-\s+/)[0]?.trim() || shortName;

  const gameLabels = [...new Set(
    [gameTitle, "Rocket League", "VALORANT"]
      .map((label) => String(label ?? "").trim())
      .filter(Boolean),
  )];
  for (const label of gameLabels) {
    shortName = shortName.replace(new RegExp(`\\b${escapeRegExp(label)}\\b`, "gi"), " ");
  }

  shortName = shortName.replace(/\s+/g, " ").trim();
  return shortName || original;
}
