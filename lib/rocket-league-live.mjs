import { calculateRocketLeagueSeries } from "./rocket-league.mjs";
import { resolveScoreboardHeader } from "./scoreboard-header.mjs";
import { buildOverlaySponsors } from "./overlay-sponsors.mjs";
import { resolveImagePlate } from "./readable-text.mjs";

export const ROCKET_LEAGUE_OVERLAY_DEFAULTS = {
  teamOneColor: "#1A75FD",
  teamTwoColor: "#F8871E",
  leaguePrimary: "#1A75FD",
  leagueSecondary: "#FCC500",
  logoBackground: "#FFFFFF",
  skin: "nel",
};

export const ROCKET_LEAGUE_ACTIVE_PLAYER_SCENARIOS = {
  skyljn3: {
    id: "skyljn3",
    label: "Screenshot match (SKYLIN3)",
    player: {
      id: "debug-skyljn3",
      name: "SKYLIN3",
      team: 0,
      goals: 0,
      shots: 3,
      saves: 2,
      assists: 0,
      boost: 45,
      isDead: false,
    },
  },
  "long-name": {
    id: "long-name",
    label: "Long name truncate",
    player: {
      id: "debug-long-name",
      name: "SUPERLONGNAMEHERE",
      team: 0,
      goals: 1,
      shots: 4,
      saves: 1,
      assists: 2,
      boost: 62,
      isDead: false,
    },
  },
  "team-two": {
    id: "team-two",
    label: "Team two colors",
    player: {
      id: "debug-team-two",
      name: "ORANG3",
      team: 1,
      goals: 2,
      shots: 5,
      saves: 0,
      assists: 1,
      boost: 33,
      isDead: false,
    },
  },
  "high-stats": {
    id: "high-stats",
    label: "High stats spacing",
    player: {
      id: "debug-high-stats",
      name: "STATPAD",
      team: 0,
      goals: 12,
      shots: 24,
      saves: 18,
      assists: 9,
      boost: 70,
      isDead: false,
    },
  },
  "empty-boost": {
    id: "empty-boost",
    label: "Empty boost / demoed",
    player: {
      id: "debug-empty-boost",
      name: "DEMOED",
      team: 1,
      goals: 0,
      shots: 1,
      saves: 0,
      assists: 0,
      boost: 0,
      isDead: true,
    },
  },
  "full-boost": {
    id: "full-boost",
    label: "Full boost",
    player: {
      id: "debug-full-boost",
      name: "BOOSTED",
      team: 0,
      goals: 1,
      shots: 2,
      saves: 3,
      assists: 1,
      boost: 100,
      isDead: false,
    },
  },
};

export const ROCKET_LEAGUE_ACTIVE_PLAYER_SCENARIO_IDS = Object.keys(ROCKET_LEAGUE_ACTIVE_PLAYER_SCENARIOS);

export function normalizeActivePlayerScenario(value) {
  const id = String(value ?? "").trim();
  return ROCKET_LEAGUE_ACTIVE_PLAYER_SCENARIO_IDS.includes(id) ? id : "skyljn3";
}

