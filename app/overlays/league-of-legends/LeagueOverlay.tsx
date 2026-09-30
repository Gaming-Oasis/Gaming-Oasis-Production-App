"use client";

import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { leagueDraftSteps, LEAGUE_ROLES, leagueChampionAssetId, leagueGameLimit, normalizeLeaguePickOrder } from "../../../lib/league-of-legends.mjs";
import { isLeagueOverlayData, leagueFearlessChampions, leagueFearlessPage, leagueLiveStatsAvailable } from "../../../lib/league-overlay.mjs";
import { detectImagePlate, readableText, resolveImagePlate } from "../../../lib/readable-text.mjs";
import { FitTeamName, SponsorCarousel, VsSceneBackdrop, type VsOverlayTeam, type VsOverlaySponsor } from "../vs/VsMatchupOverlay";
import { useStableImageSource } from "../useStableImageSource";
import { LEAGUE_DRAGON_TYPES, leagueBaronSecondsRemaining, leagueElderSecondsRemaining, leagueScoreboardTeam, leagueScoreboardValue, normalizeLeagueScoreboard } from "../../../lib/league-scoreboard.mjs";
import type { LeagueScoreboardSettings } from "../../LeagueScoreboardControls";
import LeagueDragonIcon from "../../LeagueDragonIcon";
import { useCountdownClock } from "../../useCountdownClock";
import layout from "../../../lib/league-overlay-layout.json";
import styles from "./league-overlay.module.css";

const OVERLAY_ENDPOINT = "http://127.0.0.1:4877/api/overlays/league-of-legends";
const ASSET_ENDPOINT = "http://127.0.0.1:4877/api/public/league-of-legends/assets";
const ICON_ROOT = "/league-of-legends-overlay";

type Rect = number[];
function box(rect: Rect, origin: Rect = [0, 0]): CSSProperties {
  return { position: "absolute", left: rect[0] - origin[0], top: rect[1] - origin[1], width: rect[2], height: rect[3] };
}

/** Align visible glyphs with the PSD text bounds, independent of browser line boxes. */
function SourceText({ value, rect, fontSize = 20, weight = 800, align = "start", vertical = false, label }: {
  value: string | number; rect: Rect; fontSize?: number; weight?: number;
  align?: "start" | "center" | "end"; vertical?: boolean; label?: string;
}) {
  const text = String(value);
  const width = vertical ? rect[3] : rect[2];
  const height = vertical ? rect[2] : rect[3];
  const [metrics, setMetrics] = useState({ x: 0, y: height, size: fontSize });
  useLayoutEffect(() => {
    let active = true;
    function measure() {
      if (!active) return;
      const context = document.createElement("canvas").getContext("2d");
      if (!context) return;
      context.font = `${weight} ${fontSize}px "League Oxanium"`;
      const m = context.measureText(text);
      const inkWidth = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
      const inkHeight = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
      const scale = Math.min(1, width / (inkWidth || 1), height / (inkHeight || 1));
      const left = align === "end" ? width - inkWidth * scale : align === "center" ? (width - inkWidth * scale) / 2 : 0;
      setMetrics({ x: left + m.actualBoundingBoxLeft * scale, y: (height - inkHeight * scale) / 2 + m.actualBoundingBoxAscent * scale, size: fontSize * scale });
    }
    measure();
    void document.fonts.load(`${weight} ${fontSize}px "League Oxanium"`).then(measure);
    return () => { active = false; };
  }, [text, width, height, fontSize, weight, align]);
  return <span className={styles.sourceText} style={box(rect)} data-source-box={rect.join(",")} aria-label={label}>
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={vertical ? { transform: `translateY(${width}px) rotate(-90deg)`, transformOrigin: "0 0" } : undefined}>
      <text x={metrics.x} y={metrics.y} fontSize={metrics.size} fontWeight={weight}>{text}</text>
    </svg>
  </span>;
}

