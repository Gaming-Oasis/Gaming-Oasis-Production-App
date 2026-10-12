"use client";

import { useEffect, useRef, useState } from "react";
import { hubEligibility, normalizeHubCollection, selectHubSession, type HubCollection, type HubGameKey, type HubMatch, type HubSession, type HubSource } from "../lib/hub-draft.mjs";
import { startHubPolling } from "../lib/hub-polling.mjs";

type HubStatus = { busy: boolean; error: string; lastSuccess: string };
const idle: HubStatus = { busy: false, error: "", lastSuccess: "" };

export function useHubDraftSync({ active, match, endpoint, onCollection }: {
  active: boolean; match: HubMatch; endpoint: string;
  onCollection: (collection: HubCollection) => void;
}) {
  const [status, setStatus] = useState<HubStatus>(idle);
  const poller = useRef<ReturnType<typeof startHubPolling> | null>(null);
  const success = useRef({ matchKey: "", at: "" });
  const { id, syncedId, hubIdentity: identity } = match;
  const game = identity?.game;
  const team1Id = identity?.team1Id;
  const team2Id = identity?.team2Id;
  useEffect(() => {
    const matchKey = JSON.stringify([id, syncedId, game, team1Id, team2Id]);
    if (success.current.matchKey !== matchKey) success.current = { matchKey, at: "" };
    setStatus({ ...idle, lastSuccess: success.current.at });
    if (!active || !game || !team1Id || !team2Id) return;
    const requestedMatch = { id, syncedId, hubIdentity: { game, team1Id, team2Id } };
    const current = startHubPolling({
      load: async (signal: AbortSignal) => {
        const response = await fetch(`${endpoint}/${encodeURIComponent(syncedId)}`, { signal, cache: "no-store", headers: { Accept: "application/json" } });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(typeof body.error === "string" ? body.error : `League Hub request failed (${response.status})`);
        }
        return normalizeHubCollection(await response.json(), requestedMatch);
      },
      accept: onCollection,
      status: (next: HubStatus) => {
        if (next.lastSuccess) success.current.at = next.lastSuccess;
        setStatus({ ...next, lastSuccess: success.current.at });
      },
    });
    poller.current = current;
    return () => { current.stop(); if (poller.current === current) poller.current = null; };
  }, [active, id, syncedId, game, team1Id, team2Id, endpoint, onCollection]);
  return { ...status, refresh: () => poller.current?.refresh() };
}

function Lineups({ session, teams, gameKey }: { session: HubSession | null; teams: [string, string]; gameKey: HubGameKey }) {
  if (!session) return <p className="field-hint">Waiting for the Game session in League Hub.</p>;
  if (!session.revealed) return <p className="field-hint">{gameKey === "leagueOfLegends"
    ? session.confirmedTeams.length === 2 ? "Player and role assignments are unavailable for this draft."
      : `${session.confirmedTeams.length} of 2 teams confirmed. Player and role assignments stay hidden until both confirm.`
    : "Agent lineups appear after the game score and agents are reported in League Hub."}</p>;
  return <div className="hub-lineups">{(["team1", "team2"] as const).map((key, index) => <div key={key}>
    <h4>{teams[index]}</h4>
    <table><thead><tr><th scope="col">{session.kind === "champions" ? "Role" : "Slot"}</th><th scope="col">Player</th><th scope="col">{session.kind === "champions" ? "Champion" : "Agent"}</th></tr></thead>
      <tbody>{session.lineups[key].map((row) => <tr key={row.position}><td>{row.position}</td><td>{row.player}</td><td>{row.item}</td></tr>)}</tbody>
    </table>
  </div>)}</div>;
}

export function HubDraftControls({ gameKey, source, match, teams, gameNumber, status, owner, onMode }: {
  gameKey: HubGameKey; source: HubSource; match: HubMatch; teams: [string, string]; gameNumber: number;
  status: HubStatus & { refresh: () => void }; owner: boolean; onMode: (mode: "manual" | "live") => void;
}) {
  const game = gameKey === "valorant" ? "VALORANT" : "League of Legends";
  const reason = hubEligibility(match, game);
  const collection = source.collection;
  const session = selectHubSession(collection, gameNumber);
  const live = source.mode === "live";
  const message = !owner ? "Standby — production control belongs to another browser." : reason || (!live ? "Manual — live updates stopped."
    : status.error ? `${status.error}. ${collection ? "Showing last valid data; retrying." : "Retrying automatically."}`
    : !status.lastSuccess ? "Connecting to League Hub…" : "Live — checking League Hub every 2 seconds.");
  return <section className="panel-card hub-draft-panel" aria-label={`${game} League Hub API`}>
    <div className="card-title-row"><div><h2>League Hub API</h2><p>Match 1 · {match.syncedId || "Not synced"}<br />{teams[0]} vs {teams[1]}</p></div>
      <div className="hub-api-actions">
        <label className="field"><span className="field-label">Draft source</span><select aria-label={`${game} draft source`} value={source.mode} disabled={!owner} onChange={(event) => onMode(event.target.value as "manual" | "live")}><option value="manual">Manual</option><option value="live" disabled={Boolean(reason)}>Live</option></select></label>
        <button type="button" className="button secondary" onClick={status.refresh} disabled={!owner || !live || Boolean(reason) || status.busy}>Refresh now</button>
      </div>
    </div>
    <p role="status" className={status.error && live ? "hub-api-error" : "field-hint"}>{message}</p>
    <p className="field-hint">Last successful refresh: {status.lastSuccess ? new Date(status.lastSuccess).toLocaleTimeString() : "Not refreshed this session"}. Scores remain manual; publish them with Update results.</p>
    {collection ? <>
      <p><strong>Game {gameNumber}</strong> · {!collection.required ? "Drafting is disabled for this match." : session?.progress || (gameKey === "valorant" ? collection.veto?.progress : "") || "Waiting for Hub draft"}</p>
      {collection.currentGameIndex && collection.currentGameIndex > gameNumber ? <p className="hub-api-notice">Hub is on Game {collection.currentGameIndex}; update results to advance.</p> : null}
      {collection.games.length ? <p className="field-hint">Hub results (reference only): {collection.games.map((result, index) => `Game ${index + 1}: ${result.team1} – ${result.team2}`).join(" · ")}</p> : null}
      <Lineups session={session} teams={teams} gameKey={gameKey} />
      {collection.sessions.filter((entry) => (entry.gameIndex ?? Infinity) < gameNumber).map((entry) => <details key={entry.id}><summary>Game {entry.gameIndex} draft and lineup</summary>
        {entry.kind === "champions" ? (["team1", "team2"] as const).map((key, index) => <p className="field-hint" key={key}><strong>{teams[index]}</strong> · Picks: {entry.picks[key].join(", ") || "None"}<br />Bans: {entry.bans.filter((ban) => ban.team === key).map((ban) => ban.name).join(", ") || "None"}</p>) : null}
        <Lineups session={entry} teams={teams} gameKey={gameKey} />
      </details>)}
    </> : null}
  </section>;
}
