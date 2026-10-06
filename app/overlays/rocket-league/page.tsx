"use client";

import { normalizeRocketLeagueSceneMode, resolveRocketLeagueScene } from "../../../lib/rocket-league-scene.mjs";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  resolveRocketLeagueLiveTeamColor,
  resolveRocketLeagueSideTeams,
} from "../../../lib/rocket-league-live.mjs";
import {
  readableText,
  resolveImagePlate,
} from "../../../lib/readable-text.mjs";
import { sponsorLogoSrc } from "../../../lib/sponsor-logo-url.mjs";
import { VsMatchupStage } from "../vs/VsMatchupOverlay";
import {
  isMatchTeamStats,
  PostMatchTeamStatsStage,
  type MatchTeamStats,
} from "./stats/PostMatchTeamStats";
import { usePollingJson } from "../usePollingJson";
import { useStableImageSource } from "../useStableImageSource";
import styles from "./rocket-league-overlay.module.css";

type OverlayTeam = {
  name: string;
  standing: string;
  logo: string;
  color: string;
  logoBackground: string;
  seriesScore: string;
};

type OverlayPlayer = {
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

type OverlayGame = {
  hasGame: boolean;
  hasWinner: boolean;
  isOT: boolean;
  isReplay: boolean;
  timeSeconds: number;
  target: string;
  scoreOne: number;
  scoreTwo: number;
  targetPlayer: OverlayPlayer | null;
};

type OverlayConnection = {
  connected: boolean;
  lastEventAt: string | null;
};

type OverlaySponsor = {
  id: string;
  name: string;
  logo: string;
};

type OverlayActivity = {
  id: string;
  type: string;
  primaryName: string;
  secondaryName: string;
  team: number;
  createdAt: string;
};

type OverlayReplayCard = {
  scorerName: string;
  assisterName: string;
  team: number;
  scorerId: string;
  goals: number;
  assists: number;
  saves: number;
  shots: number;
  score: number;
  /** GoalScored.GoalSpeed converted to MPH for on-air display; 0 when unknown. */
  ballSpeedMph: number;
  createdAt: string;
};

type RocketLeagueOverlayState = {
  version: 1;
  updatedAt: string;
  skin: string;
  header: string;
  bestOf: string;
  flipSides: boolean;
  playerCardEnabled: boolean;
  sponsorWidgetEnabled: boolean;
  lobbyScene: "vs" | "stats";
  sceneMode?: "auto" | "scoreboard" | "vs" | "stats";
  statsSceneBackground: "transparent" | "team-split";
  sponsors: OverlaySponsor[];
  roundNumber: number;
  winsNeeded: number;
  leaguePrimary: string;
  leagueSecondary: string;
  teamOne: OverlayTeam;
  teamTwo: OverlayTeam;
  debugLiveOverride: boolean;
  connection: OverlayConnection;
  game: OverlayGame;
  activities: OverlayActivity[];
  replayCard: OverlayReplayCard | null;
  matchTeamStats: MatchTeamStats | null;
};

const OVERLAY_ENDPOINT = "http://127.0.0.1:4877/api/overlays/rocket-league";
const TEAM_NAME_MAX_PX = 42;
const TEAM_NAME_MIN_PX = 18;
/** Opaque plate from the active-player card body (active-border-fill). */
const SCORE_PANEL_NAVY = "#171717";

/** Series pills on the team name plate — same white/navy pick as readableText. */
function seriesPillColor(teamColor: string) {
  return readableText(teamColor);
}

function isOverlayTeam(value: unknown): value is OverlayTeam {
  if (!value || typeof value !== "object") return false;
  const team = value as Record<string, unknown>;
  return ["name", "standing", "logo", "color", "logoBackground", "seriesScore"]
    .every((key) => typeof team[key] === "string");
}

function isOverlayPlayer(value: unknown): value is OverlayPlayer {
  if (!value || typeof value !== "object") return false;
  const player = value as Record<string, unknown>;
  return typeof player.id === "string"
    && typeof player.name === "string"
    && typeof player.team === "number"
    && typeof player.goals === "number"
    && typeof player.shots === "number"
    && typeof player.saves === "number"
    && typeof player.assists === "number"
    && typeof player.boost === "number"
    && typeof player.isDead === "boolean";
}

function isOverlayGame(value: unknown): value is OverlayGame {
  if (!value || typeof value !== "object") return false;
  const game = value as Record<string, unknown>;
  return typeof game.hasGame === "boolean"
    && typeof game.hasWinner === "boolean"
    && typeof game.isOT === "boolean"
    && typeof game.isReplay === "boolean"
    && typeof game.timeSeconds === "number"
    && typeof game.target === "string"
    && typeof game.scoreOne === "number"
    && typeof game.scoreTwo === "number"
    && (game.targetPlayer === null || isOverlayPlayer(game.targetPlayer));
}

function isOverlayActivity(value: unknown): value is OverlayActivity {
  if (!value || typeof value !== "object") return false;
  const activity = value as Record<string, unknown>;
  return typeof activity.id === "string"
    && typeof activity.type === "string"
    && typeof activity.primaryName === "string"
    && typeof activity.secondaryName === "string"
    && typeof activity.team === "number"
    && typeof activity.createdAt === "string";
}

function isOverlayActivities(value: unknown): value is OverlayActivity[] {
  return Array.isArray(value) && value.every(isOverlayActivity);
}

function isOverlayReplayCard(value: unknown): value is OverlayReplayCard {
  if (!value || typeof value !== "object") return false;
  const card = value as Record<string, unknown>;
  return typeof card.scorerName === "string"
    && typeof card.assisterName === "string"
    && typeof card.team === "number"
    && typeof card.scorerId === "string"
    && typeof card.goals === "number"
    && typeof card.assists === "number"
    && typeof card.saves === "number"
    && typeof card.shots === "number"
    && typeof card.score === "number"
    && typeof card.ballSpeedMph === "number"
    && typeof card.createdAt === "string";
}

function isOverlayState(value: unknown): value is RocketLeagueOverlayState {
  if (!value || typeof value !== "object") return false;
  const state = value as Record<string, unknown>;
  const connection = state.connection as Record<string, unknown> | undefined;
  return state.version === 1
    && typeof state.updatedAt === "string"
    && typeof state.skin === "string"
    && typeof state.header === "string"
    && typeof state.bestOf === "string"
    && typeof state.flipSides === "boolean"
    && typeof state.playerCardEnabled === "boolean"
    && typeof state.sponsorWidgetEnabled === "boolean"
    && (state.lobbyScene === undefined
      || state.lobbyScene === "vs"
      || state.lobbyScene === "stats")
    && (state.statsSceneBackground === undefined
      || state.statsSceneBackground === "transparent"
      || state.statsSceneBackground === "team-split")
    && isOverlaySponsors(state.sponsors)
    && typeof state.roundNumber === "number"
    && typeof state.winsNeeded === "number"
    && typeof state.leaguePrimary === "string"
    && typeof state.leagueSecondary === "string"
    && isOverlayTeam(state.teamOne)
    && isOverlayTeam(state.teamTwo)
    && typeof state.debugLiveOverride === "boolean"
    && connection !== undefined
    && typeof connection.connected === "boolean"
    && (connection.lastEventAt === null || typeof connection.lastEventAt === "string")
    && isOverlayGame(state.game)
    && isOverlayActivities(state.activities)
    && (state.replayCard === null
      || state.replayCard === undefined
      || isOverlayReplayCard(state.replayCard))
    && (state.matchTeamStats === null
      || state.matchTeamStats === undefined
      || isMatchTeamStats(state.matchTeamStats));
}

function normalizeOverlayState(next: RocketLeagueOverlayState): RocketLeagueOverlayState {
  return {
    ...next,
    sceneMode: normalizeRocketLeagueSceneMode(next.sceneMode) as RocketLeagueOverlayState["sceneMode"],
    lobbyScene: next.lobbyScene === "stats" ? "stats" : "vs",
    statsSceneBackground: next.statsSceneBackground === "team-split" ? "team-split" : "transparent",
    matchTeamStats: next.matchTeamStats && isMatchTeamStats(next.matchTeamStats)
      ? next.matchTeamStats
      : null,
  };
}

function formatClock(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds) || 0);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function isOverlaySponsors(value: unknown): value is OverlaySponsor[] {
  return Array.isArray(value) && value.every((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const sponsor = entry as Record<string, unknown>;
    return typeof sponsor.id === "string"
      && typeof sponsor.name === "string"
      && typeof sponsor.logo === "string";
  });
}

function localLogoUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.origin === "https://hub.gamingoasis.gg" && /^\/api\/public\/logos\/(teams|leagues)\/[0-9a-f-]{36}$/i.test(url.pathname)) {
      return `http://127.0.0.1:4877${url.pathname}`;
    }
  } catch {
    // Relative and manually entered logo URLs remain unchanged.
  }
  return value;
}

function StableLogo({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const candidate = src ? localLogoUrl(src) : "";
  const { displayedSource, handleDisplayedError } = useStableImageSource(candidate);

  return displayedSource
    ? (
      <img
        key={displayedSource}
        className={className ?? styles.logoImage}
        src={displayedSource}
        alt={alt}
        onError={handleDisplayedError}
      />
    )
    : null;
}

function FitTeamName({
  name,
  className,
  maxPx = TEAM_NAME_MAX_PX,
  minPx = TEAM_NAME_MIN_PX,
}: {
  name: string;
  className: string;
  maxPx?: number;
  minPx?: number;
}) {
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const maxSize = Math.max(minPx, maxPx);
    const minSize = Math.min(minPx, maxSize);

    function fit() {
      if (cancelled || !el) return;
      let size = maxSize;
      el.style.fontSize = `${size}px`;
      while (size > minSize && el.scrollWidth > el.clientWidth + 0.5) {
        size -= 1;
        el.style.fontSize = `${size}px`;
      }
    }

    fit();
    const fontsReady = document.fonts?.ready;
    if (fontsReady) fontsReady.then(fit);
    return () => {
      cancelled = true;
    };
  }, [name, maxPx, minPx]);

  return <strong ref={ref} className={className}>{name}</strong>;
}

function SeriesPills({ wins, needed, color }: { wins: number; needed: number; color: string }) {
  // Bo1→1, Bo3→2, Bo5→3, Bo7→4. Fill left-to-right: 1st win → 1st pill, etc.
  const count = Math.min(4, Math.max(1, Math.floor(needed) || 1));
  const filled = Math.min(count, Math.max(0, Math.floor(wins) || 0));
  return (
    <div className={styles.pills} style={{ "--pill-color": color } as React.CSSProperties} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => {
        const isFilled = index < filled;
        return (
          <span
            key={index}
            className={`${styles.pill} ${isFilled ? styles.pillFilled : styles.pillEmpty}`}
            data-filled={isFilled ? "true" : "false"}
          />
        );
      })}
    </div>
  );
}