type ObjectiveCounts = { towers: number; dragons: number; barons: number; grubs?: number; elementalDragons?: number; dragonSoul?: string | null };
export type OverlayData = {
  scoreboard?: LeagueScoreboardSettings; blueTeamKey?: "team1" | "team2";
  version: 1; assetVersion: string; header: string; currentGame: number; bestOf: string;
  leaguePrimary: string; leagueSecondary: string; leagueLogo?: string;
  blueTeam: VsOverlayTeam; redTeam: VsOverlayTeam; sponsorWidgetEnabled: boolean; vsScreenEnabled: boolean;
  sponsors: VsOverlaySponsor[]; draftMode: string;
  live: {
    connection: { connected: boolean; stale: boolean; lastEventAt?: string | null };
    game: { gameTime: number };
    players: Array<{ team: "ORDER" | "CHAOS"; kills: number }>;
    objectives: { ORDER: ObjectiveCounts; CHAOS: ObjectiveCounts };
  };
  draft: {
    bluePicks: string[]; redPicks: string[]; blueBans: string[]; redBans: string[];
    bluePickOrder?: number[]; redPickOrder?: number[];
    currentStep: number; timer: number; firstPickSide?: "ORDER" | "CHAOS";
  };
  confirmedGames: Array<{ gameNumber: number; bluePicks: string[]; redPicks: string[] }>;
};

function clock(seconds: number) {
  return Math.floor(seconds / 60) + ":" + String(Math.floor(seconds % 60)).padStart(2, "0");
}

function localLogoUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.origin === "https://hub.gamingoasis.gg" && /^\/api\/public\/logos\/(teams|leagues)\/[0-9a-f-]{36}$/i.test(url.pathname)) return "http://127.0.0.1:4877" + url.pathname;
  } catch { /* Relative and manual URLs are already usable. */ }
  return value;
}

function assetUrl(version: string, name: string, portrait = false) {
  if (!/^\d+\.\d+\.\d+$/.test(version) || !name) return "";
  return ASSET_ENDPOINT + "/" + version + "/" + (portrait ? "portrait/" : "champion/") + leagueChampionAssetId(name) + (portrait ? "_0.jpg" : ".png");
}

function StableArtwork({ src, fallback, label, fallbackLabel = label, className = "", autoPlate = false }: { src: string; fallback?: string; label: string; fallbackLabel?: string; className?: string; autoPlate?: boolean }) {
  const { displayedSource, handleDisplayedError } = useStableImageSource(src);
  const alternate = useStableImageSource(displayedSource ? "" : fallback ?? "");
  const visible = displayedSource || alternate.displayedSource;
  const [plate, setPlate] = useState("#FFFFFF");
  useEffect(() => {
    if (!autoPlate || !visible) return;
    let active = true;
    // Inspect a CORS-enabled copy so logos served by the local writer remain readable.
    const probe = new Image();
    probe.crossOrigin = "anonymous";
    probe.onload = () => {
      if (!active) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 32;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return;
        context.drawImage(probe, 0, 0, 32, 32);
        setPlate(detectImagePlate(context.getImageData(0, 0, 32, 32).data));
      } catch { setPlate("#FFFFFF"); }
    };
    probe.onerror = () => { if (active) setPlate("#FFFFFF"); };
    probe.src = visible;
    return () => { active = false; probe.onload = null; probe.onerror = null; };
  }, [autoPlate, visible]);
  return <span className={styles.artwork + " " + className} style={autoPlate ? { background: resolveImagePlate(plate), color: readableText(plate) } : undefined}>
    {visible ? <img src={visible} alt={label} draggable={false} onError={displayedSource ? handleDisplayedError : alternate.handleDisplayedError} /> : <span className={styles.fallback} aria-label={label}>{fallbackLabel}</span>}
  </span>;
}

function TeamLogo({ team }: { team: VsOverlayTeam }) {
  const plate = team.logo.trim() ? resolveImagePlate(team.logoBackground) : "#171717";
  const words = team.name.trim().split(/\s+/);
  const initials = (words.length > 1 ? words.map((word) => word[0]).join("") : words[0]).slice(0, 3).toUpperCase();
  return <span className={styles.logoPlate} style={{ background: plate, color: readableText(plate) }}>
    <StableArtwork src={localLogoUrl(team.logo)} label={team.name} fallbackLabel={initials || "—"} />
  </span>;
}

function Icon({ name }: { name: string }) {
  if (name.startsWith("dragon-")) return <LeagueDragonIcon type={name.slice(7)} />;
  const mask = 'url("' + ICON_ROOT + "/" + name + '.png")';
  return <span className={styles.icon} aria-hidden="true" style={{ maskImage: mask, WebkitMaskImage: mask }} />;
}

