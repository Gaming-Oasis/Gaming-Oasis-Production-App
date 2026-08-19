"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { shortTeamName, TEAM_NAME_LIMIT } from "../lib/team-name.mjs";
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
import {
  buildValorantOverlayState,
  buildValorantFields,
  calculateValorantSeries,
  createValorantGames,
  getValorantCurrentMap,
  getValorantCurrentSides,
  VALORANT_GAME_COUNT,
  VALORANT_MAP_ARTWORK,
} from "../lib/valorant.mjs";

type Section = "welcome" | "general" | "matches" | "rocketLeague" | "valorant" | "sponsors" | "draw" | "settings";
type ConnectionState = "idle" | "connected" | "error";
type LiveSyncState = "starting" | "saving" | "synced" | "error";
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
  regionalLogo: string;
  rocketLeagueEnabled: boolean;
  valorantEnabled: boolean;
  sponsorsEnabled: boolean;
  drawShowEnabled: boolean;
};

type DrawKey = "RLT1" | "RLT2" | "VALT1" | "VALT2";
type DrawData = Record<DrawKey, Record<string, string>>;

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
  valorantMapData: ValorantMapData;
  sponsors: Sponsor[];
  settings: Settings;
  draws: DrawData;
};

type ExportFile = { filename: string; data: unknown };

const STORAGE_KEY = "gaming-oasis-production-v1";
const LIVE_JSON_ENDPOINT = "http://127.0.0.1:4877/api/live-json";
const ROCKET_LEAGUE_LIVE_OVERLAY_ENDPOINT = "http://127.0.0.1:4877/api/overlays/rocket-league";
const ROCKET_LEAGUE_MATCH_PAUSED_ENDPOINT = "http://127.0.0.1:4877/api/rocket-league/match-paused";
const VALORANT_OVERLAY_URL = "http://localhost:3000/overlays/valorant";
const VALORANT_VS_OVERLAY_URL = "http://localhost:3000/overlays/valorant/vs";
const ROCKET_LEAGUE_OVERLAY_URL = "http://localhost:3000/overlays/rocket-league";
const ROCKET_LEAGUE_VS_OVERLAY_URL = "http://localhost:3000/overlays/rocket-league/vs";
const ROCKET_LEAGUE_STATS_OVERLAY_URL = "http://localhost:3000/overlays/rocket-league/stats";
const GAMING_OASIS_SPONSOR: Sponsor = {
  id: "gaming-oasis",
  name: "Gaming Oasis",
  logo: "http://localhost:3000/gaming-oasis-logo-light.png",
  enabled: true,
};
const LOCAL_PUBLIC_ENDPOINT = "http://127.0.0.1:4877/api/public";
const MATCH_LOOKUP_ENDPOINT = `${LOCAL_PUBLIC_ENDPOINT}/matches`;

function displayLogoUrl(value: string) {
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
  return { id: "", team1: emptyTeam(), team2: emptyTeam(), league: emptyLeague() };
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
      lobbyScene: "vs",
      statsSceneBackground: "transparent",
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
      regionalLogo: "",
      rocketLeagueEnabled: true,
      valorantEnabled: true,
      sponsorsEnabled: true,
      drawShowEnabled: true,
    },
    draws: createDraws(),
  };
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
  const scoresHaveContent = (games: Array<{ home: string; away: string }>) => games.some((game) => hasText(game.home) || hasText(game.away));

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
    state.general.currentSegment,
    state.rocketLeague.scoreboardHeader,
    state.valorant.scoreboardHeader,
    state.settings.regionalLogo,
  ].some(hasText)
    || state.general.segments.some(hasText)
    || state.general.matches.some((match) => hasText(match.id) || teamHasContent(match.team1) || teamHasContent(match.team2) || leagueHasContent(match.league))
    || scoresHaveContent(state.rocketLeague.games)
    || scoresHaveContent(state.rocketLeague.savedGames)
    || scoresHaveContent(state.valorant.games)
    || scoresHaveContent(state.valorant.savedGames)
    || Object.values(state.valorant.bo3).some(hasText)
    || Object.values(state.valorant.bo5).some(hasText)
    || state.sponsors.some((sponsor) => sponsor.id !== GAMING_OASIS_SPONSOR.id && (hasText(sponsor.name) || hasText(sponsor.logo)))
    || Object.values(state.draws).some((draw) => Object.values(draw).some(hasText));
}

function mergeTeam(saved?: Partial<Team>): Team {
  const initial = emptyTeam();
  const detectedBackground = normalizeLogoBackground(saved?.logoBackground) || initial.logoBackground;
  const overrideBackground = normalizeLogoBackground(saved?.overrides?.logoBackground);
  const sourceName = saved?.sourceName?.trim() || saved?.name?.trim() || "";
  let placement = saved?.placement?.trim() || "";
  let standing = saved?.standing?.trim() || "";
  const seed = saved?.seed?.trim() || "";
  if (!placement && standing.includes("/")) {
    const [legacyPlacement, ...legacyStanding] = standing.split(/\s*\/\s*/);
    placement = legacyPlacement.trim();
    standing = legacyStanding.join(" / ").trim();
  } else if (!placement && /^\d+(st|nd|rd|th)$/i.test(standing)) {
    placement = standing;
    standing = "";
  }
  const requestedDisplay: StandingDisplay = saved?.standingDisplay === "placement" || saved?.standingDisplay === "seed"
    ? saved.standingDisplay
    : "standing";
  const standingDisplay = requestedDisplay === "standing" && !standing
    ? placement ? "placement" : seed ? "seed" : "standing"
    : requestedDisplay === "placement" && !placement
      ? standing ? "standing" : seed ? "seed" : "placement"
      : requestedDisplay === "seed" && !seed
        ? standing ? "standing" : placement ? "placement" : "seed"
        : requestedDisplay;
  return {
    ...initial,
    ...saved,
    sourceName,
    name: shortTeamName(sourceName),
    placement,
    standing,
    seed,
    standingDisplay,
    logoBackground: detectedBackground,
    overrides: { ...initial.overrides, ...(saved?.overrides ?? {}), logoBackground: overrideBackground },
  };
}

function mergeLeague(saved?: Partial<MatchLeague>): MatchLeague {
  const initial = emptyLeague();
  return {
    ...initial,
    ...saved,
    primaryColor: saved?.primaryColor?.trim() || initial.primaryColor,
    secondaryColor: saved?.secondaryColor?.trim() || initial.secondaryColor,
    overrides: { ...initial.overrides, ...(saved?.overrides ?? {}) },
  };
}

function mergeMatch(saved?: Partial<Match>): Match {
  return {
    id: saved?.id ?? "",
    team1: mergeTeam(saved?.team1),
    team2: mergeTeam(saved?.team2),
    league: mergeLeague(saved?.league),
  };
}