const SPONSOR_ROTATION_MS = 15000;
const SPONSOR_ASSET_RETRY_BASE_MS = 1000;
const SPONSOR_ASSET_RETRY_MAX_MS = 60000;

function sponsorAssetKey(sponsor: OverlaySponsor) {
  return `${sponsor.id}\u0000${sponsor.logo}`;
}

function SponsorCarousel({ sponsors }: { sponsors: OverlaySponsor[] }) {
  const [rotation, setRotation] = useState({ currentId: "", previousId: "" });
  const [assetState, setAssetState] = useState<Record<string, "loaded" | "failed">>({});
  const retryAssetRef = useRef<(sponsor: OverlaySponsor) => void>(() => undefined);
  const sponsorSignature = JSON.stringify(sponsors);
  const stableSponsors = useMemo(() => JSON.parse(sponsorSignature) as OverlaySponsor[], [sponsorSignature]);

  useEffect(() => {
    let active = true;
    const loaders = new Map<string, HTMLImageElement>();
    const retryTimers = new Map<string, number>();
    const retryAttempts = new Map<string, number>();
    const currentKeys = new Set(stableSponsors.filter((sponsor) => sponsor.logo).map(sponsorAssetKey));

    setAssetState((current) => {
      const staleKeys = Object.keys(current).filter((key) => !currentKeys.has(key));
      if (!staleKeys.length) return current;
      return Object.fromEntries(Object.entries(current).filter(([key]) => currentKeys.has(key)));
    });

    function scheduleRetry(sponsor: OverlaySponsor) {
      if (!active || !sponsor.logo) return;
      const key = sponsorAssetKey(sponsor);
      if (!currentKeys.has(key) || loaders.has(key) || retryTimers.has(key)) return;
      const attempt = retryAttempts.get(key) ?? 0;
      const delay = Math.min(
        SPONSOR_ASSET_RETRY_BASE_MS * (2 ** Math.min(attempt, 6)),
        SPONSOR_ASSET_RETRY_MAX_MS,
      );
      retryAttempts.set(key, attempt + 1);
      retryTimers.set(key, window.setTimeout(() => {
        retryTimers.delete(key);
        loadAsset(sponsor);
      }, delay));
    }

    function loadAsset(sponsor: OverlaySponsor) {
      if (!active || !sponsor.logo) return;
      const key = sponsorAssetKey(sponsor);
      if (!currentKeys.has(key) || loaders.has(key)) return;
      const image = new Image();
      loaders.set(key, image);
      image.onload = () => {
        loaders.delete(key);
        retryAttempts.delete(key);
        if (active) {
          setAssetState((current) => current[key] === "loaded" ? current : { ...current, [key]: "loaded" });
        }
      };
      image.onerror = () => {
        loaders.delete(key);
        if (active) {
          setAssetState((current) => current[key] ? current : { ...current, [key]: "failed" });
          scheduleRetry(sponsor);
        }
      };
      image.referrerPolicy = "no-referrer";
      image.src = sponsorLogoSrc(sponsor.logo);
    }

    stableSponsors.forEach((sponsor) => {
      loadAsset(sponsor);
    });
    retryAssetRef.current = scheduleRetry;

    return () => {
      active = false;
      retryAssetRef.current = () => undefined;
      retryTimers.forEach((timer) => window.clearTimeout(timer));
      loaders.forEach((image) => {
        image.onload = null;
        image.onerror = null;
      });
      retryTimers.clear();
      loaders.clear();
    };
  }, [stableSponsors]);

  const displayableSponsors = useMemo(() => stableSponsors.filter((sponsor) => {
    if (!sponsor.logo) return Boolean(sponsor.name);
    const status = assetState[sponsorAssetKey(sponsor)];
    return status !== "failed" || Boolean(sponsor.name);
  }), [assetState, stableSponsors]);

  useEffect(() => {
    if (!displayableSponsors.length) {
      setRotation({ currentId: "", previousId: "" });
      return undefined;
    }

    setRotation((current) => {
      if (displayableSponsors.some((sponsor) => sponsor.id === current.currentId)) return current;
      return { currentId: displayableSponsors[0].id, previousId: current.currentId };
    });
    if (displayableSponsors.length === 1) return undefined;

    const timer = window.setInterval(() => {
      setRotation((current) => {
        const currentIndex = displayableSponsors.findIndex((sponsor) => sponsor.id === current.currentId);
        const nextId = displayableSponsors[(currentIndex + 1 + displayableSponsors.length) % displayableSponsors.length].id;
        return { currentId: nextId, previousId: current.currentId };
      });
    }, SPONSOR_ROTATION_MS);
    return () => window.clearInterval(timer);
  }, [displayableSponsors]);

  const sponsor = displayableSponsors.find((entry) => entry.id === rotation.currentId) || displayableSponsors[0];
  if (!sponsor) return null;
  const previousSponsor = displayableSponsors.find((entry) => entry.id === rotation.previousId && entry.id !== sponsor.id);
  const slideKey = sponsorAssetKey(sponsor);

  function slideContent(entry: OverlaySponsor) {
    const failed = assetState[sponsorAssetKey(entry)] === "failed";
    if (entry.logo && !failed) {
      return (
        <img
          src={sponsorLogoSrc(entry.logo)}
          alt={entry.name ? `${entry.name} logo` : "Sponsor logo"}
          width={348}
          height={128}
          draggable={false}
          referrerPolicy="no-referrer"
          onError={() => {
            const key = sponsorAssetKey(entry);
            setAssetState((current) => current[key] === "failed" ? current : { ...current, [key]: "failed" });
            retryAssetRef.current(entry);
          }}
        />
      );
    }
    return <span>{entry.name}</span>;
  }

  return (
    <aside className={styles.sponsorCard} aria-label="Sponsor rotation">
      {previousSponsor ? (
        <div key={`${sponsorAssetKey(previousSponsor)}-leaving`} className={`${styles.sponsorSlide} ${styles.sponsorSlideLeaving}`} aria-hidden="true">
          {slideContent(previousSponsor)}
        </div>
      ) : null}
      <div key={slideKey} className={`${styles.sponsorSlide} ${styles.sponsorSlideEntering}`}>
        {slideContent(sponsor)}
      </div>
    </aside>
  );
}