function clampInt(value, min, max, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/**
 * Scoreboard Left/Right Match identities. Default: Left=teamOne/home, Right=teamTwo/away.
 * Swap assignment (`flipSides`) mirrors both sides.
 */
export function resolveRocketLeagueSideTeams(flipSides, teamOne, teamTwo) {
  return flipSides
    ? { left: teamTwo, right: teamOne }
    : { left: teamOne, right: teamTwo };
}

/**
 * Live TeamNum 0 = Blue (always scoreboard Left), 1 = Orange (always Right).
 * Accent follows the Match identity on that side after swap assignment.
 * Default: Blue→teamOne/home, Orange→teamTwo/away.
 * Flipped: Blue→teamTwo/away (Left), Orange→teamOne/home (Right).
 */
export function resolveRocketLeagueLiveTeamColor(teamNum, flipSides, teamOne, teamTwo, fallbackOne, fallbackTwo) {
  const one = teamOne && typeof teamOne === "object" ? teamOne : null;
  const two = teamTwo && typeof teamTwo === "object" ? teamTwo : null;
  const { left, right } = resolveRocketLeagueSideTeams(flipSides, one, two);
  const isOrange = clampInt(teamNum, 0, 1, 0) === 1;
  const side = isOrange ? right : left;
  const color = String(side?.color ?? "").trim();
  if (color) return color;
  return isOrange
    ? (fallbackTwo || ROCKET_LEAGUE_OVERLAY_DEFAULTS.teamTwoColor)
    : (fallbackOne || ROCKET_LEAGUE_OVERLAY_DEFAULTS.teamOneColor);
}

function clampNumber(value, min, max, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function normalizeOverlayActivity(value, fallbackId = "activity") {
  const source = value && typeof value === "object" ? value : {};
  return {
    id: String(source.id ?? fallbackId).trim() || fallbackId,
    type: String(source.type ?? "Event").trim() || "Event",
    primaryName: String(source.primaryName ?? "").trim(),
    secondaryName: String(source.secondaryName ?? "").trim(),
    team: clampInt(source.team, 0, 1, 0),
    createdAt: typeof source.createdAt === "string" && source.createdAt
      ? source.createdAt
      : new Date().toISOString(),
  };
}

export function normalizeOverlayActivities(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry, index) => normalizeOverlayActivity(entry, `activity-${index}`))
    .filter((entry) => entry.primaryName)
    .slice(0, 4);
}

export function createSampleDebugActivity(seed = Date.now()) {
  const samples = [
    { type: "Goal", primaryName: "SKYLIN3", secondaryName: "", team: 0 },
    { type: "Assist", primaryName: "ORANG3", secondaryName: "SKYLIN3", team: 1 },
    { type: "Demolition", primaryName: "STATPAD", secondaryName: "DEMOED", team: 0 },
    { type: "Save", primaryName: "BOOSTED", secondaryName: "", team: 0 },
    { type: "Epic Save", primaryName: "SKYLIN3", secondaryName: "", team: 0 },
  ];
  const sample = samples[Math.abs(Number(seed) || 0) % samples.length];
  return normalizeOverlayActivity({
    ...sample,
    id: `debug-activity-${seed}`,
    createdAt: new Date().toISOString(),
  });
}

export function normalizeReplayCard(value) {
  if (!value || typeof value !== "object") return null;
  const scorerName = String(value.scorerName ?? "").trim();
  if (!scorerName) return null;
  return {
    scorerName,
    assisterName: String(value.assisterName ?? "").trim(),
    team: clampInt(value.team, 0, 1, 0),
    scorerId: String(value.scorerId ?? "").trim(),
    goals: clampInt(value.goals, 0, 99, 0),
    assists: clampInt(value.assists, 0, 99, 0),
    saves: clampInt(value.saves, 0, 99, 0),
    shots: clampInt(value.shots, 0, 99, 0),
    score: clampInt(value.score, 0, 9999, 0),
    ballSpeedMph: clampInt(value.ballSpeedMph, 0, 999, 0),
    createdAt: typeof value.createdAt === "string" && value.createdAt
      ? value.createdAt
      : new Date().toISOString(),
  };
}

/** Sample scorer card for debug preview when Replay is on. */
export function createSampleReplayCard(player, options = {}) {
  const source = player && typeof player === "object" ? player : {};
  const name = String(source.name ?? "SKYLIN3").trim() || "SKYLIN3";
  const team = clampInt(source.team, 0, 1, 0);
  return normalizeReplayCard({
    scorerName: name,
    assisterName: String(options.assisterName ?? "ORANG3").trim(),
    team,
    scorerId: String(source.id ?? "debug-skyljn3").trim(),
    goals: clampInt(source.goals, 0, 99, 1),
    assists: clampInt(source.assists, 0, 99, 0),
    saves: clampInt(source.saves, 0, 99, 0),
    shots: clampInt(source.shots, 0, 99, 2),
    score: clampInt(options.score ?? source.score, 0, 9999, 420),
    ballSpeedMph: clampInt(options.ballSpeedMph, 0, 999, 87),
    createdAt: new Date().toISOString(),
  });
}

