"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { leagueChampionAssetId } from "../../../lib/league-of-legends.mjs";
import { VsSceneBackdrop } from "../vs/VsMatchupOverlay";
import styles from "./league-overlay.module.css";

const OVERLAY_ENDPOINT = "http://127.0.0.1:4877/api/overlays/league-of-legends";
const ASSET_ENDPOINT = "http://127.0.0.1:4877/api/public/league-of-legends/assets";

type OverlayTeam = { name: string; standing: string; logo: string; color: string; logoBackground: string; seriesScore: string };
type LeagueItem = { id: number; name: string };
type LeaguePlayer = {
  riotId: string; displayName: string; champion: string; championAssetId: string; team: "ORDER" | "CHAOS";
  level: number; kills: number; deaths: number; assists: number; creepScore: number; items: LeagueItem[];
};
type ObjectiveCounts = { towers: number; dragons: number; barons: number; heralds: number };
type LiveFeed = {
  connection: { connected: boolean; stale: boolean };
  game: { gameTime: number };
  players: LeaguePlayer[];
  objectives: { ORDER: ObjectiveCounts; CHAOS: ObjectiveCounts };
};
type ConfirmedGame = { gameNumber: number; winner: "team1" | "team2"; snapshot: LiveFeed | null };
type OverlayData = {
  assetVersion: string; header: string; currentGame: number; bestOf: string; leaguePrimary: string; leagueSecondary: string;
  teamOne: OverlayTeam; teamTwo: OverlayTeam; blueTeam: OverlayTeam; redTeam: OverlayTeam;
  playerBoardEnabled: boolean; sponsorWidgetEnabled: boolean; vsScreenEnabled: boolean;
  sponsors: Array<{ id: string; name: string; logo: string }>;
  playerOverrides: Record<string, string>; live: LiveFeed;
  draft: { bluePicks: string[]; redPicks: string[]; blueBans: string[]; redBans: string[]; timer: number };
  confirmedGames: ConfirmedGame[];
};

function clock(seconds: number) {
  const value = Math.max(0, Number(seconds) || 0);
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
}

function assetUrl(version: string, kind: "champion" | "item" | "spell", filename: string) {
  if (!version || version === "latest" || !filename) return "";
  return `${ASSET_ENDPOINT}/${encodeURIComponent(version)}/${kind}/${encodeURIComponent(filename)}`;
}

function Image({ src, alt, className }: { src: string; alt: string; className?: string }) {
  if (!src) return <span className={`${styles.imageFallback} ${className ?? ""}`}>{alt.slice(0, 2).toUpperCase()}</span>;
  return <img className={className} src={src} alt={alt} onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} />;
}

function TeamLogo({ team }: { team: OverlayTeam }) {
  return <span className={styles.logoPlate} style={{ background: team?.logoBackground || "#FFFFFF" }}>{team?.logo ? <img src={team.logo} alt="" /> : <b>{String(team?.name || "T").slice(0, 2)}</b>}</span>;
}

