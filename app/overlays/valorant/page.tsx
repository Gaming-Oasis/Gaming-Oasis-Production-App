"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  colorChannels,
  readableText,
  resolveImagePlate,
} from "../../../lib/readable-text.mjs";
import { usePollingJson } from "../usePollingJson";
import { useStableImageSource } from "../useStableImageSource";
import styles from "./valorant-overlay.module.css";

type OverlayTeam = {
  name: string;
  standing: string;
  logo: string;
  color: string;
  logoBackground: string;
  seriesScore: string;
};

type MapWidgetItem = {
  mapNumber: number;
  name: string;
  background: string;
  status: "result" | "current" | "next" | "decider";
  scoreOne: string;
  scoreTwo: string;
  picker: "one" | "two" | "";
};

type MapWidget = {
  visible: boolean;
  maps: MapWidgetItem[];
};

type OverlaySponsor = {
  id: string;
  name: string;
  logo: string;
};

type ValorantOverlayState = {
  version: 1;
  updatedAt: string;
  header: string;
  bestOf: string;
  leaguePrimary: string;
  leagueSecondary: string;
  mapWidget: MapWidget;
  sponsorWidgetEnabled: boolean;
  sponsors: OverlaySponsor[];
  teamOne: OverlayTeam;
  teamTwo: OverlayTeam;
};

const OVERLAY_ENDPOINT = "http://127.0.0.1:4877/api/overlays/valorant";

function isOverlayTeam(value: unknown): value is OverlayTeam {
  if (!value || typeof value !== "object") return false;
  const team = value as Record<string, unknown>;
  return ["name", "standing", "logo", "color", "logoBackground", "seriesScore"]
    .every((key) => typeof team[key] === "string");
}