const ACTIVE_PLAYER_NAME_MAX = 12;
const ACTIVE_PLAYER_NAME_MAX_PX = 36;
const ACTIVE_PLAYER_NAME_MIN_PX = 18;

function formatActivePlayerName(name: string) {
  const normalized = String(name || "").trim().toUpperCase();
  return normalized.length > ACTIVE_PLAYER_NAME_MAX
    ? normalized.slice(0, ACTIVE_PLAYER_NAME_MAX)
    : normalized;
}

function FitActivePlayerName({
  name,
  className,
  style,
}: {
  name: string;
  className: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLElement>(null);
  const displayName = formatActivePlayerName(name);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;

    function fit() {
      if (cancelled || !el) return;
      let size = ACTIVE_PLAYER_NAME_MAX_PX;
      el.style.fontSize = `${size}px`;
      while (size > ACTIVE_PLAYER_NAME_MIN_PX && el.scrollWidth > el.clientWidth + 0.5) {
        size -= 1;
        el.style.fontSize = `${size}px`;
      }
    }

    fit();
    const fontsReady = document.fonts?.ready;
    if (fontsReady) fontsReady.then(fit);
    return () => {
      cancelled = true;
    };
  }, [displayName]);

  return <strong ref={ref} className={className} style={style}>{displayName}</strong>;
}

const ACTIVITY_EXIT_MS = 260;
const ACTIVE_PLAYER_EXIT_MS = 280;
const REPLAY_EXIT_MS = 260;
const REPLAY_SCORER_EXIT_MS = 260;
/** Opacity crossfade between gameplay and the Stats / VS scenes. */
const SCENE_FADE_MS = 500;

function motionExitMs(fullMs: number) {
  if (typeof window !== "undefined"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return 0;
  }
  return fullMs;
}

function useScenePresence(show: boolean, overlay: RocketLeagueOverlayState | null) {
  const [stage, setStage] = useState<{ exiting: boolean; overlay: RocketLeagueOverlayState | null } | null>(
    show ? { exiting: false, overlay } : null,
  );
  const exitTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (show) {
      if (exitTimerRef.current != null) {
        window.clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
      setStage({ exiting: false, overlay });
      return undefined;
    }

    setStage((current) => {
      if (!current || current.exiting) return current;
      return { ...current, exiting: true };
    });
    return undefined;
  }, [show, overlay]);

  useEffect(() => {
    if (!stage?.exiting) return undefined;
    if (exitTimerRef.current != null) window.clearTimeout(exitTimerRef.current);
    const ms = motionExitMs(SCENE_FADE_MS);
    if (ms === 0) {
      setStage(null);
      return undefined;
    }
    exitTimerRef.current = window.setTimeout(() => {
      exitTimerRef.current = null;
      setStage(null);
    }, ms);
    return () => {
      if (exitTimerRef.current != null) {
        window.clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
    };
  }, [stage?.exiting]);

  useEffect(() => () => {
    if (exitTimerRef.current != null) window.clearTimeout(exitTimerRef.current);
  }, []);

  return stage;
}

function ReplayIndicatorHost({
  show,
  accent,
}: {
  show: boolean;
  accent: string;
}) {
  const [stage, setStage] = useState<{ exiting: boolean } | null>(null);
  const exitTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (show) {
      if (exitTimerRef.current != null) {
        window.clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
      setStage({ exiting: false });
      return undefined;
    }

    setStage((current) => {
      if (!current || current.exiting) return current;
      return { ...current, exiting: true };
    });
    return undefined;
  }, [show]);

  useEffect(() => {
    if (!stage?.exiting) return undefined;
    if (exitTimerRef.current != null) window.clearTimeout(exitTimerRef.current);
    exitTimerRef.current = window.setTimeout(() => {
      exitTimerRef.current = null;
      setStage(null);
    }, motionExitMs(REPLAY_EXIT_MS));
    return () => {
      if (exitTimerRef.current != null) {
        window.clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
    };
  }, [stage?.exiting]);

  useEffect(() => () => {
    if (exitTimerRef.current != null) window.clearTimeout(exitTimerRef.current);
  }, []);

  if (!stage) return null;

  return (
    <div
      className={`${styles.replayIndicator}${stage.exiting ? ` ${styles.replayIndicatorExiting}` : ""}`}
      style={{ "--replay-accent": accent } as React.CSSProperties}
      aria-label="Replay"
      aria-hidden={stage.exiting || undefined}
    >
      <strong className={styles.replayLabel}>REPLAY</strong>
    </div>
  );
}

function resolveReplayScorerTeam(
  teamNum: number,
  flipSides: boolean,
  teamOne: OverlayTeam,
  teamTwo: OverlayTeam,
) {
  const { left, right } = resolveRocketLeagueSideTeams(flipSides, teamOne, teamTwo);
  return (teamNum === 1 ? right : left) as OverlayTeam;
}

