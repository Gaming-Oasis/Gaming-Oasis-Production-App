"use client";

import { normalizeRocketLeagueSceneMode } from "../lib/rocket-league-scene.mjs";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { LeagueRoleOrder } from "./LeagueRoleOrder";
import { TwitchControls } from "./TwitchControls";
import { ValorantMapLibrary, useValorantMapLibrary } from "./ValorantMapLibrary";
import { migrateValorantPlaceholder } from "../lib/valorant-map-placeholder.mjs";
import { MAP_API, mergeMapArtwork } from "../lib/valorant-map-library.mjs";
import { prepareMapExport } from "../lib/valorant-map-export.mjs";
import { shortTeamName, TEAM_NAME_LIMIT } from "../lib/team-name.mjs";
import { googleDriveFileId } from "../lib/sponsor-logo-url.mjs";
import {
  applyTierSeedOffset,
  buildByGroupExport,
  drawOrderNote,
  filterSeedTeams,
  groupSeedTeamsByHat,
  parseSeedingCsv,
  placedSeedTeamIds,
  seedHatLabel,
  serializeByGroupCsv,
  shortDrawNames,
  sortSeedTeams,
  unplacedSeedTeams,
} from "../lib/draw-seeding.mjs";
import {
  IMAGE_PLATE_DARK,
  IMAGE_PLATE_LIGHT,
  detectImagePlate,
  resolveImagePlate,
} from "../lib/readable-text.mjs";
import {
  calculateRocketLeagueSeries,
  createRocketLeagueGames,
  formatRocketLeagueScore,
  proposeRocketLeagueLiveResult,
  ROCKET_LEAGUE_GAME_COUNT,
  rocketLeagueGameLimit,
} from "../lib/rocket-league.mjs";
import {
  ROCKET_LEAGUE_ACTIVE_PLAYER_SCENARIOS,
  ROCKET_LEAGUE_ACTIVE_PLAYER_SCENARIO_IDS,
  applyDebugScenario,
  buildRocketLeagueOverlayState,
  createDefaultDebugLive,
  createSampleDebugActivity,
  normalizeActivePlayerScenario,
  normalizeDebugLive,
} from "../lib/rocket-league-live.mjs";
import { resolveScoreboardHeader } from "../lib/scoreboard-header.mjs";
import { formatSocialHandle } from "../lib/social-handle.mjs";
import {
  buildValorantOverlayState,
  buildValorantFields,
  calculateValorantSeries,
  createValorantGames,
  getValorantCurrentMap,
  getValorantCurrentSides,
  VALORANT_GAME_COUNT,
  VALORANT_MAP_ARTWORK,
  valorantGameLimit,
  resetValorantVeto,
} from "../lib/valorant.mjs";
import {
  DEFAULT_LEAGUE_CHAMPIONS,
  leagueDraftSteps,
  buildLeagueScoreFields,
  LEAGUE_GAME_COUNT,
  assignLeaguePickRole,
  buildLeagueOverlayState,
  calculateLeagueCurrentGame,
  calculateLeagueSeries,
  resolveLeagueFirstSelection,
  createLeagueDraftState,
  draftSlots,
  fearlessChampionSet,
  leagueFearlessResultError,
  lockLeagueDraftSelection,
  leagueGameLimit,
  normalizeLeagueDraft,
  undoLeagueDraftSelection,
} from "../lib/league-of-legends.mjs";
import { applyProductionDefaults, matchesProductionDefaults } from "../lib/production-defaults.mjs";
import { clearProductionData } from "../lib/clear-production-data.mjs";
import { applyMatchLookupResult } from "../lib/match-sync.mjs";
import {
  findCasterPreset,
  loadCasterPresets,
  removeCasterPreset,
  saveCasterPresets,
  upsertCasterPreset,
} from "../lib/caster-presets.mjs";
import LeagueScoreboardControls, { type LeagueScoreboardSettings } from "./LeagueScoreboardControls";
import { normalizeLeagueScoreboard, resetLeagueScoreboardCounts } from "../lib/league-scoreboard.mjs";

type Section = "welcome" | "general" | "matches" | "rocketLeague" | "valorant" | "leagueOfLegends" | "sponsors" | "draw" | "settings";
type ConnectionState = "idle" | "connected" | "error";
type LiveSyncState = "checking" | "standby" | "saving" | "retrying" | "synced" | "error";
type LiveDataTone = "live" | "waiting" | "offline" | "manual";
type ColorSource = "primary" | "alternate" | "backup1" | "backup2";
type StandingDisplay = "placement" | "standing" | "seed";

type TeamOverrides = {
  name: string;
  standing: string;
  logo: string;
  color: string;
  logoBackground: string;
};

type LeagueOverrides = {
  name: string;
  logo: string;
  primaryColor: string;
  secondaryColor: string;
  eventName: string;
};

type MatchLeague = {
  name: string;
  logo: string;
  primaryColor: string;
  secondaryColor: string;
  eventName: string;
  overrides: LeagueOverrides;
};

type Team = {
  sourceName: string;
  name: string;
  placement: string;
  standing: string;
  seed: string;
  standingDisplay: StandingDisplay;
  logo: string;
  color: string;
  alternateColor: string;
  backupColor1: string;
  backupColor2: string;
  selectedColor: ColorSource;
  logoBackground: string;
  overrides: TeamOverrides;
};

type Match = {
  id: string;
  syncedId: string;
  team1: Team;
  team2: Team;
  league: MatchLeague;
};

type GeneralInfo = {
  eventName: string;
  mainCaster: string;
  secondCaster: string;
  guest1: string;
  guest2: string;
  mainCasterSocial: string;
  secondaryCasterSocial: string;
  startingSoonTitle: string;
  interviewName: string;
  podcastTitle: string;
  podcastIndicatorLogo: string;
  segments: string[];
  currentSegment: string;
  matches: [Match, Match];
};

type Sponsor = {
  id: string;
  name: string;
  logo: string;
  enabled: boolean;
};

type Settings = {
  generalInfoEnabled: boolean;
  rocketLeagueEnabled: boolean;
  valorantEnabled: boolean;
  leagueOfLegendsEnabled: boolean;
  sponsorsEnabled: boolean;
  drawShowEnabled: boolean;
};

function sectionEnabled(section: Section, settings: Settings) {
  if (section === "general") return settings.generalInfoEnabled;
  if (section === "rocketLeague") return settings.rocketLeagueEnabled;
  if (section === "valorant") return settings.valorantEnabled;
  if (section === "leagueOfLegends") return settings.leagueOfLegendsEnabled;
  if (section === "sponsors") return settings.sponsorsEnabled;
  if (section === "draw") return settings.drawShowEnabled;
  return true;
}

type LeagueDraftState = {
  firstPickSide: "ORDER" | "CHAOS";
  bluePickOrder: number[];
  redPickOrder: number[];
  currentStep: number;
  selections: string[];
  timerSeconds: number;
  timeRemaining: number;
  timerRunning: boolean;
};

type LeagueConfirmedGame = {
  id: string;
  gameNumber: number;
  winner: "team1" | "team2";
  bluePicks: string[];
  redPicks: string[];
  snapshot: unknown;
  confirmedAt: string;
};

type LeagueResultProposal = {
  id: string;
  winner: "team1" | "team2" | "";
  gameNumber: number;
  snapshot: unknown;
  detectedAt: string;
} | null;

type LeagueResultGame = {
  winner: "team1" | "team2" | "";
  id: string;
  snapshot: unknown;
  bluePicks: string[];
  redPicks: string[];
  detectedAt: string;
};

type LeagueLivePreviewPlayer = {
  riotId: string;
  displayName: string;
  champion: string;
  team: "ORDER" | "CHAOS";
  position: string;
  level: number;
  isDead: boolean;
  respawnTimer: number;
  kills: number;
  deaths: number;
  assists: number;
  creepScore: number;
  wardScore: number;
  items: Array<{ id: number; name: string; slot: number; count: number }>;
  summonerSpells: Array<{ id: string; displayName: string }>;
  runes: { keystone?: { displayName?: string } | null };
};

type LeagueLivePreview = {
  connection: { connected: boolean; stale?: boolean };
  game: { finished?: boolean; winnerTeam?: "ORDER" | "CHAOS" | null; gameTime: number; gameMode?: string; mapName?: string; mapNumber?: number; mapTerrain?: string };
  activePlayer: null | {
    riotId: string;
    currentGold: number;
    abilities: Record<string, unknown>;
    championStats: Record<string, number | string>;
    fullRunes: { generalRunes?: unknown[]; statRunes?: unknown[] };
  };
  players: LeagueLivePreviewPlayer[];
  events: Array<{ id: string; name: string; time: number; team?: "ORDER" | "CHAOS" | null }>;
};

type WriterLiveDataStatus = {
  checked: boolean;
  reachable: boolean;
  rocketLeagueStatsApi: null | {
    connected: boolean;
    lastEventAt: string | null;
  };
  leagueOfLegends: null | {
    connected: boolean;
    lastEventAt: string | null;
    stale?: boolean;
  };
};

type LeagueOfLegends = {
  firstSelectionTeam: "" | "team1" | "team2";
  scoreboardHeader: string;
  scoreboard: LeagueScoreboardSettings;
  bestOf: "Bo1" | "Bo3" | "Bo5";
  draftMode: "standard" | "online" | "fearless";
  currentGame: number;
  blueTeam: "team1" | "team2";
  autoAcceptLiveResults: boolean;
  sponsorWidgetEnabled: boolean;
  vsScreenEnabled: boolean;
  debugLiveEnabled: boolean;
  debugLiveScenario: "live" | "finished" | "stale";
  results: LeagueResultGame[];
  draft: LeagueDraftState;
  confirmedGames: LeagueConfirmedGame[];
  resultProposal: LeagueResultProposal;
  playerOverrides: Record<string, string>;
};

type DrawKey = "RLT1" | "RLT2" | "VALT1" | "VALT2";
type DrawTab = "import" | DrawKey;
type DrawData = Record<DrawKey, Record<string, string>>;
type SeededTeam = {
  id: string;
  teamId: string;
  name: string;
  seed: number;
  group: number | null;
};
type DivisionSeeding = {
  teams: SeededTeam[];
  slots: Record<string, string>;
};
type DrawSeeding = Record<DrawKey, DivisionSeeding>;

type RocketLeagueGame = {
  home: string;
  away: string;
};

type RocketLeagueActivePlayerScenario = keyof typeof ROCKET_LEAGUE_ACTIVE_PLAYER_SCENARIOS;

type RocketLeagueDebugTargetPlayer = {
  id: string;
  name: string;
  team: number;
  goals: number;
  shots: number;
  saves: number;
  assists: number;
  boost: number;
  isDead: boolean;
};

type RocketLeagueDebugActivity = {
  id: string;
  type: string;
  primaryName: string;
  secondaryName: string;
  team: number;
  createdAt: string;
};

type RocketLeagueDebugReplayCard = {
  scorerName: string;
  assisterName: string;
  team: number;
  scorerId: string;
  goals: number;
  assists: number;
  saves: number;
  shots: number;
  score: number;
  ballSpeedMph: number;
  createdAt: string;
};

type RocketLeagueDebugLive = {
  connected: boolean;
  hasGame: boolean;
  hasWinner: boolean;
  isOT: boolean;
  isReplay: boolean;
  timeSeconds: number;
  target: string;
  scoreOne: number;
  scoreTwo: number;
  targetPlayer: RocketLeagueDebugTargetPlayer;
  activities: RocketLeagueDebugActivity[];
  replayCard: RocketLeagueDebugReplayCard | null;
};

type RocketLeague = {
  scoreboardHeader: string;
  bestOf: "Bo1" | "Bo3" | "Bo5" | "Bo7";
  flipSides: boolean;
  playerCardEnabled: boolean;
  sponsorWidgetEnabled: boolean;
  broadcastSetupEnabled: boolean;
  /** Lobby scene on the scoreboard when !hasGame: VS matchup or post-match team stats. */
  lobbyScene: "vs" | "stats";
  sceneMode: "auto" | "scoreboard" | "vs" | "stats";
  /** Post-match stats scene canvas: transparent OBS plate or VS-style team split. */
  statsSceneBackground: "transparent" | "team-split";
  autoAcceptLiveResults: boolean;
  lastLiveResultProposalKey: string;
  debugActivePlayerEnabled: boolean;
  debugActivePlayerScenario: RocketLeagueActivePlayerScenario;
  debugLive: RocketLeagueDebugLive;
  games: RocketLeagueGame[];
  savedGames: RocketLeagueGame[];
};

type ValorantSide = "" | "attack" | "defense";

type ValorantBo3 = {
  ban1: string;
  ban2: string;
  pick1: string;
  pick2: string;
  ban3: string;
  ban4: string;
  decider: string;
  side1: ValorantSide;
  side2: ValorantSide;
  side3: ValorantSide;
};

type ValorantBo5 = {
  ban1: string;
  ban2: string;
  pick1: string;
  pick2: string;
  pick3: string;
  pick4: string;
  decider: string;
  side1: ValorantSide;
  side2: ValorantSide;
  side3: ValorantSide;
  side4: ValorantSide;
  side5: ValorantSide;
};

type Valorant = {
  scoreboardHeader: string;
  bestOf: "Bo1" | "Bo3" | "Bo5";
  flipSides: boolean;
  banSwap: boolean;
  mapWidgetEnabled: boolean;
  sponsorWidgetEnabled: boolean;
  games: RocketLeagueGame[];
  savedGames: RocketLeagueGame[];
  bo3: ValorantBo3;
  bo5: ValorantBo5;
};

type ValorantMapArtwork = {
  name: string;
  nextMap: string;
  pickCard: string;
  banCard: string;
};

type ValorantMapData = { maps: ValorantMapArtwork[] };

type ProductionState = {
  general: GeneralInfo;
  rocketLeague: RocketLeague;
  valorant: Valorant;
  leagueOfLegends: LeagueOfLegends;
  valorantMapData: ValorantMapData;
  sponsors: Sponsor[];
  settings: Settings;
  draws: DrawData;
  drawSeeding: DrawSeeding;
};

type ExportFile = { filename: string; data: unknown };
type PackageFile = { filename: string; data?: unknown; text?: string; bytes?: Uint8Array<ArrayBuffer> };
type PersistedStateEnvelope = {
  schemaVersion: 2;
  revision: number;
  savedAt: string;
  outputActivated: boolean;
  state: ProductionState;
};
type WriterLease = { ownerId: string; expiresAt: number; fence: number };
type PendingConfirmation = {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
};

type CasterPreset = { name: string; social: string };

function hasOutputRelevantChanges(current: ProductionState, saved: ProductionState) {
  return current.general !== saved.general
    || current.rocketLeague !== saved.rocketLeague
    || current.valorant !== saved.valorant
    || current.leagueOfLegends !== saved.leagueOfLegends
    || current.valorantMapData !== saved.valorantMapData
    || current.sponsors !== saved.sponsors
    || current.draws !== saved.draws;
}

function hasProductionContent(state: ProductionState) {
  const hasText = (value: string) => Boolean(value.trim());
  const teamHasContent = (team: Team) => [
    team.sourceName,
    team.name,
    team.placement,
    team.standing,
    team.seed,
    team.logo,
  ].some(hasText);
  const leagueHasContent = (league: MatchLeague) => [
    league.name,
    league.logo,
    league.eventName,
    league.overrides.name,
    league.overrides.logo,
    league.overrides.primaryColor,
    league.overrides.secondaryColor,
    league.overrides.eventName,
  ].some(hasText);
  const scoresHaveContent = (games: Array<{ home: string; away: string }>) => games.some((game) => (
    hasText(game.home) || hasText(game.away)
  ));

  return [
    state.general.eventName,
    state.general.mainCaster,
    state.general.secondCaster,
    state.general.guest1,
    state.general.guest2,
    state.general.mainCasterSocial,
    state.general.secondaryCasterSocial,
    state.general.interviewName,
    state.general.podcastTitle,
    state.general.podcastIndicatorLogo,
    state.general.currentSegment,
    state.rocketLeague.scoreboardHeader,
    state.valorant.scoreboardHeader,
    state.leagueOfLegends.scoreboardHeader,
  ].some(hasText)
    || state.general.segments.some(hasText)
    || state.general.matches.some((match) => (
      hasText(match.id) || teamHasContent(match.team1) || teamHasContent(match.team2) || leagueHasContent(match.league)
    ))
    || scoresHaveContent(state.rocketLeague.games)
    || scoresHaveContent(state.rocketLeague.savedGames)
    || scoresHaveContent(state.valorant.games)
    || scoresHaveContent(state.valorant.savedGames)
    || state.leagueOfLegends.results.some((game) => hasText(game.winner))
    || state.leagueOfLegends.draft.selections.some(hasText)
    || state.leagueOfLegends.confirmedGames.length > 0
    || Object.values(state.valorant.bo3).some(hasText)
    || Object.values(state.valorant.bo5).some(hasText)
    || state.sponsors.some((sponsor) => (
      sponsor.id !== GAMING_OASIS_SPONSOR.id && (hasText(sponsor.name) || hasText(sponsor.logo))
    ))
    || Object.values(state.draws).some((draw) => Object.values(draw).some(hasText));
}

class HttpResponseError extends Error {
  status: number;
  terminal: boolean;

  constructor(status: number, message: string, terminal = false) {
    super(message);
    this.status = status;
    this.terminal = terminal;
  }
}

class RequestTimeoutError extends Error {
  constructor() {
    super("The local service did not respond before the timeout");
    this.name = "TimeoutError";
  }
}

const STORAGE_KEY = "gaming-oasis-production-v1";
const CASTER_PRESETS_KEY = `${STORAGE_KEY}-caster-presets`;
const STORAGE_SCHEMA_VERSION = 2;
const WRITER_LEASE_KEY = `${STORAGE_KEY}-writer-lease`;
const WORKSPACE_HANDOFF_CHANNEL = `${STORAGE_KEY}-handoff`;
const WRITER_LEASE_DURATION_MS = 6_000;
const WRITER_LEASE_RENEW_MS = 2_000;
const WRITER_SERVER_LEASE_RENEW_MS = 4_000;
const WRITER_SERVER_CONFLICT_RETRY_MS = 1_000;
const LIVE_JSON_ENDPOINT = "http://127.0.0.1:4877/api/live-json";
const LIVE_JSON_CLAIM_ENDPOINT = "http://127.0.0.1:4877/api/live-json/claim";
const LIVE_JSON_SESSION_ENDPOINT = "http://127.0.0.1:4877/api/live-json/session";
const LIVE_JSON_STATUS_ENDPOINT = "http://127.0.0.1:4877/api/live-json/status";
const ROCKET_LEAGUE_LIVE_OVERLAY_ENDPOINT = "http://127.0.0.1:4877/api/overlays/rocket-league";
const ROCKET_LEAGUE_MATCH_PAUSED_ENDPOINT = "http://127.0.0.1:4877/api/rocket-league/match-paused";
const VALORANT_MAP_DATA_FILENAME = "VALORANT MAP DATA.json";
const VALORANT_OVERLAY_URL = "http://localhost:3000/overlays/valorant";
const VALORANT_VS_OVERLAY_URL = "http://localhost:3000/overlays/valorant/vs";
const ROCKET_LEAGUE_OVERLAY_URL = "http://localhost:3000/overlays/rocket-league";
const ROCKET_LEAGUE_VS_OVERLAY_URL = "http://localhost:3000/overlays/rocket-league/vs";
const ROCKET_LEAGUE_STATS_OVERLAY_URL = "http://localhost:3000/overlays/rocket-league/stats";
const LEAGUE_DRAFT_OVERLAY_URL = "http://localhost:3000/overlays/league-of-legends/draft";
const LEAGUE_LIVE_OVERLAY_URL = "http://localhost:3000/overlays/league-of-legends/live";
const LEAGUE_VS_OVERLAY_URL = "http://localhost:3000/overlays/league-of-legends/vs";
const LEAGUE_OVERLAY_ENDPOINT = "http://127.0.0.1:4877/api/overlays/league-of-legends";
const LEAGUE_CATALOG_ENDPOINT = "http://127.0.0.1:4877/api/public/league-of-legends/catalog";
const GAMING_OASIS_FAVICON_URL = "http://localhost:3000/gaming-oasis-favicon.png";
const GAMING_OASIS_SPONSOR: Sponsor = {
  id: "gaming-oasis",
  name: "Gaming Oasis",
  logo: "http://localhost:3000/gaming-oasis-logo-light.png",
  enabled: true,
};
const LOCAL_PUBLIC_ENDPOINT = "http://127.0.0.1:4877/api/public";
const MATCH_LOOKUP_ENDPOINT = `${LOCAL_PUBLIC_ENDPOINT}/matches`;

function canonicalMapName(value: unknown) {
  return stringValue(value).replace(/\s+/g, "").toLowerCase();
}

function displayLogoUrl(value: string) {
  const driveId = googleDriveFileId(value);
  if (driveId) return `http://127.0.0.1:4877/api/public/map-artwork/${encodeURIComponent(driveId)}`;
  try {
    const url = new URL(value);
    if (url.origin === "https://hub.gamingoasis.gg" && /^\/api\/public\/logos\/(teams|leagues)\/[0-9a-f-]{36}$/i.test(url.pathname)) {
      return `${LOCAL_PUBLIC_ENDPOINT}${url.pathname.replace(/^\/api\/public/, "")}`;
    }
  } catch {
    // Keep manual and relative logo paths unchanged.
  }
  return value;
}

function normalizeLogoBackground(value: unknown) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";
  const plate = resolveImagePlate(normalized);
  // Only accept explicit white / navy (and legacy black) tokens; reject arbitrary colors.
  const raw = normalized.toUpperCase();
  if (
    raw === "#000" || raw === "#000000" || raw === "BLACK"
    || raw === "#171717" || raw === "NAVY"
    || raw === "#FFF" || raw === "#FFFFFF" || raw === "WHITE"
  ) {
    return plate;
  }
  return "";
}

function detectLogoBackground(image: HTMLImageElement) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return "";
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    return detectImagePlate(pixels);
  } catch {
    return "";
  }
}

const DRAW_DEFINITIONS: Record<
  DrawKey,
  { label: string; filename: string; pools: number; rows: number; game: string }
> = {
  RLT1: { label: "RL Tier 1", filename: "RLT1DS.json", pools: 2, rows: 8, game: "Rocket League" },
  RLT2: { label: "RL Tier 2", filename: "RLT2DS.json", pools: 6, rows: 8, game: "Rocket League" },
  VALT1: { label: "VAL Tier 1", filename: "VALT1DS.json", pools: 2, rows: 4, game: "VALORANT" },
  VALT2: { label: "VAL Tier 2", filename: "VALT2DS.json", pools: 6, rows: 4, game: "VALORANT" },
};

const COLOR_OPTIONS: { key: ColorSource; label: string }[] = [
  { key: "primary", label: "Home" },
  { key: "alternate", label: "Away" },
  { key: "backup1", label: "Backup 1" },
  { key: "backup2", label: "Backup 2" },
];

const emptyOverrides = (): TeamOverrides => ({ name: "", standing: "", logo: "", color: "", logoBackground: "" });

const emptyLeagueOverrides = (): LeagueOverrides => ({
  name: "",
  logo: "",
  primaryColor: "",
  secondaryColor: "",
  eventName: "",
});

const emptyLeague = (): MatchLeague => ({
  name: "",
  logo: "",
  primaryColor: "#F6AC18",
  secondaryColor: "#47213F",
  eventName: "",
  overrides: emptyLeagueOverrides(),
});

const emptyTeam = (): Team => ({
  sourceName: "",
  name: "",
  placement: "",
  standing: "",
  seed: "",
  standingDisplay: "standing",
  logo: "",
  color: "#F6AC18",
  alternateColor: "#C7564B",
  backupColor1: "#F6AC18",
  backupColor2: "#47213F",
  selectedColor: "primary",
  logoBackground: IMAGE_PLATE_LIGHT,
  overrides: emptyOverrides(),
});

function emptyMatch(): Match {
  return { id: "", syncedId: "", team1: emptyTeam(), team2: emptyTeam(), league: emptyLeague() };
}

function createDraws(): DrawData {
  return (Object.keys(DRAW_DEFINITIONS) as DrawKey[]).reduce((all, key) => {
    const definition = DRAW_DEFINITIONS[key];
    const values: Record<string, string> = {};
    for (let pool = 1; pool <= definition.pools; pool += 1) {
      for (let row = 1; row <= definition.rows; row += 1) values[`P${pool}${row}`] = "";
    }
    all[key] = values;
    return all;
  }, {} as DrawData);
}

function createDrawSeeding(): DrawSeeding {
  return (Object.keys(DRAW_DEFINITIONS) as DrawKey[]).reduce((all, key) => {
    all[key] = { teams: [], slots: {} };
    return all;
  }, {} as DrawSeeding);
}

function mergeDrawSeeding(saved: unknown): DrawSeeding {
  const initial = createDrawSeeding();
  const source = asRecord(saved);
  return (Object.keys(initial) as DrawKey[]).reduce((all, key) => {
    const entry = asRecord(source[key]);
    const teams = Array.isArray(entry.teams)
      ? entry.teams.flatMap((value) => {
        const team = asRecord(value);
        const name = stringValue(team.name).trim();
        const id = stringValue(team.id).trim();
        const seed = Number(team.seed);
        if (!name || !id || !Number.isInteger(seed) || seed < 1) return [];
        const group = team.group === null || team.group === undefined || team.group === ""
          ? null
          : Number(team.group);
        return [{
          id,
          teamId: stringValue(team.teamId).trim(),
          name,
          seed,
          group: Number.isInteger(group) && Number(group) > 0 ? Number(group) : null,
        }];
      })
      : [];
    const knownSlots = new Set(Object.keys(createDraws()[key]));
    const slots: Record<string, string> = {};
    for (const [slotKey, slotValue] of Object.entries(asRecord(entry.slots))) {
      const teamId = stringValue(slotValue).trim();
      if (knownSlots.has(slotKey) && teamId && teams.some((team) => team.id === teamId)) slots[slotKey] = teamId;
    }
    all[key] = { teams, slots };
    return all;
  }, {} as DrawSeeding);
}

function createInitialState(): ProductionState {
  return {
    general: {
      eventName: "",
      mainCaster: "",
      secondCaster: "",
      guest1: "",
      guest2: "",
      mainCasterSocial: "",
      secondaryCasterSocial: "",
      startingSoonTitle: "THE STREAM IS",
      interviewName: "",
      podcastTitle: "",
      podcastIndicatorLogo: "",
      segments: Array(8).fill(""),
      currentSegment: "",
      matches: [emptyMatch(), emptyMatch()],
    },
    rocketLeague: {
      scoreboardHeader: "",
      bestOf: "Bo3",
      flipSides: false,
      playerCardEnabled: true,
      sponsorWidgetEnabled: true,
      broadcastSetupEnabled: true,
      lobbyScene: "stats",
      sceneMode: "auto",
      statsSceneBackground: "team-split",
      autoAcceptLiveResults: false,
      lastLiveResultProposalKey: "",
      debugActivePlayerEnabled: false,
      debugActivePlayerScenario: "skyljn3",
      debugLive: createDefaultDebugLive("skyljn3") as RocketLeagueDebugLive,
      games: createRocketLeagueGames(),
      savedGames: createRocketLeagueGames(),
    },
    valorant: {
      scoreboardHeader: "",
      bestOf: "Bo3",
      flipSides: false,
      banSwap: false,
      mapWidgetEnabled: true,
      sponsorWidgetEnabled: true,
      games: createValorantGames(),
      savedGames: createValorantGames(),
      bo3: { ban1: "", ban2: "", pick1: "", pick2: "", ban3: "", ban4: "", decider: "", side1: "", side2: "", side3: "" },
      bo5: { ban1: "", ban2: "", pick1: "", pick2: "", pick3: "", pick4: "", decider: "", side1: "", side2: "", side3: "", side4: "", side5: "" },
    },
    leagueOfLegends: {
      firstSelectionTeam: "",
      scoreboardHeader: "",
      scoreboard: normalizeLeagueScoreboard() as LeagueScoreboardSettings,
      bestOf: "Bo3",
      draftMode: "fearless",
      currentGame: 1,
      blueTeam: "team1",
      autoAcceptLiveResults: false,
      sponsorWidgetEnabled: true,
      vsScreenEnabled: true,
      debugLiveEnabled: false,
      debugLiveScenario: "live",
      results: createLeagueResultGames(),
      draft: createLeagueDraftState(30) as LeagueDraftState,
      confirmedGames: [],
      resultProposal: null,
      playerOverrides: {},
    },
    valorantMapData: { maps: VALORANT_MAP_ARTWORK.map((map) => ({ ...map })) },
    sponsors: [
      { ...GAMING_OASIS_SPONSOR },
      ...Array.from({ length: 10 }, (_, index) => ({
        id: `sponsor${index + 1}`,
        name: "",
        logo: "",
        enabled: true,
      })),
    ],
    settings: {
      generalInfoEnabled: true,
      rocketLeagueEnabled: true,
      valorantEnabled: true,
      leagueOfLegendsEnabled: true,
      sponsorsEnabled: true,
      drawShowEnabled: false,
    },
    draws: createDraws(),
    drawSeeding: createDrawSeeding(),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function createLocalId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createWriterFence(previousFence = 0) {
  return Math.max(previousFence + 1, (Date.now() * 1_000) + Math.floor(Math.random() * 1_000));
}

function parseWriterLease(value: string | null): WriterLease | null {
  if (!value) return null;
  try {
    const parsed = asRecord(JSON.parse(value));
    if (typeof parsed.ownerId !== "string"
      || !Number.isFinite(parsed.expiresAt)
      || !Number.isSafeInteger(parsed.fence)
      || Number(parsed.fence) < 1) return null;
    return { ownerId: parsed.ownerId, expiresAt: Number(parsed.expiresAt), fence: Number(parsed.fence) };
  } catch {
    return null;
  }
}

function parsePersistedEnvelope(value: unknown) {
  const parsed = asRecord(value);
  const isEnvelope = parsed.schemaVersion === STORAGE_SCHEMA_VERSION && isPlainStoredState(parsed.state);
  const state = mergeSavedState(isEnvelope ? parsed.state : value);
  return {
    state,
    revision: isEnvelope && Number.isSafeInteger(parsed.revision) && Number(parsed.revision) >= 0 ? Number(parsed.revision) : 0,
    outputActivated: isEnvelope ? parsed.outputActivated === true : hasProductionContent(state),
  };
}

function isPlainStoredState(value: unknown) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeStoredScore(value: unknown) {
  const raw = stringValue(value).trim();
  if (!/^\d+$/.test(raw)) return "";
  return String(Math.min(99, Number.parseInt(raw, 10)));
}

async function fetchJsonWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 8_000, maximumBytes = 2_000_000) {
  const controller = new AbortController();
  const parentSignal = init.signal;
  let timedOut = false;
  const relayAbort = () => controller.abort();
  if (parentSignal?.aborted) controller.abort();
  else parentSignal?.addEventListener("abort", relayAbort, { once: true });
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    const declaredLength = Number.parseInt(response.headers.get("content-length") ?? "", 10);
    if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
      controller.abort();
      throw new Error("Local service response is too large");
    }
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;
    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        receivedBytes += value.byteLength;
        if (receivedBytes > maximumBytes) {
          controller.abort();
          throw new Error("Local service response is too large");
        }
        chunks.push(value);
      }
    }
    const bytes = new Uint8Array(receivedBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const text = new TextDecoder().decode(bytes);
    const payload: unknown = text ? JSON.parse(text) : null;
    return { response, payload };
  } catch (error) {
    if (timedOut && !parentSignal?.aborted) throw new RequestTimeoutError();
    throw error;
  } finally {
    window.clearTimeout(timer);
    parentSignal?.removeEventListener("abort", relayAbort);
  }
}

function waitForDelay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const handleAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

function mergeStringRecord<T extends Record<string, string>>(template: T, value: unknown): T {
  const source = asRecord(value);
  return Object.fromEntries(
    Object.keys(template).map((key) => [key, stringValue(source[key], template[key])]),
  ) as T;
}

function mergeValorantVeto<T extends Record<string, string>>(template: T, value: unknown, maps: ValorantMapArtwork[]): T {
  const merged = mergeStringRecord(template, value);
  const mapByName = new Map(maps.map((map) => [canonicalMapName(map.name), map.name]));
  const usedMaps = new Set<string>();
  return Object.fromEntries(Object.entries(merged).map(([key, rawValue]) => {
    if (key.startsWith("side")) return [key, rawValue === "attack" || rawValue === "defense" ? rawValue : ""];
    const canonical = canonicalMapName(rawValue);
    const mapName = mapByName.get(canonical);
    if (!canonical || !mapName || usedMaps.has(canonical)) return [key, ""];
    usedMaps.add(canonical);
    return [key, mapName];
  })) as T;
}

function mergeTeam(saved?: unknown): Team {
  const initial = emptyTeam();
  const source = asRecord(saved);
  const savedOverrides = asRecord(source.overrides);
  const detectedBackground = normalizeLogoBackground(source.logoBackground) || initial.logoBackground;
  const overrideBackground = normalizeLogoBackground(savedOverrides.logoBackground);
  const sourceName = stringValue(source.sourceName).trim() || stringValue(source.name).trim();
  let placement = stringValue(source.placement).trim();
  let standing = stringValue(source.standing).trim();
  const seed = stringValue(source.seed).trim();
  if (!placement && standing.includes("/")) {
    const [legacyPlacement, ...legacyStanding] = standing.split(/\s*\/\s*/);
    placement = legacyPlacement.trim();
    standing = legacyStanding.join(" / ").trim();
  } else if (!placement && /^\d+(st|nd|rd|th)$/i.test(standing)) {
    placement = standing;
    standing = "";
  }
  const requestedDisplay: StandingDisplay = source.standingDisplay === "placement" || source.standingDisplay === "seed"
    ? source.standingDisplay
    : "standing";
  const standingDisplay = requestedDisplay === "standing" && !standing
    ? placement ? "placement" : seed ? "seed" : "standing"
    : requestedDisplay === "placement" && !placement
      ? standing ? "standing" : seed ? "seed" : "placement"
      : requestedDisplay === "seed" && !seed
        ? standing ? "standing" : placement ? "placement" : "seed"
        : requestedDisplay;
  return {
    sourceName,
    name: shortTeamName(sourceName),
    placement,
    standing,
    seed,
    standingDisplay,
    logo: stringValue(source.logo),
    color: stringValue(source.color, initial.color),
    alternateColor: stringValue(source.alternateColor, initial.alternateColor),
    backupColor1: stringValue(source.backupColor1, initial.backupColor1),
    backupColor2: stringValue(source.backupColor2, initial.backupColor2),
    selectedColor: ["primary", "alternate", "backup1", "backup2"].includes(stringValue(source.selectedColor))
      ? source.selectedColor as ColorSource
      : initial.selectedColor,
    logoBackground: detectedBackground,
    overrides: {
      name: stringValue(savedOverrides.name),
      standing: stringValue(savedOverrides.standing),
      logo: stringValue(savedOverrides.logo),
      color: stringValue(savedOverrides.color),
      logoBackground: overrideBackground,
    },
  };
}