function SourceIcon({ name, rect, opacity = 1 }: { name: string; rect: Rect; opacity?: number }) {
  return <span className={styles.placedIcon} style={{ ...box(rect), opacity }} data-source-box={rect.join(",")}>
    <Icon name={name} />
  </span>;
}

function SeriesIndicators({ team, bestOf, side, scene }: { team: VsOverlayTeam; bestOf: string; side: number; scene: "draft" | "score" }) {
  const needed = Math.ceil(leagueGameLimit(bestOf) / 2);
  const key = bestOf === "Bo5" ? "bo5" : "bo3";
  const all = layout[scene].series[key];
  const perSide = all.length / 2;
  const positions = all.slice(side * perSide, (side + 1) * perSide).slice(0, needed).map((rect, index) => {
    if (scene !== "score") return [rect[0] + (side === 0 ? 10 : -10), rect[1], rect[2], rect[3]];
    const edge = layout.score.edges[side];
    // Keep both stacks equally inset from the outer logo-side border.
    const height = needed === 3 ? 10 : 14;
    const gap = 3;
    const stackHeight = needed * height + (needed - 1) * gap;
    const top = layout.score.main[1] + (layout.score.main[3] - stackHeight) / 2;
    return [side ? edge[0] - 6 - rect[2] : edge[0] + edge[2] + 6, top + index * (height + gap), rect[2], height];
  });
  return <div className={styles.series} aria-label={team.name + ": " + team.seriesScore + " series wins"} style={{ color: scene === "draft" ? "#FFFFFF" : readableText(team.color) }}>
    {positions.map((rect, index) => {
      const filled = (scene === "draft" && side === 1 ? needed - 1 - index : index) < Number(team.seriesScore);
      return <span
        key={index}
        className={`${styles.seriesPill} ${filled ? styles.seriesPillFilled : styles.seriesPillEmpty}`}
        style={box(rect)}
        data-source-box={rect.join(",")}
        data-filled={filled}
      />;
    })}
  </div>;
}

function FearlessStrip({ data }: { data: OverlayData }) {
  const signature = JSON.stringify(leagueFearlessChampions(data));
  const champions = useMemo(() => JSON.parse(signature) as string[], [signature]);
  const [rotation, setRotation] = useState({ signature: "", elapsed: 0 });
  useEffect(() => {
    const start = Date.now();
    setRotation({ signature, elapsed: 0 });
    if (champions.length <= 20) return;
    const timer = window.setInterval(() => setRotation({ signature, elapsed: Date.now() - start }), 15_000);
    return () => window.clearInterval(timer);
  }, [signature, champions.length]);
  if (!champions.length) return null;
  const page = leagueFearlessPage(champions, rotation.signature === signature ? rotation.elapsed : 0);
  return <section className={styles.fearlessStrip} style={box(layout.draft.fearlessPlate)} data-source-box={layout.draft.fearlessPlate.join(",")} aria-label={"Fearless unavailable champions, page " + (page.page + 1) + " of " + page.pageCount}>
    {layout.draft.fearless.map((rect, index) => <div className={styles.fearlessSlot} style={box(rect)} data-source-box={rect.join(",")} key={index}>
      {page.champions[index] ? <StableArtwork key={page.champions[index]} src={assetUrl(data.assetVersion, page.champions[index])} label={page.champions[index]} /> : null}
    </div>)}
    {page.pageCount > 1 ? <span className={styles.pageNumber}>{page.page + 1}/{page.pageCount}</span> : null}
  </section>;
}