function mergeSavedState(saved: Partial<ProductionState>): ProductionState {
  const initial = createInitialState();
  const savedSponsors = (saved.sponsors ?? []).filter((sponsor) => sponsor.id !== GAMING_OASIS_SPONSOR.id);
  const savedGeneral = { ...(saved.general ?? {}) } as Partial<GeneralInfo> & { broadcastDate?: unknown; productionNote?: unknown };
  delete savedGeneral.broadcastDate;
  delete savedGeneral.productionNote;
  const savedSettings = { ...(saved.settings ?? {}) } as Partial<Settings> & { generalInfoEnabled?: unknown; leagueHubUrl?: unknown; apiKey?: unknown; matchRoute?: unknown };
  delete savedSettings.generalInfoEnabled;
  delete savedSettings.leagueHubUrl;
  delete savedSettings.apiKey;
  delete savedSettings.matchRoute;
  const savedRocketLeagueResults = saved.rocketLeague?.savedGames ?? saved.rocketLeague?.games;
  const savedValorantResults = saved.valorant?.savedGames ?? saved.valorant?.games;
  const savedMapArtwork = Array.isArray(saved.valorantMapData?.maps) ? saved.valorantMapData.maps : [];
  return {
    general: {
      ...initial.general,
      ...savedGeneral,
      segments: saved.general?.segments?.slice(0, 8) ?? initial.general.segments,
      matches: [mergeMatch(saved.general?.matches?.[0]), mergeMatch(saved.general?.matches?.[1])],
    },
    rocketLeague: {
      ...initial.rocketLeague,
      ...(saved.rocketLeague ?? {}),
      bestOf: ["Bo1", "Bo3", "Bo5", "Bo7"].includes(saved.rocketLeague?.bestOf ?? "")
        ? saved.rocketLeague!.bestOf
        : initial.rocketLeague.bestOf,
      flipSides: Boolean(saved.rocketLeague?.flipSides),
      playerCardEnabled: saved.rocketLeague?.playerCardEnabled !== false,
      sponsorWidgetEnabled: saved.rocketLeague?.sponsorWidgetEnabled !== false,
      broadcastSetupEnabled: saved.rocketLeague?.broadcastSetupEnabled !== false,
      lobbyScene: saved.rocketLeague?.lobbyScene === "stats" ? "stats" : "vs",
      statsSceneBackground: saved.rocketLeague?.statsSceneBackground === "team-split" ? "team-split" : "transparent",
      autoAcceptLiveResults: Boolean(saved.rocketLeague?.autoAcceptLiveResults),
      lastLiveResultProposalKey: String(saved.rocketLeague?.lastLiveResultProposalKey || ""),
      debugActivePlayerEnabled: Boolean(saved.rocketLeague?.debugActivePlayerEnabled),
      debugActivePlayerScenario: normalizeActivePlayerScenario(
        saved.rocketLeague?.debugActivePlayerScenario,
      ) as RocketLeagueActivePlayerScenario,
      debugLive: normalizeDebugLive(
        saved.rocketLeague?.debugLive,
        saved.rocketLeague?.debugActivePlayerScenario,
      ) as RocketLeagueDebugLive,
      games: initial.rocketLeague.games.map((game, index) => ({
        ...game,
        ...(saved.rocketLeague?.games?.[index] ?? {}),
      })),
      savedGames: initial.rocketLeague.savedGames.map((game, index) => ({
        ...game,
        ...(savedRocketLeagueResults?.[index] ?? {}),
      })),
    },
    valorant: {
      ...initial.valorant,
      ...(saved.valorant ?? {}),
      mapWidgetEnabled: saved.valorant?.mapWidgetEnabled ?? true,
      sponsorWidgetEnabled: saved.valorant?.sponsorWidgetEnabled ?? true,
      bestOf: ["Bo1", "Bo3", "Bo5"].includes(saved.valorant?.bestOf ?? "")
        ? saved.valorant!.bestOf
        : initial.valorant.bestOf,
      games: initial.valorant.games.map((game, index) => ({
        ...game,
        ...(saved.valorant?.games?.[index] ?? {}),
      })),
      savedGames: initial.valorant.savedGames.map((game, index) => ({
        ...game,
        ...(savedValorantResults?.[index] ?? {}),
      })),
      bo3: { ...initial.valorant.bo3, ...(saved.valorant?.bo3 ?? {}) },
      bo5: { ...initial.valorant.bo5, ...(saved.valorant?.bo5 ?? {}) },
    },
    valorantMapData: {
      maps: savedMapArtwork.length > 0
        ? savedMapArtwork.map((map) => ({
          name: String(map?.name ?? ""),
          nextMap: String(map?.nextMap ?? ""),
          pickCard: String(map?.pickCard ?? ""),
          banCard: String(map?.banCard ?? ""),
        }))
        : initial.valorantMapData.maps.map((map) => ({ ...map })),
    },
    sponsors: initial.sponsors.map((sponsor, index) => index === 0
      ? { ...GAMING_OASIS_SPONSOR }
      : { ...sponsor, ...(savedSponsors[index - 1] ?? {}) }),
    settings: {
      ...initial.settings,
      ...savedSettings,
      rocketLeagueEnabled: savedSettings.rocketLeagueEnabled ?? true,
      valorantEnabled: savedSettings.valorantEnabled ?? true,
      sponsorsEnabled: savedSettings.sponsorsEnabled ?? true,
      drawShowEnabled: savedSettings.drawShowEnabled ?? true,
    },
    draws: (Object.keys(initial.draws) as DrawKey[]).reduce((all, key) => {
      all[key] = { ...initial.draws[key], ...(saved.draws?.[key] ?? {}) };
      return all;
    }, {} as DrawData),
  };
}

const upper = (value: string) => value.trim().toUpperCase();

function selectedTeamColor(team: Team) {
  const custom = team.overrides.color.trim();
  if (custom && colorToRgb(custom)) return custom;
  if (team.selectedColor === "alternate") return team.alternateColor;
  if (team.selectedColor === "backup1") return team.backupColor1;
  if (team.selectedColor === "backup2") return team.backupColor2;
  return team.color;
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
  return {
    name: league.overrides.name.trim() || league.name.trim(),
    logo: league.overrides.logo.trim() || league.logo.trim(),
    primaryColor: league.overrides.primaryColor.trim() || league.primaryColor.trim() || "#F6AC18",
    secondaryColor: league.overrides.secondaryColor.trim() || league.secondaryColor.trim() || "#47213F",
    eventName: league.overrides.eventName.trim() || league.eventName.trim(),
  };
}

function applyLeagueColorsToTeams(team1: Team, team2: Team, primaryColor: string, secondaryColor: string): { team1: Team; team2: Team } {
  return {
    team1: { ...team1, backupColor1: primaryColor, backupColor2: secondaryColor },
    team2: { ...team2, backupColor1: primaryColor, backupColor2: secondaryColor },
  };
}

function colorToRgb(value: string) {
  const hex = value.trim().replace(/^#/, "");
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
    };
  }
  const rgb = value.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
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
  return colorToRgb(value) ? value : fallback;
}

function resultIsPending(draft: RocketLeagueGame, saved: RocketLeagueGame) {
  return draft.home !== saved.home || draft.away !== saved.away;
}

function pendingResultCount(draft: RocketLeagueGame[], saved: RocketLeagueGame[]) {
  return draft.filter((game, index) => resultIsPending(game, saved[index] ?? { home: "", away: "" })).length;
}

type ResultStatus = "blank" | "valid" | "partial" | "tied";

function resultStatus(game: RocketLeagueGame): ResultStatus {
  const home = game.home.trim();
  const away = game.away.trim();
  if (!home && !away) return "blank";
  if (!home || !away) return "partial";
  return Number(home) === Number(away) ? "tied" : "valid";
}

function invalidResultCount(games: RocketLeagueGame[]) {
  return games.filter((game) => {
    const status = resultStatus(game);
    return status === "partial" || status === "tied";
  }).length;
}

function valorantSideLabel(side: string) {
  if (side === "attack") return "Attack side";
  if (side === "defense") return "Defense side";
  return "Side not selected";
}

function buildFinalOutput(general: GeneralInfo, rocketLeague: RocketLeague, valorant: Valorant, mapArtwork: ValorantMapArtwork[]) {
  const output: Record<string, string> = {
    eventname: upper(general.eventName),
    maincaster: upper(general.mainCaster),
    secondcaster: upper(general.secondCaster),
    guest1: upper(general.guest1),
    guest2: upper(general.guest2),
    mainsocial: general.mainCasterSocial.replace(/^@/, "").trim(),
    secondarysocial: general.secondaryCasterSocial.replace(/^@/, "").trim(),
    startingtitle: upper(general.startingSoonTitle),
    interviewname: upper(general.interviewName),
    podcasttitle: upper(general.podcastTitle),
    currentsegment: general.currentSegment,
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

  rocketLeague.savedGames.forEach((game, index) => {
    output[`rlscore${index + 1}`] = formatRocketLeagueScore(game);
  });
  const series = calculateRocketLeagueSeries(rocketLeague.savedGames);
  output.rlheader = resolveScoreboardHeader(rocketLeague.scoreboardHeader, general.eventName);
  output["rlformat#"] = rocketLeague.bestOf;
  output.rlroundnumber = String(series.roundNumber);
  output.rlseriesscore1 = String(series.homeWins);
  output.rlseriesscore2 = String(series.awayWins);

  Object.assign(
    output,
    buildValorantFields(
      { ...valorant, games: valorant.savedGames },
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
    data: [state.draws[key]],
  }));

  return [
    { filename: "FinalOutput.json", data: buildFinalOutput(state.general, state.rocketLeague, state.valorant, state.valorantMapData.maps) },
    { filename: "sponsors.json", data: sponsors },
    ...drawFiles,
  ];
}

