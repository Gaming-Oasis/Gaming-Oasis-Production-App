import net from "node:net";

export const ROCKET_LEAGUE_STATS_DEFAULTS = {
  wsUrl: process.env.ROCKET_LEAGUE_STATS_WS_URL || "ws://127.0.0.1:49124",
  tcpHost: process.env.ROCKET_LEAGUE_STATS_TCP_HOST || "127.0.0.1",
  tcpPort: Number.parseInt(process.env.ROCKET_LEAGUE_STATS_TCP_PORT || "49123", 10) || 49123,
  activityTtlMs: 7000,
  activityCap: 10,
  /** Ignore duplicate GoalScored activity toasts for the same goal through replay / kickoff. */
  goalActivityDedupeMs: 45000,
  /** Hold last goal scorer card briefly after bReplay clears so exit motion can finish. */
  replayCardHoldMs: 2800,
  reconnectMinMs: 1000,
  reconnectMaxMs: 15000,
  /** Reject malformed or unexpectedly large frames before the TCP buffer can grow without bound. */
  maxFrameBytes: 1024 * 1024,
  /** One delayed re-send of HUD hide + Director cam in case spectator is not ready yet. */
  broadcastSetupRetryMs: 1500,
};

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

/**
 * GoalScored.GoalSpeed is documented as Unreal Units/second (1 UU ≈ 1 cm).
 * Broadcast overlays show MPH: uu/s → m/s (/100) → mph (*2.236936292).
 * Values already in a typical MPH band (< 250) pass through (docs sample is ~87).
 */
export function goalSpeedToMph(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const mph = n >= 250 ? n * 0.022369362920544 : n;
  return clampInt(Math.round(mph), 0, 999, 0);
}

function readGoalSpeedRaw(data) {
  if (!data || typeof data !== "object") return null;
  const direct = data.GoalSpeed ?? data.BallSpeed ?? data.SpeedMPH ?? data.Speed;
  if (direct != null && Number.isFinite(Number(direct))) return Number(direct);
  const touch = data.BallLastTouch;
  if (touch && typeof touch === "object" && touch.Speed != null && Number.isFinite(Number(touch.Speed))) {
    return Number(touch.Speed);
  }
  return null;
}

function playerId(player) {
  const primary = String(player?.PrimaryId ?? "").trim();
  if (primary) return primary;
  const shortcut = clampInt(player?.Shortcut, 0, 999, 0);
  const name = String(player?.Name ?? "").trim() || "player";
  return `${name}:${shortcut}`;
}

