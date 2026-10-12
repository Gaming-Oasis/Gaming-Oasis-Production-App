"use client";

import { useEffect, useRef, useState } from "react";
import { hubEligibility, normalizeHubCollection, selectHubSession, type HubCollection, type HubGameKey, type HubMatch, type HubSession, type HubSource } from "../lib/hub-draft.mjs";
import { startHubPolling } from "../lib/hub-polling.mjs";
import { hubConnectionState, hubDraftProgress, type HubConnectionStatus } from "../lib/hub-connection.mjs";

type HubStatus = HubConnectionStatus;
const idle: HubStatus = { busy: false, error: "", lastSuccess: "", connected: false };

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
        let response: Response;
        try {
          response = await fetch(`${endpoint}/${encodeURIComponent(syncedId)}`, { signal, cache: "no-store", headers: { Accept: "application/json" } });
        } catch (error) {
          if (signal.aborted) throw error;
          throw new Error("Cannot reach the local writer. Check that Production OS is running.");
        }
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(typeof body.error === "string" ? body.error : `League Hub request failed (${response.status})`);
        }
        return normalizeHubCollection(await response.json(), requestedMatch);
      },
      accept: onCollection,
      status: (next: Omit<HubStatus, "connected">) => {
        if (next.lastSuccess) success.current.at = next.lastSuccess;
        // A saved refresh time must not imply that a new connection is healthy yet.
        setStatus({ ...next, connected: Boolean(next.lastSuccess), lastSuccess: success.current.at });
      },
    });
    poller.current = current;
    return () => { current.stop(); if (poller.current === current) poller.current = null; };
  }, [active, id, syncedId, game, team1Id, team2Id, endpoint, onCollection]);
  return { ...status, refresh: () => poller.current?.refresh() };
}

function Lineups({ session, teams, gameKey }: { session: HubSession | null; teams: [string, string]; gameKey: HubGameKey }) {
  if (!session) return <p className="field-hint">{gameKey === "valorant" ? "Agent lineups will appear when this game's score and agents are reported in League Hub." : "Player assignments will appear after the draft is published and both teams confirm."}</p>;
  if (!session.revealed) return <p className="field-hint">{gameKey === "leagueOfLegends"
    ? session.confirmedTeams.length === 2 ? "Player and role assignments are unavailable for this draft."
      : `${session.confirmedTeams.length} of 2 teams confirmed. Player and role assignments stay hidden until both confirm.`
    : "Agent lineups appear after the game score and agents are reported in League Hub."}</p>;
  return <div className="hub-lineups">{(["team1", "team2"] as const).map((key, index) => <div key={key}>
    <table><caption>{teams[index]}</caption><thead><tr><th scope="col">{session.kind === "champions" ? "Role" : "Slot"}</th><th scope="col">Player</th><th scope="col">{session.kind === "champions" ? "Champion" : "Agent"}</th></tr></thead>
      <tbody>{session.lineups[key].map((row) => <tr key={row.position}><td>{row.position}</td><td>{row.player}</td><td>{row.item}</td></tr>)}</tbody>
    </table>
  </div>)}</div>;
}