function mergeLeague(saved?: unknown): MatchLeague {
  const initial = emptyLeague();
  const source = asRecord(saved);
  return {
    name: stringValue(source.name),
    logo: stringValue(source.logo),
    primaryColor: stringValue(source.primaryColor).trim() || initial.primaryColor,
    secondaryColor: stringValue(source.secondaryColor).trim() || initial.secondaryColor,
    eventName: stringValue(source.eventName),
    overrides: mergeStringRecord(initial.overrides, source.overrides),
  };
}

function mergeMatch(saved?: unknown): Match {
  const source = asRecord(saved);
  return {
    id: stringValue(source.id),
    syncedId: stringValue(source.syncedId),
    team1: mergeTeam(source.team1),
    team2: mergeTeam(source.team2),
    league: mergeLeague(source.league),
  };
}

function mergeSavedState(savedValue: unknown): ProductionState {
  const initial = createInitialState();
  const envelope = asRecord(savedValue);
  const saved = asRecord(envelope.schemaVersion === 2 ? envelope.state : savedValue);
  const savedGeneral = asRecord(saved.general);
  const savedRocketLeague = asRecord(saved.rocketLeague);
  const savedValorant = asRecord(saved.valorant);
  const savedLeague = asRecord(saved.leagueOfLegends) as Partial<LeagueOfLegends>;
  const savedSettings = asRecord(saved.settings);
  const savedSponsors = (Array.isArray(saved.sponsors) ? saved.sponsors : [])
    .map(asRecord)
    .filter((sponsor) => stringValue(sponsor.id) !== GAMING_OASIS_SPONSOR.id)
    .slice(0, 10);
  const legacyPodcastIndicatorLogo = stringValue(savedGeneral.regionalLogoOverride);
  const savedRocketLeagueResults = Array.isArray(savedRocketLeague.savedGames)
    ? savedRocketLeague.savedGames
    : savedRocketLeague.games;
  const savedValorantResults = Array.isArray(savedValorant.savedGames)
    ? savedValorant.savedGames
    : savedValorant.games;
  const savedRocketLeagueBestOf = ["Bo1", "Bo3", "Bo5", "Bo7"].includes(stringValue(savedRocketLeague.bestOf))
    ? savedRocketLeague.bestOf as RocketLeague["bestOf"]
    : initial.rocketLeague.bestOf;
  const savedValorantBestOf = ["Bo1", "Bo3", "Bo5"].includes(stringValue(savedValorant.bestOf))
    ? savedValorant.bestOf as Valorant["bestOf"]
    : initial.valorant.bestOf;
  const mapData = asRecord(saved.valorantMapData);
  const savedMapArtwork = Array.isArray(mapData.maps) ? mapData.maps : [];
  const savedLeagueBestOf = ["Bo1", "Bo3", "Bo5"].includes(savedLeague.bestOf ?? "")
    ? savedLeague.bestOf!
    : initial.leagueOfLegends.bestOf;
  const savedLeagueConfirmedGames = Array.isArray(savedLeague.confirmedGames)
    ? savedLeague.confirmedGames.filter((game) => game?.winner === "team1" || game?.winner === "team2")
    : [];
  const savedLeagueResults = Array.isArray(savedLeague.results)
    ? createLeagueResultGames(savedLeague.results)
    : leagueResultsFromConfirmedGames(savedLeagueConfirmedGames);
  const segments = Array.from({ length: 8 }, (_, index) => stringValue(
    Array.isArray(savedGeneral.segments) ? savedGeneral.segments[index] : undefined,
  ));
  const savedMatches = Array.isArray(savedGeneral.matches) ? savedGeneral.matches : [];
  const scoreRows = (value: unknown, count: number) => Array.from({ length: count }, (_, index) => {
    const row = asRecord(Array.isArray(value) ? value[index] : undefined);
    return { home: normalizeStoredScore(row.home), away: normalizeStoredScore(row.away) };
  });
  const uniqueMaps: ValorantMapArtwork[] = [];
  const seenMapNames = new Set<string>();
  for (const rawMap of savedMapArtwork.slice(0, 32)) {
    const map = asRecord(rawMap);
    const name = stringValue(map.name).trim();
    const key = name.replace(/\s+/g, "").toLowerCase();
    if (!key || seenMapNames.has(key)) continue;
    seenMapNames.add(key);
    uniqueMaps.push(migrateValorantPlaceholder({
      name,
      nextMap: stringValue(map.nextMap),
      pickCard: stringValue(map.pickCard),
      banCard: stringValue(map.banCard),
    }));
  }
  const normalizedMaps = uniqueMaps.length > 0
    ? uniqueMaps
    : initial.valorantMapData.maps.map((map) => ({ ...map }));
  return {
    general: {
      eventName: stringValue(savedGeneral.eventName),
      mainCaster: stringValue(savedGeneral.mainCaster),
      secondCaster: stringValue(savedGeneral.secondCaster),
      guest1: stringValue(savedGeneral.guest1),
      guest2: stringValue(savedGeneral.guest2),
      mainCasterSocial: stringValue(savedGeneral.mainCasterSocial),
      secondaryCasterSocial: stringValue(savedGeneral.secondaryCasterSocial),
      startingSoonTitle: stringValue(savedGeneral.startingSoonTitle, initial.general.startingSoonTitle),
      interviewName: stringValue(savedGeneral.interviewName),
      podcastTitle: stringValue(savedGeneral.podcastTitle),
      podcastIndicatorLogo: stringValue(savedGeneral.podcastIndicatorLogo, legacyPodcastIndicatorLogo),
      segments,
      currentSegment: stringValue(savedGeneral.currentSegment),
      matches: [mergeMatch(savedMatches[0]), mergeMatch(savedMatches[1])],
    },
    rocketLeague: {
      ...initial.rocketLeague,
      bestOf: savedRocketLeagueBestOf,
      scoreboardHeader: stringValue(savedRocketLeague.scoreboardHeader),
      flipSides: booleanValue(savedRocketLeague.flipSides, false),
      playerCardEnabled: booleanValue(savedRocketLeague.playerCardEnabled, true),
      sponsorWidgetEnabled: booleanValue(savedRocketLeague.sponsorWidgetEnabled, true),
      broadcastSetupEnabled: booleanValue(savedRocketLeague.broadcastSetupEnabled, true),
      sceneMode: normalizeRocketLeagueSceneMode(savedRocketLeague.sceneMode) as RocketLeague["sceneMode"],
      lobbyScene: savedRocketLeague.lobbyScene === "vs" ? "vs" : "stats",
      statsSceneBackground: savedRocketLeague.statsSceneBackground === "transparent" ? "transparent" : "team-split",
      autoAcceptLiveResults: booleanValue(savedRocketLeague.autoAcceptLiveResults, false),
      lastLiveResultProposalKey: stringValue(savedRocketLeague.lastLiveResultProposalKey),
      debugActivePlayerEnabled: booleanValue(savedRocketLeague.debugActivePlayerEnabled, false),
      debugActivePlayerScenario: normalizeActivePlayerScenario(
        savedRocketLeague.debugActivePlayerScenario,
      ) as RocketLeagueActivePlayerScenario,
      debugLive: normalizeDebugLive(
        savedRocketLeague.debugLive,
        stringValue(savedRocketLeague.debugActivePlayerScenario),
      ) as RocketLeagueDebugLive,
      games: scoreRows(savedRocketLeague.games, ROCKET_LEAGUE_GAME_COUNT),
      savedGames: trimSavedResultRows(scoreRows(savedRocketLeagueResults, ROCKET_LEAGUE_GAME_COUNT), ROCKET_LEAGUE_GAME_COUNT),
    },
    valorant: {
      ...initial.valorant,
      scoreboardHeader: stringValue(savedValorant.scoreboardHeader),
      flipSides: booleanValue(savedValorant.flipSides, false),
      banSwap: booleanValue(savedValorant.banSwap, false),
      mapWidgetEnabled: booleanValue(savedValorant.mapWidgetEnabled, true),
      sponsorWidgetEnabled: booleanValue(savedValorant.sponsorWidgetEnabled, true),
      bestOf: savedValorantBestOf,
      games: scoreRows(savedValorant.games, VALORANT_GAME_COUNT),
      savedGames: trimSavedResultRows(scoreRows(savedValorantResults, VALORANT_GAME_COUNT), VALORANT_GAME_COUNT),
      bo3: mergeValorantVeto(initial.valorant.bo3, savedValorant.bo3, normalizedMaps),
      bo5: mergeValorantVeto(initial.valorant.bo5, savedValorant.bo5, normalizedMaps),
    },
    leagueOfLegends: {
      ...initial.leagueOfLegends,
      ...savedLeague,
      scoreboard: normalizeLeagueScoreboard(savedLeague.scoreboard) as LeagueScoreboardSettings,
      bestOf: savedLeagueBestOf,
      draftMode: savedLeague.draftMode === "standard" ? "standard" : savedLeague.draftMode === "online" ? "online" : "fearless",
      currentGame: calculateLeagueCurrentGame(savedLeagueConfirmedGames, savedLeagueBestOf),
      firstSelectionTeam: resolveLeagueFirstSelection(savedLeague, savedLeagueConfirmedGames, savedLeagueBestOf),
      blueTeam: savedLeague.blueTeam === "team2" ? "team2" : "team1",
      autoAcceptLiveResults: booleanValue(savedLeague.autoAcceptLiveResults, false),
      sponsorWidgetEnabled: savedLeague.sponsorWidgetEnabled !== false,
      vsScreenEnabled: booleanValue(savedLeague.vsScreenEnabled, true),
      debugLiveEnabled: Boolean(savedLeague.debugLiveEnabled),
      debugLiveScenario: ["live", "finished", "stale"].includes(savedLeague.debugLiveScenario ?? "")
        ? savedLeague.debugLiveScenario!
        : "live",
      results: savedLeagueResults,
      draft: normalizeLeagueDraft(savedLeague.draft, savedLeague.draft?.timerSeconds ?? 30) as LeagueDraftState,
      confirmedGames: savedLeagueConfirmedGames,
      resultProposal: savedLeague.resultProposal?.id ? savedLeague.resultProposal : null,
      playerOverrides: savedLeague.playerOverrides && typeof savedLeague.playerOverrides === "object"
        ? savedLeague.playerOverrides
        : {},
    },
    valorantMapData: {
      maps: normalizedMaps,
    },
    sponsors: initial.sponsors.map((sponsor, index) => index === 0
      ? { ...GAMING_OASIS_SPONSOR }
      : {
        id: sponsor.id,
        name: stringValue(savedSponsors[index - 1]?.name),
        logo: stringValue(savedSponsors[index - 1]?.logo),
        enabled: booleanValue(savedSponsors[index - 1]?.enabled, true),
      }),
    settings: {
      generalInfoEnabled: booleanValue(savedSettings.generalInfoEnabled, true),
      rocketLeagueEnabled: booleanValue(savedSettings.rocketLeagueEnabled, true),
      valorantEnabled: booleanValue(savedSettings.valorantEnabled, true),
      leagueOfLegendsEnabled: booleanValue(savedSettings.leagueOfLegendsEnabled, true),
      sponsorsEnabled: booleanValue(savedSettings.sponsorsEnabled, true),
      drawShowEnabled: booleanValue(savedSettings.drawShowEnabled, false),
    },
    draws: (Object.keys(initial.draws) as DrawKey[]).reduce((all, key) => {
      all[key] = mergeStringRecord(initial.draws[key], asRecord(saved.draws)[key]);
      return all;
    }, {} as DrawData),
    drawSeeding: mergeDrawSeeding(saved.drawSeeding),
  };
}

const upper = (value: string) => value.trim().toUpperCase();

function selectedTeamColor(team: Team) {
  const custom = team.overrides.color.trim();
  const sourceColor = normalizeProductionColor(team.color) || "#F6AC18";
  const customColor = normalizeHexColor(custom);
  if (customColor) return customColor;
  if (team.selectedColor === "alternate") return normalizeProductionColor(team.alternateColor) || sourceColor;
  if (team.selectedColor === "backup1") return normalizeProductionColor(team.backupColor1) || sourceColor;
  if (team.selectedColor === "backup2") return normalizeProductionColor(team.backupColor2) || sourceColor;
  return sourceColor;
}

function resolveTeam(team: Team) {
  const customLogoBackground = normalizeLogoBackground(team.overrides.logoBackground);
  const productionSourceName = shortTeamName(team.sourceName || team.name);
  const selectedStanding = team.standingDisplay === "standing"
    ? team.standing.trim() || team.placement.trim() || team.seed.trim()
    : team.standingDisplay === "seed"
      ? team.seed.trim() || team.standing.trim() || team.placement.trim()
      : team.placement.trim() || team.standing.trim() || team.seed.trim();
  return {
    name: team.overrides.name.trim() || productionSourceName,
    standing: team.overrides.standing.trim() || selectedStanding,
    logo: team.overrides.logo.trim() || team.logo.trim(),
    color: selectedTeamColor(team),
    logoBackground: customLogoBackground || normalizeLogoBackground(team.logoBackground) || IMAGE_PLATE_LIGHT,
  };
}

function resolveLeague(league: MatchLeague) {
  const sourcePrimaryColor = normalizeProductionColor(league.primaryColor) || "#F6AC18";
  const sourceSecondaryColor = normalizeProductionColor(league.secondaryColor) || "#47213F";
  return {
    name: league.overrides.name.trim() || league.name.trim(),
    logo: league.overrides.logo.trim() || league.logo.trim(),
    primaryColor: normalizeHexColor(league.overrides.primaryColor) || sourcePrimaryColor,
    secondaryColor: normalizeHexColor(league.overrides.secondaryColor) || sourceSecondaryColor,
    eventName: league.overrides.eventName.trim() || league.eventName.trim(),
  };
}

function applyLeagueColorsToTeams(team1: Team, team2: Team, primaryColor: string, secondaryColor: string): { team1: Team; team2: Team } {
  return {
    team1: { ...team1, backupColor1: primaryColor, backupColor2: secondaryColor },
    team2: { ...team2, backupColor1: primaryColor, backupColor2: secondaryColor },
  };
}

function normalizeHexColor(value: string) {
  const match = value.trim().match(/^#([0-9a-f]{6})$/i);
  return match ? `#${match[1]}` : "";
}

function normalizeProductionColor(value: string) {
  const trimmed = value.trim();
  const hex = trimmed.match(/^#?([0-9a-f]{6})$/i);
  if (hex) return `#${hex[1]}`;
  const rgb = trimmed.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  if (!rgb) return "";
  const channels = rgb.slice(1).map(Number);
  if (channels.some((channel) => channel < 0 || channel > 255)) return "";
  return `rgb(${channels.join(", ")})`;
}

function colorToRgb(value: string) {
  const normalized = normalizeProductionColor(value);
  const hex = normalized.replace(/^#/, "");
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
    };
  }
  const rgb = normalized.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  return rgb ? { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) } : null;
}

function colorSimilarity(first: string, second: string) {
  const a = colorToRgb(first);
  const b = colorToRgb(second);
  if (!a || !b) return null;
  const distance = Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
  return Math.max(0, Math.round((1 - distance / 441) * 100));
}

function safeColor(value: string, fallback = "#404040") {
  return normalizeProductionColor(value) || normalizeProductionColor(fallback) || "#404040";
}

function mergeSyncedTeam(current: Team, synced: Team): Team {
  return {
    ...synced,
    standingDisplay: current.standingDisplay,
    selectedColor: current.selectedColor,
    logoBackground: current.logo === synced.logo ? current.logoBackground : synced.logoBackground,
    overrides: { ...current.overrides },
  };
}

function createLeagueResultGames(values: Array<Partial<LeagueResultGame>> = []): LeagueResultGame[] {
  return Array.from({ length: LEAGUE_GAME_COUNT }, (_, index) => {
    const value = values[index] ?? {};
    return {
      winner: value.winner === "team1" || value.winner === "team2" ? value.winner : "",
      id: typeof value.id === "string" ? value.id : "",
      snapshot: value.snapshot ?? null,
      bluePicks: Array.from({ length: 5 }, (__, pickIndex) => String(value.bluePicks?.[pickIndex] ?? "")),
      redPicks: Array.from({ length: 5 }, (__, pickIndex) => String(value.redPicks?.[pickIndex] ?? "")),
      detectedAt: typeof value.detectedAt === "string" ? value.detectedAt : "",
    };
  });
}

function leagueResultsFromConfirmedGames(games: LeagueConfirmedGame[]): LeagueResultGame[] {
  const values = Array.from({ length: LEAGUE_GAME_COUNT }, () => ({} as Partial<LeagueResultGame>));
  games.forEach((game) => {
    const index = game.gameNumber - 1;
    if (index < 0 || index >= LEAGUE_GAME_COUNT) return;
    values[index] = {
      winner: game.winner,
      id: game.id,
      snapshot: game.snapshot,
      bluePicks: game.bluePicks,
      redPicks: game.redPicks,
      detectedAt: game.confirmedAt,
    };
  });
  return createLeagueResultGames(values);
}

function leagueResultPendingCount(results: LeagueResultGame[], saved: LeagueConfirmedGame[], bestOf: LeagueOfLegends["bestOf"]) {
  const savedWinners = new Map(saved.map((game) => [game.gameNumber, game.winner]));
  return results.slice(0, leagueGameLimit(bestOf)).filter((game, index) => game.winner !== (savedWinners.get(index + 1) ?? "")).length;
}

function resultIsPending(draft: RocketLeagueGame, saved: RocketLeagueGame) {
  return draft.home !== saved.home || draft.away !== saved.away;
}

function pendingResultCount(draft: RocketLeagueGame[], saved: RocketLeagueGame[], gameLimit: number) {
  return draft.slice(0, gameLimit).filter((game, index) => resultIsPending(game, saved[index] ?? { home: "", away: "" })).length;
}

type ResultStatus = "blank" | "valid" | "partial" | "tied" | "invalid";
type ResultSequenceIssue = "partial" | "tied" | "invalid" | "out-of-sequence" | "after-clinch" | null;

function resultStatus(game: RocketLeagueGame): ResultStatus {
  const home = game.home.trim();
  const away = game.away.trim();
  if (!home && !away) return "blank";
  if (!home || !away) return "partial";
  if (!/^\d{1,2}$/.test(home) || !/^\d{1,2}$/.test(away)) return "invalid";
  return Number(home) === Number(away) ? "tied" : "valid";
}

function resultSequenceIssues(games: RocketLeagueGame[], gameLimit: number): ResultSequenceIssue[] {
  const winsNeeded = Math.floor(gameLimit / 2) + 1;
  let homeWins = 0;
  let awayWins = 0;
  let sequenceStopped = false;
  return games.slice(0, gameLimit).map((game) => {
    const status = resultStatus(game);
    if (status === "blank") {
      sequenceStopped = true;
      return null;
    }
    if (homeWins >= winsNeeded || awayWins >= winsNeeded) return "after-clinch";
    if (sequenceStopped) return "out-of-sequence";
    if (status !== "valid") {
      sequenceStopped = true;
      return status;
    }
    if (Number(game.home) > Number(game.away)) homeWins += 1;
    else awayWins += 1;
    return null;
  });
}

function resultIssueMessage(issue: ResultSequenceIssue, itemName: "game" | "map") {
  if (issue === "partial") return "Enter both scores";
  if (issue === "tied") return "Tie not allowed";
  if (issue === "invalid") return "Use a score from 0 to 99";
  if (issue === "out-of-sequence") return `Complete earlier ${itemName}s or clear this result`;
  if (issue === "after-clinch") return "Clear this result — the series is already complete";
  return "";
}

function trimSavedResultRows(games: RocketLeagueGame[], gameLimit: number) {
  const winsNeeded = Math.floor(gameLimit / 2) + 1;
  let homeWins = 0;
  let awayWins = 0;
  let sequenceStopped = false;
  return games.map((game, index) => {
    if (index >= gameLimit || sequenceStopped || homeWins >= winsNeeded || awayWins >= winsNeeded) {
      return { home: "", away: "" };
    }
    const next = { ...game };
    if (resultStatus(next) !== "valid") {
      sequenceStopped = true;
      return { home: "", away: "" };
    }
    if (Number(next.home) > Number(next.away)) homeWins += 1;
    else awayWins += 1;
    return next;
  });
}

function mergeSavedResultRows(draftGames: RocketLeagueGame[], savedGames: RocketLeagueGame[], gameLimit: number) {
  const normalizedActiveGames = trimSavedResultRows(draftGames, gameLimit);
  return savedGames.map((game, index) => (
    index < gameLimit ? normalizedActiveGames[index] : { ...game }
  ));
}

function valorantSideLabel(side: string) {
  if (side === "attack") return "Attack side";
  if (side === "defense") return "Defense side";
  return "Side not selected";
}

function resolveRegionalLogo(general: GeneralInfo) {
  const override = general.podcastIndicatorLogo.trim();
  if (override) return override;
  const leagueLogo = resolveLeague(general.matches[0].league).logo.trim();
  if (leagueLogo) return leagueLogo;
  return GAMING_OASIS_FAVICON_URL;
}

function buildFinalOutput(general: GeneralInfo, rocketLeague: RocketLeague, valorant: Valorant, mapArtwork: ValorantMapArtwork[], league: LeagueOfLegends) {
  const savedRocketLeagueGames = trimSavedResultRows(
    rocketLeague.savedGames,
    rocketLeagueGameLimit(rocketLeague.bestOf),
  );
  const savedValorantGames = trimSavedResultRows(
    valorant.savedGames,
    valorantGameLimit(valorant.bestOf),
  );
  const output: Record<string, string> = {
    ...buildLeagueScoreFields(league),
    eventname: upper(general.eventName),
    maincaster: upper(general.mainCaster),
    secondcaster: upper(general.secondCaster),
    guest1: upper(general.guest1),
    guest2: upper(general.guest2),
    mainsocial: formatSocialHandle(general.mainCasterSocial),
    secondarysocial: formatSocialHandle(general.secondaryCasterSocial),
    startingtitle: upper(general.startingSoonTitle),
    interviewname: upper(general.interviewName),
    podcasttitle: upper(general.podcastTitle),
    currentsegment: general.currentSegment,
    regionallogo: resolveRegionalLogo(general),
  };

  general.segments.forEach((segment, index) => {
    output[`segment${index + 1}`] = upper(segment);
    output[`currentseg${index + 1}`] = general.currentSegment === String(index + 1) ? upper(segment) : "";
  });

  general.matches.forEach((match, matchIndex) => {
    [match.team1, match.team2].forEach((team, teamIndex) => {
      const prefix = `m${matchIndex + 1}t${teamIndex + 1}`;
      const resolved = resolveTeam(team);
      output[`${prefix}name`] = upper(resolved.name);
      output[`${prefix}standing`] = resolved.standing;
      output[`${prefix}logo`] = resolved.logo;
      output[`${prefix}color`] = resolved.color;
    });
  });

  savedRocketLeagueGames.forEach((game, index) => {
    output[`rlscore${index + 1}`] = formatRocketLeagueScore(game);
  });
  const series = calculateRocketLeagueSeries(savedRocketLeagueGames, rocketLeague.bestOf);
  output.rlheader = resolveScoreboardHeader(rocketLeague.scoreboardHeader, general.eventName);
  output["rlformat#"] = rocketLeague.bestOf;
  output.rlroundnumber = String(series.roundNumber);
  output.rlseriesscore1 = String(series.homeWins);
  output.rlseriesscore2 = String(series.awayWins);

  Object.assign(
    output,
    buildValorantFields(
      { ...valorant, games: savedValorantGames },
      resolveTeam(general.matches[0].team1),
      resolveTeam(general.matches[0].team2),
      mapArtwork,
      { eventName: general.eventName },
    ),
  );

  return [output];
}

function buildExportFiles(state: ProductionState): ExportFile[] {
  const sponsors = state.sponsors
    .filter((sponsor) => sponsor.name.trim() || sponsor.logo.trim())
    .map((sponsor) => ({ ...sponsor, name: sponsor.name.trim(), logo: sponsor.logo.trim() }));

  const drawFiles = (Object.keys(DRAW_DEFINITIONS) as DrawKey[]).map((key) => ({
    filename: DRAW_DEFINITIONS[key].filename,
    data: [shortDrawNames(state.draws[key], DRAW_DEFINITIONS[key].game)],
  }));

  return [
    { filename: "FinalOutput.json", data: buildFinalOutput(state.general, state.rocketLeague, state.valorant, state.valorantMapData.maps, state.leagueOfLegends) },
    { filename: "sponsors.json", data: sponsors },
    ...drawFiles,
  ];
}

function createLivePayloadSignature(payload: unknown) {
  return JSON.stringify(payload, (key, value) => (
    key === "updatedAt" || key === "lastEventAt" ? undefined : value
  ));
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function packageFileBytes(file: { data?: unknown; text?: string; bytes?: Uint8Array<ArrayBuffer> }) {
  if (file.bytes) return file.bytes;
  const encoder = new TextEncoder();
  if (typeof file.text === "string") return encoder.encode(file.text);
  return encoder.encode(`${JSON.stringify(file.data, null, 2)}\n`);
}

function createJsonPackageArchive(files: PackageFile[]) {
  const encoder = new TextEncoder();
  const localParts: BlobPart[] = [];
  const centralParts: BlobPart[] = [];
  let localOffset = 0;
  let centralSize = 0;

  for (const file of files) {
    const name = encoder.encode(file.filename);
    const data = packageFileBytes(file);
    const checksum = crc32(data);
    const localHeader = new ArrayBuffer(30);
    const localView = new DataView(localHeader);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, data.byteLength, true);
    localView.setUint32(22, data.byteLength, true);
    localView.setUint16(26, name.byteLength, true);
    localParts.push(localHeader, name, data);

    const centralHeader = new ArrayBuffer(46);
    const centralView = new DataView(centralHeader);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, data.byteLength, true);
    centralView.setUint32(24, data.byteLength, true);
    centralView.setUint16(28, name.byteLength, true);
    centralView.setUint32(42, localOffset, true);
    centralParts.push(centralHeader, name);

    localOffset += localHeader.byteLength + name.byteLength + data.byteLength;
    centralSize += centralHeader.byteLength + name.byteLength;
  }

  const endRecord = new ArrayBuffer(22);
  const endView = new DataView(endRecord);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, localOffset, true);
  return new Blob([...localParts, ...centralParts, endRecord], { type: "application/zip" });
}

