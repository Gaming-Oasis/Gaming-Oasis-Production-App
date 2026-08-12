import { calculateRocketLeagueSeries } from "./rocket-league.mjs";
import { resolveScoreboardHeader } from "./scoreboard-header.mjs";

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

function clampNumber(value, min, max, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
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
  return {
    connected: source.connected !== false,
    hasGame: source.hasGame !== false,
    hasWinner: Boolean(source.hasWinner),
    isOT: Boolean(source.isOT),
    isReplay: Boolean(source.isReplay),
    timeSeconds: clampInt(source.timeSeconds, 0, 60 * 60, fallback.timeSeconds),
    target: String(source.target ?? id).trim() || id,
    scoreOne: clampInt(source.scoreOne, 0, 99, fallback.scoreOne),
    scoreTwo: clampInt(source.scoreTwo, 0, 99, fallback.scoreTwo),
    targetPlayer: {
      id,
      name: String(playerSource.name ?? fallback.targetPlayer.name).trim() || fallback.targetPlayer.name,
      team,
      goals: clampInt(playerSource.goals, 0, 99, fallback.targetPlayer.goals),
      shots: clampInt(playerSource.shots, 0, 99, fallback.targetPlayer.shots),
      saves: clampInt(playerSource.saves, 0, 99, fallback.targetPlayer.saves),
      assists: clampInt(playerSource.assists, 0, 99, fallback.targetPlayer.assists),
      boost: clampNumber(playerSource.boost, 0, 100, fallback.targetPlayer.boost),
      isDead: Boolean(playerSource.isDead),
    },
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
    logoBackground: overlayColor(team?.logoBackground, ROCKET_LEAGUE_OVERLAY_DEFAULTS.logoBackground),
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

export function buildRocketLeagueOverlayState(rocketLeague, home, away, league = {}, options = {}) {
  // Prefer the live editor scores so series pills fill as soon as a game winner is entered.
  // Fall back to savedGames when the draft board is empty.
  const draftGames = Array.isArray(rocketLeague?.games) ? rocketLeague.games : [];
  const savedGames = Array.isArray(rocketLeague?.savedGames) ? rocketLeague.savedGames : [];
  const draftSeries = calculateRocketLeagueSeries(draftGames);
  const series = draftSeries.completedGames > 0
    ? draftSeries
    : calculateRocketLeagueSeries(savedGames);
  const bestOf = ["Bo1", "Bo3", "Bo5", "Bo7"].includes(rocketLeague?.bestOf)
    ? rocketLeague.bestOf
    : "Bo5";
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
    roundNumber: series.roundNumber,
    winsNeeded: winsNeededForBestOf(bestOf),
    leaguePrimary: overlayColor(league.primaryColor, ROCKET_LEAGUE_OVERLAY_DEFAULTS.leaguePrimary),
    leagueSecondary: overlayColor(league.secondaryColor, ROCKET_LEAGUE_OVERLAY_DEFAULTS.leagueSecondary),
    teamOne: buildOverlayTeam(home, series.homeWins, ROCKET_LEAGUE_OVERLAY_DEFAULTS.teamOneColor),
    teamTwo: buildOverlayTeam(away, series.awayWins, ROCKET_LEAGUE_OVERLAY_DEFAULTS.teamTwoColor),
    connection: {
      connected: debugEnabled ? debugLive.connected : false,
      lastEventAt: debugEnabled && debugLive.connected ? new Date().toISOString() : null,
    },
    game: debugEnabled ? buildDebugActivePlayerGame(debugLive, debugScenario) : emptyLiveGame(),
  };
}