export function DraftOverlay({ data }: { data: OverlayData }) {
  const active = leagueDraftSteps(data.draftMode, data.draft.firstPickSide)[data.draft.currentStep];
  return <div className={styles.draftStage}>
    {data.vsScreenEnabled ? <VsSceneBackdrop leftTeam={data.blueTeam} rightTeam={data.redTeam} /> : null}
    <FearlessStrip data={data} />
    <div className={styles.draftBase} style={box(layout.draft.base)} data-source-box={layout.draft.base.join(",")} />
    {(["blue", "red"] as const).map((side) => {
      const team = side === "blue" ? data.blueTeam : data.redTeam;
      const picks = side === "blue" ? data.draft.bluePicks : data.draft.redPicks;
      const bans = side === "blue" ? data.draft.blueBans : data.draft.redBans;
      const order = normalizeLeaguePickOrder(side === "blue" ? data.draft.bluePickOrder : data.draft.redPickOrder);
      const art = layout.draft[side];
      // Use whole-pixel, equal gaps while keeping each side anchored to its outer edge.
      const pickStride = art.picks[0].portrait[2] + 7;
      const firstPickX = side === "blue" ? art.picks[0].portrait[0] : art.picks[art.picks.length - 1].portrait[0] - pickStride * (art.picks.length - 1);
      const isActive = active?.side === (side === "blue" ? "ORDER" : "CHAOS");
      return <section key={side} className={styles.draftSide} aria-label={team.name + " " + side + " side picks and bans"}>
        {picks.map((champion: string, slot: number) => {
          const card = art.picks[slot];
          const roleName = LEAGUE_ROLES[order.indexOf(slot)] as keyof typeof card.roles;
          const selecting = isActive && active.action === "pick" && active.slot === slot;
          return <div key={slot} className={styles.pickSlot} style={{ transform: `translateX(${firstPickX + slot * pickStride - card.portrait[0]}px)` }} data-pick-slot={`${side}-${slot}`}>
            <div className={styles.pick} style={{ ...box(card.portrait), "--pick-accent": team.color } as CSSProperties} data-source-box={card.portrait.join(",")} data-active={selecting}>
              {champion ? <StableArtwork key={champion} src={assetUrl(data.assetVersion, champion, true)} fallback={assetUrl(data.assetVersion, champion)} label={champion} /> : <div className={styles.upcomingPick} data-selecting={selecting} aria-label={`${team.name} pick ${slot + 1}: ${selecting ? "selecting" : "upcoming"}`}>
                <span className={styles.upcomingPickIcon}><Icon name={"role-" + side + "-" + roleName.toLowerCase()} /></span>
                <strong>{selecting ? "SELECTING" : "UPCOMING"}</strong>
                <span className={styles.upcomingPickNumber}>{String(slot + 1).padStart(2, "0")}</span>
                <span className={styles.upcomingPickAccent} />
              </div>}
            </div>
            <div className={styles.namePlate} style={box(card.namePlate)} data-source-box={card.namePlate.join(",")} />
            <SourceText value={(champion || "Pick " + (slot + 1)).toUpperCase()} rect={[card.name[0], card.portrait[1] + 10, card.name[2], card.portrait[3] - 20]} fontSize={21 * 0.944721609750746} weight={400} vertical />
            <div className={styles.rolePlate} style={box(card.rolePlate)} data-source-box={card.rolePlate.join(",")} />
            <span aria-label={roleName}><SourceIcon name={"role-" + side + "-" + roleName.toLowerCase()} rect={card.roles[roleName]} /></span>
          </div>;
        })}
        <div className={styles.banPlate} style={box(art.banPlate)} data-source-box={art.banPlate.join(",")} />
        {bans.map((champion, index) => <div key={index} className={styles.ban} style={{ ...box(art.bans[index]), "--pick-accent": team.color } as CSSProperties} data-source-box={art.bans[index].join(",")} data-active={isActive && active.action === "ban" && active.slot === index}>
          {champion ? <StableArtwork key={champion} src={assetUrl(data.assetVersion, champion)} label={champion} /> : <span>{index + 1}</span>}
        </div>)}
      </section>;
    })}
    <section className={styles.draftCenter} aria-label="Match and draft information">
      {[data.blueTeam, data.redTeam].map((team, side) => {
        const source = layout.draft.logos[side];
        // Mirror both fields within the 320px center opening, with equal 18px insets.
        const panelLeft = (layout.draft.size[0] - 320) / 2;
        const center = side === 0 ? panelLeft + 18 + 44 : panelLeft + 320 - 18 - 44;
        return <div key={side}>
        <SeriesIndicators team={team} bestOf={data.bestOf} side={side} scene="draft" />
        <div
          className={styles.draftTeamLogo}
          style={{ ...box([center - 44, source[1] - 20, 88, 88]), "--draft-team-accent": team.color } as CSSProperties}
        ><TeamLogo team={team} /></div>
        <div className={styles.draftTeamName} style={box([center - 53, source[1] + 76, 106, 16])}><FitTeamName name={team.name} className="" maxPx={12} minPx={8} /></div>
      </div>;
      })}
      <div className={styles.draftHeader}><FitTeamName name={data.header} className="" maxPx={15} minPx={11} /><span>Game {data.currentGame} · {data.bestOf}</span></div>
      {data.sponsorWidgetEnabled ? <div style={box(layout.draft.sponsor)} data-source-box={layout.draft.sponsor.join(",")}><SponsorCarousel sponsors={data.sponsors} className={styles.draftSponsor} /></div> : null}
    </section>
  </div>;
}