function downloadJSON(file: ExportFile) {
  const blob = new Blob([JSON.stringify(file.data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function writeFilesToFolder(files: ExportFile[]) {
  const picker = (window as unknown as {
    showDirectoryPicker?: () => Promise<{
      getFileHandle: (name: string, options: { create: boolean }) => Promise<{
        createWritable: () => Promise<{ write: (value: string) => Promise<void>; close: () => Promise<void> }>;
      }>;
    }>;
  }).showDirectoryPicker;

  if (!picker) return false;
  const directory = await picker();
  for (const file of files) {
    const handle = await directory.getFileHandle(file.filename, { create: true });
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(file.data, null, 2));
    await writable.close();
  }
  return true;
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

export default function Home() {
  const [state, setState] = useState<ProductionState>(() => createInitialState());
  const [activeSection, setActiveSection] = useState<Section>("welcome");
  const [generalTab, setGeneralTab] = useState<"talent" | "segments">("talent");
  const [valorantTab, setValorantTab] = useState<"results" | "pickBans" | "mapPool" | "overlay">("results");
  const [rocketLeagueTab, setRocketLeagueTab] = useState<"results" | "overlay" | "admin" | "debug">("results");
  const [drawTab, setDrawTab] = useState<DrawKey>("RLT1");
  const [drawPastePool, setDrawPastePool] = useState<number | null>(null);
  const [drawPasteText, setDrawPasteText] = useState("");
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [syncingMatch, setSyncingMatch] = useState<number | null>(null);
  const [liveSync, setLiveSync] = useState<LiveSyncState>("starting");
  const [toast, setToast] = useState("");
  const [resetConfirmationOpen, setResetConfirmationOpen] = useState(false);
  const [rocketLeagueSeriesResetOpen, setRocketLeagueSeriesResetOpen] = useState(false);
  const [valorantSeriesResetOpen, setValorantSeriesResetOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [liveWriteReady, setLiveWriteReady] = useState(false);
  const [allowEmptyLiveWrite, setAllowEmptyLiveWrite] = useState(false);
  const initialStateRef = useRef(state);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetModalRef = useRef<HTMLDivElement>(null);
  const resetTriggerRef = useRef<HTMLButtonElement>(null);
  const seriesResetModalRef = useRef<HTMLDivElement>(null);
  const seriesResetTriggerRef = useRef<HTMLButtonElement>(null);
  const valorantSeriesResetModalRef = useRef<HTMLDivElement>(null);
  const valorantSeriesResetTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        setState(mergeSavedState(JSON.parse(raw)));
        setLiveWriteReady(true);
      }
    } catch {
      // Invalid old drafts are ignored so operators can still open the tool.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!liveWriteReady) {
      if (state === initialStateRef.current) return;
      setLiveWriteReady(true);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, hydrated, liveWriteReady]);

  useEffect(() => {
    if (!resetConfirmationOpen) return;
    const modal = resetModalRef.current;
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
      resetTriggerRef.current?.focus();
    };
  }, [resetConfirmationOpen]);

  useEffect(() => {
    if (!rocketLeagueSeriesResetOpen) return;
    const modal = seriesResetModalRef.current;
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
      seriesResetTriggerRef.current?.focus();
    };
  }, [rocketLeagueSeriesResetOpen]);

  useEffect(() => {
    if (!valorantSeriesResetOpen) return;
    const modal = valorantSeriesResetModalRef.current;
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
      valorantSeriesResetTriggerRef.current?.focus();
    };
  }, [valorantSeriesResetOpen]);

  const files = useMemo(() => buildExportFiles(state), [
    state.general,
    state.rocketLeague.scoreboardHeader,
    state.rocketLeague.bestOf,
    state.rocketLeague.savedGames,
    state.valorant.scoreboardHeader,
    state.valorant.bestOf,
    state.valorant.flipSides,
    state.valorant.banSwap,
    state.valorant.savedGames,
    state.valorant.bo3,
    state.valorant.bo5,
    state.valorantMapData,
    state.sponsors,
    state.draws,
  ]);
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
  const hasLiveProductionContent = useMemo(() => hasProductionContent(state), [state]);
  const filledSponsors = state.sponsors.filter((sponsor) => sponsor.name.trim() || sponsor.logo.trim()).length;
  const filledMatches = state.general.matches.filter((match) => resolveTeam(match.team1).name && resolveTeam(match.team2).name).length;
  const rocketLeagueSeries = calculateRocketLeagueSeries(state.rocketLeague.savedGames);
  const rocketLeaguePendingResults = pendingResultCount(state.rocketLeague.games, state.rocketLeague.savedGames);
  const rocketLeagueInvalidResults = invalidResultCount(state.rocketLeague.games);
  const rocketLeagueHeader = resolveScoreboardHeader(state.rocketLeague.scoreboardHeader, state.general.eventName);
  const rocketLeagueReady = Boolean(rocketLeagueHeader);
  const valorantSeries = calculateValorantSeries(state.valorant.savedGames);
  const valorantCurrentMap = getValorantCurrentMap(state.valorant, valorantSeries.roundNumber);
  const valorantCurrentSides = getValorantCurrentSides(state.valorant, valorantSeries.roundNumber);
  const valorantPendingResults = pendingResultCount(state.valorant.games, state.valorant.savedGames);
  const valorantInvalidResults = invalidResultCount(state.valorant.games);
  const valorantHeader = resolveScoreboardHeader(state.valorant.scoreboardHeader, state.general.eventName);
  const valorantReady = Boolean(valorantHeader);

  useEffect(() => {
    if (!hydrated || !liveWriteReady) return;
    if (!hasLiveProductionContent && !allowEmptyLiveWrite) return;
    const controller = new AbortController();
    setLiveSync("saving");
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(LIVE_JSON_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            files,
            overlays: { valorant: valorantOverlay, rocketLeague: rocketLeagueOverlay },
            valorantMapData: state.valorantMapData,
          }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (allowEmptyLiveWrite) setAllowEmptyLiveWrite(false);
        setLiveSync("synced");
      } catch (error) {
        if ((error as Error).name !== "AbortError") setLiveSync("error");
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [files, valorantOverlay, rocketLeagueOverlay, state.valorantMapData, hydrated, liveWriteReady, hasLiveProductionContent, allowEmptyLiveWrite]);

  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    const controller = new AbortController();
    let winnerLatchId = "";

    async function pollFinishedGame() {
      try {
        const response = await fetch(ROCKET_LEAGUE_LIVE_OVERLAY_ENDPOINT, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!active || response.status === 204 || !response.ok) return;
        const payload = await response.json();
        const finished = payload?.finishedGame;
        const liveGame = payload?.game;
        let candidate = null;
        if (finished && typeof finished === "object" && finished.id) {
          candidate = finished;
          winnerLatchId = String(finished.id);
        } else if (liveGame?.hasWinner && liveGame.scoreOne !== liveGame.scoreTwo) {
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
      }
    }

    pollFinishedGame();
    const timer = window.setInterval(pollFinishedGame, 500);
    return () => {
      active = false;
      window.clearInterval(timer);
      controller.abort();
    };
  }, [hydrated]);

  function notify(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3200);
  }

  function updateGeneral<K extends keyof GeneralInfo>(key: K, value: GeneralInfo[K]) {
    setState((current) => ({ ...current, general: { ...current.general, [key]: value } }));
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

  async function setRocketLeagueMatchPaused(paused: boolean) {
    try {
      const response = await fetch(ROCKET_LEAGUE_MATCH_PAUSED_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ paused }),
      });
      const payload = await response.json().catch(() => ({}));
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
        savedGames: current.rocketLeague.games.map((game) => ({ ...game })),
      },
    }));
    notify("Rocket League results updated in JSON");
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
        savedGames: current.valorant.games.map((game) => ({ ...game })),
      },
    }));
    notify("VALORANT results updated in JSON");
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

  function updateValorantBo3(key: keyof ValorantBo3, value: string) {
    setState((current) => ({
      ...current,
      valorant: { ...current.valorant, bo3: { ...current.valorant.bo3, [key]: value } as ValorantBo3 },
    }));
  }

  function updateValorantBo5(key: keyof ValorantBo5, value: string) {
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
      const colored = applyLeagueColorsToTeams(match.team1, match.team2, resolved.primaryColor, resolved.secondaryColor);
      matches[matchIndex] = { ...match, ...colored, league };
      return {
        ...current,
        general: {
          ...current.general,
          eventName: matchIndex === 0 ? resolved.eventName || current.general.eventName : current.general.eventName,
          matches,
        },
      };
    });
  }

  function resetLeagueOverrides(matchIndex: number) {
    setState((current) => {
      const matches = [...current.general.matches] as [Match, Match];
      const match = matches[matchIndex];
      const league = { ...match.league, overrides: emptyLeagueOverrides() };
      const resolved = resolveLeague(league);
      const colored = applyLeagueColorsToTeams(match.team1, match.team2, resolved.primaryColor, resolved.secondaryColor);
      matches[matchIndex] = { ...match, ...colored, league };
      return {
        ...current,
        general: {
          ...current.general,
          eventName: matchIndex === 0 ? resolved.eventName || current.general.eventName : current.general.eventName,
          matches,
        },
      };
    });
    notify(`Match ${matchIndex + 1} league overrides reset`);
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
    updateTeam(matchIndex, teamKey, { selectedColor: "primary", overrides: emptyOverrides() });
    notify(`Match ${matchIndex + 1} ${teamKey === "team1" ? "team 1" : "team 2"} overrides reset`);
  }

  function parseExcelPool(text: string, maximumRows: number) {
    const lines = text.replace(/\r/g, "").split("\n");
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    const cells = lines.length === 1 && lines[0]?.includes("\t")
      ? lines[0].split("\t")
      : lines.map((line) => line.split("\t")[0] ?? "");
    return cells.slice(0, maximumRows).map((cell) => cell.trim());
  }

  function applyExcelPool(poolIndex: number) {
    const definition = DRAW_DEFINITIONS[drawTab];
    const entries = parseExcelPool(drawPasteText, definition.rows);
    if (!entries.some(Boolean)) {
      notify("Paste at least one team from Excel");
      return;
    }
    setState((current) => {
      const pool = { ...current.draws[drawTab] };
      for (let row = 0; row < definition.rows; row += 1) pool[`P${poolIndex + 1}${row + 1}`] = entries[row] ?? "";
      return { ...current, draws: { ...current.draws, [drawTab]: pool } };
    });
    setDrawPastePool(null);
    setDrawPasteText("");
    notify(`Pool ${String.fromCharCode(65 + poolIndex)} updated from Excel`);
  }

  function clearDrawPool(poolIndex: number) {
    const definition = DRAW_DEFINITIONS[drawTab];
    if (!window.confirm(`Clear every entry in Pool ${String.fromCharCode(65 + poolIndex)}?`)) return;
    setState((current) => {
      const pool = { ...current.draws[drawTab] };
      for (let row = 0; row < definition.rows; row += 1) pool[`P${poolIndex + 1}${row + 1}`] = "";
      return { ...current, draws: { ...current.draws, [drawTab]: pool } };
    });
    if (drawPastePool === poolIndex) {
      setDrawPastePool(null);
      setDrawPasteText("");
    }
    notify(`Pool ${String.fromCharCode(65 + poolIndex)} cleared`);
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
    try {
      if (await writeFilesToFolder(files)) {
        notify("6 JSON files written to your selected folder");
        return;
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
    }

    files.forEach((file, index) => window.setTimeout(() => downloadJSON(file), index * 120));
    notify("JSON package downloaded");
  }

  function updateValorantMapArtwork(index: number, key: "name" | "nextMap" | "pickCard" | "banCard", value: string) {
    setState((current) => ({
      ...current,
      valorantMapData: {
        maps: current.valorantMapData.maps.map((map, mapIndex) => mapIndex === index ? { ...map, [key]: value } : map),
      },
    }));
  }

  function addValorantMap() {
    setState((current) => ({
      ...current,
      valorantMapData: {
        maps: [
          ...current.valorantMapData.maps,
          { name: "", nextMap: "", pickCard: "", banCard: "" },
        ],
      },
    }));
  }

  function removeValorantMap(index: number) {
    setState((current) => ({
      ...current,
      valorantMapData: {
        maps: current.valorantMapData.maps.filter((_, mapIndex) => mapIndex !== index),
      },
    }));
  }

  function resetValorantMapPool() {
    setState((current) => ({
      ...current,
      valorantMapData: {
        maps: VALORANT_MAP_ARTWORK.map((map) => ({ ...map })),
      },
    }));
    notify("VALORANT map pool reset to default");
  }

  function resetLocalData() {
    const fresh = createInitialState();
    setAllowEmptyLiveWrite(true);
    setState(fresh);
    setConnection("idle");
    setActiveSection("welcome");
    setResetConfirmationOpen(false);
    notify("Local production draft reset");
  }

  async function syncMatch(matchIndex: number) {
    const match = state.general.matches[matchIndex];
    if (!match.id.trim()) {
      notify("Enter a League Hub match ID");
      return;
    }

    setSyncingMatch(matchIndex);
    try {
      const response = await fetch(`${MATCH_LOOKUP_ENDPOINT}/${encodeURIComponent(match.id.trim())}`, { headers: { Accept: "application/json" } });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({})) as { error?: string | { message?: string } };
        const message = typeof failure.error === "string" ? failure.error : failure.error?.message;
        throw new Error(message || `Match lookup failed (${response.status})`);
      }
      const json = (await response.json()) as Record<string, unknown>;
      const matchData = (json.match && typeof json.match === "object" ? json.match : {}) as Record<string, unknown>;
      const standings = (json.standings && typeof json.standings === "object" ? json.standings : {}) as Record<string, unknown>;
      const event = (json.event && typeof json.event === "object" ? json.event : {}) as Record<string, unknown>;
      const gameTitle = typeof event.gameTitle === "string" ? event.gameTitle : "";
      const leagueSource = normalizeLeague(json.league, event);
      setState((current) => {
        const matches = [...current.general.matches] as [Match, Match];
        const existingOverrides = current.general.matches[matchIndex].league.overrides;
        const league = { ...leagueSource, overrides: { ...existingOverrides } };
        const resolved = resolveLeague(league);
        const team1 = normalizeTeam(matchData.team1, standings.team1, {
          primaryColor: resolved.primaryColor,
          secondaryColor: resolved.secondaryColor,
        }, gameTitle);
        const team2 = normalizeTeam(matchData.team2, standings.team2, {
          primaryColor: resolved.primaryColor,
          secondaryColor: resolved.secondaryColor,
        }, gameTitle);
        matches[matchIndex] = { ...matches[matchIndex], team1, team2, league };
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
      setConnection("connected");
      notify(`Match ${matchIndex + 1} synced from League Hub`);
    } catch (error) {
      setConnection("error");
      notify((error as Error).message || "Match sync failed - verify the match ID");
    } finally {
      setSyncingMatch(null);
    }
  }

  const sectionLabels: Record<Section, string> = {
    welcome: "Welcome",
    general: "General info",
    matches: "Team Info",
    rocketLeague: "Rocket League",
    valorant: "VALORANT",
    sponsors: "Sponsors",
    draw: "Draw show",
    settings: "Settings",
  };

  const navItems: { key: Section; label: string }[] = [
    { key: "welcome", label: "Welcome" },
    { key: "general", label: "General info" },
    { key: "matches", label: "Team Info" },
    ...(state.settings.rocketLeagueEnabled ? [{ key: "rocketLeague" as Section, label: "Rocket League" }] : []),
    ...(state.settings.valorantEnabled ? [{ key: "valorant" as Section, label: "VALORANT" }] : []),
    ...(state.settings.sponsorsEnabled ? [{ key: "sponsors" as Section, label: "Sponsors" }] : []),
    ...(state.settings.drawShowEnabled ? [{ key: "draw" as Section, label: "Draw show" }] : []),
    { key: "settings", label: "Settings" },
  ];

  function renderWelcome() {
    const readyCount = Number(Boolean(state.general.eventName)) + Number(filledMatches > 0) + Number(rocketLeagueReady) + Number(valorantReady) + Number(filledSponsors > 0);
    return (
      <div className="page-stack welcome-page">
        <SectionHeading
          eyebrow="Production workspace"
          title="Welcome"
          description="Prepare the show, verify the required data, and export the vMix files from one local workspace."
        />

        <section className="welcome-overview panel-card">
          <div className="overview-heading">
            <div><h2>Show setup</h2><p>Complete the items needed for this broadcast.</p></div>
            <strong>{readyCount} of 5 ready</strong>
          </div>
          <div className="setup-list">
            <button onClick={() => { setActiveSection("general"); setGeneralTab("talent"); }}><span className={state.general.eventName ? "complete" : ""} aria-hidden="true" /><div><strong>Event details</strong><small>{state.general.eventName || "Not configured"}</small></div><b>Open</b></button>
            <button onClick={() => setActiveSection("matches")}><span className={filledMatches ? "complete" : ""} aria-hidden="true" /><div><strong>Team Info</strong><small>{filledMatches ? `${filledMatches} match${filledMatches === 1 ? "" : "es"} ready` : "No complete matches"}</small></div><b>Open</b></button>
            <button onClick={() => setActiveSection("rocketLeague")}><span className={rocketLeagueReady ? "complete" : ""} aria-hidden="true" /><div><strong>Rocket League</strong><small>{rocketLeagueReady ? `${state.rocketLeague.bestOf} · ${rocketLeagueSeries.completedGames} games entered` : "Event name / header not configured"}</small></div><b>Open</b></button>
            <button onClick={() => setActiveSection("valorant")}><span className={valorantReady ? "complete" : ""} aria-hidden="true" /><div><strong>VALORANT</strong><small>{valorantReady ? `${state.valorant.bestOf} · ${valorantSeries.completedGames} maps entered` : "Event name / header not configured"}</small></div><b>Open</b></button>
            <button onClick={() => setActiveSection("sponsors")}><span className={filledSponsors ? "complete" : ""} aria-hidden="true" /><div><strong>Sponsors</strong><small>{filledSponsors ? `${filledSponsors} configured` : "No sponsors configured"}</small></div><b>Open</b></button>
          </div>
        </section>

        <section className="activity-strip">
          <div><span className={`status-dot ${liveSync === "synced" ? "live" : ""}`} /><p><strong>Live JSON</strong>{liveSync === "synced" ? "Files are current" : liveSync === "saving" ? "Writing changes" : "Writer is offline"}</p></div>
          <div><span className={`status-dot ${connection === "connected" ? "live" : ""}`} /><p><strong>League Hub</strong>{connection === "connected" ? "Match data synced" : connection === "error" ? "Last sync failed" : "Ready for a match ID"}</p></div>
          <div><span className="status-dot live" /><p><strong>Output folder</strong>Local JSONs directory</p></div>
        </section>
      </div>
    );
  }

  function renderGeneral() {
    return (
      <div className="page-stack">
        <SectionHeading
          eyebrow={activeSection === "matches" ? "League Hub match data" : "Show setup"}
          title={activeSection === "matches" ? "Team Info" : "General information"}
          description={activeSection === "matches" ? "Sync match data, verify team outputs, and apply production overrides." : "Manage event details, on-air talent, and rundown copy. Every change updates the local vMix JSON files."}
        />
        {activeSection === "general" ? <div className="tabs" role="tablist" aria-label="General information views">
          {(["talent", "segments"] as const).map((tab) => (
            <button key={tab} className={generalTab === tab ? "active" : ""} onClick={() => setGeneralTab(tab)}>
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
                return (
                <section className="panel-card match-card" key={matchIndex}>
                  <div className="card-title-row">
                    <div><h2>Match {matchIndex + 1}</h2></div>
                    <div className={`match-sync ${matchIndex === 1 ? "with-copy" : ""}`}>
                      {matchIndex === 1 ? (
                        <button className="button compact copy-match-button" type="button" onClick={copyMatchTwoToOne}>
                          Copy to Match 1
                        </button>
                      ) : null}
                      <input aria-label={`Match ${matchIndex + 1} ID`} value={match.id} onChange={(event) => { updateMatch(matchIndex, { id: event.target.value }); setConnection("idle"); }} placeholder="League Hub match ID" />
                      <button className="button compact" onClick={() => syncMatch(matchIndex)} disabled={syncingMatch !== null}>
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
                      const logoBackgroundOverride = normalizeLogoBackground(team.overrides.logoBackground);
                      const nameNeedsOverride = resolved.name.trim().length > TEAM_NAME_LIMIT;
                      const productionSourceName = shortTeamName(team.sourceName || team.name);
                      return (
                        <div className="team-editor" key={teamKey}>
                          <div className="team-editor-title">
                            <span className="team-logo-preview" style={{ borderColor: safeColor(resolved.color), backgroundColor: resolved.logoBackground }}>
                              {resolved.logo ? <img src={previewLogo} crossOrigin={previewLogo !== resolved.logo ? "anonymous" : undefined} alt="" onLoad={(event) => { const background = detectLogoBackground(event.currentTarget); if (background) updateTeam(matchIndex, teamKey, { logoBackground: background }); }} /> : resolved.name.slice(0, 2).toUpperCase() || `T${teamIndex + 1}`}
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
                            <span className="field-label">Output color</span>
                            <div className="color-options">
                              {COLOR_OPTIONS.map((option) => <button type="button" key={option.key} className={team.selectedColor === option.key && !team.overrides.color ? "selected" : ""} onClick={() => selectTeamColor(matchIndex, teamKey, option.key)}><i style={{ backgroundColor: safeColor(colors[option.key]) }} /><span>{option.label}</span><small>{colors[option.key]}</small></button>)}
                            </div>
                          </div>
                          <div className="form-grid two color-override-grid">
                            <label className="field"><span className="field-label">Custom color override</span><div className="color-field"><input aria-label={`Match ${matchIndex + 1} team ${teamIndex + 1} custom color`} type="color" value={safeColor(team.overrides.color || resolved.color, "#F6AC18")} onChange={(event) => updateTeamOverride(matchIndex, teamKey, { color: event.target.value })} /><input aria-label={`Match ${matchIndex + 1} team ${teamIndex + 1} custom color hex`} value={team.overrides.color} onChange={(event) => updateTeamOverride(matchIndex, teamKey, { color: event.target.value })} placeholder="Optional #RRGGBB" maxLength={7} /></div>{team.overrides.color && !colorToRgb(team.overrides.color) ? <span className="field-error">Use a complete #RRGGBB value</span> : null}</label>
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
                          <input aria-label={`Match ${matchIndex + 1} league primary color`} type="color" value={safeColor(league.overrides.primaryColor || resolvedLeague.primaryColor, "#F6AC18")} onChange={(event) => updateLeagueOverride(matchIndex, { primaryColor: event.target.value })} />
                          <input aria-label={`Match ${matchIndex + 1} league primary color hex`} value={league.overrides.primaryColor} onChange={(event) => updateLeagueOverride(matchIndex, { primaryColor: event.target.value })} placeholder={league.primaryColor || "#RRGGBB"} maxLength={7} />
                        </div>
                        {league.overrides.primaryColor && !colorToRgb(league.overrides.primaryColor) ? <span className="field-error">Use a complete #RRGGBB value</span> : null}
                      </label>
                      <label className="field">
                        <span className="field-label">Secondary color override</span>
                        <div className="color-field">
                          <input aria-label={`Match ${matchIndex + 1} league secondary color`} type="color" value={safeColor(league.overrides.secondaryColor || resolvedLeague.secondaryColor, "#47213F")} onChange={(event) => updateLeagueOverride(matchIndex, { secondaryColor: event.target.value })} />
                          <input aria-label={`Match ${matchIndex + 1} league secondary color hex`} value={league.overrides.secondaryColor} onChange={(event) => updateLeagueOverride(matchIndex, { secondaryColor: event.target.value })} placeholder={league.secondaryColor || "#RRGGBB"} maxLength={7} />
                        </div>
                        {league.overrides.secondaryColor && !colorToRgb(league.overrides.secondaryColor) ? <span className="field-error">Use a complete #RRGGBB value</span> : null}
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
            </section>
            <section className="panel-card">
              <div className="card-title-row"><div><h2>Stream copy</h2></div></div>
              <div className="form-grid">
                <Field label="Event name" value={state.general.eventName} onChange={(value) => updateGeneral("eventName", value)} placeholder="Spring Invitational" />
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
        <div className="tabs" role="tablist" aria-label="VALORANT views">
          <button className={valorantTab === "results" ? "active" : ""} onClick={() => setValorantTab("results")}>Results & setup</button>
          <button className={valorantTab === "pickBans" ? "active" : ""} onClick={() => setValorantTab("pickBans")}>Picks / bans</button>
          <button className={valorantTab === "mapPool" ? "active" : ""} onClick={() => setValorantTab("mapPool")}>Map Pool</button>
          <button className={valorantTab === "overlay" ? "active" : ""} onClick={() => setValorantTab("overlay")}>Browser overlay</button>
        </div>

        {valorantTab === "results" ? (
          <>
          <div className="rocket-league-layout valorant-results-layout">
            <section className="panel-card rocket-score-card">
              <div className="card-title-row result-card-heading"><div><h2>Map results</h2><p>Enter both scores with a clear winner, then update the live JSON.</p></div><div className="result-update-controls"><span className={valorantInvalidResults ? "invalid" : valorantPendingResults ? "pending" : "current"}>{valorantInvalidResults ? `${valorantInvalidResults} invalid ${valorantInvalidResults === 1 ? "result" : "results"}` : valorantPendingResults ? `${valorantPendingResults} unsaved` : "Results current"}</span><button className={`button ${valorantPendingResults && !valorantInvalidResults ? "primary" : "secondary"}`} type="button" onClick={saveValorantResults} disabled={!valorantPendingResults || Boolean(valorantInvalidResults)}>Update results</button><button ref={valorantSeriesResetTriggerRef} className="button danger" type="button" onClick={() => setValorantSeriesResetOpen(true)}>Reset series</button></div></div>
              <div className="rocket-score-head" aria-hidden="true"><span>Map</span><strong>{homeTeam}</strong><span>vs</span><strong>{awayTeam}</strong></div>
              <div className="rocket-score-list">
                {Array.from({ length: VALORANT_GAME_COUNT }, (_, gameIndex) => {
                  const game = state.valorant.games[gameIndex];
                  const status = resultStatus(game);
                  const isCompleted = status === "valid";
                  const isInvalid = status === "partial" || status === "tied";
                  const isPending = resultIsPending(game, state.valorant.savedGames[gameIndex]);
                  return (
                    <div className={`rocket-score-row ${isCompleted ? "complete" : ""} ${isPending ? "pending" : ""} ${isInvalid ? "invalid" : ""}`} key={gameIndex}>
                      <span>Map {gameIndex + 1}{status === "tied" ? <small className="result-error">Tie not allowed</small> : status === "partial" ? <small className="result-error">Enter both scores</small> : isPending ? <small>Unsaved</small> : null}</span>
                      <input aria-invalid={isInvalid} aria-label={`Map ${gameIndex + 1} ${homeTeam} score`} inputMode="numeric" value={game.home} onChange={(event) => updateValorantScore(gameIndex, "home", event.target.value)} placeholder="0" />
                      <b>–</b>
                      <input aria-invalid={isInvalid} aria-label={`Map ${gameIndex + 1} ${awayTeam} score`} inputMode="numeric" value={game.away} onChange={(event) => updateValorantScore(gameIndex, "away", event.target.value)} placeholder="0" />
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
                  <label className="field"><span className="field-label">Series format</span><select value={state.valorant.bestOf} onChange={(event) => updateValorant({ bestOf: event.target.value as Valorant["bestOf"] })}><option value="Bo1">Best of 1</option><option value="Bo3">Best of 3</option><option value="Bo5">Best of 5</option></select></label>
                </div>
                <div className="valorant-toggle-list">
                  <div className="valorant-toggle-row"><div><strong>Flip sides</strong><p>Swap team names, colors, logos, and series totals on screen. Entered map scores stay in home/away order.</p></div><label className="switch large"><input aria-label="Flip VALORANT team sides" type="checkbox" checked={state.valorant.flipSides} onChange={(event) => updateValorant({ flipSides: event.target.checked })} /><span /></label></div>
                </div>
              </section>

            </div>
          </div>
          <section className="panel-card rocket-indicator-card valorant-live-card" aria-label="VAL Live info">
            <div className="card-title-row"><div><h2>VAL Live info</h2><p>Current map, series score, and starting sides calculated from the results saved to JSON.</p></div></div>
            <dl className="rocket-indicators valorant-live-indicators">
              <div><dt>Current map</dt><dd className="map-indicator-value">Map {valorantCurrentMap.number}</dd><small className="map-name">{valorantCurrentMap.name || "Map not selected"}</small></div>
              <div><dt>{displayTeamOne}</dt><dd>{displayWinsOne}</dd><small>Series wins</small><span className="valorant-live-side">{valorantSideLabel(valorantCurrentSides.one)}</span></div>
              <div><dt>{displayTeamTwo}</dt><dd>{displayWinsTwo}</dd><small>Series wins</small><span className="valorant-live-side">{valorantSideLabel(valorantCurrentSides.two)}</span></div>
            </dl>
          </section>
          </>
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
                  <div className="card-title-row"><div><h2>Map selection</h2><p>{state.valorant.bestOf} pick and ban order</p></div></div>
                  <div className="pickban-list">
                    {activeMapRows.map((row, index) => {
                      const previousPhase = index > 0 ? activeMapRows[index - 1].phase : "";
                      const value = state.valorant.bestOf === "Bo5" ? state.valorant.bo5[row.key as keyof ValorantBo5] : state.valorant.bo3[row.key as keyof ValorantBo3];
                      const selectedMap = String(value || "").trim();
                      const mapOptions = selectedMap && !mapPoolNames.includes(selectedMap)
                        ? [selectedMap, ...mapPoolNames]
                        : mapPoolNames;
                      return <div className="pickban-row-wrap" key={row.key}>{row.phase !== previousPhase ? <span className="pickban-phase">{row.phase}</span> : null}<label className="pickban-row"><span><strong>{row.label}</strong><small>{row.team}</small></span><select aria-label={`${row.label} map selected by ${row.team}`} value={value} onChange={(event) => state.valorant.bestOf === "Bo5" ? updateValorantBo5(row.key as keyof ValorantBo5, event.target.value) : updateValorantBo3(row.key as keyof ValorantBo3, event.target.value)}><option value="">Select map</option>{mapOptions.map((mapName) => <option value={mapName} key={mapName}>{mapName}</option>)}</select></label></div>;
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
                <p>Edit names and artwork URLs written to VALORANT MAP DATA.json. Changes save automatically. Picks / bans use this pool.</p>
              </div>
              <div className="result-update-controls">
                <button className="button secondary" type="button" onClick={resetValorantMapPool}>Reset to Default</button>
                <button className="button primary" type="button" onClick={addValorantMap}>Add map</button>
              </div>
            </div>
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
          </section>
        ) : (
          <section className="panel-card browser-overlay-card browser-overlay-workspace" aria-label="Browser overlay">
            <div className="card-title-row"><div><h2>VALORANT browser overlay</h2><p>Use this transparent PSD-aligned source as a vMix browser input.</p></div></div>
            <div className="browser-overlay-details">
              <div><span>Canvas</span><strong>1920 × 1080</strong><small>Transparent background</small></div>
              <div><span>Data</span><strong>Match 1</strong><small>Saved VALORANT results</small></div>
              <div><span>Refresh</span><strong>Automatic</strong><small>Updates twice per second</small></div>
            </div>
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

    return (
      <div className="page-stack rocket-league-page">
        <SectionHeading
          eyebrow="Game setup"
          title="Rocket League"
          description="Enter game results and configure the scoreboard. Match 1 supplies the team names used here."
        />
        <div className="tabs" role="tablist" aria-label="Rocket League views">
          <button className={rocketLeagueTab === "results" ? "active" : ""} onClick={() => setRocketLeagueTab("results")}>Results & setup</button>
          <button className={rocketLeagueTab === "overlay" ? "active" : ""} onClick={() => setRocketLeagueTab("overlay")}>Browser overlay</button>
          <button className={rocketLeagueTab === "admin" ? "active" : ""} onClick={() => setRocketLeagueTab("admin")}>Admin control</button>
          <button className={rocketLeagueTab === "debug" ? "active" : ""} onClick={() => setRocketLeagueTab("debug")}>Debug</button>
        </div>

        {rocketLeagueTab === "results" ? (
          <div className="rocket-league-layout">
            <section className="panel-card rocket-score-card">
              <div className="card-title-row result-card-heading">
                <div><h2>Match results</h2><p>Enter both scores with a clear winner, then update the live JSON. Finished live games propose into the next open row.</p></div>
                <div className="result-update-controls"><span className={rocketLeagueInvalidResults ? "invalid" : rocketLeaguePendingResults ? "pending" : "current"}>{rocketLeagueInvalidResults ? `${rocketLeagueInvalidResults} invalid ${rocketLeagueInvalidResults === 1 ? "result" : "results"}` : rocketLeaguePendingResults ? `${rocketLeaguePendingResults} unsaved` : "Results current"}</span><button className={`button ${rocketLeaguePendingResults && !rocketLeagueInvalidResults ? "primary" : "secondary"}`} type="button" onClick={saveRocketLeagueResults} disabled={!rocketLeaguePendingResults || Boolean(rocketLeagueInvalidResults)}>Update results</button><button ref={seriesResetTriggerRef} className="button danger" type="button" onClick={() => setRocketLeagueSeriesResetOpen(true)}>Reset series</button></div>
              </div>
              <div className="valorant-toggle-row" style={{ marginBottom: 12 }}>
                <div>
                  <strong>Auto-accept live results</strong>
                  <p>When a live round ends, fill the next game row and write it to JSON without using the save button.</p>
                </div>
                <label className="switch large">
                  <input
                    aria-label="Auto-accept live Rocket League results"
                    type="checkbox"
                    checked={state.rocketLeague.autoAcceptLiveResults}
                    onChange={(event) => updateRocketLeague({ autoAcceptLiveResults: event.target.checked })}
                  />
                  <span />
                </label>
              </div>
              <div className="rocket-score-head" aria-hidden="true">
                <span>Game</span>
                <strong>{homeTeam}</strong>
                <span>vs</span>
                <strong>{awayTeam}</strong>
              </div>
              <div className="rocket-score-list">
                {Array.from({ length: ROCKET_LEAGUE_GAME_COUNT }, (_, gameIndex) => {
                  const game = state.rocketLeague.games[gameIndex];
                  const status = resultStatus(game);
                  const isCompleted = status === "valid";
                  const isInvalid = status === "partial" || status === "tied";
                  const isPending = resultIsPending(game, state.rocketLeague.savedGames[gameIndex]);
                  return (
                    <div className={`rocket-score-row ${isCompleted ? "complete" : ""} ${isPending ? "pending" : ""} ${isInvalid ? "invalid" : ""}`} key={gameIndex}>
                      <span>Game {gameIndex + 1}{status === "tied" ? <small className="result-error">Tie not allowed</small> : status === "partial" ? <small className="result-error">Enter both scores</small> : isPending ? <small>Unsaved</small> : null}</span>
                      <input aria-invalid={isInvalid} aria-label={`Game ${gameIndex + 1} ${homeTeam} score`} inputMode="numeric" value={game.home} onChange={(event) => updateRocketLeagueScore(gameIndex, "home", event.target.value)} placeholder="0" />
                      <b>–</b>
                      <input aria-invalid={isInvalid} aria-label={`Game ${gameIndex + 1} ${awayTeam} score`} inputMode="numeric" value={game.away} onChange={(event) => updateRocketLeagueScore(gameIndex, "away", event.target.value)} placeholder="0" />
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
                    <select value={state.rocketLeague.bestOf} onChange={(event) => updateRocketLeague({ bestOf: event.target.value as RocketLeague["bestOf"] })}>
                      <option value="Bo1">Best of 1</option>
                      <option value="Bo3">Best of 3</option>
                      <option value="Bo5">Best of 5</option>
                      <option value="Bo7">Best of 7</option>
                    </select>
                  </label>
                </div>
              </section>

              <section className="panel-card rocket-indicator-card">
                <div className="card-title-row"><div><h2>Live match indicators</h2><p>Calculated from the results currently saved to JSON.</p></div></div>
                <dl className="rocket-indicators">
                  <div><dt>Round</dt><dd>{rocketLeagueSeries.roundNumber}</dd><small>Current game</small></div>
                  <div><dt>{homeTeam}</dt><dd>{rocketLeagueSeries.homeWins}</dd><small>Series wins</small></div>
                  <div><dt>{awayTeam}</dt><dd>{rocketLeagueSeries.awayWins}</dd><small>Series wins</small></div>
                </dl>
              </section>

              <section className="panel-card rocket-output-card">
                <span>Live output</span>
                <strong>{state.rocketLeague.bestOf} · Round {rocketLeagueSeries.roundNumber}</strong>
                <small>{rocketLeagueSeries.completedGames} of {ROCKET_LEAGUE_GAME_COUNT} game scores complete</small>
              </section>
            </div>
          </div>
        ) : rocketLeagueTab === "overlay" ? (
          <section className="panel-card browser-overlay-card browser-overlay-workspace" aria-label="Browser overlay">
            <div className="card-title-row"><div><h2>Rocket League browser overlay</h2><p>Use this transparent PSD-aligned source as a vMix browser input. League colors and logo backgrounds come from Match 1 / Team Info.</p></div></div>
            <div className="browser-overlay-details">
              <div><span>Canvas</span><strong>1920 × 1080</strong><small>Transparent background</small></div>
              <div><span>Data</span><strong>Match 1</strong><small>Teams, league colors, logo backgrounds</small></div>
              <div><span>Live feed</span><strong>Game Data API</strong><small>Clock, score, OT, player card, activities when Debug is off. Auto broadcast camera uses Director cam, then hides the full native HUD at countdown start and restores it when the match ends. Manual fallback: press <strong>9</strong>, then <strong>H</strong> twice while spectating.</small></div>
              <div><span>Refresh</span><strong>Automatic</strong><small>Updates four times per second</small></div>
            </div>
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
                <div><strong>Lobby scene: Post-match stats</strong><small>When the live feed has no active match, show the post-match team stats board instead of the VS matchup on the scoreboard URL.</small></div>
                <label className="switch large"><input aria-label="Show post-match stats on Rocket League lobby scene" type="checkbox" checked={state.rocketLeague.lobbyScene === "stats"} onChange={(event) => updateRocketLeague({ lobbyScene: event.target.checked ? "stats" : "vs" })} /><span /></label>
              </div>
              <div className="browser-overlay-widget-toggle">
                <div><strong>Stats scene: team background</strong><small>On the post-match stats URL, show the same diagonal team-color background as the VS scene instead of a fully transparent canvas.</small></div>
                <label className="switch large"><input aria-label="Enable team background on Rocket League post-match stats scene" type="checkbox" checked={state.rocketLeague.statsSceneBackground === "team-split"} onChange={(event) => updateRocketLeague({ statsSceneBackground: event.target.checked ? "team-split" : "transparent" })} /><span /></label>
              </div>
              <div className="browser-overlay-widget-toggle">
                <div><strong>Auto broadcast camera</strong><small>Switch to Director cam on match create. Hide the full native HUD at countdown start (Stats API cannot do a partial H-key hide). Restores HUD when the match ends. Requires spectating.</small></div>
                <label className="switch large"><input aria-label="Enable Rocket League auto broadcast camera" type="checkbox" checked={state.rocketLeague.broadcastSetupEnabled} onChange={(event) => updateRocketLeague({ broadcastSetupEnabled: event.target.checked })} /><span /></label>
              </div>
            </div>
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
                  <p style={{ margin: "0 0 8px", opacity: 0.85 }}>Has game off shows the lobby scene on the scoreboard overlay (VS or post-match stats from the Browser overlay toggle). Replay on synthesizes a sample scorer info card from the target player for overlay preview. Dedicated VS and stats URLs are also available under Browser overlay.</p>
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

  function renderSponsors() {
    const includedSponsors = state.sponsors.filter((sponsor) => sponsor.enabled && (sponsor.name.trim() || sponsor.logo.trim())).length;

    return (
      <div className="page-stack">
        <SectionHeading eyebrow="Partner rotation" title="Sponsors" description="Gaming Oasis always leads the rotation. Add and order the remaining on-air partners below it." />
        <section className="sponsor-overview panel-card">
          <div>
            <h2>Rotation</h2>
            <p>Only populated sponsor slots are written to the JSON file. Disabled partners remain saved in your local draft.</p>
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

  function renderDraw() {
    const definition = DRAW_DEFINITIONS[drawTab];
    return (
      <div className="page-stack">
        <SectionHeading eyebrow="Feature preview" title="Draw show" description="Populate the pool order for each division. Every division keeps the legacy key structure expected by the current graphics." />
        <div className="tabs draw-tabs" role="tablist" aria-label="Draw show divisions">
          {(Object.keys(DRAW_DEFINITIONS) as DrawKey[]).map((key) => <button key={key} className={drawTab === key ? "active" : ""} onClick={() => { setDrawTab(key); setDrawPastePool(null); setDrawPasteText(""); }}><small>{DRAW_DEFINITIONS[key].game}</small>{DRAW_DEFINITIONS[key].label}</button>)}
        </div>
        <div className="pool-grid">
          {Array.from({ length: definition.pools }, (_, poolIndex) => (
            <section className="panel-card pool-card" key={poolIndex}>
              <div className="pool-title"><div><span>Pool {String.fromCharCode(65 + poolIndex)}</span><small>{definition.rows} entries</small></div><div className="pool-actions"><button type="button" onClick={() => { setDrawPastePool(poolIndex); setDrawPasteText(""); }}>Paste from Excel</button><button type="button" onClick={() => clearDrawPool(poolIndex)}>Clear</button></div></div>
              {drawPastePool === poolIndex ? <div className="excel-paste-panel"><label><span>Paste one Excel column</span><textarea autoFocus value={drawPasteText} onChange={(event) => setDrawPasteText(event.target.value)} placeholder={`Paste up to ${definition.rows} team names here`} /></label><div><small>{parseExcelPool(drawPasteText, definition.rows).filter(Boolean).length} of {definition.rows} entries detected</small><button type="button" onClick={() => { setDrawPastePool(null); setDrawPasteText(""); }}>Cancel</button><button className="apply" type="button" onClick={() => applyExcelPool(poolIndex)}>Apply to pool</button></div></div> : null}
              {Array.from({ length: definition.rows }, (_, rowIndex) => {
                const fieldKey = `P${poolIndex + 1}${rowIndex + 1}`;
                return <label className="pool-row" key={fieldKey}><span>{String(rowIndex + 1).padStart(2, "0")}</span><input value={state.draws[drawTab][fieldKey]} onChange={(event) => setState((current) => ({ ...current, draws: { ...current.draws, [drawTab]: { ...current.draws[drawTab], [fieldKey]: event.target.value } } }))} placeholder="Team or seed" /></label>;
              })}
            </section>
          ))}
        </div>
      </div>
    );
  }

  function renderSettings() {
    return (
      <div className="page-stack settings-page">
        <SectionHeading eyebrow="System configuration" title="Settings" description="Control sidebar visibility and manage this workstation's local draft." />
        <section className="panel-card settings-card">
          <div className="settings-card-copy"><div><h2>Sidebar visibility</h2><p>Choose which workspaces appear in the sidebar. Hiding one does not change its data or JSON output.</p></div></div>
          <div className="settings-rows">
            <div className="setting-row">
              <div><strong>Rocket League</strong><p>Show or hide Rocket League in the main navigation.</p></div>
              <label className="switch large"><input aria-label="Show Rocket League in sidebar" type="checkbox" checked={state.settings.rocketLeagueEnabled} onChange={(event) => setState((current) => ({ ...current, settings: { ...current.settings, rocketLeagueEnabled: event.target.checked } }))} /><span /></label>
            </div>
            <div className="setting-row">
              <div><strong>VALORANT</strong><p>Show or hide VALORANT in the main navigation.</p></div>
              <label className="switch large"><input aria-label="Show VALORANT in sidebar" type="checkbox" checked={state.settings.valorantEnabled} onChange={(event) => setState((current) => ({ ...current, settings: { ...current.settings, valorantEnabled: event.target.checked } }))} /><span /></label>
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
        <section className="panel-card settings-card">
          <div className="settings-card-copy"><div><h2>Graphics defaults</h2><p>Keep shared production assets ready for graphics that use them.</p></div></div>
          <div className="settings-rows">
            <div className="setting-row">
              <div><strong>Regional logo</strong><p>Optional image URL retained for future podcast and regional graphics.</p></div>
              <input aria-label="Regional logo URL" className="setting-input" value={state.settings.regionalLogo} onChange={(event) => setState((current) => ({ ...current, settings: { ...current.settings, regionalLogo: event.target.value } }))} placeholder="https://..." />
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setActiveSection("welcome")} aria-label="Gaming Oasis home">
          <img className="brand-wordmark" src="/gaming-oasis-logo-light.png" alt="Gaming Oasis" />
          <span className="brand-product">Production OS</span>
        </button>
        <nav aria-label="Primary navigation">
          <span className="nav-caption">Workspace</span>
          {navItems.map((item) => <button key={item.key} className={activeSection === item.key ? "active" : ""} onClick={() => setActiveSection(item.key)}>{item.label}{activeSection === item.key ? <i /> : null}</button>)}
        </nav>
        <div className="sidebar-footer">
          <button className="button export-button" onClick={exportAll}>Export JSON package</button>
          <button ref={resetTriggerRef} className="button danger sidebar-reset-button" type="button" onClick={() => setResetConfirmationOpen(true)}>Reset local data</button>
        </div>
      </aside>

      <section className="workspace">
        <div className="topbar">
          <div className="mobile-brand"><img src="/gaming-oasis-favicon.png" alt="" /><strong>Production OS</strong></div>
          <div className="breadcrumb">{sectionLabels[activeSection]}</div>
          <div className="topbar-status"><span className={`status-dot ${connection === "connected" ? "live" : ""}`} /> League Hub {connection === "connected" ? "synced" : connection === "error" ? "sync failed" : "ready"}<span className="topbar-divider" /><span className={`status-dot ${liveSync === "synced" ? "live" : ""}`} /> {liveSync === "synced" ? "JSON live" : liveSync === "saving" ? "Saving JSON" : "JSON writer offline"}</div>
        </div>
        <div className="content-area">
          {activeSection === "welcome" ? renderWelcome() : null}
          {activeSection === "general" || activeSection === "matches" ? renderGeneral() : null}
          {activeSection === "rocketLeague" ? renderRocketLeague() : null}
          {activeSection === "valorant" ? renderValorant() : null}
          {activeSection === "sponsors" ? renderSponsors() : null}
          {activeSection === "draw" ? renderDraw() : null}
          {activeSection === "settings" ? renderSettings() : null}
        </div>
      </section>
      {resetConfirmationOpen ? (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setResetConfirmationOpen(false); }}>
          <div ref={resetModalRef} className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="reset-modal-title" aria-describedby="reset-modal-description">
            <span className="eyebrow">Confirm reset</span>
            <h2 id="reset-modal-title">Reset this workstation?</h2>
            <p id="reset-modal-description">This clears the local draft, match data, results, picks and bans, sponsors, and all draw data. This cannot be undone.</p>
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
