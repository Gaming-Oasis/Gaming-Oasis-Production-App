"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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

type RocketLeagueOverlayState = {
  version: 1;
  updatedAt: string;
  skin: string;
  header: string;
  bestOf: string;
  flipSides: boolean;
  playerCardEnabled: boolean;
  sponsorWidgetEnabled: boolean;
  sponsors: OverlaySponsor[];
  roundNumber: number;
  winsNeeded: number;
  leaguePrimary: string;
  leagueSecondary: string;
  teamOne: OverlayTeam;
  teamTwo: OverlayTeam;
  connection: OverlayConnection;
  game: OverlayGame;
};

const OVERLAY_ENDPOINT = "http://127.0.0.1:4877/api/overlays/rocket-league";
const TEAM_NAME_MAX_PX = 42;
const TEAM_NAME_MIN_PX = 18;
const PREFERRED_WHITE_MIN_CONTRAST = 2.5;
/** Opaque navy plate from the active-player card body (active-border-fill). */
const SCORE_PANEL_NAVY = "#0E1520";

function colorChannels(value: string) {
  const hex = value.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return hex.split("").map((part) => Number.parseInt(`${part}${part}`, 16));
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  }
  const rgb = value.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  return rgb ? rgb.slice(1).map(Number) : [26, 117, 253];
}