export function HubDraftControls({ gameKey, source, match, teams, gameNumber, status, owner, onMode, onMatchSetup, onResults }: {
  gameKey: HubGameKey; source: HubSource; match: HubMatch; teams: [string, string]; gameNumber: number;
  status: HubStatus & { refresh: () => void }; owner: boolean; onMode: (mode: "manual" | "live") => void;
  onMatchSetup: () => void; onResults: () => void;
}) {
  const game = gameKey === "valorant" ? "VALORANT" : "League of Legends";
  const reason = hubEligibility(match, game);
  const collection = !reason && source.collection?.matchId === match.syncedId
    && JSON.stringify(source.collection.identity) === JSON.stringify(match.hubIdentity) ? source.collection : null;
  const session = selectHubSession(collection, gameNumber);
  const live = source.mode === "live";
  const connection = hubConnectionState({ owner, reason, mode: source.mode, status, hasSnapshot: Boolean(collection) });
  const history = collection?.sessions.filter((entry) => (entry.gameIndex ?? Infinity) < gameNumber) ?? [];
  const ahead = live && Boolean(collection?.currentGameIndex && collection.currentGameIndex > gameNumber);
  const showLineups = collection?.required && (gameKey === "leagueOfLegends" ? Boolean(session) : Boolean(collection.veto?.phase === "complete" || session));
  const lineupLabel = session?.revealed ? "Revealed" : gameKey === "valorant" ? "Pending report"
    : session?.confirmedTeams.length === 2 ? "Assignments unavailable" : `${session?.confirmedTeams.length ?? 0} of 2 confirmed`;
  return <section className="panel-card hub-draft-panel" aria-label={`${game} League Hub API`}>
    <div className="hub-api-heading"><div><h2>League Hub API</h2><p className="hub-match-teams">{teams[0]} <span>vs</span> {teams[1]}</p></div>
      <div className="hub-api-actions">
        <label className="hub-live-control"><span className="hub-live-label">Live <small>{live ? "On" : "Off"}</small></span><span className="switch large"><input type="checkbox" role="switch" aria-label={`${game} League Hub Live`} aria-describedby={`${gameKey}-hub-status`} checked={live} disabled={!owner || Boolean(reason)} onChange={(event) => onMode(event.target.checked ? "live" : "manual")} /><span aria-hidden="true" /></span></label>
        {live && !reason ? <button type="button" className="button secondary" onClick={status.refresh} disabled={!owner}>{status.error ? "Retry now" : "Refresh now"}</button> : null}
      </div>
    </div>
    <div className="hub-match-link"><span>Match 1 <code>{match.syncedId || "Not synced"}</code></span><button type="button" className="hub-text-button" onClick={onMatchSetup}>{reason ? "Set up Match 1" : "Team Info"}</button>
      {!reason ? <a href={`https://hub.gamingoasis.gg/matches/${encodeURIComponent(match.syncedId)}`} target="_blank" rel="noreferrer">Open in League Hub ↗</a> : null}</div>
    <div className="hub-connection-row" data-tone={connection.tone}>
      <p id={`${gameKey}-hub-status`} role="status"><strong>{connection.label}</strong><span>{connection.detail}</span></p>
      {!reason && status.lastSuccess ? <span className="hub-refresh-time">Last refresh <time dateTime={status.lastSuccess}>{new Date(status.lastSuccess).toLocaleTimeString()}</time></span> : null}
    </div>
    {collection ? <div className="hub-draft-progress"><span className="field-label">{live ? "" : "Last imported · "}{gameKey === "valorant" ? "Series map veto" : `Game ${gameNumber} draft`}</span><strong>{hubDraftProgress(collection, gameKey, gameNumber)}</strong></div> : null}
    <div className={`hub-results-note${ahead ? " hub-api-notice" : ""}`}>
      <p>{ahead ? `Hub is on Game ${collection!.currentGameIndex}; update results to advance from Game ${gameNumber}.` : "Scores stay manual. Save each game with Update results to advance."}</p>
      <button type="button" className="hub-text-button" onClick={onResults}>Go to results</button>
    </div>
    {showLineups ? <details className="hub-current-lineup" key={`${collection?.matchId}-${gameNumber}`} open={session?.revealed || undefined}>
      <summary>Game {gameNumber} lineup <span>{lineupLabel}</span></summary>
      <Lineups session={session} teams={teams} gameKey={gameKey} />
    </details> : null}
    {collection && (history.length > 0 || collection.games.length > 0) ? <details className="hub-history"><summary>Hub results &amp; earlier games <span>Reference only</span></summary>
      {collection.games.length ? <table className="hub-reference-scores"><caption>Hub scores — do not publish automatically</caption><thead><tr><th scope="col">Game</th><th scope="col">{teams[0]}</th><th scope="col">{teams[1]}</th></tr></thead><tbody>{collection.games.map((result, index) => <tr key={index}><th scope="row">{index + 1}</th><td>{result.team1}</td><td>{result.team2}</td></tr>)}</tbody></table> : null}
      {history.map((entry) => <details key={entry.id}><summary>Game {entry.gameIndex} draft and lineup</summary>
        {entry.kind === "champions" ? (["team1", "team2"] as const).map((key, index) => <p className="field-hint" key={key}><strong>{teams[index]}</strong> · Picks: {entry.picks[key].join(", ") || "None"}<br />Bans: {entry.bans.filter((ban) => ban.team === key).map((ban) => ban.name).join(", ") || "None"}</p>) : null}
        <Lineups session={entry} teams={teams} gameKey={gameKey} />
      </details>)}
    </details> : null}
  </section>;
}
