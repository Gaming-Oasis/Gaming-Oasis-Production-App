/**
 * Applies a successful League Hub match lookup to the stored match.
 *
 * Loading a different match ID clears both custom team-name overrides so
 * displays and production output fall back to the newly loaded match's
 * default team names. Re-syncing the same match ID (a refresh) keeps every
 * override, and failed lookups never reach this function.
 *
 * @param {object} current stored match ({ id, syncedId, team1, team2, league })
 * @param {{ requestedId: string, league: object, team1: object, team2: object }} result
 * @returns {object} the updated match
 */
export function applyMatchLookupResult(current, { requestedId, league, team1, team2 }) {
  const syncedId = String(requestedId ?? "").trim();
  const isDifferentMatch = syncedId !== String(current?.syncedId ?? "").trim();
  const clearNameOverride = (team) => {
    if (!isDifferentMatch || !team?.overrides?.name) return team;
    return { ...team, overrides: { ...team.overrides, name: "" } };
  };
  return {
    ...current,
    syncedId,
    team1: clearNameOverride(team1),
    team2: clearNameOverride(team2),
    league,
  };
}

const SYNCED_TEAM_FIELDS = ["sourceName", "name", "logo", "placement", "standing", "seed"];
const SYNCED_LEAGUE_FIELDS = ["name", "logo", "eventName"];

/**
 * Migrates drafts saved before `syncedId` existed. A stored match that already
 * holds synced team or league data had `id` as its last successfully loaded
 * match ID, so a refresh of that same ID must keep the name overrides. A draft
 * whose ID was typed but never loaded has no synced data and keeps an empty
 * `syncedId`, so the first successful load still clears the overrides.
 * @param {object} saved stored match ({ id, syncedId, team1, team2, league })
 * @returns {string}
 */
export function inferSyncedId(saved) {
  const stored = String(saved?.syncedId ?? "").trim();
  if (stored) return stored;
  const id = String(saved?.id ?? "").trim();
  if (!id) return "";
  const hasFields = (source, fields) =>
    !!source && typeof source === "object" &&
    fields.some((field) => String(source[field] ?? "").trim() !== "");
  const synced = [saved?.team1, saved?.team2].some((team) => hasFields(team, SYNCED_TEAM_FIELDS)) ||
    hasFields(saved?.league, SYNCED_LEAGUE_FIELDS);
  return synced ? id : "";
}