function emptyGame() {
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

function emptyFinishedGame() {
  return null;
}

function normalizeFinishedGame(value) {
  if (!value || typeof value !== "object") return null;
  const id = String(value.id || "").trim();
  const scoreOne = clampInt(value.scoreOne, 0, 99, -1);
  const scoreTwo = clampInt(value.scoreTwo, 0, 99, -1);
  if (!id || scoreOne < 0 || scoreTwo < 0 || scoreOne === scoreTwo) return null;
  return {
    id,
    scoreOne,
    scoreTwo,
    finishedAt: String(value.finishedAt || "").trim() || new Date().toISOString(),
  };
}

export function createEmptyLiveFeed() {
  return {
    connection: {
      connected: false,
      lastEventAt: null,
    },
    game: emptyGame(),
    finishedGame: emptyFinishedGame(),
    /** Post-match team totals snapshot; kept until the next completed game replaces it. */
    matchTeamStats: null,
    activities: [],
    /** Cached Players from the latest UpdateState — used to join GoalScored → stats. */
    players: [],
    replayCard: null,
    replayClearAt: null,
    /**
     * After winner / MatchEnded / PodiumStart, keep the overlay on VS (hasGame false) until
     * MatchCreated clears this latch. UpdateState alone must not resurrect the HUD.
     */
    postMatch: false,
    /**
     * Lobby / next-match until the 3-2-1 countdown (MatchInitialized / CountdownBegin).
     * MatchCreated and empty-roster UpdateState set this so a 0–0 / 5:00 shell cannot show
     * the in-game HUD. RoundStarted remains a kickoff fallback if countdown events are missed.
     */
    preMatch: false,
    /** Fingerprint of the last Goal/Assist toast pair — blocks a second fire after replay. */
    lastGoalActivityKey: "",
    lastGoalActivityAt: 0,
    /** True after MatchPaused until MatchUnpaused / match teardown. */
    matchPaused: false,
  };
}

function goalActivityKey(scorerName, assisterName, ballSpeedMph) {
  return `${scorerName}|${assisterName}|${clampInt(ballSpeedMph, 0, 999, 0)}`;
}

function isLiveReplay(feed) {
  return Boolean(feed?.game?.isReplay);
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

function mapPlayerStats(player) {
  if (!player || typeof player !== "object") return null;
  const name = String(player.Name ?? "").trim();
  if (!name) return null;
  return {
    id: playerId(player),
    name,
    team: clampInt(player.TeamNum, 0, 1, 0),
    goals: clampInt(player.Goals, 0, 99, 0),
    shots: clampInt(player.Shots, 0, 99, 0),
    saves: clampInt(player.Saves, 0, 99, 0),
    assists: clampInt(player.Assists, 0, 99, 0),
    score: clampInt(player.Score, 0, 9999, 0),
    demos: clampInt(player.Demos, 0, 99, 0),
    touches: clampInt(player.Touches, 0, 9999, 0),
  };
}

function emptyTeamTotals() {
  return {
    goals: 0,
    assists: 0,
    shots: 0,
    saves: 0,
    demos: 0,
    touches: 0,
  };
}

function normalizeTeamTotals(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    goals: clampInt(source.goals, 0, 999, 0),
    assists: clampInt(source.assists, 0, 999, 0),
    shots: clampInt(source.shots, 0, 999, 0),
    saves: clampInt(source.saves, 0, 999, 0),
    demos: clampInt(source.demos, 0, 999, 0),
    touches: clampInt(source.touches, 0, 9999, 0),
  };
}

/** Sum mapped player stats into Blue (0) / Orange (1) team buckets. */
export function aggregateMatchTeamTotals(players) {
  const teamOne = emptyTeamTotals();
  const teamTwo = emptyTeamTotals();
  const list = Array.isArray(players) ? players : [];
  for (const player of list) {
    const stats = mapPlayerStats(player);
    if (!stats) continue;
    const bucket = stats.team === 1 ? teamTwo : teamOne;
    bucket.goals += stats.goals;
    bucket.assists += stats.assists;
    bucket.shots += stats.shots;
    bucket.saves += stats.saves;
    bucket.demos += stats.demos;
    bucket.touches += stats.touches;
  }
  return { teamOne, teamTwo };
}

export function normalizeMatchTeamStats(value) {
  if (!value || typeof value !== "object") return null;
  const scoreOne = clampInt(value.scoreOne, 0, 99, -1);
  const scoreTwo = clampInt(value.scoreTwo, 0, 99, -1);
  if (scoreOne < 0 || scoreTwo < 0) return null;
  let winnerTeam = null;
  if (value.winnerTeam === 0 || value.winnerTeam === 1) {
    winnerTeam = value.winnerTeam;
  } else if (scoreOne > scoreTwo) {
    winnerTeam = 0;
  } else if (scoreTwo > scoreOne) {
    winnerTeam = 1;
  }
  return {
    scoreOne,
    scoreTwo,
    winnerTeam,
    teamOne: normalizeTeamTotals(value.teamOne),
    teamTwo: normalizeTeamTotals(value.teamTwo),
  };
}

export function buildMatchTeamStats(players, scoreOne, scoreTwo) {
  const totals = aggregateMatchTeamTotals(players);
  return normalizeMatchTeamStats({
    scoreOne,
    scoreTwo,
    teamOne: totals.teamOne,
    teamTwo: totals.teamTwo,
  });
}

/** Debug / preview sample when Game Data API is overridden. */
export function buildDebugMatchTeamStats(game) {
  const scoreOne = clampInt(game?.scoreOne, 0, 99, 0);
  const scoreTwo = clampInt(game?.scoreTwo, 0, 99, 0);
  return normalizeMatchTeamStats({
    scoreOne,
    scoreTwo,
    teamOne: {
      goals: scoreOne,
      assists: Math.max(0, scoreOne),
      shots: scoreOne * 3 + 4,
      saves: 5,
      demos: 2,
      touches: 54,
    },
    teamTwo: {
      goals: scoreTwo,
      assists: Math.max(0, scoreTwo),
      shots: scoreTwo * 3 + 3,
      saves: 6,
      demos: 1,
      touches: 47,
    },
  });
}

function readPlayerRef(value) {
  if (!value || typeof value !== "object") return null;
  const name = String(value.Name ?? value.name ?? value.PlayerName ?? "").trim();
  const primaryId = String(value.PrimaryId ?? value.id ?? value.scorerId ?? "").trim();
  const shortcut = clampInt(value.Shortcut ?? value.shortcut, 0, 999, -1);
  const teamRaw = value.TeamNum ?? value.team;
  const team = teamRaw === undefined || teamRaw === null
    ? -1
    : clampInt(teamRaw, 0, 1, -1);
  if (!name && !primaryId && shortcut < 0) return null;
  return { Name: name, PrimaryId: primaryId, Shortcut: shortcut, TeamNum: team };
}

/** Official GoalScored.Scorer first; BallLastTouch.Player only when Scorer is missing. */
function resolveGoalScorer(data) {
  if (!data || typeof data !== "object") return null;
  const scorer = readPlayerRef(data.Scorer);
  if (scorer?.Name) return scorer;
  const touch = data.BallLastTouch && typeof data.BallLastTouch === "object"
    ? data.BallLastTouch
    : null;
  const touchPlayer = touch ? readPlayerRef(touch.Player) : null;
  if (touchPlayer?.Name) return touchPlayer;
  // Scorer object may exist without Name but with Shortcut — still usable for join.
  return scorer || touchPlayer;
}

function resolveGoalAssister(data) {
  if (!data || typeof data !== "object") return null;
  return readPlayerRef(data.Assister);
}

function isGoalStatfeed(data) {
  if (!data || typeof data !== "object") return false;
  const eventName = String(data.EventName ?? "").trim();
  const type = String(data.Type ?? "").trim();
  return /^goal$/i.test(eventName) || /^goal$/i.test(type);
}

function isAssistStatfeed(data) {
  if (!data || typeof data !== "object") return false;
  const eventName = String(data.EventName ?? "").trim();
  const type = String(data.Type ?? "").trim();
  return /^assist$/i.test(eventName) || /^assist$/i.test(type);
}

function isWinStatfeed(data) {
  if (!data || typeof data !== "object") return false;
  const eventName = String(data.EventName ?? "").trim();
  const type = String(data.Type ?? "").trim();
  return /^win$/i.test(eventName) || /^win$/i.test(type);
}

/** Goal / Assist toasts come from GoalScored; Win is not shown on the activity rail. */
function shouldSkipStatfeedActivity(data) {
  return isGoalStatfeed(data) || isAssistStatfeed(data) || isWinStatfeed(data);
}

function findPlayerInList(players, ref) {
  if (!ref || !Array.isArray(players) || !players.length) return null;
  const parsed = readPlayerRef(ref) || {
    Name: String(ref.Name ?? ref.name ?? ref.scorerName ?? "").trim(),
    PrimaryId: String(ref.PrimaryId ?? ref.id ?? ref.scorerId ?? "").trim(),
    Shortcut: clampInt(ref.Shortcut, 0, 999, -1),
    TeamNum: clampInt(ref.TeamNum ?? ref.team, 0, 1, -1),
  };
  const { Name: name, PrimaryId: id, Shortcut: shortcut, TeamNum: team } = parsed;

  if (id) {
    const byId = players.find((player) => {
      if (!player || typeof player !== "object") return false;
      const primary = String(player.PrimaryId ?? "").trim();
      return (primary && primary === id) || playerId(player) === id;
    });
    if (byId) return byId;
  }

  if (shortcut >= 0) {
    const byShortcut = players.find((player) => {
      if (!player || typeof player !== "object") return false;
      return clampInt(player.Shortcut, 0, 999, -2) === shortcut;
    });
    // When GoalScored provides a name, require it so a stale shortcut cannot swap scorers.
    if (byShortcut && (!name || String(byShortcut.Name ?? "").trim() === name)) {
      return byShortcut;
    }
  }

  if (name) {
    const named = players.filter((player) => {
      if (!player || typeof player !== "object") return false;
      return String(player.Name ?? "").trim() === name;
    });
    if (team >= 0) {
      const onTeam = named.find((player) => clampInt(player.TeamNum, 0, 1, -1) === team);
      if (onTeam) return onTeam;
    }
    if (named.length === 1) return named[0];
  }

  return null;
}

function buildReplayCardFromGoal(scorer, assister, players, now = Date.now(), goalData = null) {
  const scorerRef = readPlayerRef(scorer) || scorer;
  const scorerName = String(scorerRef?.Name ?? scorerRef?.name ?? "").trim();
  if (!scorerName) return null;
  const matched = findPlayerInList(players, scorerRef);
  const stats = matched ? mapPlayerStats(matched) : null;
  const assisterRef = readPlayerRef(assister) || assister;
  const assisterName = String(assisterRef?.Name ?? assisterRef?.name ?? "").trim();
  const priorSpeed = clampInt(goalData?.ballSpeedMph, 0, 999, 0);
  const ballSpeedMph = priorSpeed || goalSpeedToMph(readGoalSpeedRaw(goalData));
  return {
    // Identity is locked to the GoalScored / BallLastTouch scorer — never the spectated target.
    scorerName,
    assisterName,
    team: clampInt(
      scorerRef?.TeamNum >= 0 ? scorerRef.TeamNum : (scorer?.TeamNum ?? scorer?.team ?? stats?.team),
      0,
      1,
      0,
    ),
    scorerId: String(scorerRef?.PrimaryId || stats?.id || (scorerRef ? playerId(scorerRef) : "")).trim(),
    goals: stats?.goals ?? 0,
    assists: stats?.assists ?? 0,
    saves: stats?.saves ?? 0,
    shots: stats?.shots ?? 0,
    score: stats?.score ?? 0,
    ballSpeedMph,
    statsComplete: Boolean(stats),
    createdAt: new Date(now).toISOString(),
  };
}

function enrichReplayCard(card, players) {
  const normalized = normalizeReplayCard(card);
  if (!normalized) return null;
  // Stats may fill in later from UpdateState, but scorer identity stays from GoalScored.
  if (card?.statsComplete) {
    return {
      ...normalized,
      scorerName: normalized.scorerName,
      team: normalized.team,
      statsComplete: true,
    };
  }
  const matched = findPlayerInList(players, {
    Name: normalized.scorerName,
    PrimaryId: normalized.scorerId,
    TeamNum: normalized.team,
  });
  if (!matched) return { ...normalized, statsComplete: false };
  const stats = mapPlayerStats(matched);
  if (!stats) return { ...normalized, statsComplete: false };
  return {
    ...normalized,
    scorerName: normalized.scorerName,
    scorerId: normalized.scorerId || stats.id,
    team: normalized.team,
    goals: stats.goals,
    assists: stats.assists,
    saves: stats.saves,
    shots: stats.shots,
    score: stats.score,
    ballSpeedMph: normalized.ballSpeedMph,
    statsComplete: true,
  };
}

function resolveReplayHold(current, now, isReplay) {
  let replayCard = current.replayCard && typeof current.replayCard === "object"
    ? current.replayCard
    : null;
  let replayClearAt = Number.isFinite(current.replayClearAt) ? current.replayClearAt : null;
  if (replayClearAt != null && now >= replayClearAt) {
    replayCard = null;
    replayClearAt = null;
  }
  if (typeof isReplay === "boolean") {
    const wasReplay = Boolean(current.game?.isReplay);
    if (isReplay) {
      replayClearAt = null;
    } else if (wasReplay && replayCard) {
      replayClearAt = now + ROCKET_LEAGUE_STATS_DEFAULTS.replayCardHoldMs;
    }
  }
  return { replayCard, replayClearAt };
}

function publicReplayCard(card) {
  const normalized = normalizeReplayCard(card);
  return normalized;
}

function pruneActivities(activities, now = Date.now(), ttlMs = ROCKET_LEAGUE_STATS_DEFAULTS.activityTtlMs, cap = ROCKET_LEAGUE_STATS_DEFAULTS.activityCap) {
  return (Array.isArray(activities) ? activities : [])
    .filter((entry) => entry && typeof entry === "object")
    .filter((entry) => String(entry.primaryName || "").trim())
    .filter((entry) => {
      const created = Date.parse(entry.createdAt);
      return Number.isFinite(created) && now - created <= ttlMs;
    })
    .slice(0, cap);
}

function pushActivity(activities, activity, now = Date.now()) {
  const primaryName = String(activity.primaryName || "").trim();
  if (!primaryName) return pruneActivities(activities, now);
  const next = [
    {
      id: String(activity.id || `${activity.type}-${now}`),
      type: String(activity.type || "Event").trim() || "Event",
      primaryName,
      secondaryName: String(activity.secondaryName || "").trim(),
      team: clampInt(activity.team, 0, 1, 0),
      createdAt: activity.createdAt || new Date(now).toISOString(),
    },
    ...pruneActivities(activities, now),
  ];
  return pruneActivities(next, now);
}

function mapTargetPlayer(players, target) {
  if (!target || !Array.isArray(players)) return null;
  const targetName = String(target.Name ?? "").trim();
  const targetShortcut = clampInt(target.Shortcut, 0, 999, -1);
  const targetTeam = clampInt(target.TeamNum, 0, 1, 0);
  const match = players.find((player) => {
    if (!player || typeof player !== "object") return false;
    if (targetShortcut >= 0 && clampInt(player.Shortcut, 0, 999, -2) === targetShortcut) return true;
    return String(player.Name ?? "").trim() === targetName
      && clampInt(player.TeamNum, 0, 1, -1) === targetTeam;
  });
  if (!match) return null;
  const isDead = Boolean(match.bDemolished);
  const boostRaw = match.Boost;
  const boost = boostRaw === undefined || boostRaw === null
    ? 0
    : clampNumber(boostRaw, 0, 100, 0);
  return {
    id: playerId(match),
    name: String(match.Name ?? "").trim() || "PLAYER",
    team: clampInt(match.TeamNum, 0, 1, 0),
    goals: clampInt(match.Goals, 0, 99, 0),
    shots: clampInt(match.Shots, 0, 99, 0),
    saves: clampInt(match.Saves, 0, 99, 0),
    assists: clampInt(match.Assists, 0, 99, 0),
    boost: isDead ? 0 : boost,
    isDead,
  };
}

function teamScore(teams, teamNum) {
  if (!Array.isArray(teams)) return 0;
  const team = teams.find((entry) => clampInt(entry?.TeamNum, 0, 1, -1) === teamNum)
    || teams[teamNum];
  return clampInt(team?.Score, 0, 99, 0);
}

function decodeStatsApiPayload(raw) {
  if (raw == null) return {};
  if (typeof raw === "object") return raw;
  if (typeof raw !== "string") return {};
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function buildStatsApiCommand(command, data = {}) {
  return {
    Command: String(command || "").trim(),
    Data: data && typeof data === "object" ? data : {},
  };
}

export function buildHideHudCommand() {
  return buildStatsApiCommand("SetHUDVisibility", { bVisible: false });
}

export function buildShowHudCommand() {
  return buildStatsApiCommand("SetHUDVisibility", { bVisible: true });
}

export function buildDirectorCamCommand() {
  return buildStatsApiCommand("ChangePOV", { Perspective: "Camera_Director" });
}

export function buildSetMatchPausedCommand(paused = true) {
  return buildStatsApiCommand("SetMatchPaused", { bPaused: Boolean(paused) });
}

/**
 * Decide broadcast camera / HUD actions for one inbound Stats API event.
 * Full SetHUDVisibility hide at countdown start (Stats API has no partial H-key mode).
 * Restore HUD when the match ends.
 */
export function resolveBroadcastSetupAction({
  enabled = true,
  eventName = "",
  previousHasGame = false,
  nextHasGame = false,
  cameraAppliedForMatch = false,
  hudHiddenForMatch = false,
  /** @deprecated use cameraAppliedForMatch / hudHiddenForMatch */
  setupAppliedForMatch,
} = {}) {
  if (typeof setupAppliedForMatch === "boolean") {
    cameraAppliedForMatch = setupAppliedForMatch;
    hudHiddenForMatch = setupAppliedForMatch;
  }

  if (!enabled) {
    return {
      action: "none",
      cameraAppliedForMatch: false,
      hudHiddenForMatch: false,
      setupAppliedForMatch: false,
    };
  }

  const name = String(eventName || "").trim();
  if (name === "MatchEnded" || name === "MatchDestroyed") {
    const shouldRestore = cameraAppliedForMatch || hudHiddenForMatch;
    return {
      action: shouldRestore ? "restore" : "none",
      cameraAppliedForMatch: false,
      hudHiddenForMatch: false,
      setupAppliedForMatch: false,
    };
  }

  // Countdown start — Director + full native HUD hide. RoundStarted is a kickoff fallback.
  const countdownStart = name === "MatchInitialized"
    || name === "CountdownBegin"
    || name === "RoundStarted"
    || (!previousHasGame && nextHasGame);
  if (countdownStart && !hudHiddenForMatch) {
    return {
      action: "setup",
      cameraAppliedForMatch: true,
      hudHiddenForMatch: true,
      setupAppliedForMatch: true,
    };
  }

  // Lobby create — Director early; keep native UI until countdown.
  if (name === "MatchCreated" && !cameraAppliedForMatch) {
    return {
      action: "camera",
      cameraAppliedForMatch: true,
      hudHiddenForMatch: false,
      setupAppliedForMatch: false,
    };
  }

  return {
    action: "none",
    cameraAppliedForMatch: Boolean(cameraAppliedForMatch),
    hudHiddenForMatch: Boolean(hudHiddenForMatch),
    setupAppliedForMatch: Boolean(cameraAppliedForMatch && hudHiddenForMatch),
  };
}

/** Map an official Game Data API envelope into overlay live fields. */
export function applyStatsApiMessage(feed, message, now = Date.now()) {
  const current = feed && typeof feed === "object" ? feed : createEmptyLiveFeed();
  const eventName = String(message?.Event ?? message?.event ?? "").trim();
  // Official exporter often stringifies the Data payload.
  const data = decodeStatsApiPayload(message?.Data ?? message?.data);
  if (!eventName) return current;

  if (eventName === "UpdateState") {
    const game = data.Game && typeof data.Game === "object" ? data.Game : {};
    const players = Array.isArray(data.Players) ? data.Players : [];
    const hasTarget = Boolean(game.bHasTarget);
    const target = hasTarget && game.Target && typeof game.Target === "object" ? game.Target : null;
    const targetPlayer = hasTarget ? mapTargetPlayer(players, target) : null;
    const targetId = targetPlayer?.id || (target ? playerId(target) : "");
    const hasWinner = Boolean(game.bHasWinner);
    const isReplay = Boolean(game.bReplay);
    const scoreOne = teamScore(game.Teams, 0);
    const scoreTwo = teamScore(game.Teams, 1);
    let finishedGame = normalizeFinishedGame(current.finishedGame);
    let matchTeamStats = normalizeMatchTeamStats(current.matchTeamStats);
    // Stamp a finished-game proposal on winner rising edge so Results can read it after MatchEnded.
    if (hasWinner && scoreOne !== scoreTwo) {
      // End/podium events clear game.hasWinner, but subsequent winner snapshots
      // still belong to that same game until a new match leaves post-match state.
      const wasWinner = Boolean(current.game?.hasWinner || current.postMatch);
      if (!wasWinner || !finishedGame) {
        finishedGame = {
          id: `finish-${now}-${scoreOne}-${scoreTwo}`,
          scoreOne,
          scoreTwo,
          finishedAt: new Date(now).toISOString(),
        };
      } else {
        finishedGame = {
          ...finishedGame,
          scoreOne,
          scoreTwo,
        };
      }
      // Snapshot roster totals while Players[] is still populated (cleared after MatchEnded).
      if (players.length > 0) {
        matchTeamStats = buildMatchTeamStats(players, scoreOne, scoreTwo);
      }
    }
    const held = resolveReplayHold(current, now, isReplay);
    const replayCard = enrichReplayCard(held.replayCard, players);
    const timeSeconds = clampInt(game.TimeSeconds, 0, 60 * 60, 0);
    const ballSpeed = Number(game.Ball?.Speed);
    const playEvidence = isReplay
      || scoreOne > 0
      || scoreTwo > 0
      || (Number.isFinite(ballSpeed) && ballSpeed > 0)
      || Boolean(game.bOvertime)
      || (players.length > 0 && timeSeconds < 300);
    // Winner / podium → VS. Empty lobby or MatchCreated latch → VS until countdown.
    // Once countdown/live has begun (hasGame), do not re-latch preMatch on a blank
    // Players[] UpdateState — that would bring VS back until RoundStarted/kickoff.
    const postMatch = Boolean(current.postMatch) || hasWinner;
    let preMatch = Boolean(current.preMatch);
    if (postMatch) {
      preMatch = false;
    } else if (players.length === 0) {
      if (!current.game?.hasGame) {
        preMatch = true;
      }
    } else if (playEvidence) {
      preMatch = false;
    }
    const hasGame = !postMatch && !preMatch;
    const wasReplay = Boolean(current.game?.isReplay);
    // Clear the activity rail for the whole replay — Goal Replay owns that beat.
    let activities = current.activities;
    if (isReplay && !wasReplay) {
      activities = [];
    }
    return {
      connection: {
        connected: true,
        lastEventAt: new Date(now).toISOString(),
      },
      game: {
        hasGame,
        hasWinner,
        isOT: Boolean(game.bOvertime),
        isReplay: hasGame ? isReplay : false,
        timeSeconds,
        target: hasGame ? targetId : "",
        scoreOne,
        scoreTwo,
        targetPlayer: hasGame ? targetPlayer : null,
      },
      finishedGame,
      matchTeamStats,
      activities: pruneActivities(activities, now),
      players: hasGame ? players : [],
      replayCard: hasGame ? replayCard : null,
      replayClearAt: hasGame ? held.replayClearAt : null,
      postMatch,
      preMatch,
      lastGoalActivityKey: current.lastGoalActivityKey || "",
      lastGoalActivityAt: Number(current.lastGoalActivityAt) || 0,
      matchPaused: Boolean(current.matchPaused),
    };
  }

  if (eventName === "StatfeedEvent") {
    const main = data.MainTarget && typeof data.MainTarget === "object" ? data.MainTarget : null;
    const secondary = data.SecondaryTarget && typeof data.SecondaryTarget === "object"
      ? data.SecondaryTarget
      : null;
    const primaryName = String(main?.Name ?? "").trim();
    const held = resolveReplayHold(current, now, undefined);
    let replayCard = held.replayCard;
    let replayClearAt = held.replayClearAt;
    // Only surface player-attributed feed events (skip empty / match-level noise).
    if (!primaryName) {
      return {
        ...current,
        connection: {
          connected: true,
          lastEventAt: new Date(now).toISOString(),
        },
        activities: pruneActivities(current.activities, now),
        replayCard,
        replayClearAt,
      };
    }
    const type = String(data.Type || data.EventName || "Event").trim() || "Event";
    // Goal Statfeed is a fallback when GoalScored is missing; GoalScored always wins later.
    // Prefer EventName ("Goal") over localized Type for detection.
    if (isGoalStatfeed(data) && !replayCard) {
      replayCard = buildReplayCardFromGoal(main, secondary, current.players, now);
      replayClearAt = null;
    }
    // Skip Goal/Assist activity toasts here — GoalScored emits the canonical pair and both
    // events fire on a normal goal, which would otherwise double the feed. Skip Win too.
    // Also skip every toast while a goal replay is playing.
    const activities = shouldSkipStatfeedActivity(data) || isLiveReplay(current)
      ? pruneActivities(current.activities, now)
      : pushActivity(current.activities, {
        id: `statfeed-${type}-${now}-${String(main?.Shortcut ?? "")}`,
        type,
        primaryName,
        secondaryName: String(secondary?.Name ?? "").trim(),
        team: clampInt(main?.TeamNum, 0, 1, 0),
        createdAt: new Date(now).toISOString(),
      }, now);
    return {
      ...current,
      connection: {
        connected: true,
        lastEventAt: new Date(now).toISOString(),
      },
      activities,
      replayCard,
      replayClearAt,
    };
  }

  if (eventName === "GoalScored") {
    // Scorer identity comes only from GoalScored (Scorer → BallLastTouch.Player) — not the spectated target.
    const scorer = resolveGoalScorer(data);
    const assister = resolveGoalAssister(data);
    let activities = current.activities;
    const scorerName = String(scorer?.Name ?? "").trim();
    const assisterName = String(assister?.Name ?? "").trim();
    const ballSpeedMph = goalSpeedToMph(readGoalSpeedRaw(data));
    const activityKey = scorerName ? goalActivityKey(scorerName, assisterName, ballSpeedMph) : "";
    const priorKey = String(current.lastGoalActivityKey || "");
    const priorAt = Number(current.lastGoalActivityAt) || 0;
    const withinDedupe = Boolean(activityKey)
      && activityKey === priorKey
      && now - priorAt <= ROCKET_LEAGUE_STATS_DEFAULTS.goalActivityDedupeMs;
    // First GoalScored toasts; a second fire for the same goal (often after replay) must not.
    // Never toast during an active goal replay — center Goal Replay card owns that beat.
    const suppressGoalToasts = withinDedupe || isLiveReplay(current);
    let lastGoalActivityKey = priorKey;
    let lastGoalActivityAt = priorAt;
    if (scorerName && !suppressGoalToasts) {
      activities = pushActivity(activities, {
        id: `goal-${now}-${String(scorer.Shortcut ?? "")}`,
        type: "Goal",
        primaryName: scorerName,
        secondaryName: "",
        team: clampInt(scorer.TeamNum >= 0 ? scorer.TeamNum : 0, 0, 1, 0),
        createdAt: new Date(now).toISOString(),
      }, now);
      if (assisterName) {
        activities = pushActivity(activities, {
          id: `assist-${now}-${String(assister.Shortcut ?? "")}`,
          type: "Assist",
          primaryName: assisterName,
          secondaryName: scorerName,
          team: clampInt(assister.TeamNum >= 0 ? assister.TeamNum : 0, 0, 1, 0),
          createdAt: new Date(now).toISOString(),
        }, now);
      }
      lastGoalActivityKey = activityKey;
      lastGoalActivityAt = now;
    }
    const held = resolveReplayHold(current, now, undefined);
    // Always replace any prior card on the first GoalScored / while replay is live.
    // Duplicate GoalScored after the sequence must not resurrect the center card.
    const replayCard = (!suppressGoalToasts || Boolean(current.game?.isReplay))
      ? (buildReplayCardFromGoal(scorer, assister, current.players, now, data) || held.replayCard)
      : held.replayCard;
    return {
      ...current,
      connection: {
        connected: true,
        lastEventAt: new Date(now).toISOString(),
      },
      activities: pruneActivities(activities, now),
      replayCard,
      replayClearAt: replayCard ? null : held.replayClearAt,
      lastGoalActivityKey,
      lastGoalActivityAt,
    };
  }

  // New round of play — drop any leftover Goal Replay card so the next goal cannot show the wrong scorer.
  // MatchCreated → VS (preMatch). MatchInitialized / CountdownBegin → HUD (3-2-1).
  // RoundStarted → HUD fallback at kickoff if countdown events were missed.
  if (
    eventName === "MatchCreated"
    || eventName === "MatchInitialized"
    || eventName === "CountdownBegin"
    || eventName === "RoundStarted"
  ) {
    const isLobbyCreate = eventName === "MatchCreated";
    return {
      ...current,
      connection: {
        connected: true,
        lastEventAt: new Date(now).toISOString(),
      },
      activities: pruneActivities(current.activities, now),
      replayCard: null,
      replayClearAt: null,
      // Keep the last completed game's team stats until a newer winner snapshot replaces them.
      matchTeamStats: normalizeMatchTeamStats(current.matchTeamStats),
      postMatch: false,
      preMatch: isLobbyCreate,
      // New match only — keep dedupe through post-goal RoundStarted so replay-end GoalScored is ignored.
      lastGoalActivityKey: isLobbyCreate ? "" : (current.lastGoalActivityKey || ""),
      lastGoalActivityAt: isLobbyCreate ? 0 : (Number(current.lastGoalActivityAt) || 0),
      matchPaused: isLobbyCreate ? false : Boolean(current.matchPaused),
      game: current.game && typeof current.game === "object"
        ? {
          ...current.game,
          isReplay: false,
          hasGame: !isLobbyCreate,
          hasWinner: false,
        }
        : emptyGame(),
    };
  }

  if (eventName === "MatchDestroyed" || eventName === "MatchEnded" || eventName === "PodiumStart") {
    return {
      connection: {
        connected: current.connection?.connected === true,
        lastEventAt: new Date(now).toISOString(),
      },
      game: emptyGame(),
      finishedGame: normalizeFinishedGame(current.finishedGame),
      matchTeamStats: normalizeMatchTeamStats(current.matchTeamStats),
      activities: pruneActivities(current.activities, now),
      players: [],
      replayCard: null,
      replayClearAt: null,
      postMatch: true,
      preMatch: false,
      lastGoalActivityKey: "",
      lastGoalActivityAt: 0,
      matchPaused: false,
    };
  }

  if (eventName === "MatchPaused") {
    return {
      ...current,
      connection: {
        connected: true,
        lastEventAt: new Date(now).toISOString(),
      },
      matchPaused: true,
      activities: pruneActivities(current.activities, now),
    };
  }

  if (eventName === "MatchUnpaused") {
    return {
      ...current,
      connection: {
        connected: true,
        lastEventAt: new Date(now).toISOString(),
      },
      matchPaused: false,
      activities: pruneActivities(current.activities, now),
    };
  }

  if (current.connection?.connected) {
    const held = resolveReplayHold(current, now, undefined);
    return {
      ...current,
      connection: {
        connected: true,
        lastEventAt: new Date(now).toISOString(),
      },
      finishedGame: normalizeFinishedGame(current.finishedGame),
      matchTeamStats: normalizeMatchTeamStats(current.matchTeamStats),
      activities: pruneActivities(current.activities, now),
      replayCard: held.replayCard,
      replayClearAt: held.replayClearAt,
    };
  }

  return current;
}

export function mergeRocketLeagueOverlayLive(base, liveFeed, now = Date.now()) {
  if (!base || typeof base !== "object") return null;
  const debugOverride = Boolean(base.debugLiveOverride);
  const live = liveFeed && typeof liveFeed === "object" ? liveFeed : createEmptyLiveFeed();
  const activities = debugOverride
    ? pruneActivities(base.activities, now)
    : pruneActivities(live.activities, now);
  const liveHeld = resolveReplayHold(live, now, live.game?.isReplay);
  const replayCard = debugOverride
    ? publicReplayCard(base.replayCard)
    : publicReplayCard(liveHeld.replayCard);

  // Identity graphics always come from the operator tool (Match 1 / league / sponsors).
  // Game Data API may only replace connection, game, and activities.
  const identity = {
    version: base.version,
    updatedAt: base.updatedAt,
    skin: base.skin,
    header: base.header,
    bestOf: base.bestOf,
    flipSides: base.flipSides,
    playerCardEnabled: base.playerCardEnabled,
    sponsorWidgetEnabled: base.sponsorWidgetEnabled,
    broadcastSetupEnabled: base.broadcastSetupEnabled !== false,
    lobbyScene: base.lobbyScene === "stats" ? "stats" : "vs",
    statsSceneBackground: base.statsSceneBackground === "team-split" ? "team-split" : "transparent",
    sponsors: base.sponsors,
    roundNumber: base.roundNumber,
    winsNeeded: base.winsNeeded,
    leaguePrimary: base.leaguePrimary,
    leagueSecondary: base.leagueSecondary,
    teamOne: base.teamOne,
    teamTwo: base.teamTwo,
    debugLiveOverride: base.debugLiveOverride,
  };

  if (debugOverride) {
    const debugGame = base.game && typeof base.game === "object" ? base.game : emptyGame();
    const debugFinished = debugGame.hasWinner && debugGame.scoreOne !== debugGame.scoreTwo
      ? {
        id: `debug-finish-${debugGame.scoreOne}-${debugGame.scoreTwo}`,
        scoreOne: clampInt(debugGame.scoreOne, 0, 99, 0),
        scoreTwo: clampInt(debugGame.scoreTwo, 0, 99, 0),
        finishedAt: new Date(now).toISOString(),
      }
      : null;
    // Lobby preview (Has game off) or winner → sample team totals for the stats graphic.
    const debugMatchTeamStats = (!debugGame.hasGame || debugGame.hasWinner)
      ? buildDebugMatchTeamStats(debugGame)
      : null;
    return {
      ...identity,
      connection: base.connection,
      game: debugGame,
      finishedGame: debugFinished,
      matchTeamStats: debugMatchTeamStats,
      activities,
      replayCard,
    };
  }

  return {
    ...identity,
    connection: {
      connected: Boolean(live.connection?.connected),
      lastEventAt: live.connection?.lastEventAt ?? null,
    },
    game: live.game && typeof live.game === "object" ? live.game : emptyGame(),
    finishedGame: normalizeFinishedGame(live.finishedGame),
    matchTeamStats: normalizeMatchTeamStats(live.matchTeamStats),
    activities,
    replayCard,
  };
}

function parseJsonFrames(buffer) {
  const text = buffer.toString("utf8");
  const frames = [];
  let depth = 0;
  let objectStart = -1;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "\"") inString = false;
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      if (depth === 0) objectStart = index;
      depth += 1;
      continue;
    }

    if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && objectStart >= 0) {
        const chunk = text.slice(objectStart, index + 1).trim();
        try {
          frames.push(JSON.parse(chunk));
          objectStart = -1;
        } catch {
          // Wait for more bytes if this was not yet a complete JSON object.
        }
      }
    }
  }

  const remainder = depth > 0 && objectStart >= 0
    ? Buffer.from(text.slice(objectStart), "utf8")
    : Buffer.alloc(0);
  return { frames, remainder };
}