function ReplayScorerCard({
  card,
  accent,
  logoSrc,
  logoAlt,
  logoBackground,
  exiting = false,
}: {
  card: OverlayReplayCard;
  accent: string;
  logoSrc: string;
  logoAlt: string;
  logoBackground: string;
  exiting?: boolean;
}) {
  const nameTextColor = readableText(accent);
  const showBallSpeed = Number.isFinite(card.ballSpeedMph) && card.ballSpeedMph > 0;
  return (
    <div className={styles.replayScorerSlot}>
      <article
        className={`${styles.replayScorerCard}${exiting ? ` ${styles.replayScorerCardExiting}` : ""}`}
        style={{ "--replay-scorer-accent": accent } as React.CSSProperties}
        aria-label="Goal replay scorer"
        aria-hidden={exiting || undefined}
      >
        <div className={styles.replayScorerAccent} aria-hidden="true" />
        <div className={styles.replayScorerInner}>
          <div className={styles.replayScorerTitleRow}>
            <strong className={styles.replayScorerHeader}>Goal Replay</strong>
            {showBallSpeed ? (
              <span className={styles.replayScorerSpeed}>
                <em>Speed</em>
                <strong>{Math.round(card.ballSpeedMph)}</strong>
                <span>MPH</span>
              </span>
            ) : null}
          </div>
          <div className={styles.replayScorerMain}>
            <div
              className={styles.replayScorerLogoFrame}
              style={{ background: resolveImagePlate(logoBackground) }}
            >
              <StableLogo src={logoSrc} alt={logoAlt} />
            </div>
            <div className={styles.replayScorerIdentity} style={{ background: accent }}>
              <span className={styles.replayScorerName} style={{ color: nameTextColor }}>
                {card.scorerName}
              </span>
              {card.assisterName ? (
                <span
                  className={styles.replayScorerAssist}
                  style={{ color: nameTextColor }}
                >
                  Assist {card.assisterName}
                </span>
              ) : null}
            </div>
          </div>
          <div className={styles.replayScorerStats}>
            <span><em>G</em>{card.goals}</span>
            <span><em>A</em>{card.assists}</span>
            <span><em>SV</em>{card.saves}</span>
            <span><em>SH</em>{card.shots}</span>
            <span><em>SCR</em>{card.score}</span>
          </div>
        </div>
      </article>
    </div>
  );
}

function ReplayScorerCardHost({
  show,
  card,
  accent,
  logoSrc,
  logoAlt,
  logoBackground,
}: {
  show: boolean;
  card: OverlayReplayCard | null;
  accent: string;
  logoSrc: string;
  logoAlt: string;
  logoBackground: string;
}) {
  const [stage, setStage] = useState<{
    card: OverlayReplayCard;
    accent: string;
    logoSrc: string;
    logoAlt: string;
    logoBackground: string;
    exiting: boolean;
  } | null>(null);
  const exitTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (show && card?.scorerName) {
      if (exitTimerRef.current != null) {
        window.clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
      setStage({ card, accent, logoSrc, logoAlt, logoBackground, exiting: false });
      return undefined;
    }

    setStage((current) => {
      if (!current || current.exiting) return current;
      return { ...current, exiting: true };
    });
    return undefined;
  }, [show, card, accent, logoSrc, logoAlt, logoBackground]);

  useEffect(() => {
    if (!stage?.exiting) return undefined;
    if (exitTimerRef.current != null) window.clearTimeout(exitTimerRef.current);
    exitTimerRef.current = window.setTimeout(() => {
      exitTimerRef.current = null;
      setStage(null);
    }, motionExitMs(REPLAY_SCORER_EXIT_MS));
    return () => {
      if (exitTimerRef.current != null) {
        window.clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
    };
  }, [stage?.exiting]);

  useEffect(() => () => {
    if (exitTimerRef.current != null) window.clearTimeout(exitTimerRef.current);
  }, []);

  if (!stage) return null;
  return (
    <ReplayScorerCard
      card={stage.card}
      accent={stage.accent}
      logoSrc={stage.logoSrc}
      logoAlt={stage.logoAlt}
      logoBackground={stage.logoBackground}
      exiting={stage.exiting}
    />
  );
}

function ActivePlayerCard({
  player,
  plateColor,
  exiting = false,
}: {
  player: OverlayPlayer;
  plateColor: string;
  exiting?: boolean;
}) {
  const boost = player.isDead ? 0 : Math.min(100, Math.max(0, player.boost));
  const nameTextColor = readableText(plateColor);
  return (
    <div
      className={`${styles.activePlayerSlot}${exiting ? ` ${styles.activePlayerSlotExiting}` : ""}`}
      aria-label="Active player"
      aria-hidden={exiting || undefined}
    >
      <section className={styles.activePlayer}>
        <img
          className={`${styles.activeLayer} ${styles.activeBackground}`}
          src="/rocket-league-overlay/nel/active-background.png"
          alt=""
        />
        <div className={styles.activeNamePlate} style={{ background: plateColor }} />
        <img
          className={`${styles.activeLayer} ${styles.activeBorderFill}`}
          src="/rocket-league-overlay/nel/active-border-fill.png"
          alt=""
        />
        <div className={`${styles.activeLayer} ${styles.activeBorder}`} aria-hidden="true" />
        <img
          className={`${styles.activeLayer} ${styles.activeStatLabels}`}
          src="/rocket-league-overlay/nel/active-stat-labels.png"
          alt=""
        />
        <FitActivePlayerName
          name={player.name}
          className={styles.activeName}
          style={{ color: nameTextColor }}
        />
        <div className={`${styles.activeStat} ${styles.activeStatGoals}`}>{player.goals}</div>
        <div className={`${styles.activeStat} ${styles.activeStatShots}`}>{player.shots}</div>
        <div className={`${styles.activeStat} ${styles.activeStatSaves}`}>{player.saves}</div>
        <div className={`${styles.activeStat} ${styles.activeStatAssists}`}>{player.assists}</div>
        <progress className={styles.activeBoost} max={100} value={boost} aria-label="Boost" />
      </section>
    </div>
  );
}