function relativeLuminance(color: string) {
  const linearChannels = colorChannels(color).map((value) => {
    const channel = Math.min(255, Math.max(0, value)) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linearChannels[0] + 0.7152 * linearChannels[1] + 0.0722 * linearChannels[2];
}

function contrastRatio(foreground: string, background: string) {
  const light = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const dark = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (light + 0.05) / (dark + 0.05);
}

function readableText(color: string) {
  const background = relativeLuminance(color);
  const dark = 0.008568125618069307;
  const whiteContrast = 1.05 / (background + 0.05);
  const darkContrast = (Math.max(background, dark) + 0.05) / (Math.min(background, dark) + 0.05);
  const whiteIsReadable = whiteContrast >= PREFERRED_WHITE_MIN_CONTRAST;
  return whiteIsReadable || whiteContrast >= darkContrast ? "#FFFFFF" : "#171717";
}

/** Navy pills on the name plate; white when the team color is too close to navy. */
function seriesPillColor(teamColor: string) {
  return contrastRatio(SCORE_PANEL_NAVY, teamColor) < PREFERRED_WHITE_MIN_CONTRAST
    ? "#FFFFFF"
    : SCORE_PANEL_NAVY;
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
    && isOverlaySponsors(state.sponsors)
    && typeof state.roundNumber === "number"
    && typeof state.winsNeeded === "number"
    && typeof state.leaguePrimary === "string"
    && typeof state.leagueSecondary === "string"
    && isOverlayTeam(state.teamOne)
    && isOverlayTeam(state.teamTwo)
    && Boolean(connection)
    && typeof connection.connected === "boolean"
    && (connection.lastEventAt === null || typeof connection.lastEventAt === "string")
    && isOverlayGame(state.game);
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

function StableLogo({ src, alt }: { src: string; alt: string }) {
  const [displayedSource, setDisplayedSource] = useState("");

  useEffect(() => {
    if (!src) {
      setDisplayedSource("");
      return;
    }
    const candidate = localLogoUrl(src);
    const image = new Image();
    image.onload = () => setDisplayedSource(candidate);
    image.src = candidate;
    return () => {
      image.onload = null;
    };
  }, [src]);

  return displayedSource
    ? <img key={displayedSource} className={styles.logoImage} src={displayedSource} alt={alt} onError={() => setDisplayedSource("")} />
    : null;
}

function FitTeamName({ name, className }: { name: string; className: string }) {
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;

    function fit() {
      if (cancelled || !el) return;
      let size = TEAM_NAME_MAX_PX;
      el.style.fontSize = `${size}px`;
      while (size > TEAM_NAME_MIN_PX && el.scrollWidth > el.clientWidth + 0.5) {
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
  }, [name]);

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

function sponsorAssetKey(sponsor: OverlaySponsor) {
  return `${sponsor.id}\u0000${sponsor.logo}`;
}

function SponsorCarousel({ sponsors }: { sponsors: OverlaySponsor[] }) {
  const [rotation, setRotation] = useState({ currentId: "", previousId: "" });
  const [assetState, setAssetState] = useState<Record<string, "loaded" | "failed">>({});
  const sponsorSignature = JSON.stringify(sponsors);

  useEffect(() => {
    let active = true;
    const loaders: HTMLImageElement[] = [];

    sponsors.forEach((sponsor) => {
      if (!sponsor.logo) return;
      const key = sponsorAssetKey(sponsor);
      const image = new Image();
      loaders.push(image);
      image.onload = () => {
        if (active) setAssetState((current) => ({ ...current, [key]: "loaded" }));
      };
      image.onerror = () => {
        if (active) setAssetState((current) => ({ ...current, [key]: "failed" }));
      };
      image.src = localLogoUrl(sponsor.logo);
    });

    return () => {
      active = false;
      loaders.forEach((image) => {
        image.onload = null;
        image.onerror = null;
      });
    };
  }, [sponsorSignature]);

  const displayableSponsors = sponsors.filter((sponsor) => {
    if (!sponsor.logo) return Boolean(sponsor.name);
    const status = assetState[sponsorAssetKey(sponsor)];
    return status === "loaded" || (status === "failed" && Boolean(sponsor.name));
  });
  const displayableSignature = displayableSponsors
    .map((sponsor) => `${sponsorAssetKey(sponsor)}\u0000${assetState[sponsorAssetKey(sponsor)] || "name"}`)
    .join("\u0001");

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
  }, [displayableSignature]);

  const sponsor = displayableSponsors.find((entry) => entry.id === rotation.currentId) || displayableSponsors[0];
  if (!sponsor) return null;
  const previousSponsor = displayableSponsors.find((entry) => entry.id === rotation.previousId && entry.id !== sponsor.id);
  const logoLoaded = sponsor.logo && assetState[sponsorAssetKey(sponsor)] === "loaded";
  const slideKey = `${sponsorAssetKey(sponsor)}\u0000${logoLoaded ? "logo" : "name"}`;

  function slideContent(entry: OverlaySponsor) {
    const entryLogoLoaded = entry.logo && assetState[sponsorAssetKey(entry)] === "loaded";
    return entryLogoLoaded ? (
      <img
        src={localLogoUrl(entry.logo)}
        alt={entry.name ? `${entry.name} logo` : "Sponsor logo"}
        onError={() => setAssetState((current) => ({ ...current, [sponsorAssetKey(entry)]: "failed" }))}
      />
    ) : <span>{entry.name}</span>;
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

function FitActivePlayerName({ name, className }: { name: string; className: string }) {
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

  return <strong ref={ref} className={className}>{displayName}</strong>;
}

function ActivePlayerCard({
  player,
  plateColor,
  nameTextColor,
}: {
  player: OverlayPlayer;
  plateColor: string;
  nameTextColor: string;
}) {
  const boost = player.isDead ? 0 : Math.min(100, Math.max(0, player.boost));
  return (
    <div className={styles.activePlayerSlot} aria-label="Active player">
      <section
        className={styles.activePlayer}
        style={{
          "--active-name-text": nameTextColor,
        } as React.CSSProperties}
      >
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
        <FitActivePlayerName name={player.name} className={styles.activeName} />
        <div className={`${styles.activeStat} ${styles.activeStatGoals}`}>{player.goals}</div>
        <div className={`${styles.activeStat} ${styles.activeStatShots}`}>{player.shots}</div>
        <div className={`${styles.activeStat} ${styles.activeStatSaves}`}>{player.saves}</div>
        <div className={`${styles.activeStat} ${styles.activeStatAssists}`}>{player.assists}</div>
        <progress className={styles.activeBoost} max={100} value={boost} aria-label="Boost" />
      </section>
    </div>
  );
}

export default function RocketLeagueOverlay() {
  const [overlay, setOverlay] = useState<RocketLeagueOverlayState | null>(null);
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

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function refresh() {
      try {
        const response = await fetch(OVERLAY_ENDPOINT, { cache: "no-store", signal: controller.signal });
        if (response.status === 204 || !response.ok) return;
        const next = await response.json();
        if (active && isOverlayState(next)) setOverlay(next);
      } catch {
        // Keep the last valid graphic through temporary writer or network failures.
      }
    }

    refresh();
    const timer = window.setInterval(refresh, 250);
    return () => {
      active = false;
      window.clearInterval(timer);
      controller.abort();
    };
  }, []);

  const game = overlay?.game;
  const showScoreboard = Boolean(overlay);
  const live = Boolean(game?.hasGame);
  const leftTeam = overlay?.flipSides ? overlay.teamTwo : overlay?.teamOne;
  const rightTeam = overlay?.flipSides ? overlay.teamOne : overlay?.teamTwo;
  const scoreOne = overlay?.flipSides ? (game?.scoreTwo ?? 0) : (game?.scoreOne ?? 0);
  const scoreTwo = overlay?.flipSides ? (game?.scoreOne ?? 0) : (game?.scoreTwo ?? 0);

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
      "--logo-one-bg": leftTeam.logoBackground,
      "--logo-two-bg": rightTeam.logoBackground,
      "--score-text": readableText(SCORE_PANEL_NAVY),
      "--header-text": readableText(overlay.leaguePrimary),
    } as React.CSSProperties;
  }, [overlay, leftTeam, rightTeam]);

  const headerText = overlay?.header?.trim() ?? "";
  const winsNeeded = overlay?.winsNeeded ?? 1;
  const winsOne = Number.parseInt(leftTeam?.seriesScore || "0", 10) || 0;
  const winsTwo = Number.parseInt(rightTeam?.seriesScore || "0", 10) || 0;
  const targetPlayer = game?.targetPlayer ?? null;
  const showActivePlayer = Boolean(overlay?.playerCardEnabled && targetPlayer);
  const activePlateColor = targetPlayer?.team === 1
    ? (overlay?.teamTwo.color ?? "#F8871E")
    : (overlay?.teamOne.color ?? "#1A75FD");
  const activeNameText = readableText(activePlateColor);

  return (
    <main className={styles.viewport}>
      <style>{"html,body{margin:0!important;width:100%!important;height:100%!important;overflow:hidden!important;background:transparent!important;}"}</style>
      <div
        className={styles.frame}
        style={{ transform: `translate3d(${frame.left}px, 0, 0) scale(${frame.scale})` }}
      >
        {overlay && showScoreboard && leftTeam && rightTeam ? (
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
                  <FitTeamName name={leftTeam.name} className={`${styles.teamName} ${styles.teamOneName}`} />
                  <SeriesPills wins={winsOne} needed={winsNeeded} color={seriesPillColor(leftTeam.color)} />
                </div>
                <div className={`${styles.teamStack} ${styles.teamTwoStack}`}>
                  <FitTeamName name={rightTeam.name} className={`${styles.teamName} ${styles.teamTwoName}`} />
                  <SeriesPills wins={winsTwo} needed={winsNeeded} color={seriesPillColor(rightTeam.color)} />
                </div>
                <div className={`${styles.scoreLabel} ${styles.scoreLabelOne}`}>Score</div>
                <div className={`${styles.scoreLabel} ${styles.scoreLabelTwo}`}>Score</div>
                <div className={`${styles.score} ${styles.scoreOne}`}><span key={`one-${scoreOne}`}>{live ? scoreOne : 0}</span></div>
                <div className={`${styles.score} ${styles.scoreTwo}`}><span key={`two-${scoreTwo}`}>{live ? scoreTwo : 0}</span></div>
              </section>
            </div>
            {showActivePlayer && targetPlayer ? (
              <ActivePlayerCard
                player={targetPlayer}
                plateColor={activePlateColor}
                nameTextColor={activeNameText}
              />
            ) : null}
            {overlay.sponsorWidgetEnabled ? <SponsorCarousel sponsors={overlay.sponsors} /> : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}