function isOverlayState(value: unknown): value is ValorantOverlayState {
  if (!value || typeof value !== "object") return false;
  const state = value as Record<string, unknown>;
  return state.version === 1
    && typeof state.updatedAt === "string"
    && typeof state.header === "string"
    && typeof state.bestOf === "string"
    && typeof state.leaguePrimary === "string"
    && typeof state.leagueSecondary === "string"
    && isMapWidget(state.mapWidget)
    && typeof state.sponsorWidgetEnabled === "boolean"
    && isOverlaySponsors(state.sponsors)
    && isOverlayTeam(state.teamOne)
    && isOverlayTeam(state.teamTwo);
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

function isMapWidget(value: unknown): value is MapWidget {
  if (!value || typeof value !== "object") return false;
  const widget = value as Record<string, unknown>;
  if (typeof widget.visible !== "boolean" || !Array.isArray(widget.maps)) return false;
  return widget.maps.every((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const map = entry as Record<string, unknown>;
    return typeof map.mapNumber === "number"
      && typeof map.name === "string"
      && typeof map.background === "string"
      && ["result", "current", "next", "decider"].includes(String(map.status))
      && typeof map.scoreOne === "string"
      && typeof map.scoreTwo === "string"
      && ["one", "two", ""].includes(String(map.picker));
  });
}

function mixColors(first: string, second: string, firstWeight = 0.52) {
  const firstChannels = colorChannels(first, [100, 78, 181]);
  const secondChannels = colorChannels(second, [100, 78, 181]);
  const channels = firstChannels.map((value, index) => Math.round(
    value * firstWeight + secondChannels[index] * (1 - firstWeight),
  ));
  return `rgb(${channels.join(", ")})`;
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

function localArtworkUrl(value: string) {
  try {
    const url = new URL(value);
    const artworkId = url.hostname === "drive.google.com" ? url.searchParams.get("id") : "";
    if (artworkId && (url.pathname === "/uc" || url.pathname === "/thumbnail")) {
      return `http://127.0.0.1:4877/api/public/map-artwork/${encodeURIComponent(artworkId)}`;
    }
  } catch {
    // Keep manual and relative artwork paths unchanged.
  }
  return value;
}

function StableLogo({ src, alt }: { src: string; alt: string }) {
  const candidate = src ? localLogoUrl(src) : "";
  const { displayedSource, handleDisplayedError } = useStableImageSource(candidate);

  return displayedSource
    ? <img key={displayedSource} className={styles.logoImage} src={displayedSource} alt={alt} onError={handleDisplayedError} />
    : null;
}

function MapLogo({ team, size = "normal" }: { team: OverlayTeam; size?: "normal" | "small" }) {
  return (
    <span className={`${styles.mapLogo} ${size === "small" ? styles.mapLogoSmall : ""}`}>
      <StableLogo src={team.logo} alt={`${team.name} logo`} />
    </span>
  );
}

function MapArtwork({ src }: { src: string }) {
  const candidate = src ? localArtworkUrl(src) : "";
  const { displayedSource, handleDisplayedError } = useStableImageSource(candidate);

  return displayedSource ? (
    <img
      className={styles.mapArtwork}
      src={displayedSource}
      alt=""
      aria-hidden="true"
      draggable={false}
      referrerPolicy="no-referrer"
      onError={handleDisplayedError}
    />
  ) : null;
}

function MapWidgetStrip({ widget, teamOne, teamTwo }: { widget: MapWidget; teamOne: OverlayTeam; teamTwo: OverlayTeam }) {
  if (!widget.visible || widget.maps.length !== 3) return null;

  return (
    <aside className={styles.mapWidget} aria-label="VALORANT series maps">
      {widget.maps.map((map) => {
        const picker = map.picker === "one" ? teamOne : map.picker === "two" ? teamTwo : null;
        const itemKey = [map.mapNumber, map.name, map.status, map.scoreOne, map.scoreTwo, map.picker].join("-");
        return (
          <section
            key={itemKey}
            className={`${styles.mapItem} ${styles[`mapItem${map.status[0].toUpperCase()}${map.status.slice(1)}`]}`}
          >
            <MapArtwork src={map.background} />
            <div className={styles.mapCopy}>
              <span>{map.status === "result" ? `MAP ${map.mapNumber}` : map.status}</span>
              <strong>{map.name}</strong>
            </div>
            {map.status === "result" ? (
              <div className={styles.mapResult} aria-label={`${teamOne.name} ${map.scoreOne} to ${map.scoreTwo} ${teamTwo.name}`}>
                <MapLogo team={teamOne} size="small" />
                <b>{map.scoreOne}</b><i>–</i><b>{map.scoreTwo}</b>
                <MapLogo team={teamTwo} size="small" />
              </div>
            ) : picker ? (
              <div className={styles.mapPick}>
                <MapLogo team={picker} />
              </div>
            ) : (
              <span className={styles.deciderMark}>AUTO</span>
            )}
          </section>
        );
      })}
    </aside>
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

  function slideContent(entry: OverlaySponsor) {
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

export default function ValorantOverlay() {
  const overlay = usePollingJson({
    endpoint: OVERLAY_ENDPOINT,
    intervalMs: 750,
    validate: isOverlayState,
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

  const variables = useMemo(() => {
    if (!overlay) return undefined;
    const teamOneText = readableText(overlay.teamOne.color);
    const teamTwoText = readableText(overlay.teamTwo.color);
    const headerText = readableText(mixColors(overlay.leaguePrimary, overlay.leagueSecondary));
    return {
      "--league-primary": overlay.leaguePrimary,
      "--league-secondary": overlay.leagueSecondary,
      "--team-one": overlay.teamOne.color,
      "--team-two": overlay.teamTwo.color,
      "--team-one-text": teamOneText,
      "--team-two-text": teamTwoText,
      "--team-one-shadow": teamOneText === "#171717" ? "rgb(255 255 255 / 28%)" : "rgb(0 0 0 / 36%)",
      "--team-two-shadow": teamTwoText === "#171717" ? "rgb(255 255 255 / 28%)" : "rgb(0 0 0 / 36%)",
      "--header-text": headerText,
      "--header-shadow": headerText === "#171717" ? "rgb(255 255 255 / 28%)" : "rgb(0 0 0 / 42%)",
      "--logo-one-bg": resolveImagePlate(overlay.teamOne.logoBackground),
      "--logo-two-bg": resolveImagePlate(overlay.teamTwo.logoBackground),
    } as React.CSSProperties;
  }, [overlay]);

  return (
    <main className={styles.viewport}>
      <style>{"html,body{margin:0!important;width:100%!important;height:100%!important;overflow:hidden!important;background:transparent!important;}"}</style>
      <div
        className={styles.frame}
        style={{ transform: `translate3d(${frame.left}px, 0, 0) scale(${frame.scale})` }}
      >
        {overlay ? (
          <div className={styles.stage} style={variables} aria-label="VALORANT game scoreboard">
            <div className={`${styles.maskLayer} ${styles.centerRail}`} />

            <section className={`${styles.maskLayer} ${styles.teamPanel} ${styles.teamOne}`}>
              <strong key={overlay.teamOne.name} className={styles.teamOneName}>{overlay.teamOne.name}</strong>
              {overlay.teamOne.standing ? <span key={overlay.teamOne.standing} className={styles.teamOneStanding}>{overlay.teamOne.standing}</span> : null}
            </section>
            <section className={`${styles.maskLayer} ${styles.teamPanel} ${styles.teamTwo}`}>
              <strong key={overlay.teamTwo.name} className={styles.teamTwoName}>{overlay.teamTwo.name}</strong>
              {overlay.teamTwo.standing ? <span key={overlay.teamTwo.standing} className={styles.teamTwoStanding}>{overlay.teamTwo.standing}</span> : null}
            </section>

            <div className={`${styles.maskLayer} ${styles.scoreWedge} ${styles.scoreOne}`}><span key={overlay.teamOne.seriesScore}>{overlay.teamOne.seriesScore}</span></div>
            <div className={`${styles.maskLayer} ${styles.scoreWedge} ${styles.scoreTwo}`}><span key={overlay.teamTwo.seriesScore}>{overlay.teamTwo.seriesScore}</span></div>
            <div key={overlay.header} className={styles.header}>{overlay.header}</div>

            <div className={`${styles.maskLayer} ${styles.logoBox} ${styles.logoBoxOne}`} />
            <div className={`${styles.maskLayer} ${styles.logoBox} ${styles.logoBoxTwo}`} />
            <div className={`${styles.logoFrame} ${styles.logoOne}`}><StableLogo src={overlay.teamOne.logo} alt={`${overlay.teamOne.name} logo`} /></div>
            <div className={`${styles.logoFrame} ${styles.logoTwo}`}><StableLogo src={overlay.teamTwo.logo} alt={`${overlay.teamTwo.name} logo`} /></div>

            {overlay.sponsorWidgetEnabled ? <SponsorCarousel sponsors={overlay.sponsors} /> : null}
            <MapWidgetStrip widget={overlay.mapWidget} teamOne={overlay.teamOne} teamTwo={overlay.teamTwo} />
          </div>
        ) : null}
      </div>
    </main>
  );
}
