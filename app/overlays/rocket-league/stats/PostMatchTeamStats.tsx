"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { readableText, resolveImagePlate } from "../../../../lib/readable-text.mjs";
import { useStableImageSource } from "../../useStableImageSource";
import styles from "./stats-overlay.module.css";

export type StatsOverlayTeam = {
  name: string;
  standing: string;
  logo: string;
  color: string;
  logoBackground: string;
  seriesScore: string;
};

export type MatchTeamTotals = {
  goals: number;
  assists: number;
  shots: number;
  saves: number;
  demos: number;
  touches: number;
};

export type MatchTeamStats = {
  scoreOne: number;
  scoreTwo: number;
  winnerTeam: 0 | 1 | null;
  teamOne: MatchTeamTotals;
  teamTwo: MatchTeamTotals;
};

const STAT_ROWS: Array<{
  key: keyof MatchTeamTotals;
  label: string;
  labelClass: string;
  leftClass: string;
  rightClass: string;
}> = [
  {
    key: "goals",
    label: "Goals",
    labelClass: styles.statLabelGoals,
    leftClass: styles.statValueGoalsLeft,
    rightClass: styles.statValueGoalsRight,
  },
  {
    key: "assists",
    label: "Assists",
    labelClass: styles.statLabelAssists,
    leftClass: styles.statValueAssistsLeft,
    rightClass: styles.statValueAssistsRight,
  },
  {
    key: "shots",
    label: "Shots",
    labelClass: styles.statLabelShots,
    leftClass: styles.statValueShotsLeft,
    rightClass: styles.statValueShotsRight,
  },
  {
    key: "saves",
    label: "Saves",
    labelClass: styles.statLabelSaves,
    leftClass: styles.statValueSavesLeft,
    rightClass: styles.statValueSavesRight,
  },
  {
    key: "demos",
    label: "Demos",
    labelClass: styles.statLabelDemos,
    leftClass: styles.statValueDemosLeft,
    rightClass: styles.statValueDemosRight,
  },
  {
    key: "touches",
    label: "Ball Touches",
    labelClass: styles.statLabelTouches,
    leftClass: styles.statValueTouchesLeft,
    rightClass: styles.statValueTouchesRight,
  },
];

const NAME_MAX_PX = 26;
const NAME_MIN_PX = 14;

export type StatsSceneBackground = "transparent" | "team-split";

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

function BackgroundLogo({
  src,
  className,
}: {
  src: string;
  className: string;
}) {
  const candidate = src ? localLogoUrl(src) : "";
  const { displayedSource, handleDisplayedError } = useStableImageSource(candidate);

  return displayedSource
    ? (
      <img
        key={displayedSource}
        className={className}
        src={displayedSource}
        alt=""
        onError={handleDisplayedError}
      />
    )
    : null;
}

function StatsTeamSplitBackground({
  leftTeam,
  rightTeam,
}: {
  leftTeam: StatsOverlayTeam;
  rightTeam: StatsOverlayTeam;
}) {
  return (
    <div className={styles.statsSceneBg} aria-hidden="true">
      <div className={`${styles.statsSceneWedge} ${styles.statsSceneWedgeLeft}`}>
        <div
          className={styles.statsSceneBleed}
          style={{ background: resolveImagePlate(leftTeam.logoBackground) }}
        />
        <div
          className={styles.statsSceneWash}
          style={{ ["--stats-scene-wash" as string]: leftTeam.color }}
        />
        <BackgroundLogo src={leftTeam.logo} className={styles.statsSceneBleedLogo} />
      </div>
      <div className={`${styles.statsSceneWedge} ${styles.statsSceneWedgeRight}`}>
        <div
          className={styles.statsSceneBleed}
          style={{ background: resolveImagePlate(rightTeam.logoBackground) }}
        />
        <div
          className={styles.statsSceneWash}
          style={{ ["--stats-scene-wash" as string]: rightTeam.color }}
        />
        <BackgroundLogo src={rightTeam.logo} className={styles.statsSceneBleedLogo} />
      </div>
      <div className={styles.statsSceneSeam} />
    </div>
  );
}

function StatsSceneDimLayer() {
  return <div className={styles.statsSceneDim} aria-hidden="true" />;
}

