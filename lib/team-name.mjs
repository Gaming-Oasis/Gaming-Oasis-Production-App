export const TEAM_NAME_LIMIT = 13;

// Viewers already know which game they are watching, so on-air text drops every game name and abbreviation.
const GAME_LABELS = ["League of Legends", "Rocket League", "VALORANT", "LoL", "RL", "VAL"];
const SEPARATOR = "[-–—|:·•,/]";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function removeGameLabels(value, gameTitle = "") {
  const labels = [...new Set(
    [gameTitle, ...GAME_LABELS]
      .map((label) => String(label ?? "").trim())
      .filter(Boolean),
  )].sort((a, b) => b.length - a.length);

  let text = String(value ?? "");
  for (const label of labels) {
    text = text.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(label)}(?=$|[^\\p{L}\\p{N}])`, "giu"), "$1 ");
  }
  return text
    .replace(/\s+/g, " ")
    // Collapse separators left back to back once a game label between them is gone: "Oasis | | Week 3".
    .replace(new RegExp(`(${SEPARATOR})(?:\\s*${SEPARATOR})+`, "g"), "$1")
    .replace(new RegExp(`^(?:\\s|${SEPARATOR})+|(?:\\s|${SEPARATOR})+$`, "g"), "")
    .trim();
}

export function shortTeamName(value, gameTitle = "") {
  const original = String(value ?? "").trim();
  if (!original) return "";

  let shortName = original.replace(/^#\d+\s+/, "");
  shortName = shortName.split(/\s+-\s+/)[0]?.trim() || shortName;
  shortName = removeGameLabels(shortName, gameTitle);
  // The A squad is the default squad and never shows its designator: "KU A", "KU (A)" and "KU" are all "KU".
  shortName = shortName.replace(/\s+\(?A\)?$/i, "").trim();
  return shortName || original;
}
