export const LEAGUE_SCOREBOARD_STATS = [
  { key: "kills", label: "Kills", api: true, max: 999 },
  { key: "towers", label: "Towers", api: true, max: 99 },
  { key: "grubs", label: "Grubs", api: false, max: 99 },
  { key: "barons", label: "Baron", api: false, max: 99 },
  { key: "dragons", label: "Dragons", api: false, max: 4 },
];

export const LEAGUE_DRAGON_TYPES = [
  { value: "cloud", label: "Cloud" },
  { value: "mountain", label: "Mountain" },
  { value: "infernal", label: "Infernal" },
  { value: "ocean", label: "Ocean" },
  { value: "hextech", label: "Hextech" },
  { value: "chemtech", label: "Chemtech" },
];
export const LEAGUE_BARON_BUFF_SECONDS = 180;
export const LEAGUE_ELDER_BUFF_SECONDS = 150;
const validExpiry = value => value === null || (Number.isSafeInteger(value) && value > 0 && value <= 8_640_000_000_000_000);
const dragonType = value => value === "unknown" || LEAGUE_DRAGON_TYPES.some(type => type.value === value);
const teams = ["team1", "team2"];
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const count = (value, max) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(0, Math.trunc(Number(value)))) : 0;

export function normalizeLeagueScoreboard(value) {
  const saved = object(value) ? value : {};
  const dragons = Object.fromEntries(teams.map(team => {
    const dragon = saved.dragons?.[team];
    const types = Array.isArray(dragon?.types) ? dragon.types.slice(0, 4).map(type => type === "" || dragonType(type) ? type : "unknown") : Array(count(saved.stats?.dragons?.[team], 4)).fill("unknown");
    while (types.at(-1) === "") types.pop();
    return [team, {
      types,
      soulActive: Boolean(types[3]),
      soulType: types[3] || "unknown",
    }];
  }));
  return {
    hideScoreboard: saved.hideScoreboard !== false,
    hideCountdowns: saved.hideCountdowns !== false,
    goldSource: "disabled",
    clockSource: saved.clockSource === "disabled" ? "disabled" : "api",
    dragons,
    baronBuffs: Object.fromEntries(teams.map(team => [team, {
      expiresAt: validExpiry(saved.baronBuffs?.[team]?.expiresAt) ? saved.baronBuffs[team].expiresAt : null,
    }])),
    elderBuffs: Object.fromEntries(teams.map(team => [team, {
      expiresAt: validExpiry(saved.elderBuffs?.[team]?.expiresAt) ? saved.elderBuffs[team].expiresAt : null,
    }])),
    stats: Object.fromEntries(LEAGUE_SCOREBOARD_STATS.map(({ key, api, max }) => [key, {
      source: api && saved.stats?.[key]?.source !== "manual" ? "api" : "manual",
      team1: key === "dragons" ? dragons.team1.types.filter(Boolean).length : count(saved.stats?.[key]?.team1, max),
      team2: key === "dragons" ? dragons.team2.types.filter(Boolean).length : count(saved.stats?.[key]?.team2, max),
    }])),
  };
}

export function isLeagueScoreboard(value) {
  return object(value) && ["hideScoreboard", "hideCountdowns"].every(key => typeof value[key] === "boolean")
    && value.goldSource === "disabled"
    && ["api", "disabled"].includes(value.clockSource)
    && (value.baronBuffs === undefined || (object(value.baronBuffs) && teams.every(team => object(value.baronBuffs[team]) && validExpiry(value.baronBuffs[team].expiresAt))))
    && (value.elderBuffs === undefined || (object(value.elderBuffs) && teams.every(team => object(value.elderBuffs[team]) && validExpiry(value.elderBuffs[team].expiresAt))))
    && (value.dragons === undefined || (object(value.dragons) && teams.every(team => {
      const dragon = value.dragons[team];
      return object(dragon) && Array.isArray(dragon.types) && dragon.types.length <= 4
        && dragon.types.every(type => type === "" || dragonType(type)) && typeof dragon.soulActive === "boolean" && dragonType(dragon.soulType)
        && value.stats?.dragons?.[team] === dragon.types.filter(Boolean).length;
    })))
    && object(value.stats) && LEAGUE_SCOREBOARD_STATS.every(({ key, api, max }) => {
      const stat = value.stats[key];
      return object(stat) && (stat.source === "manual" || (api && stat.source === "api"))
        && [stat.team1, stat.team2].every(n => Number.isInteger(n) && n >= 0 && n <= max);
    });
}

export function resetLeagueScoreboardCounts(value) {
  const settings = normalizeLeagueScoreboard(value);
  for (const stat of Object.values(settings.stats)) { stat.team1 = 0; stat.team2 = 0; }
  for (const team of teams) settings.dragons[team] = { types: [], soulActive: false, soulType: "unknown" };
  for (const team of teams) settings.baronBuffs[team] = { expiresAt: null };
  for (const team of teams) settings.elderBuffs[team] = { expiresAt: null };
  return settings;
}

export function updateLeagueDragons(value, team, patch) {
  const settings = normalizeLeagueScoreboard(value);
  if (!teams.includes(team)) return settings;
  settings.dragons[team] = { ...settings.dragons[team], ...patch };
  return normalizeLeagueScoreboard(settings);
}

/** Persist one expiry, so refreshes, side swaps, and writer outages never restart a buff. */
export function setLeagueBaronActive(value, team, active, now = Date.now()) {
  return setBuffActive(value, "baronBuffs", team, active, LEAGUE_BARON_BUFF_SECONDS, now);
}

export function setLeagueElderActive(value, team, active, now = Date.now()) {
  return setBuffActive(value, "elderBuffs", team, active, LEAGUE_ELDER_BUFF_SECONDS, now);
}

function setBuffActive(value, key, team, active, duration, now) {
  const settings = normalizeLeagueScoreboard(value);
  if (!teams.includes(team)) return settings;
  settings[key][team].expiresAt = active ? now + duration * 1000 : null;
  if (active) settings[key][team === "team1" ? "team2" : "team1"].expiresAt = null;
  return settings;
}

export function leagueBaronSecondsRemaining(buff, now) {
  return buffSecondsRemaining(buff, now, LEAGUE_BARON_BUFF_SECONDS);
}

export function leagueElderSecondsRemaining(buff, now) {
  return buffSecondsRemaining(buff, now, LEAGUE_ELDER_BUFF_SECONDS);
}

function buffSecondsRemaining(buff, now, duration) {
  if (!buff || !validExpiry(buff.expiresAt) || buff.expiresAt === null || !Number.isFinite(now) || now <= 0) return 0;
  return Math.min(duration, Math.max(0, Math.ceil((buff.expiresAt - now) / 1000)));
}

export function leagueScoreboardTeam(side, blueTeamKey) {
  return side === "ORDER" ? blueTeamKey : blueTeamKey === "team2" ? "team1" : "team2";
}

/** Manual numbers follow their Match 1 team when the broadcast sides flip. */
export function leagueScoreboardValue(settings, key, side, blueTeamKey, live, available) {
  const stat = settings.stats[key];
  const team = leagueScoreboardTeam(side, blueTeamKey);
  if (stat.source === "manual") return stat[team === "team2" ? "team2" : "team1"];
  if (!available) return "—";
  if (key === "kills") return live.players.filter(player => player.team === side).reduce((sum, player) => sum + player.kills, 0);
  return live.objectives[side]?.[key] ?? 0;
}