export function LiveOverlay({ data, available }: { data: OverlayData; available: boolean }) {
  const art = layout.score;
  const settings = normalizeLeagueScoreboard(data.scoreboard);
  const now = useCountdownClock(Math.max(settings.baronBuffs.team1.expiresAt ?? 0, settings.baronBuffs.team2.expiresAt ?? 0, settings.elderBuffs.team1.expiresAt ?? 0, settings.elderBuffs.team2.expiresAt ?? 0));
  const stat = (key: string, side: string) => leagueScoreboardValue(settings, key, side, data.blueTeamKey ?? "team1", data.live, available);
  const topCenter = art.main[1] + art.main[3] / 2;
  const bottomCenter = art.bottom[1] + art.bottom[3] / 2;
  const centered = (rect: Rect, center: number): Rect => [rect[0], center - rect[3] / 2, rect[2], rect[3]];
  const kills = (side: string) => stat("kills", side);
  return <div className={styles.liveStage}>
    <div className={styles.scoreArt}>
      {!settings.hideCountdowns ? <aside aria-label="Objective respawn timers">
        {art.timers.map((timer, index) => <div key={index}>
          <div className={styles.plate} style={box(timer.iconPlate)} data-source-box={timer.iconPlate.join(",")} />
          <div className={styles.translucentPlate} style={box(timer.textPlate)} data-source-box={timer.textPlate.join(",")} />
          <SourceIcon name={index ? "dragon" : "timer-baron"} rect={timer.icon} />
          <SourceText value="—" rect={timer.textPlate} align="center" label={(index ? "Dragon" : "Baron") + " respawn unavailable: —"} />
        </div>)}
      </aside> : null}
      {!settings.hideScoreboard ? <section aria-label="League scoreboard">
        <div className={styles.translucentPlate} style={box([art.main[0], art.bottom[1], art.main[2], art.bottom[3]])} />
        {[data.blueTeam, data.redTeam].map((team, side) => {
          const source = side ? "CHAOS" : "ORDER";
          const innerLeft = art.main[0];
          const innerWidth = art.main[2];
          const fill = [innerLeft + side * innerWidth / 2, art.fill[1], innerWidth / 2, art.fill[3]];
          // Attach square logo fields to the outer ends, spanning both scoreboard rows.
          const logoSize = art.bottom[1] + art.bottom[3] - art.main[1];
          const logoRect = [side ? art.main[0] + art.main[2] : art.main[0] - logoSize, art.main[1], logoSize, logoSize];
          const killRect = art.kills[side];
          const killSpace = [side ? killRect[0] : killRect[0] + killRect[2] - 49, killRect[1], 49, killRect[3]];
          // Mirror whole stat groups, keeping each icon directly beside its value.
          const midpoint = art.main[0] + art.main[2] / 2;
          const statGroupX = (left: number, width: number) => side ? midpoint * 2 - left - width : left;
          const towerX = statGroupX(374, 44);
          const goldX = statGroupX(452, 74);
          // The source extraction names these inhibitor slots; the artwork's
          // far-corner icon is the Grub counter used by this broadcast layout.
          const grubs = art.inhibitors[side];
          const grubValue = art.inhibitorValues[side];
          const baron = art.barons[side];
          const teamKey = leagueScoreboardTeam(source, data.blueTeamKey ?? "team1");
          const baronRemaining = leagueBaronSecondsRemaining(settings.baronBuffs[teamKey], now);
          const baronActive = baronRemaining > 0;
          const elderRemaining = leagueElderSecondsRemaining(settings.elderBuffs[teamKey], now);
          const dragons = art.dragons[side];
          const dragonState = settings.dragons[leagueScoreboardTeam(source, data.blueTeamKey ?? "team1")];
          const dragonCount = dragonState.types.filter(Boolean).length;
          const soul = dragonState.soulActive;
          const dragonIcon = (type: string) => LEAGUE_DRAGON_TYPES.some(dragon => dragon.value === type) ? "dragon-" + type : "score-dragon";
          const soulLabel = LEAGUE_DRAGON_TYPES.find(dragon => dragon.value === dragonState.soulType)?.label;
          const elderX = statGroupX(493, 82);
          return <div key={side}>
            <div className={styles.scoreFill} style={{ ...box(fill), background: team.color }} data-source-box={fill.join(",")} />
            <div className={styles.scoreLogo} style={{ ...box(logoRect), background: resolveImagePlate(team.logoBackground), color: readableText(resolveImagePlate(team.logoBackground)) }} aria-label={team.name + " logo"}>
              <StableArtwork src={localLogoUrl(team.logo)} label={team.name} />
            </div>
            <SeriesIndicators team={team} bestOf={data.bestOf} side={side} scene="score" />
            <div style={{ color: readableText(team.color) }}>
              <SourceIcon name="score-tower" rect={centered([towerX, 0, 14, 19], topCenter)} opacity={0.8} />
              <SourceText value={stat("towers", source)} rect={centered([towerX + 20, 0, 24, 14], topCenter)} label={team.name + " towers: " + stat("towers", source)} />
              {settings.goldSource === "api" ? <>
              <SourceIcon name="score-gold" rect={centered([goldX, 0, 18, 16], topCenter)} opacity={0.8} />
              <SourceText value={available ? 0 : "—"} rect={centered([goldX + 24, 0, 50, 14], topCenter)} label={team.name + " gold unavailable"} />
              </> : null}
              <SourceText value={kills(source)} rect={centered(killSpace, topCenter)} fontSize={20 * 1.863961942138289} align={side ? "start" : "end"} label={team.name + " kills: " + kills(source)} />
            </div>
            <SourceIcon name="score-inhibitor" rect={centered(grubs, bottomCenter)} />
            <SourceText value={stat("grubs", source)} rect={centered([grubValue[0], 0, 15, grubValue[3]], bottomCenter)} align="center" fontSize={20 * 0.7648273045397512} label={team.name + " Void Grubs taken: " + stat("grubs", source)} />
            <span className={baronActive ? styles.baronActive : undefined}><SourceIcon name="score-baron" rect={centered(baron, bottomCenter)} /></span>
            <SourceText value={stat("barons", source)} rect={centered([baron[0] + baron[2] + 3, 0, 16, 11], bottomCenter)} align="center" fontSize={20 * 0.7648273045397512} label={team.name + " barons taken: " + stat("barons", source)} />
            {baronActive ? <div className={styles.buffTab + " " + styles.baronTab} style={box([baron[0] + (baron[2] + 3 + 16) / 2 - 41, art.bottom[1] + art.bottom[3], 82, 23])} aria-label={team.name + " Baron buff: " + clock(baronRemaining) + " remaining"}>
              <span className={styles.baronActive}><SourceIcon name="score-baron" rect={[12, 2, 18, 18]} /></span>
              <SourceText value={clock(baronRemaining)} rect={[35, 6, 35, 10]} fontSize={14} align="center" />
            </div> : null}
            <div aria-label={team.name + " dragons taken: " + dragonCount}>
              {dragons.map((rect, index) => {
                const pickIndex = side ? index : 3 - index;
                const type = dragonState.types[pickIndex];
                if (soul && pickIndex === 3) return <span key={index} className={styles.soulDragon} style={box(centered([rect[0] + (rect[2] - 20) / 2 + (side ? 4 : -4), 0, 20, 20], bottomCenter))} aria-label={team.name + " fourth dragon: " + (soulLabel ? soulLabel + " " : "") + "Dragon Soul"}>
                  <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
                    <path d="M12 1 23 12 12 23 1 12Z" fill="#171717" stroke="currentColor" strokeWidth="1.8" />
                  </svg>
                  <span style={{ position: "absolute", inset: "3px" }}><Icon name={dragonIcon(dragonState.soulType)} /></span>
                </span>;
                return <span key={index} aria-label={type ? (LEAGUE_DRAGON_TYPES.find(dragon => dragon.value === type)?.label ?? "Unspecified") + " dragon" : undefined}><SourceIcon name={dragonIcon(type)} rect={centered([rect[0] + (rect[2] - 17) / 2, 0, 17, 17], bottomCenter)} opacity={type ? 1 : 0.35} /></span>;
              })}
            </div>
            {elderRemaining > 0 ? <div className={styles.buffTab} style={{ ...box([elderX, art.bottom[1] + art.bottom[3], 82, 23]), "--buff-accent": team.color } as CSSProperties} aria-label={team.name + " Elder Dragon buff: " + clock(elderRemaining) + " remaining"}>
              <SourceIcon name="dragon-elder" rect={[12, 2, 18, 18]} />
              <SourceText value={clock(elderRemaining)} rect={[35, 6, 35, 10]} fontSize={14} align="center" />
            </div> : null}
          </div>;
        })}
        <SourceText value="VS" rect={centered([art.main[0] + art.main[2] / 2 - art.leagueLogo[2] / 2, 0, art.leagueLogo[2], art.leagueLogo[3]], topCenter)} fontSize={20} align="center" label="Versus" />
        {settings.clockSource === "api" ? <SourceText value={available ? clock(data.live.game.gameTime) : "—"} rect={centered([art.main[0] + art.main[2] / 2 - 35, 0, 70, art.clock[3]], bottomCenter)} fontSize={20 * 0.7648273045397512} align="center" label={"Game time: " + (available ? clock(data.live.game.gameTime) : "unavailable")} /> : null}
      </section> : null}
    </div>
  </div>;
}