export function createDefaultDebugLive(scenarioId = "skyljn3") {
  const scenario = ROCKET_LEAGUE_ACTIVE_PLAYER_SCENARIOS[normalizeActivePlayerScenario(scenarioId)];
  const player = { ...scenario.player };
  return {
    connected: true,
    hasGame: true,
    hasWinner: false,
    isOT: false,
    isReplay: false,
    timeSeconds: 187,
    target: player.id,
    scoreOne: 1,
    scoreTwo: 0,
    targetPlayer: player,
    activities: [],
    replayCard: null,
  };
}

export function normalizeDebugLive(value, scenarioId = "skyljn3") {
  const fallback = createDefaultDebugLive(scenarioId);
  const source = value && typeof value === "object" ? value : {};
  const playerSource = source.targetPlayer && typeof source.targetPlayer === "object"
    ? source.targetPlayer
    : fallback.targetPlayer;
  const team = clampInt(playerSource.team, 0, 1, fallback.targetPlayer.team);
  const id = String(playerSource.id ?? fallback.targetPlayer.id).trim() || fallback.targetPlayer.id;
  const targetPlayer = {
    id,
    name: String(playerSource.name ?? fallback.targetPlayer.name).trim() || fallback.targetPlayer.name,
    team,
    goals: clampInt(playerSource.goals, 0, 99, fallback.targetPlayer.goals),
    shots: clampInt(playerSource.shots, 0, 99, fallback.targetPlayer.shots),
    saves: clampInt(playerSource.saves, 0, 99, fallback.targetPlayer.saves),
    assists: clampInt(playerSource.assists, 0, 99, fallback.targetPlayer.assists),
    boost: clampNumber(playerSource.boost, 0, 100, fallback.targetPlayer.boost),
    isDead: Boolean(playerSource.isDead),
  };
  const isReplay = Boolean(source.isReplay);
  const explicitCard = normalizeReplayCard(source.replayCard);
  // When Replay is toggled on with no explicit card, synthesize one from the target player.
  const replayCard = explicitCard
    || (isReplay ? createSampleReplayCard(targetPlayer) : null);
  return {
    connected: source.connected !== false,
    hasGame: source.hasGame !== false,
    hasWinner: Boolean(source.hasWinner),
    isOT: Boolean(source.isOT),
    isReplay,
    timeSeconds: clampInt(source.timeSeconds, 0, 60 * 60, fallback.timeSeconds),
    target: String(source.target ?? id).trim() || id,
    scoreOne: clampInt(source.scoreOne, 0, 99, fallback.scoreOne),
    scoreTwo: clampInt(source.scoreTwo, 0, 99, fallback.scoreTwo),
    targetPlayer,
    activities: normalizeOverlayActivities(source.activities ?? fallback.activities),
    replayCard,
  };
}

export function applyDebugScenario(scenarioId) {
  return createDefaultDebugLive(scenarioId);
}