function DraftOverlay({ data }: { data: OverlayData }) {
  const draft = data.draft ?? {};
  const version = data.assetVersion;
  const champion = (name: string) => assetUrl(version, "champion", `${leagueChampionAssetId(name)}.png`);
  return (
    <div className={styles.draftStage} style={{ "--league-primary": data.leaguePrimary, "--league-secondary": data.leagueSecondary } as CSSProperties}>
      {data.vsScreenEnabled ? <VsSceneBackdrop leftTeam={data.blueTeam} rightTeam={data.redTeam} /> : null}
      <header className={styles.draftHeader}><span>{data.header}</span><strong>GAME {data.currentGame} · {data.bestOf}</strong><b className={styles.timer}>{draft.timer ?? 0}</b></header>
      <section className={`${styles.draftTeam} ${styles.blueTeam}`}>
        <div className={styles.teamIdentity}><TeamLogo team={data.blueTeam} /><div><span>BLUE SIDE</span><strong>{data.blueTeam?.name}</strong><small>Series {data.blueTeam?.seriesScore}</small></div></div>
        <div className={styles.pickRow}>{(draft.bluePicks ?? []).map((name: string, index: number) => <div key={index} className={styles.pickCard}>{name ? <Image src={champion(name)} alt={name} /> : null}<span>{name || `PICK ${index + 1}`}</span></div>)}</div>
        <div className={styles.banRow}>{(draft.blueBans ?? []).map((name: string, index: number) => <div key={index}>{name ? <Image src={champion(name)} alt={name} /> : null}<span>{name || `BAN ${index + 1}`}</span></div>)}</div>
      </section>
      <section className={`${styles.draftTeam} ${styles.redTeam}`}>
        <div className={styles.teamIdentity}><div><span>RED SIDE</span><strong>{data.redTeam?.name}</strong><small>Series {data.redTeam?.seriesScore}</small></div><TeamLogo team={data.redTeam} /></div>
        <div className={styles.pickRow}>{(draft.redPicks ?? []).map((name: string, index: number) => <div key={index} className={styles.pickCard}>{name ? <Image src={champion(name)} alt={name} /> : null}<span>{name || `PICK ${index + 1}`}</span></div>)}</div>
        <div className={styles.banRow}>{(draft.redBans ?? []).map((name: string, index: number) => <div key={index}>{name ? <Image src={champion(name)} alt={name} /> : null}<span>{name || `BAN ${index + 1}`}</span></div>)}</div>
      </section>
    </div>
  );
}

function objectiveText(objectives: ObjectiveCounts | undefined) {
  return `T ${objectives?.towers ?? 0} · D ${objectives?.dragons ?? 0} · B ${objectives?.barons ?? 0}`;
}

function PlayerBoard({ data }: { data: OverlayData }) {
  const live = data.live;
  const players = Array.isArray(live?.players) ? live.players : [];
  if (!data.playerBoardEnabled || !players.length) return null;
  const teamPlayers = (team: string) => players.filter((player) => player.team === team).slice(0, 5);
  const Player = ({ player }: { player: LeaguePlayer }) => {
    const displayName = data.playerOverrides?.[player.riotId] || player.displayName || player.riotId;
    return <div className={styles.playerRow}>
      <Image className={styles.championIcon} src={assetUrl(data.assetVersion, "champion", `${player.championAssetId}.png`)} alt={player.champion || "Champion"} />
      <div className={styles.playerName}><strong>{displayName}</strong><small>{player.champion}</small></div>
      <span>Lv {player.level}</span><b>{player.kills}/{player.deaths}/{player.assists}</b><span>{player.creepScore} CS</span>
      <div className={styles.items}>{(player.items ?? []).slice(0, 6).map((item, index) => <Image key={`${item.id}-${index}`} src={assetUrl(data.assetVersion, "item", `${item.id}.png`)} alt={item.name || "Item"} />)}</div>
    </div>;
  };
  return <section className={styles.playerBoard}><div>{teamPlayers("ORDER").map((player) => <Player key={player.riotId} player={player} />)}</div><div>{teamPlayers("CHAOS").map((player) => <Player key={player.riotId} player={player} />)}</div></section>;
}