function isMatchTeamTotals(value: unknown): value is MatchTeamTotals {
  if (!value || typeof value !== "object") return false;
  const totals = value as Record<string, unknown>;
  return ["goals", "assists", "shots", "saves", "demos", "touches"]
    .every((key) => typeof totals[key] === "number");
}

export function isMatchTeamStats(value: unknown): value is MatchTeamStats {
  if (!value || typeof value !== "object") return false;
  const stats = value as Record<string, unknown>;
  return typeof stats.scoreOne === "number"
    && typeof stats.scoreTwo === "number"
    && (stats.winnerTeam === 0 || stats.winnerTeam === 1 || stats.winnerTeam === null)
    && isMatchTeamTotals(stats.teamOne)
    && isMatchTeamTotals(stats.teamTwo);
}

export function isStatsOverlayTeam(value: unknown): value is StatsOverlayTeam {
  if (!value || typeof value !== "object") return false;
  const team = value as Record<string, unknown>;
  return ["name", "standing", "logo", "color", "logoBackground", "seriesScore"]
    .every((key) => typeof team[key] === "string");
}

function formatBestOf(bestOf: string) {
  const match = String(bestOf || "").match(/^Bo(\d+)$/i);
  return match ? `BO ${match[1]}` : "BO 5";
}

function formatStatValue(value: number | undefined) {
  if (!Number.isFinite(value)) return "—";
  return Math.max(0, Math.floor(value ?? 0)).toLocaleString("en-US");
}