function ActivePlayerCardHost({
  show,
  player,
  plateColor,
}: {
  show: boolean;
  player: OverlayPlayer | null;
  plateColor: string;
}) {
  const [stage, setStage] = useState<{
    player: OverlayPlayer;
    plateColor: string;
    exiting: boolean;
  } | null>(null);
  const exitTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (show && player) {
      if (exitTimerRef.current != null) {
        window.clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
      setStage({ player, plateColor, exiting: false });
      return undefined;
    }

    setStage((current) => {
      if (!current || current.exiting) return current;
      return { ...current, exiting: true };
    });
    return undefined;
  }, [show, player, plateColor]);

  useEffect(() => {
    if (!stage?.exiting) return undefined;
    const delay = motionExitMs(ACTIVE_PLAYER_EXIT_MS);
    exitTimerRef.current = window.setTimeout(() => {
      exitTimerRef.current = null;
      setStage(null);
    }, delay);
    return () => {
      if (exitTimerRef.current != null) {
        window.clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
    };
  }, [stage?.exiting]);

  if (!stage) return null;
  return (
    <ActivePlayerCard
      player={stage.player}
      plateColor={stage.plateColor}
      exiting={stage.exiting}
    />
  );
}

type StagedActivity = OverlayActivity & { exiting: boolean; enterNonce: number };