function LiveOverlay({ data }: { data: OverlayData }) {
  const live = data.live ?? {};
  const players = Array.isArray(live.players) ? live.players : [];
  const kills = (team: string) => players.filter((player) => player.team === team).reduce((sum, player) => sum + (Number(player.kills) || 0), 0);
  const connected = Boolean(live.connection?.connected) && !live.connection?.stale;
  return <div className={styles.liveStage} style={{ "--league-primary": data.leaguePrimary, "--league-secondary": data.leagueSecondary } as CSSProperties}>
    <section className={styles.liveHud}>
      <div className={`${styles.hudTeam} ${styles.blueHud}`}><TeamLogo team={data.blueTeam} /><div><strong>{data.blueTeam?.name}</strong><small>{objectiveText(live.objectives?.ORDER)}</small></div><b>{connected ? kills("ORDER") : "—"}</b><span>{data.blueTeam?.seriesScore}</span></div>
      <div className={styles.hudCenter}><small>{data.header}</small><strong>{connected ? clock(live.game?.gameTime) : "DATA OFFLINE"}</strong><span>GAME {data.currentGame}</span></div>
      <div className={`${styles.hudTeam} ${styles.redHud}`}><span>{data.redTeam?.seriesScore}</span><b>{connected ? kills("CHAOS") : "—"}</b><div><strong>{data.redTeam?.name}</strong><small>{objectiveText(live.objectives?.CHAOS)}</small></div><TeamLogo team={data.redTeam} /></div>
    </section>
    {connected ? <PlayerBoard data={data} /> : null}
  </div>;
}

function RecapOverlay({ data }: { data: OverlayData }) {
  const game = [...(data.confirmedGames ?? [])].sort((a, b) => b.gameNumber - a.gameNumber)[0];
  const winner = game?.winner === "team2" ? data.teamTwo : data.teamOne;
  const snapshot = game?.snapshot;
  const players = Array.isArray(snapshot?.players) ? snapshot.players : [];
  const topPlayers = [...players].sort((a, b) => ((b.kills * 3 + b.assists) - (a.kills * 3 + a.assists))).slice(0, 3);
  return <div className={styles.recapStage} style={{ "--league-primary": data.leaguePrimary, "--league-secondary": data.leagueSecondary } as CSSProperties}>
    {data.vsScreenEnabled ? <VsSceneBackdrop leftTeam={data.blueTeam} rightTeam={data.redTeam} /> : null}
    <section className={styles.recapCard}>
      <header><span>{data.header}</span><strong>GAME {game?.gameNumber ?? data.currentGame} COMPLETE</strong></header>
      {game ? <><div className={styles.winner}><TeamLogo team={winner} /><span>VICTORY</span><strong>{winner?.name}</strong><small>Series {data.teamOne?.seriesScore} – {data.teamTwo?.seriesScore}</small></div><div className={styles.recapPlayers}>{topPlayers.map((player) => <div key={player.riotId}><Image src={assetUrl(data.assetVersion, "champion", `${player.championAssetId}.png`)} alt={player.champion} /><span>{data.playerOverrides?.[player.riotId] || player.displayName}</span><strong>{player.kills}/{player.deaths}/{player.assists}</strong><small>{player.creepScore} CS</small></div>)}</div></> : <div className={styles.waiting}>Waiting for a confirmed game result</div>}
    </section>
  </div>;
}

export default function LeagueOverlay({ scene }: { scene: "draft" | "live" | "recap" }) {
  const [data, setData] = useState<OverlayData | null>(null);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function poll() {
      try {
        const response = await fetch(OVERLAY_ENDPOINT, { cache: "no-store", signal: controller.signal });
        if (active && response.ok && response.status !== 204) setData(await response.json());
      } catch { /* Preserve the last stable frame while the writer restarts. */ }
    }
    void poll();
    const timer = window.setInterval(poll, 500);
    return () => { active = false; controller.abort(); window.clearInterval(timer); };
  }, []);
  const content = useMemo(() => {
    if (!data) return null;
    if (scene === "draft") return <DraftOverlay data={data} />;
    if (scene === "recap") return <RecapOverlay data={data} />;
    return <LiveOverlay data={data} />;
  }, [data, scene]);
  return <>
    <style>{"html,body{margin:0!important;width:100%!important;height:100%!important;overflow:hidden!important;background:transparent!important;}"}</style>
    <main className={styles.canvas} aria-label={`League of Legends ${scene} overlay`}>{content}</main>
  </>;
}