function FitTeamName({
  name,
  className,
}: {
  name: string;
  className: string;
}) {
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;

    function fit() {
      if (cancelled || !el) return;
      let size = NAME_MAX_PX;
      el.style.fontSize = `${size}px`;
      while (size > NAME_MIN_PX && el.scrollWidth > el.clientWidth + 0.5) {
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

  return <strong ref={ref} className={className}>{name || "TEAM"}</strong>;
}

export function PostMatchTeamStatsStage({
  leftTeam,
  rightTeam,
  bestOf,
  leaguePrimary,
  leagueSecondary,
  matchTeamStats,
  statsSceneBackground = "transparent",
  ariaLabel = "Rocket League post-match team stats",
}: {
  leftTeam: StatsOverlayTeam;
  rightTeam: StatsOverlayTeam;
  bestOf: string;
  leaguePrimary: string;
  leagueSecondary: string;
  matchTeamStats: MatchTeamStats | null;
  statsSceneBackground?: StatsSceneBackground;
  ariaLabel?: string;
}) {
  const leftText = readableText(leftTeam.color);
  const rightText = readableText(rightTeam.color);
  const hasStats = Boolean(matchTeamStats);
  const scoreOne = hasStats ? String(matchTeamStats?.scoreOne ?? 0) : "—";
  const scoreTwo = hasStats ? String(matchTeamStats?.scoreTwo ?? 0) : "—";
  const winnerTeam = matchTeamStats?.winnerTeam ?? null;
  const leftTotals = matchTeamStats?.teamOne;
  const rightTotals = matchTeamStats?.teamTwo;
  const leftResult = !hasStats
    ? ""
    : winnerTeam === null ? "TIED" : (winnerTeam === 0 ? "VICTORY" : "LOSS");
  const rightResult = !hasStats
    ? ""
    : winnerTeam === null ? "TIED" : (winnerTeam === 1 ? "VICTORY" : "LOSS");
  const seriesLeft = Number.parseInt(leftTeam.seriesScore || "0", 10) || 0;
  const seriesRight = Number.parseInt(rightTeam.seriesScore || "0", 10) || 0;

  const cssVars = useMemo(() => ({
    "--league-primary": leaguePrimary,
    "--league-secondary": leagueSecondary,
    "--team-one": leftTeam.color,
    "--team-two": rightTeam.color,
    "--team-one-text": leftText,
    "--team-two-text": rightText,
  } as React.CSSProperties), [
    leaguePrimary,
    leagueSecondary,
    leftTeam.color,
    rightTeam.color,
    leftText,
    rightText,
  ]);

  return (
    <section className={styles.stage} style={cssVars} aria-label={ariaLabel}>
      {statsSceneBackground === "team-split" ? (
        <>
          <StatsTeamSplitBackground leftTeam={leftTeam} rightTeam={rightTeam} />
          <StatsSceneDimLayer />
        </>
      ) : null}
      <div className={`${styles.layer} ${styles.border}`} aria-hidden="true" />
      <div className={`${styles.layer} ${styles.chrome}`} aria-hidden="true" />
      <div className={`${styles.layer} ${styles.resultBody}`} aria-hidden="true" />
      <div className={`${styles.layer} ${styles.resultAccentLeft}`} aria-hidden="true" />
      <div className={`${styles.layer} ${styles.resultAccentRight}`} aria-hidden="true" />
      <div className={`${styles.layer} ${styles.namePlateLeft}`} aria-hidden="true" />
      <div className={`${styles.layer} ${styles.namePlateRight}`} aria-hidden="true" />
      <div className={`${styles.layer} ${styles.dividerLeft}`} aria-hidden="true" />
      <div className={`${styles.layer} ${styles.dividerRight}`} aria-hidden="true" />
      <div className={styles.boBoxAccent} aria-hidden="true" />

      <span className={`${styles.text} ${styles.orbitron} ${styles.overlayWhite} ${styles.resultLeft}`}>{leftResult}</span>
      <span className={`${styles.text} ${styles.orbitron} ${styles.overlayWhite} ${styles.resultRight}`}>{rightResult}</span>
      <span className={`${styles.text} ${styles.orbitron} ${styles.overlayWhite} ${styles.vsMark}`} aria-hidden="true">VS</span>
      <span className={`${styles.text} ${styles.orbitron} ${styles.overlayWhite} ${styles.scoreLine}`}>
        <span>{scoreOne}</span>
        <span className={styles.scoreSeparator} aria-hidden="true">:</span>
        <span>{scoreTwo}</span>
      </span>

      <span className={`${styles.text} ${styles.orbitron} ${styles.boHeader}`}>{formatBestOf(bestOf)}</span>
      <span className={`${styles.text} ${styles.orbitron} ${styles.boSeriesLabel}`}>SERIES SCORE</span>
      <span className={`${styles.text} ${styles.orbitron} ${styles.boSeriesScore}`}>{seriesLeft} - {seriesRight}</span>

      <FitTeamName
        name={leftTeam.name || "TEAM ONE"}
        className={`${styles.text} ${styles.orbitron} ${styles.teamNameLeft}`}
      />
      <FitTeamName
        name={rightTeam.name || "TEAM TWO"}
        className={`${styles.text} ${styles.orbitron} ${styles.teamNameRight}`}
      />

      {STAT_ROWS.map((row) => (
        <span key={`label-${row.key}`} className={`${styles.text} ${styles.oxanium} ${styles.statLabel} ${row.labelClass}`}>
          {row.label}
        </span>
      ))}
      {STAT_ROWS.map((row) => (
        <span
          key={`left-${row.key}`}
          className={`${styles.text} ${styles.oxanium} ${styles.statValue} ${styles.statValueLeft} ${row.leftClass}`}
        >
          {formatStatValue(leftTotals?.[row.key])}
        </span>
      ))}
      {STAT_ROWS.map((row) => (
        <span
          key={`right-${row.key}`}
          className={`${styles.text} ${styles.oxanium} ${styles.statValue} ${styles.statValueRight} ${row.rightClass}`}
        >
          {formatStatValue(rightTotals?.[row.key])}
        </span>
      ))}
    </section>
  );
}

export function PostMatchTeamStatsOverlay({
  leftTeam,
  rightTeam,
  bestOf,
  leaguePrimary,
  leagueSecondary,
  matchTeamStats,
  statsSceneBackground = "transparent",
  ariaLabel,
}: {
  leftTeam: StatsOverlayTeam;
  rightTeam: StatsOverlayTeam;
  bestOf: string;
  leaguePrimary: string;
  leagueSecondary: string;
  matchTeamStats: MatchTeamStats | null;
  statsSceneBackground?: StatsSceneBackground;
  ariaLabel?: string;
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
        <PostMatchTeamStatsStage
          leftTeam={leftTeam}
          rightTeam={rightTeam}
          bestOf={bestOf}
          leaguePrimary={leaguePrimary}
          leagueSecondary={leagueSecondary}
          matchTeamStats={matchTeamStats}
          statsSceneBackground={statsSceneBackground}
          ariaLabel={ariaLabel}
        />
      </div>
    </main>
  );
}