function overlayColor(value, fallback) {
  const normalized = String(value ?? "").trim();
  if (/^#[0-9a-f]{6}$/i.test(normalized) || /^#[0-9a-f]{3}$/i.test(normalized)) return normalized;
  if (/^rgb\(\s*(?:\d{1,3}\s*,\s*){2}\d{1,3}\s*\)$/i.test(normalized)) return normalized;
  return fallback;
}

function winsNeededForBestOf(bestOf) {
  const match = String(bestOf || "").match(/^Bo(\d+)$/i);
  const total = match ? Number.parseInt(match[1], 10) : 5;
  return Math.max(1, Math.ceil(total / 2));
}

function buildOverlayTeam(team, seriesScore, colorFallback) {
  return {
    name: String(team?.name || "").trim(),
    standing: String(team?.standing || "").trim(),
    logo: String(team?.logo || "").trim(),
    color: overlayColor(team?.color, colorFallback),
    logoBackground: resolveImagePlate(team?.logoBackground),
    seriesScore: String(seriesScore ?? "0"),
  };
}

function emptyLiveGame() {
  return {
    hasGame: false,
    hasWinner: false,
    isOT: false,
    isReplay: false,
    timeSeconds: 0,
    target: "",
    scoreOne: 0,
    scoreTwo: 0,
    targetPlayer: null,
  };
}

export function buildDebugActivePlayerGame(debugLive, scenarioId = "skyljn3") {
  const live = normalizeDebugLive(debugLive, scenarioId);
  const player = live.hasGame ? { ...live.targetPlayer } : null;
  return {
    hasGame: live.hasGame,
    hasWinner: live.hasWinner,
    isOT: live.isOT,
    isReplay: live.isReplay,
    timeSeconds: live.timeSeconds,
    target: live.hasGame ? live.target : "",
    scoreOne: live.scoreOne,
    scoreTwo: live.scoreTwo,
    targetPlayer: player,
  };
}

export function buildRocketLeagueOverlayState(rocketLeague, home, away, league = {}, options = {}, sponsors = []) {
  const savedGames = Array.isArray(rocketLeague?.savedGames) ? rocketLeague.savedGames : [];
  const bestOf = ["Bo1", "Bo3", "Bo5", "Bo7"].includes(rocketLeague?.bestOf)
    ? rocketLeague.bestOf
    : "Bo5";
  // Results are deliberately staged. Only the explicitly saved board may affect
  // round and series values shown on-air.
  const series = calculateRocketLeagueSeries(savedGames, bestOf);
  const debugEnabled = Boolean(rocketLeague?.debugActivePlayerEnabled);
  const debugScenario = normalizeActivePlayerScenario(rocketLeague?.debugActivePlayerScenario);
  const debugLive = normalizeDebugLive(rocketLeague?.debugLive, debugScenario);
  const eventName = options.eventName ?? league.eventName;

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    skin: ROCKET_LEAGUE_OVERLAY_DEFAULTS.skin,
    header: resolveScoreboardHeader(rocketLeague?.scoreboardHeader, eventName),
    bestOf,
    flipSides: Boolean(rocketLeague?.flipSides),
    playerCardEnabled: rocketLeague?.playerCardEnabled !== false,
    sponsorWidgetEnabled: rocketLeague?.sponsorWidgetEnabled !== false,
    broadcastSetupEnabled: rocketLeague?.broadcastSetupEnabled !== false,
    lobbyScene: rocketLeague?.lobbyScene === "stats" ? "stats" : "vs",
    statsSceneBackground: rocketLeague?.statsSceneBackground === "team-split" ? "team-split" : "transparent",
    sponsors: buildOverlaySponsors(sponsors),
    roundNumber: series.roundNumber,
    winsNeeded: winsNeededForBestOf(bestOf),
    leaguePrimary: overlayColor(league.primaryColor, ROCKET_LEAGUE_OVERLAY_DEFAULTS.leaguePrimary),
    leagueSecondary: overlayColor(league.secondaryColor, ROCKET_LEAGUE_OVERLAY_DEFAULTS.leagueSecondary),
    teamOne: buildOverlayTeam(home, series.homeWins, ROCKET_LEAGUE_OVERLAY_DEFAULTS.teamOneColor),
    teamTwo: buildOverlayTeam(away, series.awayWins, ROCKET_LEAGUE_OVERLAY_DEFAULTS.teamTwoColor),
    debugLiveOverride: debugEnabled,
    connection: {
      connected: debugEnabled ? debugLive.connected : false,
      lastEventAt: debugEnabled && debugLive.connected ? new Date().toISOString() : null,
    },
    game: debugEnabled ? buildDebugActivePlayerGame(debugLive, debugScenario) : emptyLiveGame(),
    activities: debugEnabled ? normalizeOverlayActivities(debugLive.activities) : [],
    replayCard: debugEnabled ? normalizeReplayCard(debugLive.replayCard) : null,
  };
}