function ActivityFeed({
  activities,
  flipSides,
  teamOne,
  teamTwo,
}: {
  activities: OverlayActivity[];
  flipSides: boolean;
  teamOne: OverlayTeam;
  teamTwo: OverlayTeam;
}) {
  const visible = useMemo(
    () => activities.filter((activity) => activity.primaryName.trim()),
    [activities],
  );
  const [staged, setStaged] = useState<StagedActivity[]>([]);
  const exitTimersRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const visibleIds = new Set(visible.map((activity) => activity.id));
    const reduced = motionExitMs(ACTIVITY_EXIT_MS) === 0;

    if (reduced) {
      for (const timer of exitTimersRef.current.values()) window.clearTimeout(timer);
      exitTimersRef.current.clear();
      setStaged(visible.map((activity) => ({ ...activity, exiting: false, enterNonce: 1 })));
    } else {
      setStaged((prev) => {
        const prevById = new Map(prev.map((entry) => [entry.id, entry]));
        // Stable enterNonce while visible so poll updates do not remount and re-run enter motion.
        const live = visible.map((activity) => {
          const prior = prevById.get(activity.id);
          if (prior && !prior.exiting) {
            return { ...activity, exiting: false, enterNonce: prior.enterNonce };
          }
          return {
            ...activity,
            exiting: false,
            enterNonce: (prior?.enterNonce ?? 0) + 1,
          };
        });
        const leaving = prev
          .filter((entry) => !visibleIds.has(entry.id))
          .map((entry) => ({ ...entry, exiting: true }));
        return [...live, ...leaving];
      });
    }

    for (const id of visibleIds) {
      const timer = exitTimersRef.current.get(id);
      if (timer != null) {
        window.clearTimeout(timer);
        exitTimersRef.current.delete(id);
      }
    }
  }, [visible]);

  useEffect(() => {
    for (const entry of staged) {
      if (!entry.exiting || exitTimersRef.current.has(entry.id)) continue;
      const timer = window.setTimeout(() => {
        exitTimersRef.current.delete(entry.id);
        setStaged((prev) => prev.filter((item) => item.id !== entry.id));
      }, motionExitMs(ACTIVITY_EXIT_MS));
      exitTimersRef.current.set(entry.id, timer);
    }

    for (const [id, timer] of [...exitTimersRef.current.entries()]) {
      if (!staged.some((entry) => entry.id === id && entry.exiting)) {
        window.clearTimeout(timer);
        exitTimersRef.current.delete(id);
      }
    }
  }, [staged]);

  useEffect(() => () => {
    for (const timer of exitTimersRef.current.values()) window.clearTimeout(timer);
    exitTimersRef.current.clear();
  }, []);

  if (!staged.length) return null;
  return (
    <div className={styles.activityStack}>
      {staged.map((activity) => {
        const accent = resolveRocketLeagueLiveTeamColor(
          activity.team,
          flipSides,
          teamOne,
          teamTwo,
        );
        return (
          <div
            key={`${activity.id}-${activity.enterNonce}`}
            className={`${styles.activityToast}${activity.exiting ? ` ${styles.activityToastExiting}` : ""}`}
            style={{ "--activity-accent": accent } as React.CSSProperties}
            aria-hidden={activity.exiting || undefined}
          >
            <strong className={styles.activityType}>{activity.type}</strong>
            <span className={styles.activityPrimary}>{activity.primaryName}</span>
            {activity.secondaryName ? (
              <span className={styles.activitySecondary}>{activity.secondaryName}</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export default function RocketLeagueOverlay() {
  const overlay = usePollingJson({
    endpoint: OVERLAY_ENDPOINT,
    intervalMs: 250,
    validate: isOverlayState,
    normalize: normalizeOverlayState,
  });
  const [frame, setFrame] = useState({ scale: 1, left: 0 });

  useEffect(() => {
    function fitStage() {
      const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
      setFrame({ scale, left: Math.max(0, (window.innerWidth - 1920 * scale) / 2) });
    }
    fitStage();
    window.addEventListener("resize", fitStage);
    return () => window.removeEventListener("resize", fitStage);
  }, []);

  const scene = resolveRocketLeagueScene(overlay);
  const live = scene === "scoreboard";
  const lobbyScene = scene;
  const showLobbyVs = Boolean(overlay && !live && lobbyScene === "vs");
  const showLobbyStats = Boolean(overlay && !live && lobbyScene === "stats");
  const showInGame = Boolean(overlay && live);
  const vsScene = useScenePresence(showLobbyVs, overlay);
  const statsScene = useScenePresence(showLobbyStats, overlay);
  const gameScene = useScenePresence(showInGame, overlay);
  // Keep the outgoing gameplay frame intact until its fade finishes. End events clear
  // the feed's clock, player and replay fields before the lobby scene appears.
  const gameOverlay = showInGame ? overlay : gameScene?.overlay;
  const game = gameOverlay?.game;
  const sides = overlay
    ? resolveRocketLeagueSideTeams(overlay.flipSides, overlay.teamOne, overlay.teamTwo)
    : null;
  const leftTeam = sides?.left;
  const rightTeam = sides?.right;
  // Left is always live Blue (scoreOne / TeamNum 0); Right is always Orange (scoreTwo / TeamNum 1).
  // Swap assignment only mirrors Match identity onto those fixed game sides.
  const scoreOne = game?.scoreOne ?? 0;
  const scoreTwo = game?.scoreTwo ?? 0;
  const matchTeamStats = overlay?.matchTeamStats && isMatchTeamStats(overlay.matchTeamStats)
    ? overlay.matchTeamStats
    : null;

  const cssVars = useMemo(() => {
    if (!overlay || !leftTeam || !rightTeam) return undefined;
    const teamOneText = readableText(leftTeam.color);
    const teamTwoText = readableText(rightTeam.color);
    return {
      "--league-primary": overlay.leaguePrimary,
      "--league-secondary": overlay.leagueSecondary,
      "--team-one": leftTeam.color,
      "--team-two": rightTeam.color,
      "--team-one-text": teamOneText,
      "--team-two-text": teamTwoText,
      "--logo-one-bg": resolveImagePlate(leftTeam.logoBackground),
      "--logo-two-bg": resolveImagePlate(rightTeam.logoBackground),
      "--score-text": readableText(SCORE_PANEL_NAVY),
      "--header-text": readableText(overlay.leaguePrimary),
    } as React.CSSProperties;
  }, [overlay, leftTeam, rightTeam]);

  const headerText = overlay?.header?.trim() ?? "";
  const winsNeeded = overlay?.winsNeeded ?? 1;
  const winsOne = Number.parseInt(leftTeam?.seriesScore || "0", 10) || 0;
  const winsTwo = Number.parseInt(rightTeam?.seriesScore || "0", 10) || 0;
  const targetPlayer = game?.targetPlayer ?? null;
  const showActivePlayer = Boolean(gameOverlay?.playerCardEnabled && targetPlayer && !game?.isReplay);
  const activePlateColor = targetPlayer && overlay
    ? resolveRocketLeagueLiveTeamColor(
      targetPlayer.team,
      overlay.flipSides,
      overlay.teamOne,
      overlay.teamTwo,
    )
    : "#1A75FD";
  const clockText = gameScene ? formatClock(game?.timeSeconds ?? 0) : "";
  const showOvertime = Boolean(gameScene && game?.isOT);
  const activities = gameOverlay?.activities ?? [];
  const replayCard = gameOverlay?.replayCard && isOverlayReplayCard(gameOverlay.replayCard)
    ? gameOverlay.replayCard
    : null;
  const showReplayScorer = Boolean(game?.isReplay && replayCard?.scorerName);
  const replayScorerTeam = replayCard && overlay
    ? resolveReplayScorerTeam(
      replayCard.team,
      overlay.flipSides,
      overlay.teamOne,
      overlay.teamTwo,
    )
    : null;
  const replayScorerAccent = replayCard && overlay
    ? resolveRocketLeagueLiveTeamColor(
      replayCard.team,
      overlay.flipSides,
      overlay.teamOne,
      overlay.teamTwo,
    )
    : overlay?.leagueSecondary ?? "#FCC500";
  const replayScorerLogo = String(replayScorerTeam?.logo ?? "").trim();
  const replayScorerLogoAlt = `${String(replayScorerTeam?.name ?? "Team").trim() || "Team"} logo`;
  const replayScorerLogoBackground = resolveImagePlate(replayScorerTeam?.logoBackground);

  return (
    <main className={styles.viewport}>
      <style>{"html,body{margin:0!important;width:100%!important;height:100%!important;overflow:hidden!important;background:transparent!important;}"}</style>
      <div
        className={styles.frame}
        style={{ transform: `translate3d(${frame.left}px, 0, 0) scale(${frame.scale})` }}
      >
        {overlay && leftTeam && rightTeam && vsScene ? (
          <div
            className={`${styles.sceneLayer} ${styles.sceneLayerVs}${vsScene.exiting ? ` ${styles.sceneLayerExiting}` : ` ${styles.sceneLayerEntering}`}`}
            aria-hidden={vsScene.exiting || undefined}
          >
            <VsMatchupStage
              leftTeam={leftTeam}
              rightTeam={rightTeam}
              winsNeeded={winsNeeded}
              leaguePrimary={overlay.leaguePrimary}
              leagueSecondary={overlay.leagueSecondary}
              sponsors={overlay.sponsors}
              sponsorWidgetEnabled={overlay.sponsorWidgetEnabled}
              ariaLabel="Rocket League lobby versus screen"
              skipEnterAnimation
            />
          </div>
        ) : null}
        {overlay && leftTeam && rightTeam && statsScene ? (
          <div
            className={`${styles.sceneLayer} ${styles.sceneLayerVs}${statsScene.exiting ? ` ${styles.sceneLayerExiting}` : ` ${styles.sceneLayerEntering}`}`}
            aria-hidden={statsScene.exiting || undefined}
          >
            <PostMatchTeamStatsStage
              leftTeam={leftTeam}
              rightTeam={rightTeam}
              bestOf={overlay.bestOf}
              leaguePrimary={overlay.leaguePrimary}
              leagueSecondary={overlay.leagueSecondary}
              matchTeamStats={matchTeamStats}
              statsSceneBackground="team-split"
              ariaLabel="Rocket League lobby post-match team stats"
            />
          </div>
        ) : null}
        {overlay && leftTeam && rightTeam && gameScene ? (
          <div
            className={`${styles.sceneLayer} ${styles.sceneLayerGame}${gameScene.exiting ? ` ${styles.sceneLayerExiting}` : ` ${styles.sceneLayerEntering}`}`}
            aria-hidden={gameScene.exiting || undefined}
          >
            <div className={styles.stage} style={cssVars} aria-label="Rocket League game scoreboard">
              <div className={styles.scoreboardSlot}>
                <section className={styles.scoreboard}>
                  <div className={`${styles.layer} ${styles.secondaryFill}`} />
                  <div className={`${styles.layer} ${styles.logoFill} ${styles.logoFillOne}`} />
                  <div className={`${styles.layer} ${styles.logoFill} ${styles.logoFillTwo}`} />
                  <div className={`${styles.nameFill} ${styles.nameFillOne}`} />
                  <div className={`${styles.nameFill} ${styles.nameFillTwo}`} />
                  <div className={`${styles.layer} ${styles.primaryFill}`} />
                  <div className={`${styles.logoFrame} ${styles.logoOne}`}>
                    <StableLogo src={leftTeam.logo} alt={`${leftTeam.name} logo`} />
                  </div>
                  <div className={`${styles.logoFrame} ${styles.logoTwo}`}>
                    <StableLogo src={rightTeam.logo} alt={`${rightTeam.name} logo`} />
                  </div>
                  {headerText ? <div className={styles.header}>{headerText}</div> : null}
                  <div className={`${styles.teamStack} ${styles.teamOneStack}`}>
                    {leftTeam.standing.trim() ? (
                      <span className={`${styles.teamStanding} ${styles.teamOneStanding}`}>{leftTeam.standing.trim()}</span>
                    ) : null}
                    <FitTeamName name={leftTeam.name} className={`${styles.teamName} ${styles.teamOneName}`} />
                    <SeriesPills wins={winsOne} needed={winsNeeded} color={seriesPillColor(leftTeam.color)} />
                  </div>
                  <div className={`${styles.teamStack} ${styles.teamTwoStack}`}>
                    {rightTeam.standing.trim() ? (
                      <span className={`${styles.teamStanding} ${styles.teamTwoStanding}`}>{rightTeam.standing.trim()}</span>
                    ) : null}
                    <FitTeamName name={rightTeam.name} className={`${styles.teamName} ${styles.teamTwoName}`} />
                    <SeriesPills wins={winsTwo} needed={winsNeeded} color={seriesPillColor(rightTeam.color)} />
                  </div>
                  <div className={`${styles.scoreLabel} ${styles.scoreLabelOne}`}>Score</div>
                  <div className={`${styles.scoreLabel} ${styles.scoreLabelTwo}`}>Score</div>
                  <div className={`${styles.score} ${styles.scoreOne}`}><span key={`one-${scoreOne}`}>{scoreOne}</span></div>
                  <div className={`${styles.score} ${styles.scoreTwo}`}><span key={`two-${scoreTwo}`}>{scoreTwo}</span></div>
                  <div
                    className={styles.clockSlot}
                    aria-label={showOvertime ? "Overtime game clock" : "Game clock"}
                  >
                    {showOvertime ? (
                      <img
                        className={styles.overtimePill}
                        src="/rocket-league-overlay/nel/overtime-pill.png"
                        alt="Overtime"
                      />
                    ) : null}
                    <div className={styles.clock}>
                      <span className={styles.clockValue}>{clockText}</span>
                    </div>
                  </div>
                </section>
              </div>
              <ActivePlayerCardHost
                show={showActivePlayer}
                player={targetPlayer}
                plateColor={activePlateColor}
              />
              <ReplayIndicatorHost
                show={Boolean(game?.isReplay)}
                accent={overlay.leagueSecondary}
              />
              <ReplayScorerCardHost
                show={showReplayScorer}
                card={replayCard}
                accent={replayScorerAccent}
                logoSrc={replayScorerLogo}
                logoAlt={replayScorerLogoAlt}
                logoBackground={replayScorerLogoBackground}
              />
              <aside className={styles.upperRightRail} aria-label="Match activities">
                <ActivityFeed
                  activities={activities}
                  flipSides={overlay.flipSides}
                  teamOne={overlay.teamOne}
                  teamTwo={overlay.teamTwo}
                />
              </aside>
              {overlay.sponsorWidgetEnabled ? <SponsorCarousel sponsors={overlay.sponsors} /> : null}
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