export function LeagueOverlayFrame({ data, scene, available = true }: { data: OverlayData; scene: "draft" | "live"; available?: boolean }) {
  const [frame, setFrame] = useState({ scale: 1, left: 0 });
  useEffect(() => {
    const resize = () => {
      const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
      setFrame({ scale, left: Math.max(0, (window.innerWidth - 1920 * scale) / 2) });
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  return <><div className={styles.frame} style={{ "--league-primary": data.leaguePrimary, "--league-secondary": data.leagueSecondary, transform: "translateX(" + frame.left + "px) scale(" + frame.scale + ")" } as CSSProperties}>
    {scene === "draft" ? <DraftOverlay data={data} /> : <LiveOverlay data={data} available={available} />}
  </div>
    {scene === "live" && data.sponsorWidgetEnabled ? <div className={styles.liveSponsorAnchor} style={{ "--league-primary": data.leaguePrimary, "--league-secondary": data.leagueSecondary, transform: `scale(${frame.scale})` } as CSSProperties}>
      <SponsorCarousel sponsors={data.sponsors} className={styles.liveSponsor} />
    </div> : null}
  </>;
}

export default function LeagueOverlay({ scene }: { scene: "draft" | "live" }) {
  const [frame, setFrame] = useState<{ data: OverlayData; receivedAt: number } | null>(null);
  const [now, setNow] = useState(0);
  useEffect(() => {
    let active = true;
    let polling = false;
    let controller: AbortController | null = null;
    async function poll() {
      if (polling) return;
      polling = true;
      const requestController = new AbortController();
      controller = requestController;
      const timeout = window.setTimeout(() => requestController.abort(), 2500);
      try {
        const response = await fetch(OVERLAY_ENDPOINT, { cache: "no-store", signal: requestController.signal });
        if (!response.ok || response.status === 204) return;
        const next: unknown = await response.json();
        if (active && isLeagueOverlayData(next)) setFrame({ data: next as OverlayData, receivedAt: Date.now() });
      } catch { /* Preserve static branding and the last valid frame through writer restarts. */ }
      finally { window.clearTimeout(timeout); controller = null; polling = false; }
    }
    void poll();
    const timer = window.setInterval(() => { setNow(Date.now()); void poll(); }, 500);
    return () => { active = false; controller?.abort(); window.clearInterval(timer); };
  }, []);
  const available = frame ? leagueLiveStatsAvailable(frame.data.live, frame.receivedAt, now || frame.receivedAt) : false;
  return <>
    <style>{"html,body{margin:0!important;width:100%!important;height:100%!important;overflow:hidden!important;background:transparent!important;}"}</style>
    <main className={styles.canvas} aria-label={"League of Legends " + (scene === "draft" ? "Pick/Ban" : "Scoreboard") + " overlay"}>
      {frame ? <LeagueOverlayFrame data={frame.data} scene={scene} available={available} /> : null}
    </main>
  </>;
}
