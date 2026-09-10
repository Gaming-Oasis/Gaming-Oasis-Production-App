"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { readableText, resolveImagePlate } from "../../../lib/readable-text.mjs";
import styles from "./vs-overlay.module.css";
import { useStableImageSource } from "../useStableImageSource";

export type VsOverlayTeam = {
  name: string;
  standing: string;
  logo: string;
  color: string;
  logoBackground: string;
  seriesScore: string;
};

export type VsOverlaySponsor = {
  id: string;
  name: string;
  logo: string;
};

const VS_NAME_MAX_PX = 72;
const VS_NAME_MIN_PX = 28;
const SPONSOR_ROTATION_MS = 15000;

function seriesPillColor(teamColor: string) {
  return readableText(teamColor);
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
        className={className}
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
  maxPx = VS_NAME_MAX_PX,
  minPx = VS_NAME_MIN_PX,
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

function sponsorAssetKey(sponsor: VsOverlaySponsor) {
  return `${sponsor.id}\u0000${sponsor.logo}`;
}

const SPONSOR_ASSET_RETRY_BASE_MS = 1000;
const SPONSOR_ASSET_RETRY_MAX_MS = 60000;

function SponsorCarousel({ sponsors }: { sponsors: VsOverlaySponsor[] }) {
  const [rotation, setRotation] = useState({ currentId: "", previousId: "" });
  const [assetState, setAssetState] = useState<Record<string, "loaded" | "failed">>({});
  const retryAssetRef = useRef<(sponsor: VsOverlaySponsor) => void>(() => undefined);
  const sponsorSignature = JSON.stringify(sponsors);
  const stableSponsors = useMemo(() => JSON.parse(sponsorSignature) as VsOverlaySponsor[], [sponsorSignature]);

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

    function scheduleRetry(sponsor: VsOverlaySponsor) {
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

    function loadAsset(sponsor: VsOverlaySponsor) {
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
      image.src = localLogoUrl(sponsor.logo);
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
    return status === "loaded" || (status === "failed" && Boolean(sponsor.name));
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
  const logoLoaded = sponsor.logo && assetState[sponsorAssetKey(sponsor)] === "loaded";
  const slideKey = `${sponsorAssetKey(sponsor)}\u0000${logoLoaded ? "logo" : "name"}`;

  function slideContent(entry: VsOverlaySponsor) {
    const entryLogoLoaded = entry.logo && assetState[sponsorAssetKey(entry)] === "loaded";
    return entryLogoLoaded ? (
      <img
        src={localLogoUrl(entry.logo)}
        alt={entry.name ? `${entry.name} logo` : "Sponsor logo"}
        onError={() => {
          const key = sponsorAssetKey(entry);
          setAssetState((current) => current[key] === "failed" ? current : { ...current, [key]: "failed" });
          retryAssetRef.current(entry);
        }}
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

export function VsTeamSplitBackground({
  leftTeam,
  rightTeam,
}: {
  leftTeam: VsOverlayTeam;
  rightTeam: VsOverlayTeam;
}) {
  return (
    <div className={styles.teamSplitBackground} aria-hidden="true">
      <div className={`${styles.lobbyVsWedge} ${styles.lobbyVsWedgeLeft}`}>
        <div className={styles.lobbyVsBleed} style={{ background: resolveImagePlate(leftTeam.logoBackground) }} />
        <div className={styles.lobbyVsWash} style={{ ["--lobby-vs-wash" as string]: leftTeam.color }} />
        <StableLogo src={leftTeam.logo} alt="" className={styles.lobbyVsBleedLogo} />
      </div>
      <div className={`${styles.lobbyVsWedge} ${styles.lobbyVsWedgeRight}`}>
        <div className={styles.lobbyVsBleed} style={{ background: resolveImagePlate(rightTeam.logoBackground) }} />
        <div className={styles.lobbyVsWash} style={{ ["--lobby-vs-wash" as string]: rightTeam.color }} />
        <StableLogo src={rightTeam.logo} alt="" className={styles.lobbyVsBleedLogo} />
      </div>
      <div className={styles.lobbyVsSeam} />
    </div>
  );
}

/**
 * Background treatment for composed scenes. The matte layer keeps overlay
 * components readable while preserving the team split underneath. Standalone
 * VS screens intentionally use VsTeamSplitBackground directly.
 */
export function VsSceneBackdrop({
  leftTeam,
  rightTeam,
}: {
  leftTeam: VsOverlayTeam;
  rightTeam: VsOverlayTeam;
}) {
  return (
    <>
      <VsTeamSplitBackground leftTeam={leftTeam} rightTeam={rightTeam} />
      <div className={styles.sceneBackdropDim} aria-hidden="true" />
    </>
  );
}

function LobbyVsScreen({
  leftTeam,
  rightTeam,
  winsOne,
  winsTwo,
  winsNeeded,
  skipEnterAnimation = false,
}: {
  leftTeam: VsOverlayTeam;
  rightTeam: VsOverlayTeam;
  winsOne: number;
  winsTwo: number;
  winsNeeded: number;
  skipEnterAnimation?: boolean;
}) {
  const leftText = readableText(leftTeam.color);
  const rightText = readableText(rightTeam.color);
  const leftStanding = leftTeam.standing.trim();
  const rightStanding = rightTeam.standing.trim();
  return (
    <section
      className={`${styles.lobbyVs}${skipEnterAnimation ? ` ${styles.lobbyVsNoEnter}` : ""}`}
      aria-label="Matchup versus screen"
    >
      <VsTeamSplitBackground leftTeam={leftTeam} rightTeam={rightTeam} />
      <div
        className={`${styles.lobbyVsCorner} ${styles.lobbyVsCornerLeft}`}
        style={{ color: leftText }}
      >
        <FitTeamName name={leftTeam.name} className={styles.lobbyVsName} />
        {leftStanding ? (
          <span className={styles.lobbyVsStanding}>{leftStanding}</span>
        ) : null}
        <SeriesPills wins={winsOne} needed={winsNeeded} color={seriesPillColor(leftTeam.color)} />
      </div>
      <div
        className={`${styles.lobbyVsCorner} ${styles.lobbyVsCornerRight}`}
        style={{ color: rightText }}
      >
        <FitTeamName name={rightTeam.name} className={styles.lobbyVsName} />
        {rightStanding ? (
          <span className={styles.lobbyVsStanding}>{rightStanding}</span>
        ) : null}
        <SeriesPills wins={winsTwo} needed={winsNeeded} color={seriesPillColor(rightTeam.color)} />
      </div>
      <div className={styles.lobbyVsMark} aria-hidden="true">
        <span>VS</span>
      </div>
    </section>
  );
}

export function VsMatchupStage({
  leftTeam,
  rightTeam,
  winsNeeded,
  leaguePrimary,
  leagueSecondary,
  sponsors,
  sponsorWidgetEnabled,
  ariaLabel = "Matchup versus screen",
  skipEnterAnimation = false,
}: {
  leftTeam: VsOverlayTeam;
  rightTeam: VsOverlayTeam;
  winsNeeded: number;
  leaguePrimary: string;
  leagueSecondary: string;
  sponsors: VsOverlaySponsor[];
  sponsorWidgetEnabled: boolean;
  ariaLabel?: string;
  /** When the parent owns the fade (RL live overlay), skip the nested lobby enter. */
  skipEnterAnimation?: boolean;
}) {
  const winsOne = Number.parseInt(leftTeam.seriesScore || "0", 10) || 0;
  const winsTwo = Number.parseInt(rightTeam.seriesScore || "0", 10) || 0;

  const cssVars = useMemo(() => ({
    "--league-primary": leaguePrimary,
    "--league-secondary": leagueSecondary,
  }) as React.CSSProperties, [leaguePrimary, leagueSecondary]);

  return (
    <div className={styles.stage} style={cssVars} aria-label={ariaLabel}>
      <LobbyVsScreen
        leftTeam={leftTeam}
        rightTeam={rightTeam}
        winsOne={winsOne}
        winsTwo={winsTwo}
        winsNeeded={winsNeeded}
        skipEnterAnimation={skipEnterAnimation}
      />
      {sponsorWidgetEnabled ? <SponsorCarousel sponsors={sponsors} /> : null}
    </div>
  );
}

export function VsMatchupOverlay({
  leftTeam,
  rightTeam,
  winsNeeded,
  leaguePrimary,
  leagueSecondary,
  sponsors,
  sponsorWidgetEnabled,
  ariaLabel,
}: {
  leftTeam: VsOverlayTeam;
  rightTeam: VsOverlayTeam;
  winsNeeded: number;
  leaguePrimary: string;
  leagueSecondary: string;
  sponsors: VsOverlaySponsor[];
  sponsorWidgetEnabled: boolean;
  ariaLabel: string;
}) {
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

  return (
    <main className={styles.viewport}>
      <style>{"html,body{margin:0!important;width:100%!important;height:100%!important;overflow:hidden!important;background:transparent!important;}"}</style>
      <div
        className={styles.frame}
        style={{ transform: `translate3d(${frame.left}px, 0, 0) scale(${frame.scale})` }}
      >
        <VsMatchupStage
          leftTeam={leftTeam}
          rightTeam={rightTeam}
          winsNeeded={winsNeeded}
          leaguePrimary={leaguePrimary}
          leagueSecondary={leagueSecondary}
          sponsors={sponsors}
          sponsorWidgetEnabled={sponsorWidgetEnabled}
          ariaLabel={ariaLabel}
        />
      </div>
    </main>
  );
}

export function isVsOverlayTeam(value: unknown): value is VsOverlayTeam {
  if (!value || typeof value !== "object") return false;
  const team = value as Record<string, unknown>;
  return ["name", "standing", "logo", "color", "logoBackground", "seriesScore"]
    .every((key) => typeof team[key] === "string");
}

export function isVsOverlaySponsors(value: unknown): value is VsOverlaySponsor[] {
  return Array.isArray(value) && value.every((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const sponsor = entry as Record<string, unknown>;
    return typeof sponsor.id === "string"
      && typeof sponsor.name === "string"
      && typeof sponsor.logo === "string";
  });
}