/**
 * Connect to the Rocket League Game Data API and keep a live feed store updated.
 * Prefers TCP (Port 49123 — confirmed live framing) then falls back to WebSocket (WebPort).
 * When broadcast setup is enabled, switches to Director cam on MatchCreated, then on
 * countdown start hides the full native HUD (SetHUDVisibility) and ensures Director cam.
 * Restores HUD on match end. Stats API has no partial H-key hide.
 */
export function startRocketLeagueStatsApiClient(options = {}) {
  const wsUrl = options.wsUrl || ROCKET_LEAGUE_STATS_DEFAULTS.wsUrl;
  const tcpHost = options.tcpHost || ROCKET_LEAGUE_STATS_DEFAULTS.tcpHost;
  const tcpPort = options.tcpPort || ROCKET_LEAGUE_STATS_DEFAULTS.tcpPort;
  const preferTcp = options.preferTcp !== false;
  const onChange = typeof options.onChange === "function" ? options.onChange : () => {};
  let broadcastSetupEnabled = options.broadcastSetupEnabled !== false;

  let feed = createEmptyLiveFeed();
  let closed = false;
  let transport = null;
  let reconnectTimer = null;
  let broadcastRetryTimer = null;
  let reconnectDelay = ROCKET_LEAGUE_STATS_DEFAULTS.reconnectMinMs;
  let tcpBuffer = Buffer.alloc(0);
  let usingTcp = preferTcp;
  let cameraAppliedForMatch = false;
  let hudHiddenForMatch = false;

  function setFeed(next) {
    feed = next;
    onChange(feed);
  }

  function sendCommand(command, data = {}, { stringifyData = false } = {}) {
    if (closed || !transport) return false;
    const envelope = {
      Command: String(command || "").trim(),
      Data: stringifyData
        ? JSON.stringify(data && typeof data === "object" ? data : {})
        : (data && typeof data === "object" ? data : {}),
    };
    if (!envelope.Command) return false;
    const payload = `${JSON.stringify(envelope)}\n`;
    try {
      if (typeof transport.send === "function") {
        transport.send(payload);
        return true;
      }
      if (typeof transport.write === "function") {
        transport.write(payload);
        return true;
      }
    } catch {
      // Best-effort; connection may be mid-teardown.
    }
    return false;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function setMatchPaused(paused = true, { confirmMs = 1500 } = {}) {
    const wantPaused = Boolean(paused);
    const data = { bPaused: wantPaused };
    // Docs show object Data; some RL builds accept stringified Data like inbound events.
    const sentObject = sendCommand("SetMatchPaused", data);
    const sentString = sendCommand("SetMatchPaused", data, { stringifyData: true });
    const sent = sentObject || sentString;
    if (!sent) {
      return {
        sent: false,
        confirmed: false,
        paused: wantPaused,
        matchPaused: Boolean(feed.matchPaused),
      };
    }
    const deadline = Date.now() + Math.max(0, confirmMs);
    while (Date.now() < deadline) {
      if (Boolean(feed.matchPaused) === wantPaused) {
        return {
          sent: true,
          confirmed: true,
          paused: wantPaused,
          matchPaused: Boolean(feed.matchPaused),
        };
      }
      await wait(50);
    }
    return {
      sent: true,
      confirmed: Boolean(feed.matchPaused) === wantPaused,
      paused: wantPaused,
      matchPaused: Boolean(feed.matchPaused),
    };
  }

  function clearBroadcastRetry() {
    if (!broadcastRetryTimer) return;
    clearTimeout(broadcastRetryTimer);
    broadcastRetryTimer = null;
  }

  function applyDirectorCam({ retry = true } = {}) {
    sendCommand("ChangePOV", { Perspective: "Camera_Director" });
    if (!retry) return;
    clearBroadcastRetry();
    broadcastRetryTimer = setTimeout(() => {
      broadcastRetryTimer = null;
      if (closed || !broadcastSetupEnabled || !cameraAppliedForMatch) return;
      sendCommand("ChangePOV", { Perspective: "Camera_Director" });
    }, ROCKET_LEAGUE_STATS_DEFAULTS.broadcastSetupRetryMs);
  }

  function applyBroadcastSetup() {
    cameraAppliedForMatch = true;
    hudHiddenForMatch = true;
    sendCommand("SetHUDVisibility", { bVisible: false });
    sendCommand("ChangePOV", { Perspective: "Camera_Director" });
    clearBroadcastRetry();
    broadcastRetryTimer = setTimeout(() => {
      broadcastRetryTimer = null;
      if (closed || !broadcastSetupEnabled || !hudHiddenForMatch) return;
      sendCommand("SetHUDVisibility", { bVisible: false });
      sendCommand("ChangePOV", { Perspective: "Camera_Director" });
    }, ROCKET_LEAGUE_STATS_DEFAULTS.broadcastSetupRetryMs);
  }

  function restoreHud() {
    clearBroadcastRetry();
    sendCommand("SetHUDVisibility", { bVisible: true });
    cameraAppliedForMatch = false;
    hudHiddenForMatch = false;
  }

  function handleMessage(message) {
    const previousHasGame = Boolean(feed.game?.hasGame);
    const next = applyStatsApiMessage(feed, message);
    setFeed(next);

    const eventName = String(message?.Event ?? message?.event ?? "").trim();
    const decision = resolveBroadcastSetupAction({
      enabled: broadcastSetupEnabled,
      eventName,
      previousHasGame,
      nextHasGame: Boolean(next.game?.hasGame),
      cameraAppliedForMatch,
      hudHiddenForMatch,
    });
    cameraAppliedForMatch = decision.cameraAppliedForMatch;
    hudHiddenForMatch = decision.hudHiddenForMatch;
    if (decision.action === "camera") applyDirectorCam();
    if (decision.action === "setup") applyBroadcastSetup();
    if (decision.action === "restore") restoreHud();
  }

  function markDisconnected() {
    setFeed({
      ...feed,
      connection: {
        connected: false,
        lastEventAt: feed.connection?.lastEventAt ?? null,
      },
    });
  }

  function scheduleReconnect() {
    if (closed || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, reconnectDelay);
    reconnectDelay = Math.min(
      ROCKET_LEAGUE_STATS_DEFAULTS.reconnectMaxMs,
      Math.floor(reconnectDelay * 1.5),
    );
  }

  function cleanupTransport() {
    const active = transport;
    transport = null;
    if (!active) return;
    try {
      if (typeof active.destroy === "function") active.destroy();
      else if (typeof active.close === "function") active.close();
      else if (typeof active.terminate === "function") active.terminate();
    } catch {
      // Ignore teardown races.
    }
  }

  function connectTcp() {
    if (closed) return;
    usingTcp = true;
    const socket = net.createConnection({ host: tcpHost, port: tcpPort });
    transport = socket;
    tcpBuffer = Buffer.alloc(0);

    socket.setEncoding("utf8");
    socket.on("connect", () => {
      if (closed || transport !== socket) return;
      reconnectDelay = ROCKET_LEAGUE_STATS_DEFAULTS.reconnectMinMs;
      setFeed({
        ...feed,
        connection: {
          connected: true,
          lastEventAt: new Date().toISOString(),
        },
      });
    });
    socket.on("data", (chunk) => {
      if (closed || transport !== socket) return;
      const nextChunk = Buffer.from(chunk, "utf8");
      if (tcpBuffer.length + nextChunk.length > ROCKET_LEAGUE_STATS_DEFAULTS.maxFrameBytes) {
        tcpBuffer = Buffer.alloc(0);
        socket.destroy(new Error("Rocket League Stats API frame exceeded the local safety limit"));
        return;
      }
      tcpBuffer = Buffer.concat([tcpBuffer, nextChunk]);
      const parsed = parseJsonFrames(tcpBuffer);
      tcpBuffer = parsed.remainder;
      parsed.frames.forEach(handleMessage);
    });
    socket.on("error", () => {
      // Reconnect path handles retry.
    });
    socket.on("close", () => {
      if (transport !== socket) return;
      transport = null;
      markDisconnected();
      if (closed) return;
      // Alternate back to WebSocket after every TCP failure. A later WebSocket
      // close schedules TCP again, so fallback remains available for process life.
      connectWebSocket();
    });
  }

  function connectWebSocket() {
    if (closed) return;
    usingTcp = false;
    let socket;
    try {
      socket = new WebSocket(wsUrl);
    } catch {
      usingTcp = true;
      scheduleReconnect();
      return;
    }
    transport = socket;

    socket.addEventListener("open", () => {
      if (closed || transport !== socket) return;
      reconnectDelay = ROCKET_LEAGUE_STATS_DEFAULTS.reconnectMinMs;
      setFeed({
        ...feed,
        connection: {
          connected: true,
          lastEventAt: new Date().toISOString(),
        },
      });
    });
    socket.addEventListener("message", (event) => {
      if (closed || transport !== socket) return;
      const raw = typeof event.data === "string" ? event.data : String(event.data ?? "");
      if (Buffer.byteLength(raw, "utf8") > ROCKET_LEAGUE_STATS_DEFAULTS.maxFrameBytes) return;
      const parsed = parseJsonFrames(Buffer.from(raw, "utf8"));
      parsed.frames.forEach(handleMessage);
      if (!parsed.frames.length) {
        const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        for (const line of lines) {
          try {
            handleMessage(JSON.parse(line));
          } catch {
            // Ignore non-JSON frames.
          }
        }
      }
    });
    socket.addEventListener("error", () => {
      // Fall through to close → reconnect (may switch to TCP).
    });
    socket.addEventListener("close", () => {
      if (transport !== socket) return;
      transport = null;
      markDisconnected();
      if (closed) return;
      usingTcp = true;
      scheduleReconnect();
    });
  }

  function connect() {
    if (closed) return;
    cleanupTransport();
    if (usingTcp) connectTcp();
    else connectWebSocket();
  }

  connect();

  return {
    getFeed: () => ({
      ...feed,
      activities: pruneActivities(feed.activities),
    }),
    sendCommand,
    applyBroadcastSetup,
    restoreHud,
    setMatchPaused,
    setBroadcastSetupEnabled: (enabled) => {
      broadcastSetupEnabled = enabled !== false;
      if (!broadcastSetupEnabled) {
        if (hudHiddenForMatch) restoreHud();
        clearBroadcastRetry();
        cameraAppliedForMatch = false;
        hudHiddenForMatch = false;
      }
    },
    getBroadcastSetupEnabled: () => broadcastSetupEnabled,
    stop: () => {
      if (hudHiddenForMatch) restoreHud();
      closed = true;
      clearBroadcastRetry();
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      cleanupTransport();
      markDisconnected();
    },
  };
}