function downloadBlob(blob: Blob, downloadName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = downloadName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

function downloadStoredPackage(files: PackageFile[], downloadName: string) {
  downloadBlob(createJsonPackageArchive(files), downloadName);
}

function downloadTextFile(filename: string, text: string) {
  downloadBlob(new Blob([text], { type: "text/csv;charset=utf-8" }), filename);
}

function downloadJsonPackage(files: PackageFile[]) {
  downloadStoredPackage(files, "gaming-oasis-production-json.zip");
}

async function writeFilesToFolder(files: ExportFile[]) {
  const browserWindow = window as unknown as Window & {
    showDirectoryPicker?: () => Promise<{
      getFileHandle: (name: string, options: { create: boolean }) => Promise<{
        createWritable: () => Promise<{
          write: (value: string | Uint8Array<ArrayBuffer>) => Promise<void>;
          close: () => Promise<void>;
          abort?: (reason?: unknown) => Promise<void>;
        }>;
      }>;
    }>;
  };
  const picker = browserWindow.showDirectoryPicker;

  if (!picker) return "unsupported" as const;
  const directory = await picker.call(browserWindow);
  const packageFiles: PackageFile[] = await prepareMapExport(files);
  for (const file of packageFiles) {
    let writable: {
      write: (value: string | Uint8Array<ArrayBuffer>) => Promise<void>;
      close: () => Promise<void>;
      abort?: (reason?: unknown) => Promise<void>;
    } | null = null;
    try {
      const handle = await directory.getFileHandle(file.filename, { create: true });
      writable = await handle.createWritable();
      await writable.write(file.bytes ?? JSON.stringify(file.data, null, 2));
      await writable.close();
      writable = null;
    } catch (error) {
      await writable?.abort?.(error).catch(() => {});
      throw new Error(`Could not write ${file.filename}: ${(error as Error).message || "file write failed"}`, { cause: error });
    }
  }
  return "folder" as const;
}

function ordinal(rank: number) {
  const remainder = rank % 100;
  if (remainder >= 11 && remainder <= 13) return `${rank}th`;
  if (rank % 10 === 1) return `${rank}st`;
  if (rank % 10 === 2) return `${rank}nd`;
  if (rank % 10 === 3) return `${rank}rd`;
  return `${rank}th`;
}

function normalizeLeague(leagueValue: unknown, eventValue: unknown): MatchLeague {
  const league = (leagueValue && typeof leagueValue === "object" ? leagueValue : {}) as Record<string, unknown>;
  const event = (eventValue && typeof eventValue === "object" ? eventValue : {}) as Record<string, unknown>;
  const logo = typeof league.logo === "string" && league.logo.trim()
    ? league.logo.trim()
    : typeof league.logoUrl === "string" && league.logoUrl.trim()
      ? league.logoUrl.trim()
      : "";
  return {
    ...emptyLeague(),
    name: typeof league.name === "string" ? league.name.trim() : "",
    logo,
    primaryColor: String(league.primaryColor ?? "#F6AC18"),
    secondaryColor: String(league.secondaryColor ?? "#47213F"),
    eventName: typeof event.name === "string" ? event.name.trim() : "",
    overrides: emptyLeagueOverrides(),
  };
}

function normalizeTeam(value: unknown, standingValue?: unknown, leagueValue?: unknown, gameTitle = ""): Team {
  const team = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const standing = (standingValue && typeof standingValue === "object" ? standingValue : {}) as Record<string, unknown>;
  const league = (leagueValue && typeof leagueValue === "object" ? leagueValue : {}) as Record<string, unknown>;
  const rank = typeof standing.rank === "number" ? standing.rank : Number(standing.rank);
  const record = typeof standing.record === "string" ? standing.record.trim() : "";
  const seedValue = typeof team.seed === "number" ? team.seed : Number(team.seed);
  const placement = Number.isFinite(rank) && rank > 0 ? ordinal(rank) : "";
  const seed = Number.isFinite(seedValue) && seedValue > 0 ? `#${seedValue}` : "";
  const sourceName = String(team.name ?? "");
  return {
    ...emptyTeam(),
    sourceName,
    name: shortTeamName(sourceName, gameTitle),
    placement,
    standing: record,
    seed,
    standingDisplay: record ? "standing" : placement ? "placement" : seed ? "seed" : "standing",
    logo: String(team.logo ?? ""),
    color: String(team.primaryColor ?? team.color ?? "#F6AC18"),
    alternateColor: String(team.secondaryColor ?? "#C7564B"),
    backupColor1: String(league.primaryColor ?? "#F6AC18"),
    backupColor2: String(league.secondaryColor ?? "#47213F"),
    logoBackground: IMAGE_PLATE_LIGHT,
    overrides: emptyOverrides(),
  };
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  hint,
  maxLength,
  attention,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  hint?: string;
  maxLength?: number;
  attention?: string;
}) {
  return (
    <label className={`field ${attention ? "needs-override" : ""}`}>
      <span className="field-label">
        {label}
        {maxLength ? <small>{value.length}/{maxLength}</small> : null}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-invalid={attention ? true : undefined}
      />
      {attention ? <span className="field-error">{attention}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

function GameFlipSidesControl({
  gameName,
  checked,
  onChange,
}: {
  gameName: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="valorant-toggle-row">
      <div>
        <strong>Flip Sides</strong>
        <p>Swap Team 1 and Team 2 across the scoreboard and live graphics. Saved results stay in Team 1/Team 2 order.</p>
      </div>
      <label className="switch large">
        <input aria-label={`Flip ${gameName} team sides`} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        <span />
      </label>
    </div>
  );
}

function GameAutoAcceptControl({
  gameName,
  checked,
  onChange,
  locked = false,
}: {
  gameName: string;
  checked: boolean;
  onChange?: (checked: boolean) => void;
  locked?: boolean;
}) {
  return (
    <div className="valorant-toggle-row">
      <div>
        <strong>Auto Accept Live Results</strong>
        <p>{locked ? "Live results are accepted automatically for this game." : "When live data detects a winner, save the next result automatically. Leave off to review it before updating results."}</p>
      </div>
      <label className="switch large">
        <input aria-label={`Auto Accept Live ${gameName} Results`} type="checkbox" checked={checked} disabled={locked} onChange={(event) => onChange?.(event.target.checked)} />
        <span />
      </label>
    </div>
  );
}

type GameIndicator = {
  label: React.ReactNode;
  value: React.ReactNode;
  detail: React.ReactNode;
  valueClassName?: string;
  detailClassName?: string;
};

function GameLiveMatchIndicators({ gameName, indicators }: { gameName: string; indicators: GameIndicator[] }) {
  return (
    <section className="panel-card rocket-indicator-card" aria-label={`${gameName} live match indicators`}>
      <div className="card-title-row"><div><h2>Live Match Indicators</h2><p>Calculated from the results currently saved to JSON.</p></div></div>
      <dl className="rocket-indicators">
        {indicators.map((indicator, index) => (
          <div key={index}>
            <dt>{indicator.label}</dt>
            <dd className={indicator.valueClassName}>{indicator.value}</dd>
            <small className={indicator.detailClassName}>{indicator.detail}</small>
          </div>
        ))}
      </dl>
    </section>
  );
}

function receivedRecently(lastEventAt: string | null | undefined, now = Date.now()) {
  if (!lastEventAt) return false;
  const timestamp = Date.parse(lastEventAt);
  return Number.isFinite(timestamp) && now - timestamp <= 5_000;
}

function lastDataLabel(lastEventAt: string | null | undefined) {
  if (!lastEventAt) return "No game data received this run";
  const timestamp = Date.parse(lastEventAt);
  if (!Number.isFinite(timestamp)) return "Last data time unavailable";
  return `Last data ${new Date(timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}`;
}

function GameLiveDataMonitor({
  gameName,
  label,
  detail,
  tone,
  lastEventAt,
}: {
  gameName: string;
  label: string;
  detail: string;
  tone: LiveDataTone;
  lastEventAt?: string | null;
}) {
  return (
    <section className={`game-live-data-monitor ${tone}`} aria-label={`${gameName} live data connection`} aria-live="polite">
      <span className="game-live-data-indicator" aria-hidden="true" />
      <div>
        <span>Live data</span>
        <strong>{label}</strong>
      </div>
      <p>{detail}</p>
      {tone !== "manual" ? <small>{lastDataLabel(lastEventAt)}</small> : null}
    </section>
  );
}

function SectionHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return (
    <header className="section-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action ? <div className="heading-action">{action}</div> : null}
    </header>
  );
}

function liveSyncLongLabel(state: LiveSyncState) {
  if (state === "synced") return "Files are current";
  if (state === "saving") return "Writing changes";
  if (state === "retrying") return "Retrying writer";
  if (state === "checking") return "Checking writer";
  if (state === "standby") return "Standing by — no output changes";
  return "Writer is offline";
}

function liveSyncShortLabel(state: LiveSyncState) {
  if (state === "synced") return "JSON live";
  if (state === "saving") return "Saving JSON";
  if (state === "retrying") return "Retrying JSON";
  if (state === "checking") return "Checking JSON";
  if (state === "standby") return "JSON standby";
  return "JSON writer offline";
}

function handleTabListKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'));
  const currentIndex = tabs.indexOf(event.target as HTMLButtonElement);
  if (currentIndex < 0 || tabs.length === 0) return;
  event.preventDefault();
  const nextIndex = event.key === "Home"
    ? 0
    : event.key === "End"
      ? tabs.length - 1
      : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
  tabs[nextIndex].focus();
  tabs[nextIndex].click();
}

export default function Home() {
  const [state, setState] = useState<ProductionState>(() => createInitialState());
  const [activeSection, setActiveSection] = useState<Section>("welcome");
  const [generalTab, setGeneralTab] = useState<"talent" | "segments">("talent");
  const [valorantTab, setValorantTab] = useState<"results" | "pickBans" | "mapPool" | "controls" | "overlay">("results");
  const [rocketLeagueTab, setRocketLeagueTab] = useState<"results" | "controls" | "overlay" | "admin" | "debug">("results");
  const [leagueTab, setLeagueTab] = useState<"results" | "draft" | "controls" | "live" | "overlay">("results");
  const [leagueChampion, setLeagueChampion] = useState("");
  const [leagueCatalog, setLeagueCatalog] = useState<Array<{ id: string; name: string }>>(() => [...DEFAULT_LEAGUE_CHAMPIONS]);
  const [leagueCatalogVersion, setLeagueCatalogVersion] = useState("latest");
  const [leagueLivePreview, setLeagueLivePreview] = useState<LeagueLivePreview | null>(null);
  const [drawTab, setDrawTab] = useState<DrawTab>("import");
  const [drawPastePool, setDrawPastePool] = useState<number | null>(null);
  const [drawPasteText, setDrawPasteText] = useState("");
  const [drawDropSlot, setDrawDropSlot] = useState<string | null>(null);
  const [drawPicker, setDrawPicker] = useState<string | null>(null);
  const [drawPickerDraft, setDrawPickerDraft] = useState("");
  const [drawPickerQuery, setDrawPickerQuery] = useState("");
  const [drawPickerIndex, setDrawPickerIndex] = useState(-1);
  const seedingDragRef = useRef<{ division: DrawKey; id: string } | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [syncingMatch, setSyncingMatch] = useState<number | null>(null);
  const [liveSync, setLiveSync] = useState<LiveSyncState>("checking");
  const [writerLiveDataStatus, setWriterLiveDataStatus] = useState<WriterLiveDataStatus>({
    checked: false,
    reachable: false,
    rocketLeagueStatsApi: null,
    leagueOfLegends: null,
  });
  const [toast, setToast] = useState("");
  const [resetConfirmationOpen, setResetConfirmationOpen] = useState(false);
  const [rocketLeagueSeriesResetOpen, setRocketLeagueSeriesResetOpen] = useState(false);
  const [valorantSeriesResetOpen, setValorantSeriesResetOpen] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [casterPresets, setCasterPresets] = useState<CasterPreset[]>([]);
  const [casterPresetSelection, setCasterPresetSelection] = useState<{ main: string; second: string }>({ main: "", second: "" });
  const [hydrated, setHydrated] = useState(false);
  const [outputActivated, setOutputActivated] = useState(false);
  const [isPrimaryTab, setIsPrimaryTab] = useState(false);
  const [takingControl, setTakingControl] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [liveRetryNonce, setLiveRetryNonce] = useState(0);
  const stateRef = useRef(state);
  const hydratedStateRef = useRef(state);
  const outputActivatedRef = useRef(false);
  const isPrimaryTabRef = useRef(false);
  const persistenceRevisionRef = useRef(0);
  const persistenceTimerRef = useRef<number | null>(null);
  const tabIdRef = useRef("");
  const writerIdRef = useRef("");
  const writerFenceRef = useRef(0);
  const workspaceHandoffChannelRef = useRef<BroadcastChannel | null>(null);
  const yieldedForHandoffRef = useRef(false);
  const forceWriterClaimRef = useRef(false);
  const serverOwnershipBlockedRef = useRef(false);
  const serverOwnershipRetryAtRef = useRef(0);
  const writerTokenRef = useRef("");
  const writerRevisionRef = useRef(0);
  const liveWriteSequenceRef = useRef(0);
  const lastSuccessfulPayloadSignatureRef = useRef("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetModalRef = useRef<HTMLDivElement>(null);
  const resetTriggerRef = useRef<HTMLButtonElement>(null);
  const seriesResetModalRef = useRef<HTMLDivElement>(null);
  const seriesResetTriggerRef = useRef<HTMLButtonElement>(null);
  const valorantSeriesResetModalRef = useRef<HTMLDivElement>(null);
  const valorantSeriesResetTriggerRef = useRef<HTMLButtonElement>(null);
  const actionConfirmationModalRef = useRef<HTMLDivElement>(null);
  const actionConfirmationTriggerRef = useRef<HTMLElement | null>(null);
  const matchRequestRef = useRef<Array<{ sequence: number; controller: AbortController | null }>>([
    { sequence: 0, controller: null },
    { sequence: 0, controller: null },
  ]);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3200);
  }, []);

  function requestConfirmation(confirmation: PendingConfirmation) {
    if (!isPrimaryTabRef.current) return;
    actionConfirmationTriggerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setPendingConfirmation(confirmation);
  }

  const enterWriterConflictStandby = useCallback(() => {
    serverOwnershipBlockedRef.current = true;
    serverOwnershipRetryAtRef.current = Date.now() + WRITER_SERVER_CONFLICT_RETRY_MS;
    isPrimaryTabRef.current = false;
    setIsPrimaryTab(false);
    setLiveSync("standby");
    setResetConfirmationOpen(false);
    setRocketLeagueSeriesResetOpen(false);
    setValorantSeriesResetOpen(false);
    setPendingConfirmation(null);
  }, [setResetConfirmationOpen, setRocketLeagueSeriesResetOpen, setValorantSeriesResetOpen, setPendingConfirmation]);

  const persistCurrentState = useCallback(() => {
    if (!isPrimaryTabRef.current) return;
    const revision = persistenceRevisionRef.current + 1;
    const activated = outputActivatedRef.current || hasOutputRelevantChanges(stateRef.current, hydratedStateRef.current);
    const envelope: PersistedStateEnvelope = {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      revision,
      savedAt: new Date().toISOString(),
      outputActivated: activated,
      state: stateRef.current,
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
      persistenceRevisionRef.current = revision;
      outputActivatedRef.current = activated;
      hydratedStateRef.current = stateRef.current;
    } catch {
      notify("Local draft could not be saved — check browser storage");
    }
  }, [notify]);

  const getWriterToken = useCallback(async (signal?: AbortSignal, force = false) => {
    if (!force && writerTokenRef.current) return writerTokenRef.current;
    const { response, payload: rawPayload } = await fetchJsonWithTimeout(LIVE_JSON_SESSION_ENDPOINT, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal,
    });
    const payload = asRecord(rawPayload);
    if (!response.ok || typeof payload?.token !== "string" || payload.token.length < 32) {
      throw new Error(String(payload?.error || `Writer session failed (HTTP ${response.status})`));
    }
    writerTokenRef.current = payload.token;
    return payload.token;
  }, []);

  const postWriterMutation = useCallback(async (endpoint: string, body: unknown, signal?: AbortSignal) => {
    for (let tokenAttempt = 0; tokenAttempt < 2; tokenAttempt += 1) {
      const token = await getWriterToken(signal, tokenAttempt > 0);
      const result = await fetchJsonWithTimeout(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Gaming-Oasis-Writer-Token": token,
        },
        body: JSON.stringify(body),
        signal,
      });
      if (result.response.status !== 403 || tokenAttempt === 1) return result;
      writerTokenRef.current = "";
    }
    throw new Error("Writer session expired");
  }, [getWriterToken]);

  const applyMapArtwork = useCallback((before: ValorantMapArtwork | undefined, artwork: ValorantMapArtwork, activate = false) => {
    if (!isPrimaryTabRef.current) return;
    setState((current) => {
      const maps = mergeMapArtwork(current.valorantMapData.maps, before, artwork);
      if (maps === current.valorantMapData.maps) return current;
      const valorantMapData = { maps };
      if (activate) outputActivatedRef.current = true;
      // Downloading artwork on an untouched launch must not publish default
      // match data over the existing show package. The first operator edit
      // activates the ordinary complete-package writer, including these maps.
      if (!outputActivatedRef.current && !hasOutputRelevantChanges(current, hydratedStateRef.current)) {
        hydratedStateRef.current = { ...hydratedStateRef.current, valorantMapData };
      }
      return { ...current, valorantMapData };
    });
  }, []);
  const ownsMapWriter = useCallback(() => isPrimaryTabRef.current && writerFenceRef.current > 0 && !serverOwnershipBlockedRef.current, []);
  const mutateMapLibrary = useCallback(async (route: string, body: unknown) => {
    if (!ownsMapWriter()) throw new Error("This browser does not control the JSON writer");
    const { response, payload } = await postWriterMutation(`${MAP_API}/${route}`, {
      ...(body as Record<string, unknown>), writerId: writerIdRef.current, fence: writerFenceRef.current,
    });
    if (!response.ok) throw new Error(String(asRecord(payload).error || "Map update failed"));
    return payload;
  }, [ownsMapWriter, postWriterMutation]);
  const mapLibrary = useValorantMapLibrary({ enabled: hydrated && isPrimaryTab, maps: state.valorantMapData.maps, ownsWriter: ownsMapWriter, mutate: mutateMapLibrary, apply: applyMapArtwork });

  useEffect(() => {
    if (!hydrated) return;
    const controller = new AbortController();
    fetch(LEAGUE_CATALOG_ENDPOINT, { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload) => {
        const entries = Object.values(payload?.data ?? {}) as Array<{ id?: string; name?: string }>;
        const catalog = entries
          .filter((entry) => entry?.id && entry?.name)
          .map((entry) => ({ id: String(entry.id), name: String(entry.name) }))
          .sort((a, b) => a.name.localeCompare(b.name));
        if (catalog.length > 100) setLeagueCatalog(catalog);
        if (typeof payload?.version === "string") setLeagueCatalogVersion(payload.version);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    let requestActive = false;
    const controller = new AbortController();

    async function pollWriterLiveDataStatus() {
      if (requestActive) return;
      requestActive = true;
      try {
        const response = await fetch(LIVE_JSON_STATUS_ENDPOINT, { cache: "no-store", signal: controller.signal });
        const payload = await response.json();
        if (!active || payload?.service !== "gaming-oasis-production-os-writer") return;
        setWriterLiveDataStatus({
          checked: true,
          reachable: true,
          rocketLeagueStatsApi: payload.rocketLeagueStatsApi ?? null,
          leagueOfLegends: payload.leagueOfLegends ?? null,
        });
      } catch {
        if (active) {
          setWriterLiveDataStatus({ checked: true, reachable: false, rocketLeagueStatsApi: null, leagueOfLegends: null });
        }
      } finally {
        requestActive = false;
      }
    }

    void pollWriterLiveDataStatus();
    const timer = window.setInterval(pollWriterLiveDataStatus, 2_000);
    return () => {
      active = false;
      window.clearInterval(timer);
      controller.abort();
    };
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated || !isPrimaryTab) return;
    let active = true;
    const controller = new AbortController();

    async function pollLeagueLive() {
      try {
        const response = await fetch(LEAGUE_OVERLAY_ENDPOINT, { cache: "no-store", signal: controller.signal });
        if (!active || response.status === 204 || !response.ok) return;
        const payload = await response.json();
        setLeagueLivePreview(payload?.live ?? null);
        if (!payload?.live?.game?.finished) return;
        const endEvent = [...(payload.live.events ?? [])].reverse().find((event: { id?: string; name?: string }) => String(event?.name).toLowerCase() === "gameend");
        const playerSignature = (payload.live.players ?? []).map((player: { riotId?: string; champion?: string }) => `${player.riotId ?? ""}:${player.champion ?? ""}`).join("|");
        const proposalId = `lol-${endEvent?.id ?? "end"}-${Math.floor(payload.live.game.gameTime ?? 0)}-${playerSignature}`;
        setState((current) => {
          if (current.leagueOfLegends.resultProposal?.id === proposalId || current.leagueOfLegends.confirmedGames.some((game) => game.id === proposalId)) return current;
          const winnerTeam = payload.live.game.winnerTeam;
          const blueWinner = current.leagueOfLegends.blueTeam === "team1" ? "team1" : "team2";
          const redWinner = blueWinner === "team1" ? "team2" : "team1";
          const winner: LeagueResultGame["winner"] = winnerTeam === "ORDER" ? blueWinner : winnerTeam === "CHAOS" ? redWinner : "";
          const gameNumber = current.leagueOfLegends.currentGame;
          const slots = draftSlots(current.leagueOfLegends.draft, current.leagueOfLegends.draftMode);
          const results = current.leagueOfLegends.results.map((game, index) => index === gameNumber - 1 ? {
            ...game,
            winner,
            id: proposalId,
            snapshot: payload.live,
            bluePicks: slots.bluePicks,
            redPicks: slots.redPicks,
            detectedAt: new Date().toISOString(),
          } : game);
          return {
            ...current,
            leagueOfLegends: {
              ...current.leagueOfLegends,
              results,
              resultProposal: {
                id: proposalId,
                winner,
                gameNumber,
                snapshot: payload.live,
                detectedAt: new Date().toISOString(),
              },
            },
          };
        });
      } catch {
        if (active) setLeagueLivePreview((current) => current ? { ...current, connection: { ...current.connection, connected: false } } : null);
      }
    }

    void pollLeagueLive();
    const timer = window.setInterval(pollLeagueLive, 500);
    return () => {
      active = false;
      window.clearInterval(timer);
      controller.abort();
    };
  }, [hydrated, isPrimaryTab]);

  useEffect(() => {
    const { presets, error } = loadCasterPresets(
      typeof window === "undefined" ? null : window.localStorage,
      CASTER_PRESETS_KEY,
    );
    setCasterPresets(presets);
    if (error) notify("Saved caster presets could not be read");
  }, [notify]);

  useEffect(() => {
    tabIdRef.current = createLocalId();
    writerIdRef.current = createLocalId();
    yieldedForHandoffRef.current = false;
    forceWriterClaimRef.current = false;
    serverOwnershipBlockedRef.current = false;
    serverOwnershipRetryAtRef.current = 0;
    let handoffChannel: BroadcastChannel | null = null;

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const restored = parsePersistedEnvelope(JSON.parse(raw));
        persistenceRevisionRef.current = restored.revision;
        outputActivatedRef.current = restored.outputActivated;
        hydratedStateRef.current = restored.state;
        stateRef.current = restored.state;
        setState(restored.state);
        setOutputActivated(restored.outputActivated);
      } else {
        hydratedStateRef.current = stateRef.current;
      }
    } catch {
      // Invalid old drafts are ignored so operators can still open the tool.
      hydratedStateRef.current = stateRef.current;
    }

    function setOwnership(ownsLease: boolean) {
      const gainedOwnership = ownsLease && !isPrimaryTabRef.current;
      isPrimaryTabRef.current = ownsLease;
      setIsPrimaryTab(ownsLease);
      if (gainedOwnership) lastSuccessfulPayloadSignatureRef.current = "";
      if (!ownsLease) {
        setLiveSync("standby");
        setResetConfirmationOpen(false);
        setRocketLeagueSeriesResetOpen(false);
        setValorantSeriesResetOpen(false);
        setPendingConfirmation(null);
      }
    }

    function claimOrRenewLease(force = false) {
      try {
        if (serverOwnershipBlockedRef.current && !force) {
          if (Date.now() < serverOwnershipRetryAtRef.current) {
            setOwnership(false);
            return;
          }
          serverOwnershipBlockedRef.current = false;
          serverOwnershipRetryAtRef.current = 0;
        }
        if (force) {
          serverOwnershipBlockedRef.current = false;
          serverOwnershipRetryAtRef.current = 0;
        }
        const now = Date.now();
        const current = parseWriterLease(window.localStorage.getItem(WRITER_LEASE_KEY));
        if (yieldedForHandoffRef.current) {
          if (force || !current || current.expiresAt <= now) {
            yieldedForHandoffRef.current = false;
          } else {
            setOwnership(false);
            return;
          }
        }
        const mayClaim = force || !current || current.expiresAt <= now || current.ownerId === tabIdRef.current;
        if (!mayClaim) {
          setOwnership(false);
          return;
        }
        const fence = current?.ownerId === tabIdRef.current
          ? current.fence
          : createWriterFence(current?.fence ?? writerFenceRef.current);
        const lease: WriterLease = { ownerId: tabIdRef.current, expiresAt: now + WRITER_LEASE_DURATION_MS, fence };
        window.localStorage.setItem(WRITER_LEASE_KEY, JSON.stringify(lease));
        const verified = parseWriterLease(window.localStorage.getItem(WRITER_LEASE_KEY));
        if (verified?.ownerId === tabIdRef.current) writerFenceRef.current = verified.fence;
        setOwnership(verified?.ownerId === tabIdRef.current);
      } catch {
        // If storage is unavailable, keep the tool usable in this tab.
        writerFenceRef.current = createWriterFence(writerFenceRef.current);
        setOwnership(true);
      }
    }

    function handleHandoffMessage(event: MessageEvent) {
      const message = asRecord(event.data);
      if (message.type !== "request-handoff"
        || typeof message.requestId !== "string"
        || typeof message.requesterId !== "string"
        || message.requesterId === tabIdRef.current
        || !isPrimaryTabRef.current) return;

      // Flush the latest refs before yielding, then stop renewing until the
      // requester has had time to replace the lease.
      persistCurrentState();
      yieldedForHandoffRef.current = true;
      setOwnership(false);
      handoffChannel?.postMessage({
        type: "handoff-ready",
        requestId: message.requestId,
        requesterId: message.requesterId,
      });
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === WRITER_LEASE_KEY) {
        const lease = parseWriterLease(window.localStorage.getItem(WRITER_LEASE_KEY));
        if (lease?.ownerId === tabIdRef.current) writerFenceRef.current = lease.fence;
        setOwnership(Boolean(
          !serverOwnershipBlockedRef.current
          && lease
          && lease.ownerId === tabIdRef.current
          && lease.expiresAt > Date.now()
        ));
        return;
      }
      if (event.key !== STORAGE_KEY || !event.newValue || isPrimaryTabRef.current) return;
      try {
        const restored = parsePersistedEnvelope(JSON.parse(event.newValue));
        if (restored.revision <= persistenceRevisionRef.current) return;
        persistenceRevisionRef.current = restored.revision;
        outputActivatedRef.current = restored.outputActivated;
        hydratedStateRef.current = restored.state;
        stateRef.current = restored.state;
        setOutputActivated(restored.outputActivated);
        setState(restored.state);
      } catch {
        // Ignore corrupt cross-tab messages and retain the last valid draft.
      }
    }

    function releaseLease() {
      try {
        const current = parseWriterLease(window.localStorage.getItem(WRITER_LEASE_KEY));
        if (current?.ownerId === tabIdRef.current) window.localStorage.removeItem(WRITER_LEASE_KEY);
      } catch {
        // Storage cleanup is best effort during navigation.
      }
    }

    if (typeof window.BroadcastChannel === "function") {
      handoffChannel = new window.BroadcastChannel(WORKSPACE_HANDOFF_CHANNEL);
      workspaceHandoffChannelRef.current = handoffChannel;
      handoffChannel.addEventListener("message", handleHandoffMessage);
    }

    claimOrRenewLease();
    const leaseTimer = window.setInterval(() => claimOrRenewLease(), WRITER_LEASE_RENEW_MS);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("pagehide", releaseLease);
    setHydrated(true);
    return () => {
      window.clearInterval(leaseTimer);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("pagehide", releaseLease);
      handoffChannel?.removeEventListener("message", handleHandoffMessage);
      handoffChannel?.close();
      if (workspaceHandoffChannelRef.current === handoffChannel) workspaceHandoffChannelRef.current = null;
      yieldedForHandoffRef.current = false;
      releaseLease();
    };
  }, [persistCurrentState]);

  useLayoutEffect(() => {
    stateRef.current = state;
    outputActivatedRef.current = outputActivated;
  }, [state, outputActivated]);

  useEffect(() => {
    if (!hydrated || outputActivated || !isPrimaryTab || !hasOutputRelevantChanges(state, hydratedStateRef.current)) return;
    setOutputActivated(true);
  }, [state, hydrated, outputActivated, isPrimaryTab]);

  useEffect(() => {
    if (!hydrated || !isPrimaryTab) return;
    if (persistenceTimerRef.current) window.clearTimeout(persistenceTimerRef.current);
    persistenceTimerRef.current = window.setTimeout(() => {
      persistenceTimerRef.current = null;
      persistCurrentState();
    }, 250);
    return () => {
      if (persistenceTimerRef.current) window.clearTimeout(persistenceTimerRef.current);
      persistenceTimerRef.current = null;
    };
  }, [state, outputActivated, hydrated, isPrimaryTab, persistCurrentState]);

  useEffect(() => {
    if (!hydrated || !isPrimaryTab) return;
    const flush = () => persistCurrentState();
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [hydrated, isPrimaryTab, persistCurrentState]);

  useEffect(() => {
    if (!resetConfirmationOpen) return;
    const modal = resetModalRef.current;
    const trigger = resetTriggerRef.current;
    const focusable = modal?.querySelectorAll<HTMLElement>("button") ?? [];
    focusable[0]?.focus();

    function handleModalKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setResetConfirmationOpen(false);
        return;
      }
      if (event.key !== "Tab" || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleModalKeyDown);
    return () => {
      document.removeEventListener("keydown", handleModalKeyDown);
      trigger?.focus();
    };
  }, [resetConfirmationOpen]);

  useEffect(() => {
    if (!rocketLeagueSeriesResetOpen) return;
    const modal = seriesResetModalRef.current;
    const trigger = seriesResetTriggerRef.current;
    const focusable = modal?.querySelectorAll<HTMLElement>("button") ?? [];
    focusable[0]?.focus();

    function handleModalKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setRocketLeagueSeriesResetOpen(false);
        return;
      }
      if (event.key !== "Tab" || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleModalKeyDown);
    return () => {
      document.removeEventListener("keydown", handleModalKeyDown);
      trigger?.focus();
    };
  }, [rocketLeagueSeriesResetOpen]);

  useEffect(() => {
    if (!valorantSeriesResetOpen) return;
    const modal = valorantSeriesResetModalRef.current;
    const trigger = valorantSeriesResetTriggerRef.current;
    const focusable = modal?.querySelectorAll<HTMLElement>("button") ?? [];
    focusable[0]?.focus();

    function handleModalKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setValorantSeriesResetOpen(false);
        return;
      }
      if (event.key !== "Tab" || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleModalKeyDown);
    return () => {
      document.removeEventListener("keydown", handleModalKeyDown);
      trigger?.focus();
    };
  }, [valorantSeriesResetOpen]);

  useEffect(() => {
    if (!pendingConfirmation) return;
    const modal = actionConfirmationModalRef.current;
    const trigger = actionConfirmationTriggerRef.current;
    const focusable = modal?.querySelectorAll<HTMLElement>("button") ?? [];
    focusable[0]?.focus();

    function handleModalKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setPendingConfirmation(null);
        return;
      }
      if (event.key !== "Tab" || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleModalKeyDown);
    return () => {
      document.removeEventListener("keydown", handleModalKeyDown);
      if (isPrimaryTabRef.current) trigger?.focus();
    };
  }, [pendingConfirmation]);

  const files = useMemo(() => buildExportFiles(state), [state]);
  const manualExportFiles = useMemo(() => [
    ...files,
    { filename: VALORANT_MAP_DATA_FILENAME, data: state.valorantMapData },
  ], [files, state.valorantMapData]);
  const matchOneLeague = resolveLeague(state.general.matches[0].league);
  const valorantOverlay = useMemo(() => buildValorantOverlayState(
    state.valorant,
    resolveTeam(state.general.matches[0].team1),
    resolveTeam(state.general.matches[0].team2),
    {
      primaryColor: matchOneLeague.primaryColor,
      secondaryColor: matchOneLeague.secondaryColor,
    },
    state.sponsors,
    state.valorantMapData.maps,
    { eventName: state.general.eventName },
  ), [state.valorant, state.general.eventName, state.general.matches, state.sponsors, state.valorantMapData.maps, matchOneLeague.primaryColor, matchOneLeague.secondaryColor]);
  const rocketLeagueOverlay = useMemo(() => buildRocketLeagueOverlayState(
    state.rocketLeague,
    resolveTeam(state.general.matches[0].team1),
    resolveTeam(state.general.matches[0].team2),
    {
      primaryColor: matchOneLeague.primaryColor,
      secondaryColor: matchOneLeague.secondaryColor,
    },
    { eventName: state.general.eventName },
    state.sponsors,
  ), [state.rocketLeague, state.general.eventName, state.general.matches, state.sponsors, matchOneLeague.primaryColor, matchOneLeague.secondaryColor]);
  const leagueOverlay = useMemo(() => buildLeagueOverlayState(
    state.leagueOfLegends,
    resolveTeam(state.general.matches[0].team1),
    resolveTeam(state.general.matches[0].team2),
    { primaryColor: matchOneLeague.primaryColor, secondaryColor: matchOneLeague.secondaryColor, logo: matchOneLeague.logo },
    state.sponsors,
    { eventName: state.general.eventName, assetVersion: leagueCatalogVersion },
  ), [state.leagueOfLegends, state.general.eventName, state.general.matches, state.sponsors, matchOneLeague.primaryColor, matchOneLeague.secondaryColor, matchOneLeague.logo, leagueCatalogVersion]);
  const livePayload = useMemo(() => ({
    files,
    overlays: { valorant: valorantOverlay, rocketLeague: rocketLeagueOverlay, leagueOfLegends: leagueOverlay },
    valorantMapData: state.valorantMapData,
  }), [files, leagueOverlay, rocketLeagueOverlay, state.valorantMapData, valorantOverlay]);
  const livePayloadSignature = useMemo(() => createLivePayloadSignature(livePayload), [livePayload]);
  const filledSponsors = state.sponsors.filter((sponsor) => sponsor.name.trim() || sponsor.logo.trim()).length;
  const filledMatches = state.general.matches.filter((match) => resolveTeam(match.team1).name && resolveTeam(match.team2).name).length;
  const rocketLeagueGameCount = rocketLeagueGameLimit(state.rocketLeague.bestOf);
  const rocketLeagueSeries = calculateRocketLeagueSeries(state.rocketLeague.savedGames, state.rocketLeague.bestOf);
  const rocketLeagueDraftSeries = calculateRocketLeagueSeries(state.rocketLeague.games, state.rocketLeague.bestOf);
  const rocketLeagueDraftComplete = Math.max(rocketLeagueDraftSeries.homeWins, rocketLeagueDraftSeries.awayWins) >= Math.floor(rocketLeagueGameCount / 2) + 1;
  const rocketLeaguePendingResults = pendingResultCount(state.rocketLeague.games, state.rocketLeague.savedGames, rocketLeagueGameCount);
  const rocketLeagueResultIssues = resultSequenceIssues(state.rocketLeague.games, rocketLeagueGameCount);
  const rocketLeagueInvalidResults = rocketLeagueResultIssues.filter(Boolean).length;
  const rocketLeagueHeader = resolveScoreboardHeader(state.rocketLeague.scoreboardHeader, state.general.eventName);
  const rocketLeagueReady = Boolean(rocketLeagueHeader);
  const valorantGameCount = valorantGameLimit(state.valorant.bestOf);
  const valorantSeries = calculateValorantSeries(state.valorant.savedGames, state.valorant.bestOf);
  const valorantDraftSeries = calculateValorantSeries(state.valorant.games, state.valorant.bestOf);
  const valorantDraftComplete = Math.max(valorantDraftSeries.homeWins, valorantDraftSeries.awayWins) >= Math.floor(valorantGameCount / 2) + 1;
  const valorantCurrentMap = getValorantCurrentMap(state.valorant, valorantSeries.roundNumber);
  const valorantCurrentSides = getValorantCurrentSides(state.valorant, valorantSeries.roundNumber);
  const valorantPendingResults = pendingResultCount(state.valorant.games, state.valorant.savedGames, valorantGameCount);
  const valorantResultIssues = resultSequenceIssues(state.valorant.games, valorantGameCount);
  const valorantInvalidResults = valorantResultIssues.filter(Boolean).length;
  const valorantHeader = resolveScoreboardHeader(state.valorant.scoreboardHeader, state.general.eventName);
  const valorantReady = Boolean(valorantHeader);
  const leagueGameCount = leagueGameLimit(state.leagueOfLegends.bestOf);
  const leagueConfirmedGames = state.leagueOfLegends.confirmedGames.filter((game) => game.gameNumber <= leagueGameCount);
  const leagueSeries = calculateLeagueSeries(leagueConfirmedGames);
  const leagueDraftProgress = (() => {
    const winsNeeded = Math.floor(leagueGameCount / 2) + 1;
    let teamOne = 0;
    let teamTwo = 0;
    let completedGames = 0;
    for (const result of state.leagueOfLegends.results.slice(0, leagueGameCount)) {
      if (!result.winner || teamOne >= winsNeeded || teamTwo >= winsNeeded) break;
      if (result.winner === "team1") teamOne += 1;
      else teamTwo += 1;
      completedGames += 1;
    }
    return { completedGames, complete: teamOne >= winsNeeded || teamTwo >= winsNeeded };
  })();
  const leaguePendingResults = leagueResultPendingCount(state.leagueOfLegends.results, leagueConfirmedGames, state.leagueOfLegends.bestOf);
  const leagueHeader = resolveScoreboardHeader(state.leagueOfLegends.scoreboardHeader, state.general.eventName);

  useEffect(() => {
    if (!hydrated) return;
    if (!isPrimaryTab) {
      setLiveSync("standby");
      return;
    }
    const sequence = ++liveWriteSequenceRef.current;
    const controller = new AbortController();

    if (!outputActivated) {
      setLiveSync("checking");
      void (async () => {
        try {
          await getWriterToken(controller.signal);
          const { response } = await fetchJsonWithTimeout(LIVE_JSON_STATUS_ENDPOINT, {
            cache: "no-store",
            headers: { Accept: "application/json" },
            signal: controller.signal,
          });
          if (!response.ok) throw new Error(`Writer status failed (HTTP ${response.status})`);
          if (sequence === liveWriteSequenceRef.current) setLiveSync("standby");
        } catch (error) {
          if ((error as Error).name !== "AbortError" && sequence === liveWriteSequenceRef.current) setLiveSync("error");
        }
      })();
      return () => controller.abort();
    }

    if (livePayloadSignature === lastSuccessfulPayloadSignatureRef.current) {
      setLiveSync("synced");
      return () => controller.abort();
    }

    const revision = Math.max(writerRevisionRef.current + 1, Date.now());
    writerRevisionRef.current = revision;
    const retryDelays = [0, 500, 1_500, 3_500];
    const timer = window.setTimeout(() => {
      void (async () => {
        for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
          try {
            if (retryDelays[attempt] > 0) {
              if (sequence === liveWriteSequenceRef.current) setLiveSync("retrying");
              await waitForDelay(retryDelays[attempt], controller.signal);
            } else if (sequence === liveWriteSequenceRef.current) {
              setLiveSync("saving");
            }

            try {
              const lease = parseWriterLease(window.localStorage.getItem(WRITER_LEASE_KEY));
              if (lease && (lease.ownerId !== tabIdRef.current || lease.expiresAt <= Date.now())) {
                isPrimaryTabRef.current = false;
                setIsPrimaryTab(false);
                throw new HttpResponseError(409, "Another tab controls the workspace", true);
              }
            } catch (error) {
              if (error instanceof HttpResponseError) throw error;
              // Storage-restricted sessions operate as a single tab.
            }

            const { response: claimResponse, payload: rawClaimPayload } = await postWriterMutation(
              LIVE_JSON_CLAIM_ENDPOINT,
              { writerId: writerIdRef.current, force: forceWriterClaimRef.current },
              controller.signal,
            );
            const claimPayload = asRecord(rawClaimPayload);
            if (claimResponse.status === 409) {
              enterWriterConflictStandby();
              return;
            }
            if (!claimResponse.ok
              || claimPayload.ok !== true
              || !Number.isSafeInteger(claimPayload.fence)
              || Number(claimPayload.fence) < 1) {
              const terminal = claimResponse.status >= 400 && claimResponse.status < 500;
              throw new HttpResponseError(
                claimResponse.status,
                String(claimPayload.error || `Writer claim failed (HTTP ${claimResponse.status})`),
                terminal,
              );
            }
            const claimedFence = Number(claimPayload.fence);
            forceWriterClaimRef.current = false;
            serverOwnershipBlockedRef.current = false;
            serverOwnershipRetryAtRef.current = 0;
            writerFenceRef.current = claimedFence;
            try {
              const lease = parseWriterLease(window.localStorage.getItem(WRITER_LEASE_KEY));
              if (lease?.ownerId === tabIdRef.current) {
                window.localStorage.setItem(WRITER_LEASE_KEY, JSON.stringify({ ...lease, fence: claimedFence }));
              } else if (lease && lease.expiresAt > Date.now()) {
                isPrimaryTabRef.current = false;
                setIsPrimaryTab(false);
                throw new HttpResponseError(409, "Another tab controls the workspace", true);
              }
            } catch (error) {
              if (error instanceof HttpResponseError) throw error;
              // Storage-restricted sessions operate as a single tab.
            }

            const body = {
              writerId: writerIdRef.current,
              fence: claimedFence,
              revision,
              ...livePayload,
            };
            const { response, payload: rawPayload } = await postWriterMutation(LIVE_JSON_ENDPOINT, body, controller.signal);
            const payload = asRecord(rawPayload);
            if (!response.ok) {
              if (response.status === 409) {
                enterWriterConflictStandby();
                return;
              }
              const terminal = response.status >= 400 && response.status < 500;
              if (terminal) throw new HttpResponseError(response.status, String(payload?.error || `HTTP ${response.status}`), true);
              throw new HttpResponseError(response.status, String(payload?.error || `HTTP ${response.status}`));
            }
            if (payload?.ok !== true || payload?.files !== 6 || payload?.revision !== revision) {
              throw new Error("Writer returned an invalid acknowledgement");
            }
            if (sequence === liveWriteSequenceRef.current) {
              lastSuccessfulPayloadSignatureRef.current = livePayloadSignature;
              setLiveSync("synced");
            }
            return;
          } catch (error) {
            if ((error as Error).name === "AbortError") return;
            if (error instanceof HttpResponseError && error.terminal) {
              if (sequence === liveWriteSequenceRef.current) setLiveSync("error");
              return;
            }
            if (attempt === retryDelays.length - 1 && sequence === liveWriteSequenceRef.current) setLiveSync("error");
          }
        }
      })();
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [hydrated, outputActivated, isPrimaryTab, livePayload, livePayloadSignature, liveRetryNonce, enterWriterConflictStandby, getWriterToken, postWriterMutation]);

  useEffect(() => {
    if (!hydrated || !isPrimaryTab) return;
    let active = true;
    let timer: number | undefined;
    let controller: AbortController | null = null;

    async function renewServerOwnership() {
      controller = new AbortController();
      const requestController = controller;
      try {
        const force = forceWriterClaimRef.current;
        const { response, payload: rawPayload } = await postWriterMutation(
          LIVE_JSON_CLAIM_ENDPOINT,
          { writerId: writerIdRef.current, force },
          requestController.signal,
        );
        const payload = asRecord(rawPayload);
        if (response.status === 409) {
          if (active) enterWriterConflictStandby();
          return;
        }
        if (!response.ok || payload.ok !== true || !Number.isSafeInteger(payload.fence) || Number(payload.fence) < 1) return;
        forceWriterClaimRef.current = false;
        serverOwnershipBlockedRef.current = false;
        serverOwnershipRetryAtRef.current = 0;
        writerFenceRef.current = Number(payload.fence);
        try {
          const lease = parseWriterLease(window.localStorage.getItem(WRITER_LEASE_KEY));
          if (lease?.ownerId === tabIdRef.current) {
            window.localStorage.setItem(WRITER_LEASE_KEY, JSON.stringify({ ...lease, fence: Number(payload.fence) }));
          }
        } catch {
          // Storage-restricted sessions still renew their server-side owner lease.
        }
      } catch {
        // The live writer effect reports connection failures; the next heartbeat retries.
      } finally {
        if (controller === requestController) controller = null;
        if (active) timer = window.setTimeout(renewServerOwnership, WRITER_SERVER_LEASE_RENEW_MS);
      }
    }

    void renewServerOwnership();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
      controller?.abort();
    };
  }, [enterWriterConflictStandby, hydrated, isPrimaryTab, postWriterMutation]);

  useEffect(() => {
    if (!hydrated || !isPrimaryTab || liveSync !== "error") return;
    const timer = window.setTimeout(() => setLiveRetryNonce((current) => current + 1), 10_000);
    return () => window.clearTimeout(timer);
  }, [hydrated, isPrimaryTab, liveSync]);

  useEffect(() => {
    if (!hydrated || !isPrimaryTab) return;
    let active = true;
    let controller: AbortController | null = null;
    let timer: number | undefined;
    let winnerLatchId = "";
    let awaitingOverlayRestore = false;

    async function pollFinishedGame() {
      controller = new AbortController();
      try {
        const { response, payload: rawPayload } = await fetchJsonWithTimeout(ROCKET_LEAGUE_LIVE_OVERLAY_ENDPOINT, {
          cache: "no-store",
          signal: controller.signal,
        }, 5_000);
        if (!active) return;
        if (response.status === 204) {
          if (outputActivatedRef.current && !awaitingOverlayRestore) {
            awaitingOverlayRestore = true;
            lastSuccessfulPayloadSignatureRef.current = "";
            setLiveRetryNonce((current) => current + 1);
          }
          return;
        }
        if (!response.ok) return;
        awaitingOverlayRestore = false;
        const payload = asRecord(rawPayload);
        const finished = asRecord(payload.finishedGame);
        const liveGame = asRecord(payload.game);
        let candidate: { id: string; scoreOne: number; scoreTwo: number } | null = null;
        if (stringValue(finished.id)
          && typeof finished.scoreOne === "number" && Number.isFinite(finished.scoreOne)
          && typeof finished.scoreTwo === "number" && Number.isFinite(finished.scoreTwo)) {
          candidate = { id: stringValue(finished.id), scoreOne: finished.scoreOne, scoreTwo: finished.scoreTwo };
          winnerLatchId = candidate.id;
        } else if (liveGame.hasWinner === true
          && typeof liveGame.scoreOne === "number" && Number.isFinite(liveGame.scoreOne)
          && typeof liveGame.scoreTwo === "number" && Number.isFinite(liveGame.scoreTwo)
          && liveGame.scoreOne !== liveGame.scoreTwo) {
          if (!winnerLatchId) {
            winnerLatchId = `edge-${Date.now()}-${liveGame.scoreOne}-${liveGame.scoreTwo}`;
          }
          candidate = {
            id: winnerLatchId,
            scoreOne: liveGame.scoreOne,
            scoreTwo: liveGame.scoreTwo,
          };
        } else {
          winnerLatchId = "";
          return;
        }

        let toastMessage = "";
        setState((current) => {
          const result = proposeRocketLeagueLiveResult(current.rocketLeague, candidate);
          if (!result.changed) return current;
          if (result.proposed) {
            const gameLabel = `Game ${result.gameIndex + 1}`;
            toastMessage = result.accepted
              ? `${gameLabel} result auto-accepted from live match`
              : `${gameLabel} result proposed from live match — review, then save`;
          }
          return { ...current, rocketLeague: result.rocketLeague };
        });
        if (toastMessage) {
          setToast(toastMessage);
          if (toastTimer.current) clearTimeout(toastTimer.current);
          toastTimer.current = setTimeout(() => setToast(""), 3200);
        }
      } catch {
        // Writer may be restarting; keep last Results board.
      } finally {
        controller = null;
        if (active) timer = window.setTimeout(pollFinishedGame, 500);
      }
    }

    void pollFinishedGame();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
      controller?.abort();
    };
  }, [hydrated, isPrimaryTab]);

  async function takeControlOfWorkspace() {
    if (takingControl) return;
    setTakingControl(true);
    let handoffTimedOut = false;
    try {
      const currentLease = parseWriterLease(window.localStorage.getItem(WRITER_LEASE_KEY));
      const handoffChannel = workspaceHandoffChannelRef.current;
      if (handoffChannel
        && currentLease
        && currentLease.ownerId !== tabIdRef.current
        && currentLease.expiresAt > Date.now()) {
        const requestId = createLocalId();
        const confirmed = await new Promise<boolean>((resolve) => {
          let settled = false;
          const finish = (value: boolean) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            handoffChannel.removeEventListener("message", handleMessage);
            resolve(value);
          };
          const handleMessage = (event: MessageEvent) => {
            const message = asRecord(event.data);
            if (message.type === "handoff-ready"
              && message.requestId === requestId
              && message.requesterId === tabIdRef.current) finish(true);
          };
          const timer = window.setTimeout(() => finish(false), 1_000);
          handoffChannel.addEventListener("message", handleMessage);
          try {
            handoffChannel.postMessage({ type: "request-handoff", requestId, requesterId: tabIdRef.current });
          } catch {
            finish(false);
          }
        });
        handoffTimedOut = !confirmed;
      }
    } catch {
      // Storage-restricted sessions cannot coordinate across tabs.
    }

    try {
      const persisted = window.localStorage.getItem(STORAGE_KEY);
      if (persisted) {
        const restored = parsePersistedEnvelope(JSON.parse(persisted));
        if (restored.revision > persistenceRevisionRef.current) {
          persistenceRevisionRef.current = restored.revision;
          outputActivatedRef.current = restored.outputActivated;
          hydratedStateRef.current = restored.state;
          stateRef.current = restored.state;
          setOutputActivated(restored.outputActivated);
          setState(restored.state);
        }
      }
    } catch {
      // Keep the last valid in-memory draft if persisted data is malformed.
    }

    try {
      const current = parseWriterLease(window.localStorage.getItem(WRITER_LEASE_KEY));
      const lease: WriterLease = {
        ownerId: tabIdRef.current,
        expiresAt: Date.now() + WRITER_LEASE_DURATION_MS,
        fence: createWriterFence(current?.fence ?? writerFenceRef.current),
      };
      window.localStorage.setItem(WRITER_LEASE_KEY, JSON.stringify(lease));
      const verified = parseWriterLease(window.localStorage.getItem(WRITER_LEASE_KEY));
      if (verified?.ownerId !== tabIdRef.current) {
        notify("Could not take control — another tab still owns the workspace");
        setTakingControl(false);
        return;
      }
      writerFenceRef.current = verified.fence;
    } catch {
      // Storage-restricted browser sessions can still operate as a single tab.
      writerFenceRef.current = createWriterFence(writerFenceRef.current);
    }
    yieldedForHandoffRef.current = false;
    serverOwnershipBlockedRef.current = false;
    serverOwnershipRetryAtRef.current = 0;
    forceWriterClaimRef.current = true;
    lastSuccessfulPayloadSignatureRef.current = "";
    isPrimaryTabRef.current = true;
    setIsPrimaryTab(true);
    writerTokenRef.current = "";
    setLiveSync("checking");
    setTakingControl(false);
    notify(handoffTimedOut
      ? "This tab now controls the workspace — verify recent edits from the previous tab"
      : "This tab now controls the production workspace");
  }

  function updateGeneral<K extends keyof GeneralInfo>(key: K, value: GeneralInfo[K]) {
    setState((current) => ({ ...current, general: { ...current.general, [key]: value } }));
  }

  function persistCasterPresets(next: CasterPreset[]) {
    setCasterPresets(next);
    const stored = saveCasterPresets(
      typeof window === "undefined" ? null : window.localStorage,
      CASTER_PRESETS_KEY,
      next,
    );
    if (!stored) notify("Caster presets could not be saved — check browser storage");
  }

  function applyCasterPreset(slot: "main" | "second", name: string) {
    setCasterPresetSelection((current) => ({ ...current, [slot]: name }));
    if (!name) return;
    const preset = findCasterPreset(casterPresets, name);
    if (!preset) {
      notify("Caster preset not found");
      return;
    }
    const nameKey = slot === "main" ? "mainCaster" : "secondCaster";
    const socialKey = slot === "main" ? "mainCasterSocial" : "secondaryCasterSocial";
    setState((current) => ({
      ...current,
      general: { ...current.general, [nameKey]: preset.name, [socialKey]: preset.social },
    }));
    notify(`${slot === "main" ? "Main" : "Second"} caster filled from preset`);
  }

  function saveCasterPreset(slot: "main" | "second") {
    const entry = slot === "main"
      ? { name: state.general.mainCaster, social: state.general.mainCasterSocial }
      : { name: state.general.secondCaster, social: state.general.secondaryCasterSocial };
    const result = upsertCasterPreset(casterPresets, entry);
    if (!result) {
      notify("Enter a caster name before saving a preset");
      return;
    }
    persistCasterPresets(result.presets);
    setCasterPresetSelection((current) => ({ ...current, [slot]: result.preset.name }));
    notify(result.created ? `Caster preset "${result.preset.name}" saved` : `Caster preset "${result.preset.name}" updated`);
  }

  function removeCasterPresetAction(slot: "main" | "second") {
    const preset = findCasterPreset(casterPresets, casterPresetSelection[slot]);
    if (!preset) return;
    const slotLabel = slot === "main" ? "Main caster" : "Second caster";
    requestConfirmation({
      title: `Remove caster preset "${preset.name}"?`,
      description: `This deletes the saved preset from this workstation. The ${slotLabel} fields keep their current values.`,
      confirmLabel: "Remove preset",
      onConfirm: () => {
        persistCasterPresets(removeCasterPreset(casterPresets, preset.name));
        setCasterPresetSelection((current) => ({ ...current, [slot]: "" }));
        notify(`Caster preset "${preset.name}" removed`);
      },
    });
  }

  async function copyValorantOverlayLink() {
    try {
      await navigator.clipboard.writeText(VALORANT_OVERLAY_URL);
      notify("VALORANT overlay link copied");
    } catch {
      notify("Could not copy the overlay link");
    }
  }

  async function copyValorantVsOverlayLink() {
    try {
      await navigator.clipboard.writeText(VALORANT_VS_OVERLAY_URL);
      notify("VALORANT VS overlay link copied");
    } catch {
      notify("Could not copy the VS overlay link");
    }
  }

  function openValorantOverlay() {
    window.open(VALORANT_OVERLAY_URL, "_blank", "noopener,noreferrer");
  }

  function openValorantVsOverlay() {
    window.open(VALORANT_VS_OVERLAY_URL, "_blank", "noopener,noreferrer");
  }

  async function copyRocketLeagueOverlayLink() {
    try {
      await navigator.clipboard.writeText(ROCKET_LEAGUE_OVERLAY_URL);
      notify("Rocket League overlay link copied");
    } catch {
      notify("Could not copy the overlay link");
    }
  }

  async function copyRocketLeagueVsOverlayLink() {
    try {
      await navigator.clipboard.writeText(ROCKET_LEAGUE_VS_OVERLAY_URL);
      notify("Rocket League VS overlay link copied");
    } catch {
      notify("Could not copy the VS overlay link");
    }
  }

  async function copyRocketLeagueStatsOverlayLink() {
    try {
      await navigator.clipboard.writeText(ROCKET_LEAGUE_STATS_OVERLAY_URL);
      notify("Rocket League stats overlay link copied");
    } catch {
      notify("Could not copy the stats overlay link");
    }
  }

  function openRocketLeagueOverlay() {
    window.open(ROCKET_LEAGUE_OVERLAY_URL, "_blank", "noopener,noreferrer");
  }

  function openRocketLeagueVsOverlay() {
    window.open(ROCKET_LEAGUE_VS_OVERLAY_URL, "_blank", "noopener,noreferrer");
  }

  function openRocketLeagueStatsOverlay() {
    window.open(ROCKET_LEAGUE_STATS_OVERLAY_URL, "_blank", "noopener,noreferrer");
  }

  async function copyLeagueOverlayLink(label: string, url: string) {
    try {
      await navigator.clipboard.writeText(url);
      notify(`${label} overlay link copied`);
    } catch {
      notify("Could not copy the overlay link");
    }
  }

  function openLeagueOverlay(url: string) {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function updateLeagueOfLegends(patch: Partial<LeagueOfLegends>) {
    setState((current) => ({ ...current, leagueOfLegends: { ...current.leagueOfLegends, ...patch } }));
  }

  function updateLeagueBestOf(bestOf: LeagueOfLegends["bestOf"]) {
    setState((current) => ({
      ...current,
      leagueOfLegends: {
        ...current.leagueOfLegends,
        bestOf,
        currentGame: calculateLeagueCurrentGame(current.leagueOfLegends.confirmedGames, bestOf),
        firstSelectionTeam: resolveLeagueFirstSelection(current.leagueOfLegends, current.leagueOfLegends.confirmedGames, bestOf),
      },
    }));
  }

  function lockLeagueChampion() {
    let failure = "";
    setState((current) => {
      const unavailable = current.leagueOfLegends.draftMode === "fearless"
        ? fearlessChampionSet(current.leagueOfLegends.confirmedGames, current.leagueOfLegends.bestOf, current.leagueOfLegends.currentGame)
        : new Set();
      const result = lockLeagueDraftSelection(current.leagueOfLegends.draft, leagueChampion, unavailable, current.leagueOfLegends.draftMode);
      if (!result.changed) {
        failure = result.reason || "Could not lock champion";
        return current;
      }
      return {
        ...current,
        leagueOfLegends: { ...current.leagueOfLegends, draft: result.draft as LeagueDraftState },
      };
    });
    if (failure) notify(failure);
    else setLeagueChampion("");
  }

  function undoLeagueDraft() {
    setState((current) => ({
      ...current,
      leagueOfLegends: {
        ...current.leagueOfLegends,
        draft: undoLeagueDraftSelection(current.leagueOfLegends.draft) as LeagueDraftState,
      },
    }));
  }

  function updateLeaguePickRole(side: "blue" | "red", role: number, pick: number) {
    setState((current) => ({
      ...current,
      leagueOfLegends: {
        ...current.leagueOfLegends,
        draft: assignLeaguePickRole(current.leagueOfLegends.draft, side, role, pick) as LeagueDraftState,
      },
    }));
  }

  function resetLeagueDraft() {
    if (!window.confirm("Reset the current League of Legends draft? Confirmed games and fearless history will remain.")) return;
    setState((current) => ({
      ...current,
      leagueOfLegends: {
        ...current.leagueOfLegends,
        draft: createLeagueDraftState(current.leagueOfLegends.draft.timerSeconds) as LeagueDraftState,
      },
    }));
    setLeagueChampion("");
    notify("League of Legends draft reset");
  }

  function updateLeagueResult(gameIndex: number, winner: LeagueResultGame["winner"]) {
    setState((current) => ({
      ...current,
      leagueOfLegends: {
        ...current.leagueOfLegends,
        results: current.leagueOfLegends.results.map((game, index) => index === gameIndex ? { ...game, winner } : game),
      },
    }));
  }

  function discardLeagueResultProposal() {
    setState((current) => {
      const proposal = current.leagueOfLegends.resultProposal;
      if (!proposal) return current;
      const saved = current.leagueOfLegends.confirmedGames.find((game) => game.gameNumber === proposal.gameNumber);
      const replacement = saved ? leagueResultsFromConfirmedGames([saved])[proposal.gameNumber - 1] : createLeagueResultGames()[proposal.gameNumber - 1];
      return {
        ...current,
        leagueOfLegends: {
          ...current.leagueOfLegends,
          results: current.leagueOfLegends.results.map((game, index) => index === proposal.gameNumber - 1 ? replacement : game),
          resultProposal: null,
        },
      };
    });
    notify("Live League result proposal discarded");
  }

  function saveLeagueResults() {
    if (!leaguePendingResults) return;
    const fearlessError = leagueFearlessResultError(state.leagueOfLegends);
    if (fearlessError) {
      notify(fearlessError);
      return;
    }
    setState((current) => {
      const slots = draftSlots(current.leagueOfLegends.draft, current.leagueOfLegends.draftMode);
      const currentDraftHasPicks = [...slots.bluePicks, ...slots.redPicks].some(Boolean);
      const previousByGame = new Map(current.leagueOfLegends.confirmedGames.map((game) => [game.gameNumber, game]));
      const gameLimit = leagueGameLimit(current.leagueOfLegends.bestOf);
      const confirmedGames = current.leagueOfLegends.results.slice(0, gameLimit).flatMap((result, index) => {
        if (!result.winner) return [];
        const gameNumber = index + 1;
        const existing = previousByGame.get(gameNumber);
        const resultHasPicks = [...result.bluePicks, ...result.redPicks].some(Boolean);
        const useCurrentDraft = gameNumber === current.leagueOfLegends.currentGame && currentDraftHasPicks;
        return [{
          id: result.id || existing?.id || `manual-${gameNumber}-${Date.now()}`,
          gameNumber,
          winner: result.winner,
          bluePicks: resultHasPicks ? result.bluePicks : useCurrentDraft ? slots.bluePicks : existing?.bluePicks ?? Array(5).fill(""),
          redPicks: resultHasPicks ? result.redPicks : useCurrentDraft ? slots.redPicks : existing?.redPicks ?? Array(5).fill(""),
          snapshot: result.snapshot ?? existing?.snapshot ?? null,
          confirmedAt: new Date().toISOString(),
        } as LeagueConfirmedGame];
      });
      const currentResultChanged = (previousByGame.get(current.leagueOfLegends.currentGame)?.winner ?? "")
        !== (current.leagueOfLegends.results[current.leagueOfLegends.currentGame - 1]?.winner ?? "");
      const currentGame = calculateLeagueCurrentGame(confirmedGames, current.leagueOfLegends.bestOf);
      return {
        ...current,
        leagueOfLegends: {
          ...current.leagueOfLegends,
          confirmedGames,
          results: leagueResultsFromConfirmedGames(confirmedGames),
          currentGame,
          firstSelectionTeam: resolveLeagueFirstSelection(current.leagueOfLegends, confirmedGames),
          scoreboard: currentGame !== current.leagueOfLegends.currentGame
            ? resetLeagueScoreboardCounts(current.leagueOfLegends.scoreboard) as LeagueScoreboardSettings
            : current.leagueOfLegends.scoreboard,
          draft: currentResultChanged || currentGame !== current.leagueOfLegends.currentGame
            ? createLeagueDraftState(current.leagueOfLegends.draft.timerSeconds) as LeagueDraftState
            : current.leagueOfLegends.draft,
          resultProposal: null,
        },
      };
    });
    notify("League of Legends results updated");
  }

  useEffect(() => {
    if (!hydrated || !state.leagueOfLegends.autoAcceptLiveResults || !state.leagueOfLegends.resultProposal?.winner || !leaguePendingResults) return;
    saveLeagueResults();
  }, [hydrated, leaguePendingResults, state.leagueOfLegends.autoAcceptLiveResults, state.leagueOfLegends.resultProposal?.id]);

  function resetLeagueSeries() {
    if (!window.confirm("Reset the League of Legends series? This clears draft history, confirmed results, and the fearless pool.")) return;
    setState((current) => ({
      ...current,
      leagueOfLegends: {
        ...current.leagueOfLegends,
        currentGame: 1,
        firstSelectionTeam: "",
        scoreboard: resetLeagueScoreboardCounts(current.leagueOfLegends.scoreboard) as LeagueScoreboardSettings,
        results: createLeagueResultGames(),
        draft: createLeagueDraftState(current.leagueOfLegends.draft.timerSeconds) as LeagueDraftState,
        confirmedGames: [],
        resultProposal: null,
      },
    }));
    notify("League of Legends series reset");
  }

  async function setRocketLeagueMatchPaused(paused: boolean) {
    try {
      const { response, payload: rawPayload } = await postWriterMutation(ROCKET_LEAGUE_MATCH_PAUSED_ENDPOINT, { paused });
      const payload = asRecord(rawPayload);
      if (!response.ok && response.status !== 202) {
        notify(String(payload?.error || (paused ? "Could not pause the match" : "Could not resume the match")));
        return;
      }
      if (payload?.confirmed) {
        notify(paused ? "Match paused" : "Match resumed");
        return;
      }
      notify(String(
        payload?.hint
        || (paused
          ? "Pause sent, but RL did not confirm — this PC may need to be match admin/host"
          : "Resume sent, but RL did not confirm — this PC may need to be match admin/host"),
      ));
    } catch {
      notify(paused ? "Could not pause the match — is the JSON writer online?" : "Could not resume the match — is the JSON writer online?");
    }
  }

  function updateRocketLeague(patch: Partial<RocketLeague>) {
    setState((current) => ({ ...current, rocketLeague: { ...current.rocketLeague, ...patch } }));
  }

  function updateRocketLeagueBestOf(bestOf: RocketLeague["bestOf"]) {
    setState((current) => ({
      ...current,
      rocketLeague: {
        ...current.rocketLeague,
        bestOf,
      },
    }));
  }

  function updateDebugLive(patch: Partial<RocketLeagueDebugLive>) {
    setState((current) => ({
      ...current,
      rocketLeague: {
        ...current.rocketLeague,
        debugLive: normalizeDebugLive({
          ...current.rocketLeague.debugLive,
          ...patch,
        }, current.rocketLeague.debugActivePlayerScenario) as RocketLeagueDebugLive,
      },
    }));
  }

  function updateDebugTargetPlayer(patch: Partial<RocketLeagueDebugTargetPlayer>) {
    setState((current) => {
      const nextPlayer = {
        ...current.rocketLeague.debugLive.targetPlayer,
        ...patch,
      };
      const nextLive = normalizeDebugLive({
        ...current.rocketLeague.debugLive,
        target: patch.id !== undefined ? String(patch.id) : current.rocketLeague.debugLive.target,
        targetPlayer: nextPlayer,
      }, current.rocketLeague.debugActivePlayerScenario) as RocketLeagueDebugLive;
      return {
        ...current,
        rocketLeague: {
          ...current.rocketLeague,
          debugLive: nextLive,
        },
      };
    });
  }

  function applyActivePlayerScenario(scenarioId: string) {
    const scenario = normalizeActivePlayerScenario(scenarioId) as RocketLeagueActivePlayerScenario;
    updateRocketLeague({
      debugActivePlayerScenario: scenario,
      debugLive: applyDebugScenario(scenario) as RocketLeagueDebugLive,
    });
  }

  function fireSampleDebugActivity() {
    updateDebugLive({
      activities: [
        createSampleDebugActivity(Date.now()) as RocketLeagueDebugActivity,
        ...(state.rocketLeague.debugLive.activities || []).slice(0, 3),
      ],
    });
  }

  function updateRocketLeagueScore(gameIndex: number, side: "home" | "away", rawValue: string) {
    const digits = rawValue.replace(/\D/g, "");
    const value = digits ? String(Math.min(99, Number.parseInt(digits, 10))) : "";
    setState((current) => {
      const games = current.rocketLeague.games.map((game, index) => (
        index === gameIndex ? { ...game, [side]: value } : game
      ));
      return { ...current, rocketLeague: { ...current.rocketLeague, games } };
    });
  }

  function saveRocketLeagueResults() {
    if (rocketLeagueInvalidResults) {
      notify("Resolve tied or incomplete Rocket League results before updating JSON");
      return;
    }
    setState((current) => ({
      ...current,
      rocketLeague: {
        ...current.rocketLeague,
        savedGames: mergeSavedResultRows(
          current.rocketLeague.games,
          current.rocketLeague.savedGames,
          rocketLeagueGameLimit(current.rocketLeague.bestOf),
        ),
      },
    }));
    notify("Rocket League results queued for live JSON");
  }

  function resetRocketLeagueSeries() {
    setState((current) => ({
      ...current,
      rocketLeague: {
        ...current.rocketLeague,
        games: createRocketLeagueGames(),
        savedGames: createRocketLeagueGames(),
      },
    }));
    setRocketLeagueSeriesResetOpen(false);
    notify("Rocket League series results cleared");
  }

  function updateValorant(patch: Partial<Valorant>) {
    setState((current) => ({ ...current, valorant: { ...current.valorant, ...patch } }));
  }

  function updateValorantBestOf(bestOf: Valorant["bestOf"]) {
    setState((current) => ({
      ...current,
      valorant: {
        ...current.valorant,
        bestOf,
      },
    }));
  }

  function updateValorantScore(gameIndex: number, side: "home" | "away", rawValue: string) {
    const digits = rawValue.replace(/\D/g, "");
    const value = digits ? String(Math.min(99, Number.parseInt(digits, 10))) : "";
    setState((current) => {
      const games = current.valorant.games.map((game, index) => (
        index === gameIndex ? { ...game, [side]: value } : game
      ));
      return { ...current, valorant: { ...current.valorant, games } };
    });
  }

  function saveValorantResults() {
    if (valorantInvalidResults) {
      notify("Resolve tied or incomplete VALORANT results before updating JSON");
      return;
    }
    setState((current) => ({
      ...current,
      valorant: {
        ...current.valorant,
        savedGames: mergeSavedResultRows(
          current.valorant.games,
          current.valorant.savedGames,
          valorantGameLimit(current.valorant.bestOf),
        ),
      },
    }));
    notify("VALORANT results queued for live JSON");
  }

  function resetValorantSeries() {
    setState((current) => ({
      ...current,
      valorant: {
        ...current.valorant,
        games: createValorantGames(),
        savedGames: createValorantGames(),
      },
    }));
    setValorantSeriesResetOpen(false);
    notify("VALORANT series results cleared");
  }

  function resetValorantMapBans() {
    if (state.valorant.bestOf === "Bo1") return;
    requestConfirmation({
      title: `Reset VALORANT ${state.valorant.bestOf} map bans?`,
      description: `This clears every pick, ban, and decider map selection in the current ${state.valorant.bestOf} veto and updates the production output. Map results, starting sides, ban swap, and series format stay as they are. This cannot be undone.`,
      confirmLabel: "Reset map bans",
      onConfirm: () => {
        setState((current) => {
          const key = current.valorant.bestOf === "Bo5" ? "bo5" : "bo3";
          return {
            ...current,
            valorant: { ...current.valorant, [key]: resetValorantVeto(current.valorant[key]) },
          };
        });
        notify("VALORANT map bans reset");
      },
    });
  }

  function updateValorantBo3(key: keyof ValorantBo3, value: string) {
    if (!String(key).startsWith("side") && value) {
      const duplicate = Object.entries(state.valorant.bo3).some(([candidateKey, candidateValue]) => (
        candidateKey !== key
        && !candidateKey.startsWith("side")
        && canonicalMapName(candidateValue) === canonicalMapName(value)
      ));
      if (duplicate) {
        notify("Each VALORANT map can only be used once in the veto");
        return;
      }
    }
    setState((current) => ({
      ...current,
      valorant: { ...current.valorant, bo3: { ...current.valorant.bo3, [key]: value } as ValorantBo3 },
    }));
  }

  function updateValorantBo5(key: keyof ValorantBo5, value: string) {
    if (!String(key).startsWith("side") && value) {
      const duplicate = Object.entries(state.valorant.bo5).some(([candidateKey, candidateValue]) => (
        candidateKey !== key
        && !candidateKey.startsWith("side")
        && canonicalMapName(candidateValue) === canonicalMapName(value)
      ));
      if (duplicate) {
        notify("Each VALORANT map can only be used once in the veto");
        return;
      }
    }
    setState((current) => ({
      ...current,
      valorant: { ...current.valorant, bo5: { ...current.valorant.bo5, [key]: value } as ValorantBo5 },
    }));
  }

  function updateMatch(matchIndex: number, patch: Partial<Match>) {
    setState((current) => {
      const matches = [...current.general.matches] as [Match, Match];
      matches[matchIndex] = { ...matches[matchIndex], ...patch };
      return { ...current, general: { ...current.general, matches } };
    });
  }

  function copyMatchTwoToOne() {
    setState((current) => {
      const copied = mergeMatch(current.general.matches[1]);
      const resolved = resolveLeague(copied.league);
      const matches: [Match, Match] = [copied, current.general.matches[1]];
      return {
        ...current,
        general: {
          ...current.general,
          eventName: resolved.eventName || current.general.eventName,
          matches,
        },
      };
    });
    notify("Match 2 copied to Match 1");
  }

  function updateTeam(matchIndex: number, teamKey: "team1" | "team2", patch: Partial<Team>) {
    setState((current) => {
      const matches = [...current.general.matches] as [Match, Match];
      matches[matchIndex] = {
        ...matches[matchIndex],
        [teamKey]: { ...matches[matchIndex][teamKey], ...patch },
      };
      return { ...current, general: { ...current.general, matches } };
    });
  }

  function updateTeamOverride(matchIndex: number, teamKey: "team1" | "team2", patch: Partial<TeamOverrides>) {
    setState((current) => {
      const matches = [...current.general.matches] as [Match, Match];
      const team = matches[matchIndex][teamKey];
      matches[matchIndex] = {
        ...matches[matchIndex],
        [teamKey]: { ...team, overrides: { ...team.overrides, ...patch } },
      };
      return { ...current, general: { ...current.general, matches } };
    });
  }

  function updateLeagueOverride(matchIndex: number, patch: Partial<LeagueOverrides>) {
    setState((current) => {
      const matches = [...current.general.matches] as [Match, Match];
      const match = matches[matchIndex];
      const league = {
        ...match.league,
        overrides: { ...match.league.overrides, ...patch },
      };
      const resolved = resolveLeague(league);
      const updatesEventName = Object.prototype.hasOwnProperty.call(patch, "eventName");
      const colored = applyLeagueColorsToTeams(match.team1, match.team2, resolved.primaryColor, resolved.secondaryColor);
      matches[matchIndex] = { ...match, ...colored, league };
      return {
        ...current,
        general: {
          ...current.general,
          eventName: matchIndex === 0 && updatesEventName ? resolved.eventName : current.general.eventName,
          matches,
        },
      };
    });
  }

  function resetLeagueOverrides(matchIndex: number) {
    requestConfirmation({
      title: `Reset Match ${matchIndex + 1} league overrides?`,
      description: "This restores the synced league name, event name, colors, region, season, and logo for this match. This cannot be undone.",
      confirmLabel: "Reset league overrides",
      onConfirm: () => {
        setState((current) => {
          const matches = [...current.general.matches] as [Match, Match];
          const match = matches[matchIndex];
          const previousResolved = resolveLeague(match.league);
          const league = { ...match.league, overrides: emptyLeagueOverrides() };
          const resolved = resolveLeague(league);
          const colored = applyLeagueColorsToTeams(match.team1, match.team2, resolved.primaryColor, resolved.secondaryColor);
          matches[matchIndex] = { ...match, ...colored, league };
          const shouldRestoreSourceEvent = matchIndex === 0
            && Boolean(match.league.overrides.eventName.trim())
            && current.general.eventName === previousResolved.eventName;
          return {
            ...current,
            general: {
              ...current.general,
              eventName: shouldRestoreSourceEvent ? resolved.eventName : current.general.eventName,
              matches,
            },
          };
        });
        notify(`Match ${matchIndex + 1} league overrides reset`);
      },
    });
  }

  function selectTeamColor(matchIndex: number, teamKey: "team1" | "team2", selectedColor: ColorSource) {
    setState((current) => {
      const matches = [...current.general.matches] as [Match, Match];
      const team = matches[matchIndex][teamKey];
      matches[matchIndex] = {
        ...matches[matchIndex],
        [teamKey]: { ...team, selectedColor, overrides: { ...team.overrides, color: "" } },
      };
      return { ...current, general: { ...current.general, matches } };
    });
  }

  function resetTeamOverrides(matchIndex: number, teamKey: "team1" | "team2") {
    const teamLabel = teamKey === "team1" ? "team 1" : "team 2";
    requestConfirmation({
      title: `Reset Match ${matchIndex + 1} ${teamLabel} overrides?`,
      description: "This restores the synced team name, shorthand, region, standing, logo, and primary color. This cannot be undone.",
      confirmLabel: "Reset team overrides",
      onConfirm: () => {
        updateTeam(matchIndex, teamKey, { selectedColor: "primary", overrides: emptyOverrides() });
        notify(`Match ${matchIndex + 1} ${teamLabel} overrides reset`);
      },
    });
  }

  function parseExcelPool(text: string, maximumRows: number) {
    const lines = text.replace(/\r/g, "").split("\n");
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    const cells = lines.length === 1 && lines[0]?.includes("\t")
      ? lines[0].split("\t")
      : lines.map((line) => line.split("\t")[0] ?? "");
    return cells.slice(0, maximumRows).map((cell) => cell.trim());
  }

  function applyExcelPool(division: DrawKey, poolIndex: number) {
    const definition = DRAW_DEFINITIONS[division];
    const entries = parseExcelPool(drawPasteText, definition.rows);
    if (!entries.some(Boolean)) {
      notify("Paste at least one team from Excel");
      return;
    }
    setState((current) => {
      const pool = { ...current.draws[division] };
      const slots = { ...current.drawSeeding[division].slots };
      for (let row = 0; row < definition.rows; row += 1) {
        const fieldKey = `P${poolIndex + 1}${row + 1}`;
        pool[fieldKey] = entries[row] ?? "";
        delete slots[fieldKey];
      }
      return {
        ...current,
        draws: { ...current.draws, [division]: pool },
        drawSeeding: { ...current.drawSeeding, [division]: { ...current.drawSeeding[division], slots } },
      };
    });
    setDrawPastePool(null);
    setDrawPasteText("");
    notify(`Pool ${String.fromCharCode(65 + poolIndex)} updated from Excel`);
  }

  function clearDrawPool(division: DrawKey, poolIndex: number) {
    const definition = DRAW_DEFINITIONS[division];
    const poolName = String.fromCharCode(65 + poolIndex);
    requestConfirmation({
      title: `Clear Pool ${poolName}?`,
      description: `This removes all ${definition.rows} entries from Pool ${poolName}. This cannot be undone.`,
      confirmLabel: "Clear pool",
      onConfirm: () => {
        setState((current) => {
          const pool = { ...current.draws[division] };
          const slots = { ...current.drawSeeding[division].slots };
          for (let row = 0; row < definition.rows; row += 1) {
            const fieldKey = `P${poolIndex + 1}${row + 1}`;
            pool[fieldKey] = "";
            delete slots[fieldKey];
          }
          return {
            ...current,
            draws: { ...current.draws, [division]: pool },
            drawSeeding: { ...current.drawSeeding, [division]: { ...current.drawSeeding[division], slots } },
          };
        });
        if (drawPastePool === poolIndex) {
          setDrawPastePool(null);
          setDrawPasteText("");
        }
        notify(`Pool ${poolName} cleared`);
      },
    });
  }

  function updateDrawSlot(division: DrawKey, fieldKey: string, value: string) {
    setState((current) => {
      const seeding = current.drawSeeding[division];
      const slots = { ...seeding.slots };
      const assigned = seeding.teams.find((team) => team.id === slots[fieldKey]);
      if (!assigned || assigned.name !== value) delete slots[fieldKey];
      return {
        ...current,
        draws: { ...current.draws, [division]: { ...current.draws[division], [fieldKey]: value } },
        drawSeeding: { ...current.drawSeeding, [division]: { ...seeding, slots } },
      };
    });
  }

  function placeSeededTeam(division: DrawKey, fieldKey: string, teamId: string) {
    setState((current) => {
      const seeding = current.drawSeeding[division];
      const team = seeding.teams.find((entry) => entry.id === teamId);
      if (!team) return current;
      const pool = { ...current.draws[division] };
      const slots = { ...seeding.slots };
      for (const key of Object.keys(pool)) {
        if (key !== fieldKey && (slots[key] === team.id || pool[key].trim() === team.name.trim())) {
          pool[key] = "";
          delete slots[key];
        }
      }
      pool[fieldKey] = team.name;
      slots[fieldKey] = team.id;
      return {
        ...current,
        draws: { ...current.draws, [division]: pool },
        drawSeeding: { ...current.drawSeeding, [division]: { ...seeding, slots } },
      };
    });
  }

  async function importSeedingFile(division: DrawKey, file: File) {
    const parsed = parseSeedingCsv(await file.text());
    if (parsed.error) {
      notify(parsed.error);
      return;
    }
    const label = DRAW_DEFINITIONS[division].label;
    const teams = applyTierSeedOffset(division, parsed.teams);
    setState((current) => {
      const previous = current.drawSeeding[division];
      const slots: Record<string, string> = {};
      for (const [key, id] of Object.entries(previous.slots)) {
        const team = teams.find((entry: SeededTeam) => entry.id === id);
        if (team && current.draws[division][key]?.trim() === team.name.trim()) slots[key] = id;
      }
      return {
        ...current,
        drawSeeding: {
          ...current.drawSeeding,
          [division]: { teams, slots },
        },
      };
    });
    notify(`${label} teams are in Imported teams. Draw files update when a team is placed.`);
  }

  function clearSeedingFile(division: DrawKey) {
    const label = DRAW_DEFINITIONS[division].label;
    requestConfirmation({
      title: `Clear the ${label} CSV?`,
      description: `This removes the imported seed list for ${label}. Names already placed in pools stay, without their team IDs.`,
      confirmLabel: "Clear CSV",
      onConfirm: () => {
        setState((current) => ({
          ...current,
          drawSeeding: {
            ...current.drawSeeding,
            [division]: { teams: [], slots: {} },
          },
        }));
        notify(`${label} seed list cleared`);
      },
    });
  }

  function divisionGroupCsv(division: DrawKey) {
    const definition = DRAW_DEFINITIONS[division];
    return serializeByGroupCsv(buildByGroupExport(
      definition.pools,
      definition.rows,
      state.draws[division],
      state.drawSeeding[division].teams,
      state.drawSeeding[division].slots,
    ));
  }

  function exportDivisionSeeding(division: DrawKey) {
    downloadTextFile(`seeding-${division}.csv`, divisionGroupCsv(division));
    notify(`${DRAW_DEFINITIONS[division].label} group list downloaded`);
  }

  function exportSeeding() {
    const files = (Object.keys(DRAW_DEFINITIONS) as DrawKey[]).map((key) => ({
      filename: `seeding-${key}.csv`,
      text: divisionGroupCsv(key),
    }));
    downloadStoredPackage(files, "draw-seeding.zip");
    notify("Group lists downloaded");
  }

  function updateSponsor(index: number, patch: Partial<Sponsor>) {
    setState((current) => {
      if (current.sponsors[index]?.id === GAMING_OASIS_SPONSOR.id) return current;
      const sponsors = [...current.sponsors];
      sponsors[index] = { ...sponsors[index], ...patch };
      return { ...current, sponsors };
    });
  }

  async function exportAll() {
    if (exporting) return;
    setExporting(true);
    try {
      if (typeof (window as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker !== "function") {
        downloadJsonPackage(await prepareMapExport(manualExportFiles));
        notify("JSON recovery package downloaded with map artwork — unzip all files into one folder");
        return;
      }
      if (await writeFilesToFolder(manualExportFiles) === "folder") {
        notify("7 JSON files and generated map artwork written to your selected folder");
        return;
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      notify(`${(error as Error).message}. Check any files already written, then retry.`);
      return;
    } finally {
      setExporting(false);
    }
  }

  function updateValorantMapArtwork(index: number, key: "name" | "nextMap" | "pickCard" | "banCard", value: string) {
    const oldName = state.valorantMapData.maps[index]?.name ?? "";
    if (key === "name") {
      const normalized = canonicalMapName(value);
      const duplicate = state.valorantMapData.maps.some((map, mapIndex) => mapIndex !== index && canonicalMapName(map.name) === normalized);
      if (!normalized || duplicate) {
        notify(!normalized ? "Map names cannot be blank" : "Map names must be unique");
        return;
      }
    }
    setState((current) => {
      const rename = (selection: Record<string, string>) => Object.fromEntries(
        Object.entries(selection).map(([selectionKey, selectionValue]) => [
          selectionKey,
          key === "name" && !selectionKey.startsWith("side") && canonicalMapName(selectionValue) === canonicalMapName(oldName) ? value : selectionValue,
        ]),
      );
      return {
        ...current,
        valorant: key === "name" ? {
          ...current.valorant,
          bo3: rename(current.valorant.bo3) as ValorantBo3,
          bo5: rename(current.valorant.bo5) as ValorantBo5,
        } : current.valorant,
        valorantMapData: {
          maps: current.valorantMapData.maps.map((map, mapIndex) => mapIndex === index ? { ...map, [key]: value } : map),
        },
      };
    });
  }

  function applyDetectedLogoBackground(matchIndex: number, teamKey: "team1" | "team2", source: string, logoBackground: string) {
    setState((current) => {
      const matches = [...current.general.matches] as [Match, Match];
      const team = matches[matchIndex][teamKey];
      if (displayLogoUrl(resolveTeam(team).logo) !== source) return current;
      matches[matchIndex] = { ...matches[matchIndex], [teamKey]: { ...team, logoBackground } };
      return { ...current, general: { ...current.general, matches } };
    });
  }

  function addValorantMap() {
    if (state.valorantMapData.maps.length >= 32) {
      notify("The VALORANT map pool supports up to 32 maps");
      return;
    }
    let suffix = state.valorantMapData.maps.length + 1;
    while (state.valorantMapData.maps.some((map) => canonicalMapName(map.name) === canonicalMapName(`Custom Map ${suffix}`))) suffix += 1;
    setState((current) => ({
      ...current,
      valorantMapData: {
        maps: current.valorantMapData.maps.length >= 32 ? current.valorantMapData.maps : [
          ...current.valorantMapData.maps,
          { name: `Custom Map ${suffix}`, nextMap: "", pickCard: "", banCard: "" },
        ],
      },
    }));
  }

  function removeValorantMap(index: number) {
    const map = state.valorantMapData.maps[index];
    if (!map) return;
    if (state.valorantMapData.maps.length <= 1) {
      notify("The VALORANT map pool must contain at least one map");
      return;
    }
    requestConfirmation({
      title: `Remove ${map.name}?`,
      description: "This removes the map from the VALORANT pool and clears any existing veto selections that use it. This cannot be undone.",
      confirmLabel: "Remove map",
      onConfirm: () => {
        setState((current) => {
          const clearSelection = (selection: Record<string, string>) => Object.fromEntries(
            Object.entries(selection).map(([selectionKey, selectionValue]) => [
              selectionKey,
              !selectionKey.startsWith("side") && canonicalMapName(selectionValue) === canonicalMapName(map.name) ? "" : selectionValue,
            ]),
          );
          return {
            ...current,
            valorant: {
              ...current.valorant,
              bo3: clearSelection(current.valorant.bo3) as ValorantBo3,
              bo5: clearSelection(current.valorant.bo5) as ValorantBo5,
            },
            valorantMapData: {
              maps: current.valorantMapData.maps.filter((_, mapIndex) => mapIndex !== index),
            },
          };
        });
      },
    });
  }

  function resetValorantMapPool() {
    requestConfirmation({
      title: "Reset the VALORANT map pool?",
      description: "This restores the full standard map library and automatic source images, centers all focal points, regenerates artwork, removes custom maps, and clears veto selections for removed maps. This cannot be undone.",
      confirmLabel: "Reset map pool",
      onConfirm: () => {
        void mapLibrary.resetDefaults((maps) => {
          const defaultNames = new Set(maps.map((map) => canonicalMapName(map.name)));
          setState((current) => ({
            ...current,
            valorant: {
              ...current.valorant,
              bo3: Object.fromEntries(Object.entries(current.valorant.bo3).map(([key, value]) => [key, key.startsWith("side") || !value || defaultNames.has(canonicalMapName(value)) ? value : ""])) as ValorantBo3,
              bo5: Object.fromEntries(Object.entries(current.valorant.bo5).map(([key, value]) => [key, key.startsWith("side") || !value || defaultNames.has(canonicalMapName(value)) ? value : ""])) as ValorantBo5,
            },
            valorantMapData: { maps },
          }));
          notify("VALORANT map pool reset to default");
        });
      },
    });
  }

  function resetLocalData() {
    matchRequestRef.current.forEach((request) => {
      request.sequence += 1;
      request.controller?.abort();
      request.controller = null;
    });
    const fresh = clearProductionData(stateRef.current, createInitialState()) as ProductionState;
    hydratedStateRef.current = fresh;
    stateRef.current = fresh;
    outputActivatedRef.current = true;
    setOutputActivated(true);
    setState(fresh);
    setConnection("idle");
    setSyncingMatch(null);
    setActiveSection("welcome");
    setResetConfirmationOpen(false);
    notify("Entered production data cleared; settings preserved");
  }

  async function syncMatch(matchIndex: number) {
    const match = state.general.matches[matchIndex];
    if (!match.id.trim()) {
      notify("Enter a League Hub match ID");
      return;
    }

    const requestedId = match.id.trim();
    const requestState = matchRequestRef.current[matchIndex];
    requestState.controller?.abort();
    const controller = new AbortController();
    const sequence = requestState.sequence + 1;
    requestState.sequence = sequence;
    requestState.controller = controller;
    const timeout = window.setTimeout(() => controller.abort("timeout"), 10_000);
    setSyncingMatch(matchIndex);
    try {
      const response = await fetch(`${MATCH_LOOKUP_ENDPOINT}/${encodeURIComponent(requestedId)}`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({})) as { error?: string | { message?: string } };
        const message = typeof failure.error === "string" ? failure.error : failure.error?.message;
        throw new Error(message || `Match lookup failed (${response.status})`);
      }
      const json = (await response.json()) as Record<string, unknown>;
      const matchData = (json.match && typeof json.match === "object" ? json.match : {}) as Record<string, unknown>;
      const standings = (json.standings && typeof json.standings === "object" ? json.standings : {}) as Record<string, unknown>;
      const event = (json.event && typeof json.event === "object" ? json.event : {}) as Record<string, unknown>;
      if (!matchData.team1 || typeof matchData.team1 !== "object" || !matchData.team2 || typeof matchData.team2 !== "object") {
        throw new Error("League Hub response did not include both teams");
      }
      if (matchRequestRef.current[matchIndex].sequence !== sequence) return;
      const gameTitle = typeof event.gameTitle === "string" ? event.gameTitle : "";
      const leagueSource = normalizeLeague(json.league, event);
      setState((current) => {
        if (matchRequestRef.current[matchIndex].sequence !== sequence || current.general.matches[matchIndex].id.trim() !== requestedId) return current;
        const matches = [...current.general.matches] as [Match, Match];
        const currentMatch = current.general.matches[matchIndex];
        const existingOverrides = currentMatch.league.overrides;
        const league = { ...leagueSource, overrides: { ...existingOverrides } };
        const resolved = resolveLeague(league);
        const team1 = mergeSyncedTeam(currentMatch.team1, normalizeTeam(matchData.team1, standings.team1, {
          primaryColor: resolved.primaryColor,
          secondaryColor: resolved.secondaryColor,
        }, gameTitle));
        const team2 = mergeSyncedTeam(currentMatch.team2, normalizeTeam(matchData.team2, standings.team2, {
          primaryColor: resolved.primaryColor,
          secondaryColor: resolved.secondaryColor,
        }, gameTitle));
        matches[matchIndex] = applyMatchLookupResult(currentMatch, { requestedId, league, team1, team2 }) as Match;
        return {
          ...current,
          general: {
            ...current.general,
            eventName: matchIndex === 0
              ? (resolved.eventName || current.general.eventName)
              : current.general.eventName,
            matches,
          },
        };
      });
      if (
        matchRequestRef.current[matchIndex].sequence === sequence
        && stateRef.current.general.matches[matchIndex].id.trim() === requestedId
      ) {
        setConnection("connected");
        notify(`Match ${matchIndex + 1} synced from League Hub`);
      } else if (matchRequestRef.current[matchIndex].sequence === sequence) {
        setConnection("idle");
      }
    } catch (error) {
      if (matchRequestRef.current[matchIndex].sequence !== sequence) return;
      if (stateRef.current.general.matches[matchIndex].id.trim() !== requestedId) {
        setConnection("idle");
        return;
      }
      setConnection("error");
      const timedOut = controller.signal.aborted && controller.signal.reason === "timeout";
      notify(timedOut ? "League Hub sync timed out — try again" : (error as Error).message || "Match sync failed - verify the match ID");
    } finally {
      window.clearTimeout(timeout);
      if (matchRequestRef.current[matchIndex].sequence === sequence) {
        matchRequestRef.current[matchIndex].controller = null;
        setSyncingMatch(null);
      }
    }
  }

  const sectionLabels: Record<Section, string> = {
    welcome: "Welcome",
    general: "General info",
    matches: "Team Info",
    rocketLeague: "Rocket League",
    valorant: "VALORANT",
    leagueOfLegends: "League of Legends",
    sponsors: "Sponsors",
    draw: "Draw show",
    settings: "Settings",
  };

  const navItems: { key: Section; label: string }[] = [
    { key: "welcome", label: "Welcome" },
    ...(state.settings.generalInfoEnabled ? [{ key: "general" as Section, label: "General info" }] : []),
    { key: "matches", label: "Team Info" },
    ...(state.settings.rocketLeagueEnabled ? [{ key: "rocketLeague" as Section, label: "Rocket League" }] : []),
    ...(state.settings.valorantEnabled ? [{ key: "valorant" as Section, label: "VALORANT" }] : []),
    ...(state.settings.leagueOfLegendsEnabled ? [{ key: "leagueOfLegends" as Section, label: "League of Legends" }] : []),
    ...(state.settings.sponsorsEnabled ? [{ key: "sponsors" as Section, label: "Sponsors" }] : []),
    ...(state.settings.drawShowEnabled ? [{ key: "draw" as Section, label: "Draw show" }] : []),
    { key: "settings", label: "Settings" },
  ];
  const visibleSection = sectionEnabled(activeSection, state.settings) ? activeSection : "welcome";

  function goToSection(section: Section) {
    setActiveSection(sectionEnabled(section, state.settings) ? section : "welcome");
  }

  function renderProductionDefaults() {
    return <section className="panel-card settings-card" aria-label="Production defaults">
      <div className="settings-card-copy"><h2>Production defaults</h2><p>Apply a preset to all three games. Match data and entered statistics are preserved.</p></div>
      <div className="settings-rows">
        {([true, false] as const).map(conferences => {
          const aligned = matchesProductionDefaults(state, conferences);
          const label = conferences ? "Gaming Oasis Conferences production Defaults" : "Standard (Recommended Default)";
          return <div className="setting-row" key={label}>
            <div><strong>{label}</strong><p role="status">{aligned ? "✓ Current settings match" : "Current settings differ"}</p></div>
            <button className="button secondary" type="button" aria-label={`Apply ${label}`} disabled={aligned} onClick={() => {
              setState(current => applyProductionDefaults(current, conferences) as ProductionState);
              notify(conferences ? "Conference production defaults applied" : "Recommended defaults applied");
            }}>{aligned ? "Applied" : "Apply defaults"}</button>
          </div>;
        })}
      </div>
    </section>;
  }

  function renderWelcome() {
    const readiness = [
      state.settings.generalInfoEnabled ? Boolean(state.general.eventName) : null,
      filledMatches > 0,
      state.settings.rocketLeagueEnabled ? rocketLeagueReady : null,
      state.settings.valorantEnabled ? valorantReady : null,
      state.settings.sponsorsEnabled ? filledSponsors > 0 : null,
    ].filter((value): value is boolean => value !== null);
    const readyCount = readiness.filter(Boolean).length;
    return (
      <div className="page-stack welcome-page">
        <SectionHeading
          eyebrow="Production workspace"
          title="Welcome"
          description="Prepare the show, verify the required data, and export the vMix files from one local workspace."
        />

        {renderProductionDefaults()}
        <section className="welcome-overview panel-card">
          <div className="overview-heading">
            <div><h2>Show setup</h2><p>Complete the items needed for this broadcast.</p></div>
            <strong>{readyCount} of {readiness.length} ready</strong>
          </div>
          <div className="setup-list">
            {state.settings.generalInfoEnabled ? <button onClick={() => { goToSection("general"); setGeneralTab("talent"); }}><span className={state.general.eventName ? "complete" : ""} aria-hidden="true" /><div><strong>Event details</strong><small>{state.general.eventName || "Not configured"}</small></div><b>Open</b></button> : null}
            <button onClick={() => goToSection("matches")}><span className={filledMatches ? "complete" : ""} aria-hidden="true" /><div><strong>Team Info</strong><small>{filledMatches ? `${filledMatches} match${filledMatches === 1 ? "" : "es"} ready` : "No complete matches"}</small></div><b>Open</b></button>
            {state.settings.rocketLeagueEnabled ? <button onClick={() => goToSection("rocketLeague")}><span className={rocketLeagueReady ? "complete" : ""} aria-hidden="true" /><div><strong>Rocket League</strong><small>{rocketLeagueReady ? `${state.rocketLeague.bestOf} · ${rocketLeagueSeries.completedGames} games entered` : "Event name / header not configured"}</small></div><b>Open</b></button> : null}
            {state.settings.valorantEnabled ? <button onClick={() => goToSection("valorant")}><span className={valorantReady ? "complete" : ""} aria-hidden="true" /><div><strong>VALORANT</strong><small>{valorantReady ? `${state.valorant.bestOf} · ${valorantSeries.completedGames} maps entered` : "Event name / header not configured"}</small></div><b>Open</b></button> : null}
            {state.settings.sponsorsEnabled ? <button onClick={() => goToSection("sponsors")}><span className={filledSponsors ? "complete" : ""} aria-hidden="true" /><div><strong>Sponsors</strong><small>{filledSponsors ? `${filledSponsors} configured` : "No sponsors configured"}</small></div><b>Open</b></button> : null}
          </div>
        </section>

        <section className="activity-strip">
          <div><span className={`status-dot ${liveSync === "synced" ? "live" : ""}`} /><p><strong>Live JSON</strong>{liveSyncLongLabel(liveSync)}</p></div>
          <div><span className={`status-dot ${connection === "connected" ? "live" : ""}`} /><p><strong>League Hub</strong>{connection === "connected" ? "Match data synced" : connection === "error" ? "Last sync failed" : "Ready for a match ID"}</p></div>
          <div><span className="status-dot live" /><p><strong>Output folder</strong>Local JSONs directory</p></div>
        </section>
      </div>
    );
  }

  function renderGeneral() {
    const matchOneLeague = resolveLeague(state.general.matches[0].league);
    return (
      <div className="page-stack">
        <SectionHeading
          eyebrow={activeSection === "matches" ? "League Hub match data" : "Show setup"}
          title={activeSection === "matches" ? "Team Info" : "General information"}
          description={activeSection === "matches" ? "Sync match data, verify team outputs, and apply production overrides." : "Manage event details, on-air talent, and rundown copy. Every change updates the local vMix JSON files."}
        />
        {activeSection === "general" ? <div className="tabs" role="tablist" aria-label="General information views" onKeyDown={handleTabListKeyDown}>
          {(["talent", "segments"] as const).map((tab) => (
            <button role="tab" aria-selected={generalTab === tab} tabIndex={generalTab === tab ? 0 : -1} key={tab} className={generalTab === tab ? "active" : ""} onClick={() => setGeneralTab(tab)}>
              {tab === "talent" ? "Talent & stream" : "Podcast Run of Show"}
            </button>
          ))}
        </div> : null}

        {activeSection === "matches" ? (
            <div className="match-stack">
              {state.general.matches.map((match, matchIndex) => {
                const firstFinal = resolveTeam(match.team1);
                const secondFinal = resolveTeam(match.team2);
                const similarity = colorSimilarity(firstFinal.color, secondFinal.color);
                const league = match.league;
                const resolvedLeague = resolveLeague(league);
                const leagueLogoPreview = displayLogoUrl(resolvedLeague.logo);
                const sourceLogoPreview = displayLogoUrl(league.logo);
                const leaguePrimaryColorInvalid = Boolean(league.overrides.primaryColor.trim() && !normalizeHexColor(league.overrides.primaryColor));
                const leagueSecondaryColorInvalid = Boolean(league.overrides.secondaryColor.trim() && !normalizeHexColor(league.overrides.secondaryColor));
                const leaguePrimaryColorErrorId = `match-${matchIndex + 1}-league-primary-color-error`;
                const leagueSecondaryColorErrorId = `match-${matchIndex + 1}-league-secondary-color-error`;
                return (
                <section className="panel-card match-card" key={matchIndex}>
                  <div className="card-title-row">
                    <div><h2>Match {matchIndex + 1}</h2></div>
                    <div className={`match-sync ${matchIndex === 1 ? "with-copy" : ""}`}>
                      {matchIndex === 1 ? (
                        <button className="button compact copy-match-button" type="button" onClick={copyMatchTwoToOne} disabled={syncingMatch !== null}>
                          Copy to Match 1
                        </button>
                      ) : null}
                       <input disabled={syncingMatch === matchIndex} aria-label={`Match ${matchIndex + 1} ID`} value={match.id} onChange={(event) => { updateMatch(matchIndex, { id: event.target.value }); setConnection("idle"); }} placeholder="League Hub match ID" />
                       <button className="button compact" aria-busy={syncingMatch === matchIndex} onClick={() => syncMatch(matchIndex)} disabled={syncingMatch !== null}>
                        {syncingMatch === matchIndex ? "Syncing..." : "Sync from hub"}
                      </button>
                    </div>
                  </div>
                  <div className="team-grid">
                    {(["team1", "team2"] as const).map((teamKey, teamIndex) => {
                      const team = match[teamKey];
                      const resolved = resolveTeam(team);
                      const colors: Record<ColorSource, string> = {
                        primary: team.color,
                        alternate: team.alternateColor,
                        backup1: team.backupColor1,
                        backup2: team.backupColor2,
                      };
                      const previewLogo = displayLogoUrl(resolved.logo);
                      const customColorInvalid = Boolean(team.overrides.color.trim() && !normalizeHexColor(team.overrides.color));
                      const customColorActive = Boolean(normalizeHexColor(team.overrides.color));
                      const customColorErrorId = `match-${matchIndex + 1}-team-${teamIndex + 1}-custom-color-error`;
                      const outputColorLabelId = `match-${matchIndex + 1}-team-${teamIndex + 1}-output-color-label`;
                      const logoBackgroundOverride = normalizeLogoBackground(team.overrides.logoBackground);
                      const nameNeedsOverride = resolved.name.trim().length > TEAM_NAME_LIMIT;
                      const productionSourceName = shortTeamName(team.sourceName || team.name);
                      return (
                        <div className="team-editor" key={teamKey}>
                          <div className="team-editor-title">
                            <span className="team-logo-preview" style={{ borderColor: safeColor(resolved.color), backgroundColor: resolved.logoBackground }}>
                              {resolved.logo ? <img src={previewLogo} crossOrigin={previewLogo !== resolved.logo ? "anonymous" : undefined} alt="" onLoad={(event) => { const background = detectLogoBackground(event.currentTarget); if (background) applyDetectedLogoBackground(matchIndex, teamKey, previewLogo, background); }} /> : resolved.name.slice(0, 2).toUpperCase() || `T${teamIndex + 1}`}
                            </span>
                            <div><small>Team {teamIndex + 1} final output</small><strong>{resolved.name || "Awaiting team"}</strong></div>
                            <button className="override-reset" type="button" onClick={() => resetTeamOverrides(matchIndex, teamKey)}>Reset overrides</button>
                          </div>
                          <div className="source-data">
                            <span>Hub source</span>
                            <p><strong>{team.sourceName || team.name || "No team loaded"}</strong><small>{team.placement || "No placement"} · {team.standing || "No standing"} · {team.seed || "No seed"}</small></p>
                          </div>
                          <div className="override-field-group">
                            <span className="field-label">Standing display <small>{resolved.standing || "No value available"}</small></span>
                            <div className="standing-display-options">
                              <button type="button" className={team.standingDisplay === "placement" ? "selected" : ""} aria-pressed={team.standingDisplay === "placement"} disabled={!team.placement} onClick={() => updateTeam(matchIndex, teamKey, { standingDisplay: "placement" })}><span>Placement</span><small>{team.placement || "Unavailable"}</small></button>
                              <button type="button" className={team.standingDisplay === "standing" ? "selected" : ""} aria-pressed={team.standingDisplay === "standing"} disabled={!team.standing} onClick={() => updateTeam(matchIndex, teamKey, { standingDisplay: "standing" })}><span>Standing</span><small>{team.standing || "Unavailable"}</small></button>
                              <button type="button" className={team.standingDisplay === "seed" ? "selected" : ""} aria-pressed={team.standingDisplay === "seed"} disabled={!team.seed} onClick={() => updateTeam(matchIndex, teamKey, { standingDisplay: "seed" })}><span>Seed</span><small>{team.seed || "Unavailable"}</small></button>
                            </div>
                          </div>
                          <div className="form-grid two override-grid">
                            <Field label="Name override" value={team.overrides.name} onChange={(value) => updateTeamOverride(matchIndex, teamKey, { name: value })} maxLength={TEAM_NAME_LIMIT} placeholder={nameNeedsOverride ? `Override required — maximum ${TEAM_NAME_LIMIT} characters` : productionSourceName || "Team name"} attention={nameNeedsOverride ? `Override required: final name is ${resolved.name.trim().length} characters; maximum is ${TEAM_NAME_LIMIT}.` : undefined} />
                            <Field label="Standing override" value={team.overrides.standing} onChange={(value) => updateTeamOverride(matchIndex, teamKey, { standing: value })} placeholder={resolved.standing || "3rd or 0-1"} />
                            <div className="wide-field"><Field label="Logo URL override" value={team.overrides.logo} onChange={(value) => updateTeamOverride(matchIndex, teamKey, { logo: value })} placeholder={team.logo || "https://..."} /></div>
                          </div>
                          <div className="override-field-group">
                            <span className="field-label" id={outputColorLabelId}>Output color</span>
                            <div className="color-options" role="group" aria-labelledby={outputColorLabelId}>
                              {COLOR_OPTIONS.map((option) => {
                                const selected = team.selectedColor === option.key && !customColorActive;
                                return <button type="button" key={option.key} className={selected ? "selected" : ""} aria-pressed={selected} onClick={() => selectTeamColor(matchIndex, teamKey, option.key)}><i style={{ backgroundColor: safeColor(colors[option.key]) }} /><span>{option.label}</span><small>{colors[option.key]}</small></button>;
                              })}
                            </div>
                          </div>
                          <div className="form-grid two color-override-grid">
                            <label className="field"><span className="field-label">Custom color override</span><div className="color-field"><input aria-label={`Match ${matchIndex + 1} team ${teamIndex + 1} custom color`} type="color" value={safeColor(normalizeHexColor(team.overrides.color) || resolved.color, "#F6AC18")} onChange={(event) => updateTeamOverride(matchIndex, teamKey, { color: event.target.value })} /><input aria-label={`Match ${matchIndex + 1} team ${teamIndex + 1} custom color hex`} aria-invalid={customColorInvalid || undefined} aria-describedby={customColorInvalid ? customColorErrorId : undefined} value={team.overrides.color} onChange={(event) => updateTeamOverride(matchIndex, teamKey, { color: event.target.value })} placeholder="Optional #RRGGBB" maxLength={7} /></div>{customColorInvalid ? <span className="field-error" id={customColorErrorId}>Use a complete #RRGGBB value</span> : null}</label>
                            <div className="field"><span className="field-label">Logo background <small>{logoBackgroundOverride ? "Manual" : `Auto · ${resolved.logoBackground === IMAGE_PLATE_DARK ? "Navy" : "White"}`}</small></span><div className="logo-background-options"><button type="button" className={!logoBackgroundOverride ? "selected" : ""} aria-pressed={!logoBackgroundOverride} onClick={() => updateTeamOverride(matchIndex, teamKey, { logoBackground: "" })}>Auto</button><button type="button" className={logoBackgroundOverride === IMAGE_PLATE_LIGHT ? "selected" : ""} aria-pressed={logoBackgroundOverride === IMAGE_PLATE_LIGHT} onClick={() => updateTeamOverride(matchIndex, teamKey, { logoBackground: IMAGE_PLATE_LIGHT })}><i className="white" />White</button><button type="button" className={logoBackgroundOverride === IMAGE_PLATE_DARK ? "selected" : ""} aria-pressed={logoBackgroundOverride === IMAGE_PLATE_DARK} onClick={() => updateTeamOverride(matchIndex, teamKey, { logoBackground: IMAGE_PLATE_DARK })}><i className="navy" />Navy</button></div></div>
                          </div>
                          <div className="final-output-line"><span>Final</span><strong>{resolved.name || "No team"}</strong><small>{resolved.standing || "No standing"}</small><code style={{ borderColor: safeColor(resolved.color) }}>{resolved.color}</code></div>
                        </div>
                      );
                    })}
                  </div>
                  <div className={`color-comparison ${similarity !== null && similarity > 80 ? "warning" : ""}`}>
                    <div><span style={{ backgroundColor: safeColor(firstFinal.color) }} /><p><strong>{firstFinal.name || "Team 1"}</strong><small>{firstFinal.color}</small></p></div>
                    <b>vs</b>
                    <div><span style={{ backgroundColor: safeColor(secondFinal.color) }} /><p><strong>{secondFinal.name || "Team 2"}</strong><small>{secondFinal.color}</small></p></div>
                    <p className="similarity-result"><span>Color comparison</span><strong>{similarity === null ? "Check colors" : `${similarity}% similar`}</strong><small>{similarity === null ? "Enter valid hex colors" : similarity > 80 ? "Too similar - choose an alternate" : "Good separation"}</small></p>
                  </div>
                  <div className="league-info">
                    <div className="team-editor-title">
                      <span className="team-logo-preview league-logo-preview" style={{ borderColor: safeColor(resolvedLeague.primaryColor) }}>
                        {resolvedLeague.logo
                          ? <img src={leagueLogoPreview} crossOrigin={leagueLogoPreview !== resolvedLeague.logo ? "anonymous" : undefined} alt="" />
                          : (resolvedLeague.name || "LG").slice(0, 2).toUpperCase()}
                      </span>
                      <div><small>League info</small><strong>{resolvedLeague.name || "Awaiting league"}</strong></div>
                      <button className="override-reset" type="button" onClick={() => resetLeagueOverrides(matchIndex)}>Reset league overrides</button>
                    </div>
                    <div className="source-data league-source-data">
                      <span>Hub source</span>
                      <p>
                        <strong>{league.name || "No league loaded"}</strong>
                        <small>
                          {league.eventName || "No event"}
                          {" · "}
                          <i style={{ backgroundColor: safeColor(league.primaryColor) }} />
                          {league.primaryColor}
                          {" · "}
                          <i style={{ backgroundColor: safeColor(league.secondaryColor) }} />
                          {league.secondaryColor}
                          {league.logo ? " · Logo synced" : " · No logo"}
                        </small>
                      </p>
                      {league.logo ? <img className="league-source-logo" src={sourceLogoPreview} crossOrigin={sourceLogoPreview !== league.logo ? "anonymous" : undefined} alt="" /> : null}
                    </div>
                    <div className="form-grid two override-grid">
                      <Field label="League name override" value={league.overrides.name} onChange={(value) => updateLeagueOverride(matchIndex, { name: value })} placeholder={league.name || "League name"} />
                      <Field label="Event name override" value={league.overrides.eventName} onChange={(value) => updateLeagueOverride(matchIndex, { eventName: value })} placeholder={league.eventName || "Event name"} />
                      <div className="wide-field"><Field label="League logo URL override" value={league.overrides.logo} onChange={(value) => updateLeagueOverride(matchIndex, { logo: value })} placeholder={league.logo || "https://..."} /></div>
                    </div>
                    <div className="form-grid two color-override-grid">
                      <label className="field">
                        <span className="field-label">Primary color override</span>
                        <div className="color-field">
                          <input aria-label={`Match ${matchIndex + 1} league primary color`} type="color" value={safeColor(normalizeHexColor(league.overrides.primaryColor) || resolvedLeague.primaryColor, "#F6AC18")} onChange={(event) => updateLeagueOverride(matchIndex, { primaryColor: event.target.value })} />
                          <input aria-label={`Match ${matchIndex + 1} league primary color hex`} aria-invalid={leaguePrimaryColorInvalid || undefined} aria-describedby={leaguePrimaryColorInvalid ? leaguePrimaryColorErrorId : undefined} value={league.overrides.primaryColor} onChange={(event) => updateLeagueOverride(matchIndex, { primaryColor: event.target.value })} placeholder={league.primaryColor || "#RRGGBB"} maxLength={7} />
                        </div>
                        {leaguePrimaryColorInvalid ? <span className="field-error" id={leaguePrimaryColorErrorId}>Use a complete #RRGGBB value</span> : null}
                      </label>
                      <label className="field">
                        <span className="field-label">Secondary color override</span>
                        <div className="color-field">
                          <input aria-label={`Match ${matchIndex + 1} league secondary color`} type="color" value={safeColor(normalizeHexColor(league.overrides.secondaryColor) || resolvedLeague.secondaryColor, "#47213F")} onChange={(event) => updateLeagueOverride(matchIndex, { secondaryColor: event.target.value })} />
                          <input aria-label={`Match ${matchIndex + 1} league secondary color hex`} aria-invalid={leagueSecondaryColorInvalid || undefined} aria-describedby={leagueSecondaryColorInvalid ? leagueSecondaryColorErrorId : undefined} value={league.overrides.secondaryColor} onChange={(event) => updateLeagueOverride(matchIndex, { secondaryColor: event.target.value })} placeholder={league.secondaryColor || "#RRGGBB"} maxLength={7} />
                        </div>
                        {leagueSecondaryColorInvalid ? <span className="field-error" id={leagueSecondaryColorErrorId}>Use a complete #RRGGBB value</span> : null}
                      </label>
                    </div>
                    <div className="final-output-line league-final-line">
                      <span>Final</span>
                      <strong>{resolvedLeague.name || "No league"}</strong>
                      <small>{resolvedLeague.eventName || "No event"}</small>
                      <code style={{ borderColor: safeColor(resolvedLeague.primaryColor) }}>{resolvedLeague.primaryColor}</code>
                      <code style={{ borderColor: safeColor(resolvedLeague.secondaryColor) }}>{resolvedLeague.secondaryColor}</code>
                    </div>
                  </div>
                </section>
                );
              })}
            </div>
        ) : null}

        {activeSection === "general" && generalTab === "talent" ? (
          <div className="talent-layout">
            <section className="panel-card">
              <div className="card-title-row"><div><h2>On-air talent</h2></div></div>
              <div className="form-grid two">
                <Field label="Main caster" value={state.general.mainCaster} onChange={(value) => updateGeneral("mainCaster", value)} maxLength={16} placeholder="Caster name" />
                <Field label="Second caster" value={state.general.secondCaster} onChange={(value) => updateGeneral("secondCaster", value)} maxLength={16} placeholder="Caster name" />
                <Field label="Guest 1" value={state.general.guest1} onChange={(value) => updateGeneral("guest1", value)} maxLength={16} placeholder="Guest name" />
                <Field label="Guest 2" value={state.general.guest2} onChange={(value) => updateGeneral("guest2", value)} maxLength={16} placeholder="Guest name" />
                <Field label="Main social" value={state.general.mainCasterSocial} onChange={(value) => updateGeneral("mainCasterSocial", value)} maxLength={15} placeholder="@handle" />
                <Field label="Secondary social" value={state.general.secondaryCasterSocial} onChange={(value) => updateGeneral("secondaryCasterSocial", value)} maxLength={15} placeholder="@handle" />
              </div>
              <div className="preset-list">
                <span className="preset-title">Caster presets — saved on this workstation only</span>
                {(["main", "second"] as const).map((slot) => {
                  const slotLabel = slot === "main" ? "Main caster" : "Second caster";
                  return (
                    <div className="preset-row" key={slot}>
                      <span><strong>{slotLabel}</strong><small>{casterPresets.length ? "Select a saved preset" : "No presets saved"}</small></span>
                      <select aria-label={`${slotLabel} preset`} value={casterPresetSelection[slot]} onChange={(event) => applyCasterPreset(slot, event.target.value)}>
                        <option value="">Select preset</option>
                        {casterPresets.map((preset) => <option key={preset.name} value={preset.name}>{preset.name}</option>)}
                      </select>
                      <div className="preset-actions">
                        <button className="button secondary" type="button" onClick={() => saveCasterPreset(slot)}>Save preset</button>
                        <button className="button danger" type="button" disabled={!findCasterPreset(casterPresets, casterPresetSelection[slot])} onClick={() => removeCasterPresetAction(slot)}>Remove</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
            <section className="panel-card">
              <div className="card-title-row"><div><h2>Stream copy</h2></div></div>
              <div className="form-grid">
                <Field
                  label="Event name"
                  value={state.general.eventName}
                  onChange={(value) => updateGeneral("eventName", value)}
                  placeholder="Spring Invitational"
                  hint="Pulled from Match 1 in Team Info and used by Rocket League, VALORANT, and League of Legends."
                />
                <Field label="Starting soon title" value={state.general.startingSoonTitle} onChange={(value) => updateGeneral("startingSoonTitle", value)} placeholder="THE STREAM IS" />
                <Field label="Interview name" value={state.general.interviewName} onChange={(value) => updateGeneral("interviewName", value)} maxLength={12} placeholder="Guest name" />
                <Field label="Podcast title" value={state.general.podcastTitle} onChange={(value) => updateGeneral("podcastTitle", value)} placeholder="Episode / segment title" />
              </div>
            </section>
          </div>
        ) : null}

        {activeSection === "general" && generalTab === "segments" ? (
          <section className="panel-card run-card">
            <div className="card-title-row"><div><h2>Podcast Run of Show</h2></div><label className="compact-select"><span>Live segment</span><select value={state.general.currentSegment} onChange={(event) => updateGeneral("currentSegment", event.target.value)}><option value="">Not selected</option>{state.general.segments.map((segment, index) => <option key={index} value={String(index + 1)}>0{index + 1} / {segment || "Untitled"}</option>)}</select></label></div>
            <div className="form-grid">
              <Field label="Podcast indicator logo" value={state.general.podcastIndicatorLogo} onChange={(value) => updateGeneral("podcastIndicatorLogo", value)} placeholder={matchOneLeague.logo || "Uses Match 1 league logo"} />
            </div>
            <div className="segment-list">
              {state.general.segments.map((segment, index) => (
                <label className={`segment-row ${state.general.currentSegment === String(index + 1) ? "live" : ""}`} key={index}>
                  <span>0{index + 1}</span>
                  <input value={segment} onChange={(event) => { const segments = [...state.general.segments]; segments[index] = event.target.value; updateGeneral("segments", segments); }} placeholder={`Segment ${index + 1} title`} />
                  <button type="button" onClick={() => updateGeneral("currentSegment", String(index + 1))}>{state.general.currentSegment === String(index + 1) ? "On air" : "Take"}</button>
                </label>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  function renderValorant() {
    const homeTeam = resolveTeam(state.general.matches[0].team1).name || "Team 1";
    const awayTeam = resolveTeam(state.general.matches[0].team2).name || "Team 2";
    const displayTeamOne = state.valorant.flipSides ? awayTeam : homeTeam;
    const displayTeamTwo = state.valorant.flipSides ? homeTeam : awayTeam;
    const displayWinsOne = state.valorant.flipSides ? valorantSeries.awayWins : valorantSeries.homeWins;
    const displayWinsTwo = state.valorant.flipSides ? valorantSeries.homeWins : valorantSeries.awayWins;
    const teamA = state.valorant.banSwap ? awayTeam : homeTeam;
    const teamB = state.valorant.banSwap ? homeTeam : awayTeam;
    const mapPoolNames = Array.from(new Set(
      state.valorantMapData.maps
        .map((map) => map.name.trim())
        .filter((name) => name && name.toLowerCase() !== "placeholder"),
    ));
    const bo3MapRows: { key: keyof ValorantBo3; label: string; team: string; phase: string }[] = [
      { key: "ban1", label: "Ban 1", team: teamA, phase: "Opening bans" },
      { key: "ban2", label: "Ban 2", team: teamB, phase: "Opening bans" },
      { key: "pick1", label: "Pick 1", team: teamA, phase: "Map picks" },
      { key: "pick2", label: "Pick 2", team: teamB, phase: "Map picks" },
      { key: "ban3", label: "Ban 3", team: teamA, phase: "Final bans" },
      { key: "ban4", label: "Ban 4", team: teamB, phase: "Final bans" },
      { key: "decider", label: "Decider", team: "Automatic", phase: "Decider" },
    ];
    const bo3SideRows: { key: keyof ValorantBo3; label: string; team: string }[] = [
      { key: "side1", label: "Map 1 side", team: teamB },
      { key: "side2", label: "Map 2 side", team: teamA },
      { key: "side3", label: "Map 3 side", team: teamA },
    ];
    const bo5MapRows: { key: keyof ValorantBo5; label: string; team: string; phase: string }[] = [
      { key: "ban1", label: "Ban 1", team: teamA, phase: "Opening bans" },
      { key: "ban2", label: "Ban 2", team: teamB, phase: "Opening bans" },
      { key: "pick1", label: "Pick 1", team: teamA, phase: "Map picks" },
      { key: "pick2", label: "Pick 2", team: teamB, phase: "Map picks" },
      { key: "pick3", label: "Pick 3", team: teamA, phase: "Map picks" },
      { key: "pick4", label: "Pick 4", team: teamB, phase: "Map picks" },
      { key: "decider", label: "Decider", team: "Automatic", phase: "Decider" },
    ];
    const bo5SideRows: { key: keyof ValorantBo5; label: string; team: string }[] = [
      { key: "side1", label: "Map 1 side", team: teamB },
      { key: "side2", label: "Map 2 side", team: teamA },
      { key: "side3", label: "Map 3 side", team: teamB },
      { key: "side4", label: "Map 4 side", team: teamA },
      { key: "side5", label: "Map 5 side", team: teamB },
    ];
    const activeMapRows = state.valorant.bestOf === "Bo5" ? bo5MapRows : bo3MapRows;
    const activeSideRows = state.valorant.bestOf === "Bo5" ? bo5SideRows : bo3SideRows;

    return (
      <div className="page-stack valorant-page">
        <SectionHeading
          eyebrow="Game setup"
          title="VALORANT"
          description="Manage map results, scoreboard settings, and the complete series pick/ban order. Match 1 supplies team data."
        />
        <GameLiveDataMonitor
          gameName="VALORANT"
          label="Manual control"
          detail="No VALORANT live-data API is configured. Results and match state are controlled from this workspace."
          tone="manual"
        />
        <div className="tabs" role="tablist" aria-label="VALORANT views" onKeyDown={handleTabListKeyDown}>
          <button role="tab" aria-selected={valorantTab === "results"} tabIndex={valorantTab === "results" ? 0 : -1} className={valorantTab === "results" ? "active" : ""} onClick={() => setValorantTab("results")}>Results & setup</button>
          <button role="tab" aria-selected={valorantTab === "pickBans"} tabIndex={valorantTab === "pickBans" ? 0 : -1} className={valorantTab === "pickBans" ? "active" : ""} onClick={() => setValorantTab("pickBans")}>Pick / ban</button>
          <button role="tab" aria-selected={valorantTab === "mapPool"} tabIndex={valorantTab === "mapPool" ? 0 : -1} className={valorantTab === "mapPool" ? "active" : ""} onClick={() => setValorantTab("mapPool")}>Map pool</button>
          <button role="tab" aria-selected={valorantTab === "controls"} tabIndex={valorantTab === "controls" ? 0 : -1} className={valorantTab === "controls" ? "active" : ""} onClick={() => setValorantTab("controls")}>Overlay controls</button>
          <button role="tab" aria-selected={valorantTab === "overlay"} tabIndex={valorantTab === "overlay" ? 0 : -1} className={valorantTab === "overlay" ? "active" : ""} onClick={() => setValorantTab("overlay")}>Browser overlay links</button>
        </div>

        {valorantTab === "results" ? (
          <div className="rocket-league-layout valorant-results-layout game-results-layout">
            <section className="panel-card rocket-score-card">
              <div className="card-title-row result-card-heading"><div><h2>Map results</h2><p>Enter both scores with a clear winner, then update the live JSON.</p></div><div className="result-update-controls"><span className={valorantInvalidResults ? "invalid" : valorantPendingResults ? "pending" : "current"}>{valorantInvalidResults ? `${valorantInvalidResults} invalid ${valorantInvalidResults === 1 ? "result" : "results"}` : valorantPendingResults ? `${valorantPendingResults} unsaved` : "Results current"}</span><button className={`button ${valorantPendingResults && !valorantInvalidResults ? "primary" : "secondary"}`} type="button" onClick={saveValorantResults} disabled={!valorantPendingResults || Boolean(valorantInvalidResults)}>Update results</button><button ref={valorantSeriesResetTriggerRef} className="button danger" type="button" onClick={() => setValorantSeriesResetOpen(true)}>Reset series</button></div></div>
              <div className="rocket-score-head" aria-hidden="true"><span>Map</span><strong>{homeTeam}</strong><span>vs</span><strong>{awayTeam}</strong></div>
              <div className="rocket-score-list">
                {Array.from({ length: valorantGameCount }, (_, gameIndex) => {
                  const game = state.valorant.games[gameIndex];
                  const status = resultStatus(game);
                  const issue = valorantResultIssues[gameIndex] ?? null;
                  const isInvalid = Boolean(issue);
                  const isCompleted = status === "valid" && !isInvalid;
                  const isPending = resultIsPending(game, state.valorant.savedGames[gameIndex]);
                  const locked = status === "blank" && (gameIndex > valorantDraftSeries.completedGames || (valorantDraftComplete && gameIndex >= valorantDraftSeries.completedGames));
                  const helpId = isInvalid
                    ? `valorant-result-${gameIndex + 1}-error`
                    : locked ? `valorant-result-${gameIndex + 1}-locked` : undefined;
                  return (
                    <div className={`rocket-score-row ${isCompleted ? "complete" : ""} ${isPending ? "pending" : ""} ${isInvalid ? "invalid" : ""} ${locked ? "locked" : ""}`} key={gameIndex}>
                      <span>Map {gameIndex + 1}{locked ? <small id={helpId}>Complete earlier maps first</small> : isInvalid ? <small id={helpId} className="result-error">{resultIssueMessage(issue, "map")}</small> : isPending ? <small>Unsaved</small> : null}</span>
                      <input disabled={locked} aria-invalid={isInvalid || undefined} aria-describedby={helpId} aria-label={`Map ${gameIndex + 1} ${homeTeam} score`} inputMode="numeric" pattern="[0-9]*" maxLength={2} value={game.home} onChange={(event) => updateValorantScore(gameIndex, "home", event.target.value)} placeholder="0" />
                      <b>–</b>
                      <input disabled={locked} aria-invalid={isInvalid || undefined} aria-describedby={helpId} aria-label={`Map ${gameIndex + 1} ${awayTeam} score`} inputMode="numeric" pattern="[0-9]*" maxLength={2} value={game.away} onChange={(event) => updateValorantScore(gameIndex, "away", event.target.value)} placeholder="0" />
                    </div>
                  );
                })}
              </div>
            </section>

            <div className="rocket-side-stack">
              <section className="panel-card rocket-setup-card">
                <div className="card-title-row"><div><h2>Scoreboard setup</h2><p>These values control the VALORANT graphics.</p></div></div>
                <div className="form-grid">
                  <Field
                    label="Scoreboard header override"
                    value={state.valorant.scoreboardHeader}
                    onChange={(value) => updateValorant({ scoreboardHeader: value })}
                    placeholder={state.general.eventName || "Uses Event name"}
                    hint={state.valorant.scoreboardHeader.trim() ? `On-air: ${valorantHeader}` : "Leave blank to use General Info event name."}
                  />
                  <label className="field"><span className="field-label">Series format</span><select value={state.valorant.bestOf} onChange={(event) => updateValorantBestOf(event.target.value as Valorant["bestOf"])}><option value="Bo1">Best of 1</option><option value="Bo3">Best of 3</option><option value="Bo5">Best of 5</option></select></label>
                </div>
                <div className="valorant-toggle-list">
                  <GameAutoAcceptControl gameName="VALORANT" checked locked />
                  <GameFlipSidesControl gameName="VALORANT" checked={state.valorant.flipSides} onChange={(checked) => updateValorant({ flipSides: checked })} />
                </div>
              </section>
              <GameLiveMatchIndicators gameName="VALORANT" indicators={[
                { label: "Current map", value: `Map ${valorantCurrentMap.number}`, detail: valorantCurrentMap.name || "Map not selected", valueClassName: "map-indicator-value", detailClassName: "map-name" },
                { label: displayTeamOne, value: displayWinsOne, detail: `${valorantSideLabel(valorantCurrentSides.one)} · Series wins` },
                { label: displayTeamTwo, value: displayWinsTwo, detail: `${valorantSideLabel(valorantCurrentSides.two)} · Series wins` },
              ]} />
            </div>
          </div>
        ) : valorantTab === "pickBans" ? (
          <div className="valorant-pickban-stack">
            <section className="panel-card valorant-reference" aria-label="VALORANT ban team assignments">
              <div><span>Ban Team A</span><strong>{teamA}</strong></div>
              <div><span>Ban Team B</span><strong>{teamB}</strong></div>
              <div><span>Format</span><strong>{state.valorant.bestOf}</strong></div>
              <div className="valorant-reference-ban-control">
                <div><span>Ban swap</span><strong>{state.valorant.banSwap ? "Swapped" : "Standard"}</strong></div>
                <label className="switch large"><input aria-label="Swap VALORANT pick ban teams" type="checkbox" checked={state.valorant.banSwap} onChange={(event) => updateValorant({ banSwap: event.target.checked })} /><span /></label>
              </div>
            </section>

            {state.valorant.bestOf === "Bo1" ? (
              <section className="panel-card valorant-empty-state"><h2>No pick/ban phase for Bo1</h2><p>Change the series format to Best of 3 or Best of 5 in Results & setup.</p></section>
            ) : (
              <div className="valorant-pickban-grid">
                <section className="panel-card pickban-card">
                  <div className="card-title-row"><div><h2>Map selection</h2><p>{state.valorant.bestOf} pick and ban order</p></div><button className="button danger" type="button" onClick={resetValorantMapBans}>Reset map bans</button></div>
                  <div className="pickban-list">
                    {activeMapRows.map((row, index) => {
                      const previousPhase = index > 0 ? activeMapRows[index - 1].phase : "";
                      const value = state.valorant.bestOf === "Bo5" ? state.valorant.bo5[row.key as keyof ValorantBo5] : state.valorant.bo3[row.key as keyof ValorantBo3];
                      const selectedMap = String(value || "").trim();
                      const mapOptions = selectedMap && !mapPoolNames.includes(selectedMap)
                        ? [selectedMap, ...mapPoolNames]
                        : mapPoolNames;
                      const activeSelection = state.valorant.bestOf === "Bo5" ? state.valorant.bo5 : state.valorant.bo3;
                      const usedElsewhere = new Set(Object.entries(activeSelection)
                        .filter(([selectionKey, selectionValue]) => selectionKey !== row.key && !selectionKey.startsWith("side") && Boolean(selectionValue))
                        .map(([, selectionValue]) => canonicalMapName(selectionValue)));
                      return <div className="pickban-row-wrap" key={row.key}>{row.phase !== previousPhase ? <span className="pickban-phase">{row.phase}</span> : null}<label className="pickban-row"><span><strong>{row.label}</strong><small>{row.team}</small></span><select aria-label={`${row.label} map selected by ${row.team}`} value={value} onChange={(event) => state.valorant.bestOf === "Bo5" ? updateValorantBo5(row.key as keyof ValorantBo5, event.target.value) : updateValorantBo3(row.key as keyof ValorantBo3, event.target.value)}><option value="">Select map</option>{mapOptions.map((mapName) => <option value={mapName} key={mapName} disabled={usedElsewhere.has(canonicalMapName(mapName))}>{mapName}</option>)}</select></label></div>;
                    })}
                  </div>
                </section>

                <section className="panel-card pickban-card">
                  <div className="card-title-row"><div><h2>Starting sides</h2><p>The opposing team chooses the starting side after each pick.</p></div></div>
                  <div className="pickban-list">
                    {activeSideRows.map((row) => {
                      const value = state.valorant.bestOf === "Bo5" ? state.valorant.bo5[row.key as keyof ValorantBo5] : state.valorant.bo3[row.key as keyof ValorantBo3];
                      return <label className="pickban-row" key={row.key}><span><strong>{row.label}</strong><small>{row.team}</small></span><select aria-label={`${row.label} selected by ${row.team}`} value={value} onChange={(event) => state.valorant.bestOf === "Bo5" ? updateValorantBo5(row.key as keyof ValorantBo5, event.target.value) : updateValorantBo3(row.key as keyof ValorantBo3, event.target.value)}><option value="">Select side</option><option value="attack">Attack</option><option value="defense">Defense</option></select></label>;
                    })}
                  </div>
                </section>
              </div>
            )}
          </div>
        ) : valorantTab === "mapPool" ? (
          <section className="panel-card valorant-map-artwork-card" aria-label="VALORANT map pool">
            <div className="card-title-row result-card-heading">
              <div>
                <h2>Map Pool</h2>
                <p>Full standard map library. Sync generates next-map, pick / widget, and ban artwork automatically. Picks / bans use the full library, independent of competitive rotation.</p>
              </div>
              <div className="result-update-controls">
                <button className="button secondary" type="button" disabled={mapLibrary.busy} onClick={resetValorantMapPool}>Reset to Default</button>
                <button className="button secondary" type="button" onClick={addValorantMap} disabled={state.valorantMapData.maps.length >= 32}>Add map</button>
              </div>
            </div>
            <ValorantMapLibrary maps={state.valorantMapData.maps} controller={mapLibrary} />
            <details className="map-library-legacy"><summary>Map names and artwork URL overrides</summary>
            <div className="valorant-map-artwork-list">
              <div className="valorant-map-artwork-head" aria-hidden="true"><span>Map</span><span>Next map</span><span>Pick card / widget background</span><span>Ban card</span><span>Actions</span></div>
              {state.valorantMapData.maps.map((map, index) => (
                <div className="valorant-map-artwork-row" key={`map-pool-${index}`}>
                  <label>
                    <span>Map name</span>
                    <input
                      aria-label={`Map ${index + 1} name`}
                      value={map.name}
                      onChange={(event) => updateValorantMapArtwork(index, "name", event.target.value)}
                      placeholder="Map name"
                    />
                  </label>
                  <label><span>Next map</span><input aria-label={`${map.name || `Map ${index + 1}`} next map artwork URL`} value={map.nextMap} onChange={(event) => updateValorantMapArtwork(index, "nextMap", event.target.value)} placeholder="https://..." /></label>
                  <label><span>Pick card / widget background</span><input aria-label={`${map.name || `Map ${index + 1}`} pick card artwork URL`} value={map.pickCard} onChange={(event) => updateValorantMapArtwork(index, "pickCard", event.target.value)} placeholder="https://..." /></label>
                  <label><span>Ban card</span><input aria-label={`${map.name || `Map ${index + 1}`} ban card artwork URL`} value={map.banCard} onChange={(event) => updateValorantMapArtwork(index, "banCard", event.target.value)} placeholder="https://..." /></label>
                  <div className="valorant-map-artwork-actions">
                    <button className="button danger" type="button" onClick={() => removeValorantMap(index)} aria-label={`Remove ${map.name || `map ${index + 1}`}`}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
            </details>
          </section>
        ) : (
          <section className="panel-card browser-overlay-card browser-overlay-workspace" aria-label={valorantTab === "controls" ? "Overlay controls" : "Browser overlay"}>
            {valorantTab === "overlay" ? <>
            <div className="card-title-row"><div><h2>VALORANT browser overlay</h2><p>Use this transparent PSD-aligned source as a vMix browser input.</p></div></div>
            <div className="browser-overlay-details">
              <div><span>Canvas</span><strong>1920 × 1080</strong><small>Transparent background</small></div>
              <div><span>Data</span><strong>Match 1</strong><small>Saved VALORANT results</small></div>
              <div><span>Refresh</span><strong>Automatic</strong><small>Updates twice per second</small></div>
            </div>
            </> : <>
            <div className="card-title-row"><h2>VALORANT overlay controls</h2></div>
            <div className="browser-overlay-widget-controls" aria-label="Overlay widget visibility">
              <div className="browser-overlay-widget-toggle">
                <div><strong>Map widget</strong><small>Show the three-map series strip.</small></div>
                <label className="switch large"><input aria-label="Enable VALORANT map widget" type="checkbox" checked={state.valorant.mapWidgetEnabled} onChange={(event) => updateValorant({ mapWidgetEnabled: event.target.checked })} /><span /></label>
              </div>
              <div className="browser-overlay-widget-toggle">
                <div><strong>Sponsor widget</strong><small>Show the rotating included sponsors.</small></div>
                <label className="switch large"><input aria-label="Enable VALORANT sponsor widget" type="checkbox" checked={state.valorant.sponsorWidgetEnabled} onChange={(event) => updateValorant({ sponsorWidgetEnabled: event.target.checked })} /><span /></label>
              </div>
            </div>
            </>}
            {valorantTab === "overlay" ? <>
            <label className="field browser-overlay-url"><span className="field-label">Scoreboard URL</span><input readOnly value={VALORANT_OVERLAY_URL} /></label>
            <div className="browser-overlay-actions">
              <button className="button secondary" type="button" onClick={copyValorantOverlayLink}>Copy link</button>
              <button className="button primary" type="button" onClick={openValorantOverlay}>Open overlay</button>
            </div>
            <label className="field browser-overlay-url"><span className="field-label">VS matchup URL</span><input readOnly value={VALORANT_VS_OVERLAY_URL} /></label>
            <div className="browser-overlay-actions">
              <button className="button secondary" type="button" onClick={copyValorantVsOverlayLink}>Copy VS link</button>
              <button className="button primary" type="button" onClick={openValorantVsOverlay}>Open VS overlay</button>
            </div>
            </> : null}
          </section>
        )}
      </div>
    );
  }

  function renderRocketLeague() {
    const homeTeam = resolveTeam(state.general.matches[0].team1).name || "Team 1";
    const awayTeam = resolveTeam(state.general.matches[0].team2).name || "Team 2";
    const overlayLeftTeam = state.rocketLeague.flipSides ? awayTeam : homeTeam;
    const overlayRightTeam = state.rocketLeague.flipSides ? homeTeam : awayTeam;
    const overlayLeftGameSide = "Blue";
    const overlayRightGameSide = "Orange";
    const rlApi = writerLiveDataStatus.rocketLeagueStatsApi;
    const rlReceiving = Boolean(rlApi?.connected && receivedRecently(rlApi.lastEventAt));
    const rlMonitor = !writerLiveDataStatus.checked
      ? { label: "Checking connection", detail: "Checking the local writer and Rocket League Game Data API.", tone: "waiting" as LiveDataTone }
      : !writerLiveDataStatus.reachable
        ? { label: "Writer offline", detail: "Start Production OS with run.bat to monitor Rocket League data.", tone: "offline" as LiveDataTone }
        : !rlApi?.connected
          ? { label: "API disconnected", detail: "Rocket League is not connected to the local writer. Verify PacketSendRate and restart the game.", tone: "offline" as LiveDataTone }
          : rlReceiving
            ? { label: "Receiving game data", detail: "Rocket League match data is updating the browser overlays.", tone: "live" as LiveDataTone }
            : { label: "Connected · waiting for match", detail: "The Game Data API is connected. Start or spectate a match to receive live statistics.", tone: "waiting" as LiveDataTone };

    return (
      <div className="page-stack rocket-league-page">
        <SectionHeading
          eyebrow="Game setup"
          title="Rocket League"
          description="Enter game results and configure the scoreboard. Match 1 supplies the team names used here."
        />
        <GameLiveDataMonitor gameName="Rocket League" {...rlMonitor} lastEventAt={rlApi?.lastEventAt} />
        <div className="tabs" role="tablist" aria-label="Rocket League views" onKeyDown={handleTabListKeyDown}>
          <button role="tab" aria-selected={rocketLeagueTab === "results"} tabIndex={rocketLeagueTab === "results" ? 0 : -1} className={rocketLeagueTab === "results" ? "active" : ""} onClick={() => setRocketLeagueTab("results")}>Results & setup</button>
          <button role="tab" aria-selected={rocketLeagueTab === "admin"} tabIndex={rocketLeagueTab === "admin" ? 0 : -1} className={rocketLeagueTab === "admin" ? "active" : ""} onClick={() => setRocketLeagueTab("admin")}>Admin control</button>
          <button role="tab" aria-selected={rocketLeagueTab === "debug"} tabIndex={rocketLeagueTab === "debug" ? 0 : -1} className={rocketLeagueTab === "debug" ? "active" : ""} onClick={() => setRocketLeagueTab("debug")}>Debug</button>
          <button role="tab" aria-selected={rocketLeagueTab === "controls"} tabIndex={rocketLeagueTab === "controls" ? 0 : -1} className={rocketLeagueTab === "controls" ? "active" : ""} onClick={() => setRocketLeagueTab("controls")}>Overlay controls</button>
          <button role="tab" aria-selected={rocketLeagueTab === "overlay"} tabIndex={rocketLeagueTab === "overlay" ? 0 : -1} className={rocketLeagueTab === "overlay" ? "active" : ""} onClick={() => setRocketLeagueTab("overlay")}>Browser overlay links</button>
        </div>

        {rocketLeagueTab === "results" ? (
          <div className="rocket-league-layout game-results-layout">
            <section className="panel-card rocket-score-card">
              <div className="card-title-row result-card-heading">
                <div><h2>Match results</h2><p>Enter both scores with a clear winner, then update the live JSON. Finished live games propose into the next open row.</p></div>
                <div className="result-update-controls"><span className={rocketLeagueInvalidResults ? "invalid" : rocketLeaguePendingResults ? "pending" : "current"}>{rocketLeagueInvalidResults ? `${rocketLeagueInvalidResults} invalid ${rocketLeagueInvalidResults === 1 ? "result" : "results"}` : rocketLeaguePendingResults ? `${rocketLeaguePendingResults} unsaved` : "Results current"}</span><button className={`button ${rocketLeaguePendingResults && !rocketLeagueInvalidResults ? "primary" : "secondary"}`} type="button" onClick={saveRocketLeagueResults} disabled={!rocketLeaguePendingResults || Boolean(rocketLeagueInvalidResults)}>Update results</button><button ref={seriesResetTriggerRef} className="button danger" type="button" onClick={() => setRocketLeagueSeriesResetOpen(true)}>Reset series</button></div>
              </div>
              <div className="rocket-score-head" aria-hidden="true">
                <span>Game</span>
                <strong>{homeTeam}</strong>
                <span>vs</span>
                <strong>{awayTeam}</strong>
              </div>
              <div className="rocket-score-list">
                {Array.from({ length: rocketLeagueGameCount }, (_, gameIndex) => {
                  const game = state.rocketLeague.games[gameIndex];
                  const status = resultStatus(game);
                  const issue = rocketLeagueResultIssues[gameIndex] ?? null;
                  const isInvalid = Boolean(issue);
                  const isCompleted = status === "valid" && !isInvalid;
                  const isPending = resultIsPending(game, state.rocketLeague.savedGames[gameIndex]);
                  const locked = status === "blank" && (gameIndex > rocketLeagueDraftSeries.completedGames || (rocketLeagueDraftComplete && gameIndex >= rocketLeagueDraftSeries.completedGames));
                  const helpId = isInvalid
                    ? `rocket-league-result-${gameIndex + 1}-error`
                    : locked ? `rocket-league-result-${gameIndex + 1}-locked` : undefined;
                  return (
                    <div className={`rocket-score-row ${isCompleted ? "complete" : ""} ${isPending ? "pending" : ""} ${isInvalid ? "invalid" : ""} ${locked ? "locked" : ""}`} key={gameIndex}>
                      <span>Game {gameIndex + 1}{locked ? <small id={helpId}>Complete earlier games first</small> : isInvalid ? <small id={helpId} className="result-error">{resultIssueMessage(issue, "game")}</small> : isPending ? <small>Unsaved</small> : null}</span>
                      <input disabled={locked} aria-invalid={isInvalid || undefined} aria-describedby={helpId} aria-label={`Game ${gameIndex + 1} ${homeTeam} score`} inputMode="numeric" pattern="[0-9]*" maxLength={2} value={game.home} onChange={(event) => updateRocketLeagueScore(gameIndex, "home", event.target.value)} placeholder="0" />
                      <b>–</b>
                      <input disabled={locked} aria-invalid={isInvalid || undefined} aria-describedby={helpId} aria-label={`Game ${gameIndex + 1} ${awayTeam} score`} inputMode="numeric" pattern="[0-9]*" maxLength={2} value={game.away} onChange={(event) => updateRocketLeagueScore(gameIndex, "away", event.target.value)} placeholder="0" />
                    </div>
                  );
                })}
              </div>
            </section>

            <div className="rocket-side-stack">
              <section className="panel-card rocket-setup-card">
                <div className="card-title-row"><div><h2>Scoreboard setup</h2><p>These values feed the Rocket League graphics.</p></div></div>
                <div className="form-grid">
                  <Field
                    label="Scoreboard header override"
                    value={state.rocketLeague.scoreboardHeader}
                    onChange={(value) => updateRocketLeague({ scoreboardHeader: value })}
                    placeholder={state.general.eventName || "Uses Event name"}
                    hint={state.rocketLeague.scoreboardHeader.trim() ? `On-air: ${rocketLeagueHeader}` : "Leave blank to use General Info event name."}
                  />
                  <label className="field">
                    <span className="field-label">Series format</span>
                    <select value={state.rocketLeague.bestOf} onChange={(event) => updateRocketLeagueBestOf(event.target.value as RocketLeague["bestOf"])}>
                      <option value="Bo1">Best of 1</option>
                      <option value="Bo3">Best of 3</option>
                      <option value="Bo5">Best of 5</option>
                      <option value="Bo7">Best of 7</option>
                    </select>
                  </label>
                </div>
                <div className="valorant-toggle-list">
                  <GameAutoAcceptControl gameName="Rocket League" checked={state.rocketLeague.autoAcceptLiveResults} onChange={(checked) => updateRocketLeague({ autoAcceptLiveResults: checked })} />
                  <GameFlipSidesControl gameName="Rocket League" checked={state.rocketLeague.flipSides} onChange={(checked) => updateRocketLeague({ flipSides: checked })} />
                </div>
              </section>

              <GameLiveMatchIndicators gameName="Rocket League" indicators={[
                { label: "Current game", value: rocketLeagueSeries.roundNumber, detail: state.rocketLeague.bestOf },
                { label: homeTeam, value: rocketLeagueSeries.homeWins, detail: "Series wins" },
                { label: awayTeam, value: rocketLeagueSeries.awayWins, detail: "Series wins" },
              ]} />

            </div>
          </div>
        ) : rocketLeagueTab === "overlay" || rocketLeagueTab === "controls" ? (
          <section className="panel-card browser-overlay-card browser-overlay-workspace" aria-label={rocketLeagueTab === "controls" ? "Overlay controls" : "Browser overlay"}>
            {rocketLeagueTab === "overlay" ? <>
            <div className="card-title-row"><div><h2>Rocket League browser overlay</h2><p>Use this transparent PSD-aligned source as a vMix browser input. League colors and logo backgrounds come from Match 1 / Team Info.</p></div></div>
            <div className="browser-overlay-details">
              <div><span>Canvas</span><strong>1920 × 1080</strong><small>Transparent background</small></div>
              <div><span>Data</span><strong>Match 1</strong><small>Teams, league colors, logo backgrounds</small></div>
              <div><span>Live feed</span><strong>Game Data API</strong><small>Clock, score, OT, player card, activities when Debug is off. Auto broadcast camera uses Director cam, then hides the full native HUD at countdown start and restores it when the match ends. Manual fallback: press <strong>9</strong>, then <strong>H</strong> twice while spectating.</small></div>
              <div><span>Refresh</span><strong>Automatic</strong><small>Updates four times per second</small></div>
            </div>
            </> : <>
            <div className="card-title-row"><h2>Rocket League overlay controls</h2></div>
            <label className="field">
              <span className="field-label">Scene control</span>
              <select value={state.rocketLeague.sceneMode} onChange={(event) => updateRocketLeague({ sceneMode: event.target.value as RocketLeague["sceneMode"] })}>
                <option value="auto">Automatic</option>
                <option value="scoreboard">Scoreboard</option>
                <option value="vs">VS</option>
                <option value="stats">Stats</option>
              </select>
              <small>{state.rocketLeague.sceneMode === "auto"
                ? "Automatic: follows the live match and lobby scene setting."
                : "Manual: holds this scene until you choose another scene or Automatic."} Applies to the Scoreboard URL. Stats uses the latest available match totals.</small>
            </label>
            <section className="rl-side-assignment" aria-label="In-game team assignment">
              <div className="card-title-row">
                <div>
                  <h2>In-game team assignment</h2>
                  <p>Match 1 teams map to scoreboard Left (Blue) and Right (Orange). Swap assignment switches which Match team plays each side.</p>
                </div>
              </div>
              <div className="rl-side-assignment-grid">
                <div className="rl-side-assignment-slot">
                  <span>Left</span>
                  <strong>{overlayLeftTeam}</strong>
                  <small>In-game {overlayLeftGameSide}</small>
                </div>
                <div className="rl-side-assignment-slot">
                  <span>Right</span>
                  <strong>{overlayRightTeam}</strong>
                  <small>In-game {overlayRightGameSide}</small>
                </div>
              </div>
              <div className="valorant-toggle-list" style={{ marginTop: 12 }}>
                <div className="valorant-toggle-row">
                  <div>
                    <strong>Swap assignment</strong>
                    <p>Swap which Match 1 team is Left/Blue versus Right/Orange on the scoreboard and player card.</p>
                  </div>
                  <label className="switch large">
                    <input
                      aria-label="Swap Rocket League left and right team assignment"
                      type="checkbox"
                      checked={state.rocketLeague.flipSides}
                      onChange={(event) => updateRocketLeague({ flipSides: event.target.checked })}
                    />
                    <span />
                  </label>
                </div>
              </div>
            </section>
            <div className="browser-overlay-widget-controls" aria-label="Overlay widget visibility">
              <div className="browser-overlay-widget-toggle">
                <div><strong>Player card</strong><small>Shows the spectated player widget on the overlay. Live data comes from the Rocket League Game Data API when Debug is off.</small></div>
                <label className="switch large"><input aria-label="Enable Rocket League player card" type="checkbox" checked={state.rocketLeague.playerCardEnabled} onChange={(event) => updateRocketLeague({ playerCardEnabled: event.target.checked })} /><span /></label>
              </div>
              <div className="browser-overlay-widget-toggle">
                <div><strong>Sponsor box</strong><small>Shows the shared Sponsors list in the bottom-right corner of the overlay.</small></div>
                <label className="switch large"><input aria-label="Enable Rocket League sponsor widget" type="checkbox" checked={state.rocketLeague.sponsorWidgetEnabled} onChange={(event) => updateRocketLeague({ sponsorWidgetEnabled: event.target.checked })} /><span /></label>
              </div>
              <div className="browser-overlay-widget-toggle">
                <div><strong>VS screen background</strong><small>Place the team-split VS treatment behind the post-match Stats scene on the dedicated Stats link. Stats on the main Scoreboard link always shows this background.</small></div>
                <label className="switch large"><input aria-label="Show Rocket League VS screen background" type="checkbox" checked={state.rocketLeague.statsSceneBackground === "team-split"} onChange={(event) => updateRocketLeague({ statsSceneBackground: event.target.checked ? "team-split" : "transparent" })} /><span /></label>
              </div>
              <div className="browser-overlay-widget-toggle">
                <div><strong>Lobby scene: Post-match stats</strong><small>When the live feed has no active match, show post-match stats instead of the full VS matchup screen.</small></div>
                <label className="switch large"><input aria-label="Show post-match stats on Rocket League lobby scene" type="checkbox" checked={state.rocketLeague.lobbyScene === "stats"} onChange={(event) => updateRocketLeague({ lobbyScene: event.target.checked ? "stats" : "vs" })} /><span /></label>
              </div>
              <div className="browser-overlay-widget-toggle">
                <div><strong>Auto broadcast camera</strong><small>Switch to Director cam on match create. Hide the full native HUD at countdown start (Stats API cannot do a partial H-key hide). Restores HUD when the match ends. Requires spectating.</small></div>
                <label className="switch large"><input aria-label="Enable Rocket League auto broadcast camera" type="checkbox" checked={state.rocketLeague.broadcastSetupEnabled} onChange={(event) => updateRocketLeague({ broadcastSetupEnabled: event.target.checked })} /><span /></label>
              </div>
            </div>
            </>}
            {rocketLeagueTab === "overlay" ? <>
            <label className="field browser-overlay-url"><span className="field-label">Scoreboard URL</span><input readOnly value={ROCKET_LEAGUE_OVERLAY_URL} /></label>
            <div className="browser-overlay-actions">
              <button className="button secondary" type="button" onClick={copyRocketLeagueOverlayLink}>Copy link</button>
              <button className="button primary" type="button" onClick={openRocketLeagueOverlay}>Open overlay</button>
            </div>
            <label className="field browser-overlay-url"><span className="field-label">VS matchup URL</span><input readOnly value={ROCKET_LEAGUE_VS_OVERLAY_URL} /></label>
            <div className="browser-overlay-actions">
              <button className="button secondary" type="button" onClick={copyRocketLeagueVsOverlayLink}>Copy VS link</button>
              <button className="button primary" type="button" onClick={openRocketLeagueVsOverlay}>Open VS overlay</button>
            </div>
            <label className="field browser-overlay-url"><span className="field-label">Post-match stats URL</span><input readOnly value={ROCKET_LEAGUE_STATS_OVERLAY_URL} /></label>
            <div className="browser-overlay-actions">
              <button className="button secondary" type="button" onClick={copyRocketLeagueStatsOverlayLink}>Copy stats link</button>
              <button className="button primary" type="button" onClick={openRocketLeagueStatsOverlay}>Open stats overlay</button>
            </div>
            </> : null}
          </section>
        ) : rocketLeagueTab === "admin" ? (
          <section className="panel-card browser-overlay-card browser-overlay-workspace" aria-label="Rocket League admin control">
            <div className="card-title-row">
              <div>
                <h2>Admin control</h2>
                <p>Send live match commands through the Rocket League Game Data API. Pause/resume needs this PC to be the match admin/host — spectator-only clients usually will not pause. JSON writer must be online and connected.</p>
              </div>
            </div>
            <div className="browser-overlay-actions" style={{ justifyContent: "flex-start" }}>
              <button
                className="button secondary"
                type="button"
                aria-label="Pause Rocket League match"
                onClick={() => setRocketLeagueMatchPaused(true)}
              >
                Pause match
              </button>
              <button
                className="button secondary"
                type="button"
                aria-label="Resume Rocket League match"
                onClick={() => setRocketLeagueMatchPaused(false)}
              >
                Resume match
              </button>
            </div>
          </section>
        ) : (
          <section className="panel-card browser-overlay-card browser-overlay-workspace" aria-label="Rocket League debug">
            <div className="card-title-row">
              <div>
                <h2>Active player debug</h2>
                <p>Enable debug to override the Rocket League Game Data API and preview clock, score, overtime, replay badge, scorer card, player card, and activities on the scoreboard overlay.</p>
              </div>
            </div>
            <div className="valorant-toggle-row">
              <div>
                <strong>Enable debug</strong>
                <p>When off, the overlay uses the live Game Data API feed from the local writer. When on, the fields below populate match state.</p>
              </div>
              <label className="switch large">
                <input
                  aria-label="Enable Rocket League active player debug"
                  type="checkbox"
                  checked={state.rocketLeague.debugActivePlayerEnabled}
                  onChange={(event) => updateRocketLeague({ debugActivePlayerEnabled: event.target.checked })}
                />
                <span />
              </label>
            </div>
            {state.rocketLeague.debugActivePlayerEnabled ? (
              <>
                <label className="field">
                  <span className="field-label">Scenario preset</span>
                  <select
                    aria-label="Active player debug scenario"
                    value={state.rocketLeague.debugActivePlayerScenario}
                    onChange={(event) => applyActivePlayerScenario(event.target.value)}
                  >
                    {ROCKET_LEAGUE_ACTIVE_PLAYER_SCENARIO_IDS.map((scenarioId) => (
                      <option key={scenarioId} value={scenarioId}>
                        {ROCKET_LEAGUE_ACTIVE_PLAYER_SCENARIOS[scenarioId as RocketLeagueActivePlayerScenario].label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="card-title-row" style={{ marginTop: 18 }}>
                  <div><h2>Connection / game</h2><p>Fields the Rocket League Game Data API supplies for match state.</p></div>
                </div>
                <div className="form-grid three">
                  <div className="valorant-toggle-row" style={{ minHeight: 0, padding: "8px 0", borderBottom: 0 }}>
                    <div><strong>Connected</strong></div>
                    <label className="switch large"><input aria-label="Debug Game Data API connected" type="checkbox" checked={state.rocketLeague.debugLive.connected} onChange={(event) => updateDebugLive({ connected: event.target.checked })} /><span /></label>
                  </div>
                  <div className="valorant-toggle-row" style={{ minHeight: 0, padding: "8px 0", borderBottom: 0 }}>
                    <div><strong>Has game</strong></div>
                    <label className="switch large"><input aria-label="Debug has game" type="checkbox" checked={state.rocketLeague.debugLive.hasGame} onChange={(event) => updateDebugLive({ hasGame: event.target.checked })} /><span /></label>
                  </div>
                  <div className="valorant-toggle-row" style={{ minHeight: 0, padding: "8px 0", borderBottom: 0 }}>
                    <div><strong>Has winner</strong></div>
                    <label className="switch large"><input aria-label="Debug has winner" type="checkbox" checked={state.rocketLeague.debugLive.hasWinner} onChange={(event) => updateDebugLive({ hasWinner: event.target.checked })} /><span /></label>
                  </div>
                  <div className="valorant-toggle-row" style={{ minHeight: 0, padding: "8px 0", borderBottom: 0 }}>
                    <div><strong>Overtime</strong></div>
                    <label className="switch large"><input aria-label="Debug overtime" type="checkbox" checked={state.rocketLeague.debugLive.isOT} onChange={(event) => updateDebugLive({ isOT: event.target.checked })} /><span /></label>
                  </div>
                  <div className="valorant-toggle-row" style={{ minHeight: 0, padding: "8px 0", borderBottom: 0 }}>
                    <div><strong>Replay</strong></div>
                    <label className="switch large"><input aria-label="Debug replay" type="checkbox" checked={state.rocketLeague.debugLive.isReplay} onChange={(event) => updateDebugLive({ isReplay: event.target.checked })} /><span /></label>
                  </div>
                  <p style={{ margin: "0 0 8px", opacity: 0.85 }}>Has game off shows the lobby scene on the scoreboard overlay (VS or post-match stats from the Overlay controls toggle). Replay on synthesizes a sample scorer info card from the target player for overlay preview. Dedicated VS and stats URLs are also available under Browser overlay links.</p>
                  <Field label="Clock (seconds)" value={String(state.rocketLeague.debugLive.timeSeconds)} onChange={(value) => updateDebugLive({ timeSeconds: Number.parseInt(value || "0", 10) || 0 })} placeholder="300" />
                  <Field label="Score one" value={String(state.rocketLeague.debugLive.scoreOne)} onChange={(value) => updateDebugLive({ scoreOne: Number.parseInt(value || "0", 10) || 0 })} placeholder="0" />
                  <Field label="Score two" value={String(state.rocketLeague.debugLive.scoreTwo)} onChange={(value) => updateDebugLive({ scoreTwo: Number.parseInt(value || "0", 10) || 0 })} placeholder="0" />
                  <Field label="Target player id" value={state.rocketLeague.debugLive.target} onChange={(value) => updateDebugLive({ target: value })} placeholder="debug-skyljn3" />
                </div>

                <div className="card-title-row" style={{ marginTop: 18 }}>
                  <div><h2>Target player</h2><p>Spectated player payload used by the active player card.</p></div>
                </div>
                <div className="form-grid three">
                  <Field label="Player id" value={state.rocketLeague.debugLive.targetPlayer.id} onChange={(value) => updateDebugTargetPlayer({ id: value })} placeholder="debug-skyljn3" />
                  <Field label="Player name" value={state.rocketLeague.debugLive.targetPlayer.name} onChange={(value) => updateDebugTargetPlayer({ name: value })} placeholder="SKYLIN3" />
                  <label className="field">
                    <span className="field-label">Team</span>
                    <select
                      aria-label="Debug target player team"
                      value={String(state.rocketLeague.debugLive.targetPlayer.team)}
                      onChange={(event) => updateDebugTargetPlayer({ team: Number.parseInt(event.target.value, 10) || 0 })}
                    >
                      <option value="0">Team one (0)</option>
                      <option value="1">Team two (1)</option>
                    </select>
                  </label>
                  <Field label="Goals" value={String(state.rocketLeague.debugLive.targetPlayer.goals)} onChange={(value) => updateDebugTargetPlayer({ goals: Number.parseInt(value || "0", 10) || 0 })} placeholder="0" />
                  <Field label="Shots" value={String(state.rocketLeague.debugLive.targetPlayer.shots)} onChange={(value) => updateDebugTargetPlayer({ shots: Number.parseInt(value || "0", 10) || 0 })} placeholder="0" />
                  <Field label="Saves" value={String(state.rocketLeague.debugLive.targetPlayer.saves)} onChange={(value) => updateDebugTargetPlayer({ saves: Number.parseInt(value || "0", 10) || 0 })} placeholder="0" />
                  <Field label="Assists" value={String(state.rocketLeague.debugLive.targetPlayer.assists)} onChange={(value) => updateDebugTargetPlayer({ assists: Number.parseInt(value || "0", 10) || 0 })} placeholder="0" />
                  <Field label="Boost (0-100)" value={String(state.rocketLeague.debugLive.targetPlayer.boost)} onChange={(value) => updateDebugTargetPlayer({ boost: Number.parseInt(value || "0", 10) || 0 })} placeholder="45" />
                  <div className="valorant-toggle-row" style={{ minHeight: 0, padding: "8px 0", borderBottom: 0 }}>
                    <div><strong>Is dead / demoed</strong></div>
                    <label className="switch large"><input aria-label="Debug target player is dead" type="checkbox" checked={state.rocketLeague.debugLive.targetPlayer.isDead} onChange={(event) => updateDebugTargetPlayer({ isDead: event.target.checked })} /><span /></label>
                  </div>
                </div>

                <div className="card-title-row" style={{ marginTop: 18 }}>
                  <div><h2>Activities</h2><p>Corner toast notifications for goals, assists, demos, and other stat feed events.</p></div>
                </div>
                <div className="browser-overlay-actions" style={{ marginBottom: 8 }}>
                  <button className="button secondary" type="button" onClick={fireSampleDebugActivity}>Fire sample activity</button>
                </div>
                {state.rocketLeague.debugLive.activities.length ? (
                  <p style={{ marginTop: 0 }}>
                    Queued: {state.rocketLeague.debugLive.activities.map((activity) => activity.type).join(", ")}
                  </p>
                ) : (
                  <p style={{ marginTop: 0 }}>No debug activities queued.</p>
                )}
              </>
            ) : null}
            <div className="browser-overlay-actions">
              <button className="button secondary" type="button" onClick={copyRocketLeagueOverlayLink}>Copy overlay link</button>
              <button className="button primary" type="button" onClick={openRocketLeagueOverlay}>Open overlay</button>
            </div>
          </section>
        )}
      </div>
    );
  }

  function renderLeagueOfLegends() {
    const teamOne = resolveTeam(state.general.matches[0].team1);
    const teamTwo = resolveTeam(state.general.matches[0].team2);
    const blueTeam = state.leagueOfLegends.blueTeam === "team1" ? teamOne : teamTwo;
    const redTeam = state.leagueOfLegends.blueTeam === "team1" ? teamTwo : teamOne;
    const previousWinner = leagueConfirmedGames.find((game) => game.gameNumber === state.leagueOfLegends.currentGame - 1)?.winner;
    const firstSelectionTeam = state.leagueOfLegends.firstSelectionTeam === "team1" ? teamOne.name || "Team 1"
      : state.leagueOfLegends.firstSelectionTeam === "team2" ? teamTwo.name || "Team 2" : null;
    const previousLoser = previousWinner === "team1" ? "team2" : previousWinner === "team2" ? "team1" : "";
    const firstSelectionHint = firstSelectionTeam
      ? `Game ${state.leagueOfLegends.currentGame} First Selection: ${firstSelectionTeam}${previousLoser && state.leagueOfLegends.firstSelectionTeam === previousLoser ? ` (lost Game ${state.leagueOfLegends.currentGame - 1})` : ""}. They choose side or pick order; their opponent chooses the other.`
      : state.leagueOfLegends.currentGame === 1
        ? null
        : "Save the previous game's result to identify the team holding First Selection.";
    const firstSelectionControl = (
      <label className="field">
        <span className="field-label">First Selection team</span>
        <select disabled={state.leagueOfLegends.draft.currentStep > 0} value={state.leagueOfLegends.firstSelectionTeam} onChange={(event) => updateLeagueOfLegends({ firstSelectionTeam: event.target.value as LeagueOfLegends["firstSelectionTeam"] })}>
          <option value="" disabled>Select team</option>
          <option value="team1">{teamOne.name || "Team 1"}</option>
          <option value="team2">{teamTwo.name || "Team 2"}</option>
        </select>
        <span className="field-hint">Later games automatically select the previous game&apos;s saved loser. Reset the draft to change this after drafting starts.</span>
      </label>
    );
    const draftSteps = leagueDraftSteps(state.leagueOfLegends.draftMode, state.leagueOfLegends.draft.firstPickSide);
    const activeStep = draftSteps[state.leagueOfLegends.draft.currentStep];
    const picks = draftSlots(state.leagueOfLegends.draft, state.leagueOfLegends.draftMode);
    const unavailable = state.leagueOfLegends.draftMode === "fearless"
      ? fearlessChampionSet(leagueConfirmedGames, state.leagueOfLegends.bestOf, state.leagueOfLegends.currentGame)
      : new Set<string>();
    const used = new Set(state.leagueOfLegends.draft.selections.filter((champion, index) => champion && !(state.leagueOfLegends.draftMode === "online" && activeStep?.action === "ban" && draftSteps[index].side !== activeStep.side)));
    const livePlayers = Array.isArray(leagueLivePreview?.players) ? leagueLivePreview.players : [];
    const liveEvents = Array.isArray(leagueLivePreview?.events) ? leagueLivePreview.events : [];
    const activeLeaguePlayer = leagueLivePreview?.activePlayer ?? null;
    const liveConnected = Boolean(leagueLivePreview?.connection?.connected);
    const liveStale = Boolean(leagueLivePreview?.connection?.stale);
    const formatClock = (seconds: number) => `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, "0")}`;
    const leagueApi = writerLiveDataStatus.leagueOfLegends;
    const leagueReceiving = Boolean(leagueApi?.connected && !leagueApi.stale && receivedRecently(leagueApi.lastEventAt));
    const leagueMonitor = !writerLiveDataStatus.checked
      ? { label: "Checking connection", detail: "Checking the local writer and League Live Client Data API.", tone: "waiting" as LiveDataTone }
      : !writerLiveDataStatus.reachable
        ? { label: "Writer offline", detail: "Start Production OS with run.bat to monitor League data.", tone: "offline" as LiveDataTone }
        : leagueApi?.stale
          ? { label: "Game data stale", detail: "The last valid League snapshot is no longer current.", tone: "offline" as LiveDataTone }
          : leagueReceiving
            ? { label: "Receiving game data", detail: "League spectator data is updating the browser overlays.", tone: "live" as LiveDataTone }
            : leagueApi?.connected
              ? { label: "Connected · waiting for game", detail: "The League client is reachable, but current spectator data has not arrived.", tone: "waiting" as LiveDataTone }
              : { label: "Client disconnected", detail: "Start or spectate a League game on this Windows PC to receive live statistics.", tone: "offline" as LiveDataTone };

    return (
      <div className="page-stack league-page">
        <SectionHeading
          eyebrow="Game setup"
          title="League of Legends"
          description="Run champion select, verify the local spectator feed, and confirm each game before it changes the series. Match 1 supplies team and league branding."
        />
        <GameLiveDataMonitor gameName="League of Legends" {...leagueMonitor} lastEventAt={leagueApi?.lastEventAt} />
        <div className="tabs" role="tablist" aria-label="League of Legends views">
          <button className={leagueTab === "results" ? "active" : ""} onClick={() => setLeagueTab("results")}>Results & setup</button>
          <button className={leagueTab === "draft" ? "active" : ""} onClick={() => setLeagueTab("draft")}>Draft</button>
          <button className={leagueTab === "controls" ? "active" : ""} onClick={() => setLeagueTab("controls")}>Overlay controls</button>
          <button className={leagueTab === "live" ? "active" : ""} onClick={() => setLeagueTab("live")}>Debug</button>
          <button className={leagueTab === "overlay" ? "active" : ""} onClick={() => setLeagueTab("overlay")}>Browser overlay links</button>
        </div>

        {leagueTab === "controls" ? (
          <>
          <LeagueScoreboardControls value={state.leagueOfLegends.scoreboard} blueTeamKey={state.leagueOfLegends.blueTeam} teamOne={teamOne.name} teamTwo={teamTwo.name} onChange={scoreboard => updateLeagueOfLegends({ scoreboard })} />
          <section className="panel-card browser-overlay-card browser-overlay-workspace" aria-label="League overlay visibility">
            <div className="card-title-row"><h2>Overlay visibility</h2></div>
            <div className="browser-overlay-widget-controls" aria-label="Overlay widget visibility">
              <div className="browser-overlay-widget-toggle">
                <div><strong>VS screen background</strong><small>Place the team-split VS treatment behind the Pick/Ban scene.</small></div>
                <label className="switch large"><input aria-label="Show League of Legends VS screen background" type="checkbox" checked={state.leagueOfLegends.vsScreenEnabled} onChange={(event) => updateLeagueOfLegends({ vsScreenEnabled: event.target.checked })} /><span /></label>
              </div>
              <div className="browser-overlay-widget-toggle">
                <div><strong>Sponsor widget</strong><small>Show the rotating included sponsors on Pick/Ban, Scoreboard, and VS.</small></div>
                <label className="switch large"><input aria-label="Enable League of Legends sponsor widget" type="checkbox" checked={state.leagueOfLegends.sponsorWidgetEnabled} onChange={(event) => updateLeagueOfLegends({ sponsorWidgetEnabled: event.target.checked })} /><span /></label>
              </div>
            </div>
          </section>
          </>
        ) : null}

        {leagueTab === "overlay" ? (
          <section className="panel-card browser-overlay-card browser-overlay-workspace league-overlay-links" aria-label="Browser overlay">
            <div className="card-title-row"><div><h2>League browser overlay</h2><p>Add each transparent 1920×1080 URL to its matching OBS or vMix scene. Manage visibility and live statistics in Overlay controls.</p></div></div>
            {[["Pick/Ban", LEAGUE_DRAFT_OVERLAY_URL], ["Scoreboard", LEAGUE_LIVE_OVERLAY_URL]].map(([label, url]) => (
              <div className="league-overlay-link" key={url}>
                <label className="field"><span className="field-label">{label}</span><input readOnly value={url} /></label>
                <button className="button secondary" type="button" onClick={() => copyLeagueOverlayLink(label, url)}>Copy</button>
                <button className="button secondary" type="button" onClick={() => openLeagueOverlay(url)}>Open</button>
              </div>
            ))}
            <div className="league-overlay-link">
              <label className="field"><span className="field-label">VS matchup URL</span><input readOnly value={LEAGUE_VS_OVERLAY_URL} /></label>
              <button className="button secondary" type="button" onClick={() => copyLeagueOverlayLink("League VS", LEAGUE_VS_OVERLAY_URL)}>Copy VS link</button>
              <button className="button secondary" type="button" onClick={() => openLeagueOverlay(LEAGUE_VS_OVERLAY_URL)}>Open VS overlay</button>
            </div>
          </section>
        ) : null}

        {leagueTab === "draft" ? (
          <div className="league-draft-layout">
            <section className="panel-card league-draft-control">
              <div className="card-title-row"><div><h2>Champion select</h2><p>Selections follow the selected draft format. Data Dragon {leagueCatalogVersion} supplies the champion catalog.</p></div></div>
              <p className="field-hint" role="status">{firstSelectionHint}</p>
              {firstSelectionControl}
              {activeStep ? (
                <div className="league-active-step">
                  <div><span>{activeStep.phase}</span><strong>{activeStep.side === "ORDER" ? blueTeam.name || "Blue side" : redTeam.name || "Red side"} · {activeStep.action === "pick" ? "Pick" : "Ban"} {Number(activeStep.slot) + 1}</strong></div>
                  <label className="field"><span className="field-label">Champion</span><select value={leagueChampion} onChange={(event) => setLeagueChampion(event.target.value)}><option value="">Select champion</option>{leagueCatalog.map((champion) => <option key={champion.id} value={champion.name} disabled={used.has(champion.name) || unavailable.has(champion.name)}>{champion.name}{unavailable.has(champion.name) ? " — fearless" : used.has(champion.name) ? " — used" : ""}</option>)}</select></label>
                  <button className="button primary" type="button" onClick={lockLeagueChampion} disabled={!leagueChampion}>Lock {activeStep.action}</button>
                </div>
              ) : <div className="league-draft-complete"><strong>Draft complete</strong><span>Review the role order below, then verify the spectator feed in Debug.</span></div>}
              <div className="league-draft-actions">
                <button className="button secondary" type="button" onClick={undoLeagueDraft} disabled={state.leagueOfLegends.draft.currentStep === 0}>Undo</button>
                <button className="button danger" type="button" onClick={resetLeagueDraft}>Reset draft</button>
              </div>
              <div className="league-role-order">
                <h3>Pick/Ban role assignments</h3>
                <p>Drag a role onto another pick to swap role assignments. You can also select a role, then its destination. Champions stay in their original pick slots.</p>
                {(["blue", "red"] as const).map((side) => (
                  <fieldset key={side}>
                    <legend>{side === "blue" ? blueTeam.name || "Blue side" : redTeam.name || "Red side"} · {side === "blue" ? "Blue" : "Red"}</legend>
                    <LeagueRoleOrder side={side} picks={picks[`${side}Picks`]} order={state.leagueOfLegends.draft[`${side}PickOrder`]} onAssign={(role, pick) => updateLeaguePickRole(side, role, pick)} />
                  </fieldset>
                ))}
              </div>
            </section>
            <section className="panel-card league-draft-history">
              <div className="card-title-row"><div><h2>Draft order</h2><p>{state.leagueOfLegends.draft.currentStep} of {draftSteps.length} selections locked.</p></div></div>
              <div className="league-draft-steps">{draftSteps.map((step) => <div className={`${step.index === state.leagueOfLegends.draft.currentStep ? "active" : ""} ${state.leagueOfLegends.draft.selections[step.index] ? "complete" : ""}`} key={step.index}><span>{String(step.index + 1).padStart(2, "0")}</span><strong>{step.side === "ORDER" ? "Blue" : "Red"} {step.action}</strong><small>{state.leagueOfLegends.draft.selections[step.index] || step.phase}</small></div>)}</div>
            </section>
          </div>
        ) : null}

        {leagueTab === "live" ? (
          <>
            <section className={`panel-card league-live-status ${liveConnected ? "connected" : "disconnected"}`}>
              <div><span className="eyebrow">Local spectator feed</span><h2>{state.leagueOfLegends.debugLiveEnabled ? "Debug fixture active" : liveConnected ? "League client connected" : liveStale ? "League data stale" : "Waiting for League client"}</h2><p>{liveConnected ? `${livePlayers.length} players · ${formatClock(Number(leagueLivePreview?.game?.gameTime ?? 0))}` : "Start or spectate a game on this Windows PC. Static team and series branding stays on air while live statistics are unavailable."}</p></div>
              <div className="league-live-toggles">
                <label><span>Debug data</span><span className="switch large"><input aria-label="Enable League of Legends debug data" type="checkbox" checked={state.leagueOfLegends.debugLiveEnabled} onChange={(event) => updateLeagueOfLegends({ debugLiveEnabled: event.target.checked })} /><span /></span></label>
                {state.leagueOfLegends.debugLiveEnabled ? <label><span>Scenario</span><select aria-label="League of Legends debug scenario" value={state.leagueOfLegends.debugLiveScenario} onChange={(event) => updateLeagueOfLegends({ debugLiveScenario: event.target.value as LeagueOfLegends["debugLiveScenario"] })}><option value="live">Full live match</option><option value="finished">Game finished</option><option value="stale">Connection stale</option></select></label> : null}
              </div>
            </section>
            {state.leagueOfLegends.debugLiveEnabled && liveConnected ? <section className="panel-card league-feed-coverage">
              <div className="card-title-row"><div><h2>Official Live Client coverage</h2><p>The debug fixture fills the complete normalized <code>/allgamedata</code> contract. Active-player gold is available for that player only and is never used as team gold.</p></div></div>
              <div className="league-coverage-grid">
                <div><span>Active player</span><strong>{activeLeaguePlayer?.riotId || "Unavailable"}</strong><small>{Object.keys(activeLeaguePlayer?.abilities ?? {}).length} abilities · {Object.keys(activeLeaguePlayer?.championStats ?? {}).length} champion stats · {activeLeaguePlayer?.currentGold ?? 0} active-player gold</small></div>
                <div><span>Game data</span><strong>{leagueLivePreview?.game?.mapName || "Unknown map"} · {leagueLivePreview?.game?.gameMode || "Unknown mode"}</strong><small>Map {leagueLivePreview?.game?.mapNumber ?? "—"} · {leagueLivePreview?.game?.mapTerrain || "Unknown terrain"} · {formatClock(Number(leagueLivePreview?.game?.gameTime ?? 0))}</small></div>
                <div><span>All players</span><strong>{livePlayers.length} players · {livePlayers.reduce((total, player) => total + (player.items?.length ?? 0), 0)} item slots</strong><small>Identity, champion, role, level, death/respawn, skin, K/D/A/CS/vision, runes, spells, and complete item properties</small></div>
                <div><span>Events</span><strong>{liveEvents.length} normalized events</strong><small>{liveEvents.map((event) => event.name).filter(Boolean).join(" · ") || "No events received"}</small></div>
              </div>
            </section> : null}
            <section className="panel-card league-player-table">
              <div className="card-title-row"><div><h2>Ten-player board</h2><p>Display names are local production overrides; Riot IDs remain the source identity.</p></div></div>
              <div className="league-player-head"><span>Side</span><span>Player</span><span>Champion</span><span>Role</span><span>Level</span><span>K / D / A</span><span>CS</span><span>Live details</span><span>Items</span></div>
              {livePlayers.length ? livePlayers.map((player: LeagueLivePreviewPlayer) => (
                <div className="league-player-row" key={`${player.team}-${player.riotId}`}>
                  <span>{player.team === "ORDER" ? "Blue" : "Red"}</span>
                  <label><span className="sr-only">Display name for {player.riotId}</span><input value={state.leagueOfLegends.playerOverrides[player.riotId] ?? player.displayName ?? ""} onChange={(event) => updateLeagueOfLegends({ playerOverrides: { ...state.leagueOfLegends.playerOverrides, [player.riotId]: event.target.value } })} /></label>
                  <strong>{player.champion || "—"}</strong><span>{player.position || "—"}</span><span>{player.level || "—"}</span><span>{player.kills} / {player.deaths} / {player.assists}</span><span>{player.creepScore}</span><small>{player.isDead ? `Respawn ${Math.ceil(player.respawnTimer)}s` : "Alive"} · {player.wardScore} vision · {player.runes?.keystone?.displayName || "No keystone"} · {(player.summonerSpells ?? []).map((spell) => spell.displayName).filter(Boolean).join(" + ") || "No spells"}</small><small>{(player.items ?? []).map((item) => `${item.name}${item.count > 1 ? ` ×${item.count}` : ""}`).filter(Boolean).join(", ") || "—"}</small>
                </div>
              )) : <div className="league-empty-row">No live players available. Enable Debug data to verify the full overlay without a running match.</div>}
            </section>
          </>
        ) : null}

        {leagueTab === "results" ? (
          <div className="rocket-league-layout game-results-layout">
            <section className="panel-card league-winner-card">
              <div className="card-title-row result-card-heading">
                <div><h2>Game results</h2><p>Select one winner for each game, then update results. Saved winners drive the current game, series score, and fearless history.</p></div>
                <div className="result-update-controls">
                  <span className={leaguePendingResults ? "pending" : "current"}>{leaguePendingResults ? `${leaguePendingResults} unsaved` : "Results current"}</span>
                  <button className={`button ${leaguePendingResults ? "primary" : "secondary"}`} type="button" onClick={saveLeagueResults} disabled={!leaguePendingResults}>Update results</button>
                  <button className="button danger" type="button" onClick={resetLeagueSeries}>Reset series</button>
                </div>
              </div>
              {state.leagueOfLegends.resultProposal ? (
                <div className="league-live-proposal">
                  <div><span>Live result detected</span><strong>Game {state.leagueOfLegends.resultProposal.gameNumber} · {state.leagueOfLegends.resultProposal.winner === "team1" ? teamOne.name || "Team 1" : state.leagueOfLegends.resultProposal.winner === "team2" ? teamTwo.name || "Team 2" : "Winner not detected"}</strong><small>Placed in results. Review the winner, then update results.</small></div>
                  <button className="button secondary" type="button" onClick={discardLeagueResultProposal}>Discard proposal</button>
                </div>
              ) : null}
              <div className="league-winner-table">
                <div className="league-winner-head" aria-hidden="true"><span>Game</span><strong>{teamOne.name || "Team 1"}</strong><strong>{teamTwo.name || "Team 2"}</strong><span>Clear</span></div>
                <div className="league-winner-list">
                  {Array.from({ length: leagueGameCount }, (_, gameIndex) => {
                    const result = state.leagueOfLegends.results[gameIndex];
                    const savedWinner = leagueConfirmedGames.find((game) => game.gameNumber === gameIndex + 1)?.winner ?? "";
                    const isPending = result.winner !== savedWinner;
                    const isSaved = Boolean(savedWinner) && !isPending;
                    const locked = !result.winner && (gameIndex > leagueDraftProgress.completedGames || (leagueDraftProgress.complete && gameIndex >= leagueDraftProgress.completedGames));
                    return (
                      <div className={`league-winner-row ${isSaved ? "complete" : ""} ${isPending ? "pending" : ""} ${locked ? "locked" : ""}`} key={gameIndex}>
                        <span>Game {gameIndex + 1}<small>{locked ? "Complete earlier games first" : isPending ? "Unsaved" : isSaved ? "Saved" : ""}</small></span>
                        <button disabled={locked} type="button" className={result.winner === "team1" ? "selected" : ""} aria-pressed={result.winner === "team1"} onClick={() => updateLeagueResult(gameIndex, "team1")}>{teamOne.name || "Team 1"}</button>
                        <button disabled={locked} type="button" className={result.winner === "team2" ? "selected" : ""} aria-pressed={result.winner === "team2"} onClick={() => updateLeagueResult(gameIndex, "team2")}>{teamTwo.name || "Team 2"}</button>
                        <button className="league-result-clear" type="button" onClick={() => updateLeagueResult(gameIndex, "")} disabled={locked || !result.winner}>Clear</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
            <div className="rocket-side-stack">
              <section className="panel-card rocket-setup-card">
                <div className="card-title-row"><div><h2>Scoreboard setup</h2><p>These values control the League graphics, series, and draft.</p></div></div>
                <div className="form-grid">
                  <Field
                    label="Scoreboard header override"
                    value={state.leagueOfLegends.scoreboardHeader}
                    onChange={(value) => updateLeagueOfLegends({ scoreboardHeader: value })}
                    placeholder={state.general.eventName || "Uses Event name"}
                    hint={state.leagueOfLegends.scoreboardHeader.trim() ? `On-air: ${leagueHeader}` : "Leave blank to use General Info event name."}
                  />
                  <label className="field"><span className="field-label">Series format</span><select value={state.leagueOfLegends.bestOf} onChange={(event) => updateLeagueBestOf(event.target.value as LeagueOfLegends["bestOf"])}><option>Bo1</option><option>Bo3</option><option>Bo5</option></select></label>
                  {firstSelectionControl}
                  <label className="field"><span className="field-label">Draft rules</span><select disabled={state.leagueOfLegends.draft.currentStep > 0} title={state.leagueOfLegends.draft.currentStep > 0 ? "Reset the draft before changing format" : undefined} value={state.leagueOfLegends.draftMode} onChange={(event) => updateLeagueOfLegends({ draftMode: event.target.value as LeagueOfLegends["draftMode"] })}><option value="standard">Tournament</option><option value="online">Standard</option><option value="fearless">Global fearless</option></select></label>
                  <label className="field"><span className="field-label">First pick side</span><select disabled={state.leagueOfLegends.draft.currentStep > 0} value={state.leagueOfLegends.draft.firstPickSide} onChange={(event) => updateLeagueOfLegends({ draft: { ...state.leagueOfLegends.draft, firstPickSide: event.target.value as LeagueDraftState["firstPickSide"] } })}><option value="ORDER">Blue · {blueTeam.name || "Blue team"}</option><option value="CHAOS">Red · {redTeam.name || "Red team"}</option></select></label>
                </div>
                <div className="valorant-toggle-list">
                  <p className="field-hint" role="status">{firstSelectionHint}</p>
                  <GameAutoAcceptControl gameName="League of Legends" checked={state.leagueOfLegends.autoAcceptLiveResults} onChange={(checked) => updateLeagueOfLegends({ autoAcceptLiveResults: checked })} />
                  <GameFlipSidesControl gameName="League of Legends" checked={state.leagueOfLegends.blueTeam === "team2"} onChange={(checked) => updateLeagueOfLegends({ blueTeam: checked ? "team2" : "team1" })} />
                </div>
              </section>
              <GameLiveMatchIndicators gameName="League of Legends" indicators={[
                { label: "Current game", value: state.leagueOfLegends.currentGame, detail: state.leagueOfLegends.bestOf },
                { label: teamOne.name || "Team 1", value: leagueSeries.teamOne, detail: "Series wins" },
                { label: teamTwo.name || "Team 2", value: leagueSeries.teamTwo, detail: "Series wins" },
              ]} />
            </div>
          </div>
        ) : null}

      </div>
    );
  }

  function renderSponsors() {
    const includedSponsors = state.sponsors.filter((sponsor) => sponsor.enabled && (sponsor.name.trim() || sponsor.logo.trim())).length;

    return (
      <div className="page-stack">
        <SectionHeading eyebrow="Partner rotation" title="Sponsors" description="Gaming Oasis always leads the rotation. Add and order the remaining on-air partners below it." />
        <section className="sponsor-overview panel-card">
          <div>
            <h2>Rotation</h2>
            <p>Only populated sponsor slots are written to the JSON file. Disabled partners remain saved in your local draft. Remote logos are loaded on this PC so vMix can display them.</p>
          </div>
          <p><strong>{includedSponsors}</strong> active <span>/</span> {filledSponsors} configured</p>
        </section>
        <section className="sponsor-list panel-card">
          <div className="sponsor-list-head" aria-hidden="true">
            <span>Slot</span>
            <span>Sponsor name</span>
            <span>Logo URL</span>
            <span>Included</span>
          </div>
          {state.sponsors.map((sponsor, index) => {
            const lockedSponsor = sponsor.id === GAMING_OASIS_SPONSOR.id;
            return (
              <div className={`sponsor-row ${sponsor.enabled ? "" : "disabled"} ${lockedSponsor ? "locked" : ""}`} key={sponsor.id}>
                <div className="sponsor-slot">
                  <span className="sponsor-preview">{sponsor.logo ? <img src={displayLogoUrl(sponsor.logo)} alt="" /> : String(index + 1).padStart(2, "0")}</span>
                  <small>{lockedSponsor ? "Fixed" : String(index).padStart(2, "0")}</small>
                </div>
                <label className="sponsor-row-field sponsor-name-field">
                  <span>Sponsor name</span>
                  <input value={sponsor.name} readOnly={lockedSponsor} onChange={(event) => updateSponsor(index, { name: event.target.value })} placeholder="Partner name" />
                </label>
                <label className="sponsor-row-field sponsor-logo-field">
                  <span>Logo URL</span>
                  <input value={sponsor.logo} readOnly={lockedSponsor} onChange={(event) => updateSponsor(index, { logo: event.target.value })} placeholder="https://..." />
                </label>
                <div className="sponsor-included">
                  {lockedSponsor ? <strong className="sponsor-locked-status">Always included</strong> : <><span>{sponsor.enabled ? "Included" : "Excluded"}</span><label className="switch" title="Include in sponsor rotation"><input aria-label={`Include ${sponsor.name || `sponsor slot ${index}`} in rotation`} type="checkbox" checked={sponsor.enabled} onChange={(event) => updateSponsor(index, { enabled: event.target.checked })} /><span /></label></>}
                </div>
              </div>
            );
          })}
        </section>
      </div>
    );
  }

  function renderDrawTabs() {
    const keys = Object.keys(DRAW_DEFINITIONS) as DrawKey[];
    return (
      <div className="tabs draw-tabs" role="tablist" aria-label="Draw show divisions" onKeyDown={handleTabListKeyDown}>
        <button role="tab" aria-selected={drawTab === "import"} tabIndex={drawTab === "import" ? 0 : -1} className={drawTab === "import" ? "active" : ""} type="button" onClick={() => { setDrawTab("import"); setDrawPastePool(null); setDrawPasteText(""); }}><small>Seeding</small>Import / Export</button>
        {keys.map((key) => <button role="tab" aria-selected={drawTab === key} tabIndex={drawTab === key ? 0 : -1} key={key} className={drawTab === key ? "active" : ""} type="button" onClick={() => { setDrawTab(key); setDrawPastePool(null); setDrawPasteText(""); setDrawPicker(null); setDrawPickerDraft(""); setDrawPickerQuery(""); }}><small>{DRAW_DEFINITIONS[key].game}</small>{DRAW_DEFINITIONS[key].label}</button>)}
      </div>
    );
  }

  function renderSeedingImport() {
    const keys = Object.keys(DRAW_DEFINITIONS) as DrawKey[];
    return (
      <>
        <SectionHeading eyebrow="Feature preview" title="Draw show" description="Upload the overall seed list for each division. Drag teams into the pools. Export writes the group list." action={<button className="button primary" type="button" onClick={exportSeeding}>Export groups</button>} />
        {renderDrawTabs()}
        <div className="import-grid">
          {keys.map((key) => {
            const definition = DRAW_DEFINITIONS[key];
            const teams = state.drawSeeding[key].teams;
            return (
              <section className="panel-card import-card" key={key}>
                <div className="import-card-title">
                  <div><span>{definition.label}</span><small>{definition.game} · {key}</small></div>
                  <div className="import-card-actions">
                    <label className="button compact">
                      Upload CSV
                      <input className="import-file" type="file" accept=".csv,text/csv" aria-label={`Upload ${key} seeding CSV`} onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) void importSeedingFile(key, file);
                      }} />
                    </label>
                    <button className="button compact" type="button" aria-label={`Export ${key} group list`} onClick={() => exportDivisionSeeding(key)}>Export CSV</button>
                    <button className="button compact" type="button" disabled={teams.length === 0} onClick={() => clearSeedingFile(key)}>Clear CSV</button>
                  </div>
                </div>
                <p className="import-empty">{teams.length ? `${teams.length} teams imported` : "No overall seed list uploaded."}</p>
              </section>
            );
          })}
        </div>
      </>
    );
  }

  function renderDrawDivision(division: DrawKey) {
    const definition = DRAW_DEFINITIONS[division];
    const catalog = state.drawSeeding[division].teams;
    const placed = placedSeedTeamIds(catalog, state.draws[division], state.drawSeeding[division].slots);
    const holding = unplacedSeedTeams(catalog, state.draws[division], state.drawSeeding[division].slots);
    return (
      <>
        <SectionHeading eyebrow="Feature preview" title="Draw show" description="Drag an imported team into a slot, search the dropdown, or type another name. Delete a name and press Enter to clear that row." />
        {renderDrawTabs()}
        <div className="pool-grid">
          {Array.from({ length: definition.pools }, (_, poolIndex) => (
            <section className="panel-card pool-card" key={poolIndex}>
              <div className="pool-title"><div><span>Pool {String.fromCharCode(65 + poolIndex)}</span><small>{definition.rows} entries</small></div><div className="pool-actions"><button type="button" onClick={() => { setDrawPastePool(poolIndex); setDrawPasteText(""); }}>Paste from Excel</button><button type="button" onClick={() => clearDrawPool(division, poolIndex)}>Clear</button></div></div>
              {drawPastePool === poolIndex ? <div className="excel-paste-panel"><label><span>Paste one Excel column</span><textarea autoFocus value={drawPasteText} onChange={(event) => setDrawPasteText(event.target.value)} placeholder={`Paste up to ${definition.rows} team names here`} /></label><div><small>{parseExcelPool(drawPasteText, definition.rows).filter(Boolean).length} of {definition.rows} entries detected</small><button type="button" onClick={() => { setDrawPastePool(null); setDrawPasteText(""); }}>Cancel</button><button className="apply" type="button" onClick={() => applyExcelPool(division, poolIndex)}>Apply to pool</button></div></div> : null}
              {Array.from({ length: definition.rows }, (_, rowIndex) => {
                const fieldKey = `P${poolIndex + 1}${rowIndex + 1}`;
                const menuId = `seed-menu-${division}-${fieldKey}`;
                const committed = state.draws[division][fieldKey];
                const open = drawPicker === fieldKey;
                const typed = (open ? drawPickerQuery : committed).trim();
                const matches = open ? sortSeedTeams(division, filterSeedTeams(catalog, drawPickerQuery)) : [];
                const exactMatch = catalog.some((team) => team.name.toLowerCase() === typed.toLowerCase());
                const options = open ? [
                  ...matches.map((team) => ({ kind: "team" as const, team })),
                  ...(typed && !exactMatch ? [{ kind: "custom" as const, name: typed }] : []),
                ] : [];
                const activeIndex = drawPickerIndex >= 0 ? Math.min(drawPickerIndex, Math.max(options.length - 1, 0)) : -1;
                const closePicker = () => {
                  setDrawPicker(null);
                  setDrawPickerDraft("");
                  setDrawPickerQuery("");
                };
                const chooseOption = (option: (typeof options)[number]) => {
                  if (option.kind === "team") {
                    if (placed.has(option.team.id)) return;
                    placeSeededTeam(division, fieldKey, option.team.id);
                  } else updateDrawSlot(division, fieldKey, option.name);
                  closePicker();
                };
                return (
                  <label
                    className={`pool-row${drawDropSlot === fieldKey ? " drop-target" : ""}`}
                    key={fieldKey}
                    onDragOver={(event) => { event.preventDefault(); setDrawDropSlot(fieldKey); }}
                    onDragLeave={() => setDrawDropSlot((current) => current === fieldKey ? null : current)}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDrawDropSlot(null);
                      closePicker();
                      const drag = seedingDragRef.current;
                      if (drag?.division === division) placeSeededTeam(division, fieldKey, drag.id);
                    }}
                  >
                    <span>{String(rowIndex + 1).padStart(2, "0")}</span>
                    <span className="pool-field">
                    <input
                      role="combobox"
                      aria-expanded={open && options.length > 0}
                      aria-controls={menuId}
                      aria-autocomplete="list"
                      value={open ? drawPickerDraft : committed}
                      placeholder="Search teams or type a name"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      name={`draw-${division}-${fieldKey}`}
                      onFocus={() => {
                        setDrawPicker(fieldKey);
                        setDrawPickerDraft(committed);
                        setDrawPickerQuery("");
                        setDrawPickerIndex(-1);
                      }}
                      onBlur={() => window.setTimeout(() => setDrawPicker((current) => current === fieldKey ? null : current), 120)}
                      onChange={(event) => {
                        setDrawPicker(fieldKey);
                        setDrawPickerDraft(event.target.value);
                        setDrawPickerQuery(event.target.value);
                        setDrawPickerIndex(event.target.value.trim() ? 0 : -1);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !drawPickerDraft.trim() && activeIndex < 0) {
                          event.preventDefault();
                          if (committed.trim()) updateDrawSlot(division, fieldKey, "");
                          closePicker();
                          return;
                        }
                        if (!open || options.length === 0) return;
                        if (event.key === "ArrowDown") {
                          event.preventDefault();
                          setDrawPickerIndex((current) => (current + 1) % options.length);
                        } else if (event.key === "ArrowUp") {
                          event.preventDefault();
                          setDrawPickerIndex((current) => (current - 1 + options.length) % options.length);
                        } else if (event.key === "Enter" && activeIndex >= 0) {
                          event.preventDefault();
                          chooseOption(options[activeIndex]);
                        } else if (event.key === "Escape") {
                          setDrawPicker(null);
                        }
                      }}
                    />
                    {open && options.length > 0 ? (
                      <div className="seed-menu" id={menuId} role="listbox">
                        {options.map((option, optionIndex) => (
                          <button
                            type="button"
                            role="option"
                            aria-selected={optionIndex === activeIndex}
                            key={option.kind === "team" ? option.team.id : "custom"}
                            className={`${option.kind === "team" && placed.has(option.team.id) ? "placed" : ""} ${optionIndex === activeIndex ? "active" : ""}`.trim()}
                            disabled={option.kind === "team" && placed.has(option.team.id)}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => chooseOption(option)}
                          >
                            {option.kind === "team" ? <><small>{seedHatLabel(division, option.team.seed)}</small><span>{option.team.name}</span></> : <span>Use “{option.name}”</span>}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    </span>
                    {committed.trim() ? <button className="row-clear" type="button" aria-label={`Clear row ${String(rowIndex + 1).padStart(2, "0")}`} onMouseDown={(event) => event.preventDefault()} onClick={() => { updateDrawSlot(division, fieldKey, ""); closePicker(); }}>Clear</button> : null}
                  </label>
                );
              })}
            </section>
          ))}
        </div>
        <section className="panel-card holding-tray">
          <div className="import-card-title"><div><span>Imported teams</span><small>{holding.length} ready to place</small></div></div>
          <p className="draw-order-note">{drawOrderNote(division)}</p>
          {catalog.length ? (
            <div className="hat-groups">
              {groupSeedTeamsByHat(division, catalog).map((group: { label: string; range: string; teams: SeededTeam[] }) => (
                <div key={group.label}>
                  <div className="hat-heading"><span>{group.label}</span>{group.range ? <small>Seeds {group.range}</small> : null}</div>
                  <div className="holding-chips">
                    {group.teams.map((team) => {
                      const isPlaced = placed.has(team.id);
                      return (
                      <button
                        className={isPlaced ? "seed-chip placed" : "seed-chip"}
                        type="button"
                        key={team.id}
                        draggable={!isPlaced}
                        disabled={isPlaced}
                        title={isPlaced ? "Already in a pool" : undefined}
                        aria-label={isPlaced ? `${team.name} is already in a pool` : `Drag ${team.name} into a pool`}
                        onDragStart={(event) => {
                          if (isPlaced) {
                            event.preventDefault();
                            return;
                          }
                          seedingDragRef.current = { division, id: team.id };
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", team.id);
                        }}
                        onDragEnd={() => { seedingDragRef.current = null; setDrawDropSlot(null); }}
                      >
                        <small>{seedHatLabel(division, team.seed)}</small>
                        <span>{team.name}</span>
                      </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="import-empty">Upload a seeding file on the Import / Export tab.</p>}
        </section>
      </>
    );
  }

  function renderDraw() {
    return (
      <div className="page-stack">
        {drawTab === "import" ? renderSeedingImport() : renderDrawDivision(drawTab)}
      </div>
    );
  }

  function renderSettings() {
    return (
      <div className="page-stack settings-page">
        <SectionHeading eyebrow="System configuration" title="Settings" description="Control sidebar visibility and manage this workstation's local draft." />
        {renderProductionDefaults()}
        <section className="panel-card settings-card">
          <div className="settings-card-copy"><div><h2>Sidebar visibility</h2><p>Choose which workspaces appear in the sidebar. Hiding one does not change its data or JSON output.</p></div></div>
          <div className="settings-rows">
            <div className="setting-row">
              <div><strong>General Info</strong><p>Show or hide General Info in the main navigation.</p></div>
              <label className="switch large"><input aria-label="Show General Info in sidebar" type="checkbox" checked={state.settings.generalInfoEnabled} onChange={(event) => setState((current) => ({ ...current, settings: { ...current.settings, generalInfoEnabled: event.target.checked } }))} /><span /></label>
            </div>
            <div className="setting-row">
              <div><strong>Rocket League</strong><p>Show or hide Rocket League in the main navigation.</p></div>
              <label className="switch large"><input aria-label="Show Rocket League in sidebar" type="checkbox" checked={state.settings.rocketLeagueEnabled} onChange={(event) => setState((current) => ({ ...current, settings: { ...current.settings, rocketLeagueEnabled: event.target.checked } }))} /><span /></label>
            </div>
            <div className="setting-row">
              <div><strong>VALORANT</strong><p>Show or hide VALORANT in the main navigation.</p></div>
              <label className="switch large"><input aria-label="Show VALORANT in sidebar" type="checkbox" checked={state.settings.valorantEnabled} onChange={(event) => setState((current) => ({ ...current, settings: { ...current.settings, valorantEnabled: event.target.checked } }))} /><span /></label>
            </div>
            <div className="setting-row">
              <div><strong>League of Legends</strong><p>Show or hide League of Legends in the main navigation.</p></div>
              <label className="switch large"><input aria-label="Show League of Legends in sidebar" type="checkbox" checked={state.settings.leagueOfLegendsEnabled} onChange={(event) => setState((current) => ({ ...current, settings: { ...current.settings, leagueOfLegendsEnabled: event.target.checked } }))} /><span /></label>
            </div>
            <div className="setting-row">
              <div><strong>Sponsors</strong><p>Show or hide Sponsors in the main navigation.</p></div>
              <label className="switch large"><input aria-label="Show Sponsors in sidebar" type="checkbox" checked={state.settings.sponsorsEnabled} onChange={(event) => setState((current) => ({ ...current, settings: { ...current.settings, sponsorsEnabled: event.target.checked } }))} /><span /></label>
            </div>
            <div className="setting-row">
              <div><strong>Draw Show</strong><p>Show or hide Draw Show in the main navigation.</p></div>
              <label className="switch large"><input aria-label="Show Draw Show in sidebar" type="checkbox" checked={state.settings.drawShowEnabled} onChange={(event) => setState((current) => ({ ...current, settings: { ...current.settings, drawShowEnabled: event.target.checked } }))} /><span /></label>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <main className={`app-shell ${hydrated && !isPrimaryTab ? "read-only-tab" : ""}`}>
      {hydrated && !isPrimaryTab ? (
        <div className="tab-ownership-banner" role="alert">
          <div><strong>Another browser or tab controls this workspace</strong><span>This copy is read-only to prevent conflicting JSON writes.</span></div>
          <button className="button primary" type="button" disabled={takingControl} aria-busy={takingControl} onClick={takeControlOfWorkspace}>{takingControl ? "Taking control…" : "Take control here"}</button>
        </div>
      ) : null}
      <aside className="sidebar" inert={hydrated && !isPrimaryTab ? true : undefined}>
        <button className="brand" onClick={() => goToSection("welcome")} aria-label="Gaming Oasis home">
          <img className="brand-wordmark" src="/gaming-oasis-logo-light.png" alt="Gaming Oasis" />
          <span className="brand-product">Production OS</span>
        </button>
        <nav aria-label="Primary navigation">
          <span className="nav-caption">Workspace</span>
          {navItems.map((item) => <button key={item.key} aria-current={visibleSection === item.key ? "page" : undefined} className={visibleSection === item.key ? "active" : ""} onClick={() => goToSection(item.key)}>{item.label}{visibleSection === item.key ? <i /> : null}</button>)}
        </nav>
        <div className="sidebar-footer">
          <button className="button export-button" type="button" aria-label="Export JSON package" aria-busy={exporting} disabled={exporting} onClick={exportAll}><span className="desktop-action-label">{exporting ? "Exporting JSON…" : "Export JSON package"}</span><span className="mobile-action-label">{exporting ? "Exporting…" : "Export JSON"}</span></button>
          <button ref={resetTriggerRef} className="button danger sidebar-reset-button" type="button" aria-label="Reset local data" onClick={() => setResetConfirmationOpen(true)}><span className="desktop-action-label">Reset local data</span><span className="mobile-action-label">Reset</span></button>
        </div>
      </aside>

      <section className="workspace" inert={hydrated && !isPrimaryTab ? true : undefined}>
        <div className="topbar">
          <div className="mobile-brand"><img src="/gaming-oasis-favicon.png" alt="" /><strong>Production OS</strong></div>
          <div className="breadcrumb">{sectionLabels[visibleSection]}</div>
          <div className="topbar-status" role="status" aria-live="polite" aria-atomic="true"><span className={`status-dot ${connection === "connected" ? "live" : ""}`} /> League Hub {connection === "connected" ? "synced" : connection === "error" ? "sync failed" : "ready"}<span className="topbar-divider" /><span className={`status-dot ${liveSync === "synced" ? "live" : ""}`} /> {liveSyncShortLabel(liveSync)}</div>
        </div>
        <div className="content-area">
          {visibleSection === "welcome" ? renderWelcome() : null}
          {visibleSection === "general" || visibleSection === "matches" ? renderGeneral() : null}
          <TwitchControls visible={visibleSection === "general" && generalTab === "talent"} enabled={hydrated && isPrimaryTab} />
          {visibleSection === "rocketLeague" ? renderRocketLeague() : null}
          {visibleSection === "valorant" ? renderValorant() : null}
          {visibleSection === "leagueOfLegends" ? renderLeagueOfLegends() : null}
          {visibleSection === "sponsors" ? renderSponsors() : null}
          {visibleSection === "draw" ? renderDraw() : null}
          {visibleSection === "settings" ? renderSettings() : null}
        </div>
      </section>
      {pendingConfirmation ? (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingConfirmation(null); }}>
          <div ref={actionConfirmationModalRef} className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="action-confirmation-title" aria-describedby="action-confirmation-description">
            <span className="eyebrow">Confirm action</span>
            <h2 id="action-confirmation-title">{pendingConfirmation.title}</h2>
            <p id="action-confirmation-description">{pendingConfirmation.description}</p>
            <div className="confirmation-modal-actions">
              <button className="button secondary" type="button" onClick={() => setPendingConfirmation(null)}>Cancel</button>
              <button className="button danger" type="button" onClick={() => {
                const confirmation = pendingConfirmation;
                setPendingConfirmation(null);
                if (isPrimaryTabRef.current) confirmation.onConfirm();
              }}>{pendingConfirmation.confirmLabel}</button>
            </div>
          </div>
        </div>
      ) : null}
      {resetConfirmationOpen ? (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setResetConfirmationOpen(false); }}>
          <div ref={resetModalRef} className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="reset-modal-title" aria-describedby="reset-modal-description">
            <span className="eyebrow">Confirm reset</span>
            <h2 id="reset-modal-title">Clear entered production data?</h2>
            <p id="reset-modal-description">This clears event and team details, results, picks and bans, manual statistics and active timers, entered sponsors, and all draw data. Your production settings, sidebar preferences, and map artwork configuration stay as they are. This cannot be undone.</p>
            <div className="confirmation-modal-actions">
              <button className="button secondary" type="button" onClick={() => setResetConfirmationOpen(false)}>Cancel</button>
              <button className="button danger" type="button" onClick={resetLocalData}>Reset local data</button>
            </div>
          </div>
        </div>
      ) : null}
      {rocketLeagueSeriesResetOpen ? (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setRocketLeagueSeriesResetOpen(false); }}>
          <div ref={seriesResetModalRef} className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="series-reset-modal-title" aria-describedby="series-reset-modal-description">
            <span className="eyebrow">Confirm reset</span>
            <h2 id="series-reset-modal-title">Reset Rocket League series?</h2>
            <p id="series-reset-modal-description">This clears all game scores in the draft and live JSON. Best of, scoreboard header, side flip, and overlay settings stay as they are. This cannot be undone.</p>
            <div className="confirmation-modal-actions">
              <button className="button secondary" type="button" onClick={() => setRocketLeagueSeriesResetOpen(false)}>Cancel</button>
              <button className="button danger" type="button" onClick={resetRocketLeagueSeries}>Reset series</button>
            </div>
          </div>
        </div>
      ) : null}
      {valorantSeriesResetOpen ? (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setValorantSeriesResetOpen(false); }}>
          <div ref={valorantSeriesResetModalRef} className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="valorant-series-reset-modal-title" aria-describedby="valorant-series-reset-modal-description">
            <span className="eyebrow">Confirm reset</span>
            <h2 id="valorant-series-reset-modal-title">Reset VALORANT series?</h2>
            <p id="valorant-series-reset-modal-description">This clears all map scores in the draft and live JSON. Best of, scoreboard header, side flip, picks/bans, and overlay settings stay as they are. This cannot be undone.</p>
            <div className="confirmation-modal-actions">
              <button className="button secondary" type="button" onClick={() => setValorantSeriesResetOpen(false)}>Cancel</button>
              <button className="button danger" type="button" onClick={resetValorantSeries}>Reset series</button>
            </div>
          </div>
        </div>
      ) : null}
      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </main>
  );
}
