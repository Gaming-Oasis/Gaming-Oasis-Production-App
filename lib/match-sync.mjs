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
