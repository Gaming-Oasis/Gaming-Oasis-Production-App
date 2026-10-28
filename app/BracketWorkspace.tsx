"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bracketEventUrl, bracketSourceFromMatch, emptyBracketState, layoutBracket, parseBracketEventUrl, type BracketSnapshot, type BracketSource, type BracketState } from "../lib/bracket.mjs";
import { loadBracketEvent, loadBracketSnapshot, readBracketResource, refreshBracketSnapshot, type BracketEventChoice } from "../lib/bracket-client.mjs";
import { BRACKET_CONNECTION_COPY, hubConnectionState, type HubConnectionStatus } from "../lib/hub-connection.mjs";
import { startHubPolling } from "../lib/hub-polling.mjs";
import { BracketStage } from "./overlays/bracket/BracketStage";

const idle: HubConnectionStatus = { busy: false, error: "", lastSuccess: "", connected: false };
const OVERLAY_URL = "http://localhost:3000/overlays/bracket";

export function useBracketSync({ active, value, onSnapshot }: { active: boolean; value: BracketState; onSnapshot: (snapshot: BracketSnapshot, source: BracketSource) => void }) {
  const [status, setStatus] = useState<HubConnectionStatus>(idle);
  const poller = useRef<ReturnType<typeof startHubPolling> | null>(null);
  const success = useRef({ key: "", at: "" });
  const accepted = useRef(value.snapshot);
  const source = value.snapshot?.source;
  const key = source ? JSON.stringify(source) : "";
  useEffect(() => { accepted.current = value.snapshot; }, [value.snapshot]);
  useEffect(() => {
    if (success.current.key !== key) success.current = { key, at: "" };
    setStatus({ ...idle, lastSuccess: success.current.at });
    if (!active || value.hold || !key) return;
    const requestedSource: BracketSource = JSON.parse(key);
    const current = startHubPolling({
      load: (signal: AbortSignal) => {
        const base = accepted.current;
        return base && JSON.stringify(base.source) === key ? refreshBracketSnapshot(base, signal) : loadBracketSnapshot(requestedSource, signal);
      },
      accept: (snapshot: BracketSnapshot) => onSnapshot(snapshot, requestedSource),
      status: (next: Omit<HubConnectionStatus, "connected">) => {
        if (next.lastSuccess) success.current.at = next.lastSuccess;
        // A saved refresh time must not imply that a new connection is healthy yet.
        setStatus({ ...next, connected: Boolean(next.lastSuccess), lastSuccess: success.current.at });
      },
    });
    poller.current = current;
    return () => { current.stop(); if (poller.current === current) poller.current = null; };
  }, [active, key, value.hold, onSnapshot]);
  return { ...status, refresh: useCallback(() => poller.current?.refresh(), []) };
}

export function BracketWorkspace({ enabled, value, onChange, matchId, writerStatus, status }: {
  enabled: boolean; value: BracketState; onChange: (value: BracketState) => void; matchId: string;
  writerStatus: string; status: HubConnectionStatus & { refresh: () => void };
}) {
  const [eventUrl, setEventUrl] = useState(() => value.snapshot ? bracketEventUrl(value.snapshot.source) : "");
  const [candidate, setCandidate] = useState<BracketEventChoice | null>(null);
  const [stageId, setStageId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const request = useRef<AbortController | null>(null);
  const preview = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const sourceKey = value.snapshot ? JSON.stringify(value.snapshot.source) : "";
  useEffect(() => {
    request.current?.abort(); setBusy(false);
    if (!sourceKey) { setCandidate(null); setEventUrl(""); setStageId(""); setError(""); }
  }, [sourceKey]);
  useEffect(() => {
    if (!enabled) { request.current?.abort(); setBusy(false); }
    return () => request.current?.abort();
  }, [enabled]);
  useEffect(() => {
    const element = preview.current; if (!element) return;
    const observer = new ResizeObserver(entries => { const width = entries[0]?.contentRect.width; if (width) setScale(width / 1920); });
    observer.observe(element); return () => observer.disconnect();
  }, []);
  const layout = layoutBracket(value);
  const connection = hubConnectionState({ owner: enabled, reason: value.snapshot ? "" : "Choose an event and load a stage to begin.",
    mode: value.hold ? "manual" : "live", status, hasSnapshot: Boolean(value.snapshot), copy: BRACKET_CONNECTION_COPY });
  async function perform(work: (signal: AbortSignal) => Promise<void>) {
    request.current?.abort(); const current = new AbortController(); request.current = current;
    setBusy(true); setError("");
    try { await work(current.signal); }
    catch (caught) { if (!current.signal.aborted) setError(caught instanceof Error ? caught.message : "Could not load the bracket."); }
    finally { if (request.current === current) { setBusy(false); request.current = null; } }
  }
  async function chooseEvent(source: BracketSource, signal: AbortSignal) {
    const next = await loadBracketEvent(source, signal); if (signal.aborted) return;
    setCandidate(next); setStageId(source.stageId ? next.stages.find(stage => stage.id === source.stageId)?.id ?? "" : next.stages[0]?.id ?? "");
    if (!next.stages.length) setError("This event has no published single- or double-elimination stages.");
    else if (source.stageId && !next.stages.some(stage => stage.id === source.stageId)) setError("Match 1 is not in a published elimination stage. Select an elimination stage from this event.");
  }
  function load() {
    if (!candidate || !stageId) return;
    void perform(async signal => {
      const snapshot = await loadBracketSnapshot({ ...candidate.source, stageId }, signal);
      if (!signal.aborted) onChange({ ...emptyBracketState(value.background), snapshot });
    });
  }
  return <div className="bracket-workspace">
    <header className="section-heading"><div><span className="eyebrow">League Hub</span><h1>Brackets</h1><p>Display a published League Hub elimination bracket.</p></div></header>
    <section className="panel-card bracket-source-panel" aria-label="Bracket source">
      <h2>League Hub source</h2>
      <div className="bracket-source-row"><label className="field"><span className="field-label">Public event link</span><input value={eventUrl} onChange={event => { request.current?.abort(); setBusy(false); setEventUrl(event.target.value); setCandidate(null); setStageId(""); }} placeholder="https://hub.gamingoasis.gg/portal/…/seasons/…/events/…" /></label>
        <button className="button secondary" disabled={!enabled || busy || !eventUrl.trim()} onClick={() => void perform(signal => chooseEvent(parseBracketEventUrl(eventUrl), signal))}>Find stages</button>
        <button className="button secondary" disabled={!enabled || busy || !matchId} onClick={() => void perform(async signal => {
          const detail = await readBracketResource(`/api/public/matches/${encodeURIComponent(matchId)}`, signal);
          const source = bracketSourceFromMatch(detail);
          await chooseEvent(source, signal);
          if (!signal.aborted) setEventUrl(bracketEventUrl(source));
        })}>Use Match 1 stage</button>
      </div>
      {candidate ? <div className="bracket-source-row"><label className="field"><span className="field-label">{candidate.name} · Stage</span><select aria-label="Stage" value={stageId} onChange={event => setStageId(event.target.value)} disabled={busy}><option value="">Select an elimination stage</option>{candidate.stages.map(stage => <option value={stage.id} key={stage.id}>{stage.name} · {stage.type === "single_elimination" ? "Single elimination" : "Double elimination"}</option>)}</select></label><button className="button primary" disabled={!enabled || busy || !stageId} onClick={load}>Load bracket</button></div> : null}
      {busy ? <p role="status">Loading from League Hub…</p> : null}
      {error ? <p className="field-error" role="alert">{error}{value.snapshot ? " The current bracket stays on air." : ""}</p> : null}
      <div className="hub-connection-row" data-tone={connection.tone}>
        <p role="status"><strong>{connection.label}</strong>{value.snapshot ? <span>{value.snapshot.event.name} · {value.snapshot.stage.name}</span> : null}<span>{connection.detail}</span><span>{writerStatus}</span></p>
        {status.lastSuccess ? <span className="hub-refresh-time">Last refresh <time dateTime={status.lastSuccess}>{new Date(status.lastSuccess).toLocaleTimeString()}</time></span> : null}
      </div>
    </section>
    <section className="panel-card bracket-controls-panel" aria-label="Bracket display controls">
      <div className="card-title-row"><h2>Display controls</h2><div className="bracket-actions"><label className="phantom-enable"><input type="checkbox" checked={value.hold} disabled={!enabled || !value.snapshot} onChange={event => onChange({ ...value, hold: event.target.checked })} />Hold updates</label><button className="button secondary" onClick={status.refresh} disabled={!enabled || !value.snapshot || value.hold || status.busy}>Refresh now</button></div></div>
      <div className="bracket-actions bracket-rotation"><label className="phantom-enable"><input type="checkbox" checked={value.autoRotate} disabled={!enabled || !value.snapshot} onChange={event => onChange({ ...value, autoRotate: event.target.checked })} />Auto rotate · 10 seconds</label><span>Loop through all available pages and bracket groups. Manual framing starts a new 10-second interval.</span></div>
      <div className="form-grid bracket-controls-grid">
        <label className="field"><span className="field-label">Bracket section</span><select aria-label="Bracket section" value={layout.section} disabled={!value.snapshot} onChange={event => onChange({ ...value, section: event.target.value, roundStart: 0, page: 0, view: "focus" })}>{layout.sections.length ? layout.sections.map(section => <option key={section.id} value={section.id}>{section.label}</option>) : <option value="winners">Main bracket</option>}</select></label>
        <label className="field"><span className="field-label">View</span><select aria-label="View" value={layout.overview ? "overview" : "focus"} disabled={!value.snapshot} onChange={event => onChange({ ...value, view: event.target.value as BracketState["view"], page: 0 })}><option value="focus">Focused section</option><option value="overview" disabled={!layout.canOverview}>Complete overview{!layout.canOverview ? " · too large" : ""}</option></select></label>
        <label className="field"><span className="field-label">Starting round</span><select aria-label="Starting round" value={layout.start} disabled={!value.snapshot || layout.overview} onChange={event => onChange({ ...value, roundStart: Number(event.target.value), page: 0 })}>{layout.rounds.map((round, index) => <option key={round.key} value={index}>{round.label}</option>)}</select></label>
        <label className="field"><span className="field-label">Page</span><select aria-label="Page" value={layout.page} disabled={!value.snapshot || layout.overview} onChange={event => onChange({ ...value, page: Number(event.target.value) })}>{Array.from({ length: layout.pageCount }, (_, index) => <option value={index} key={index}>Section {index + 1} of {layout.pageCount}</option>)}</select></label>
        <label className="field"><span className="field-label">Background</span><select aria-label="Background" value={value.background} onChange={event => onChange({ ...value, background: event.target.value as BracketState["background"] })}><option value="transparent">Transparent</option><option value="solid">Solid dark</option></select></label>
      </div>
      {value.hold ? <p className="field-hint">Scores and progression are frozen. Framing remains available. Release Hold to fetch the latest bracket.</p> : null}
      {value.snapshot && !layout.cards.length ? <p className="field-hint">No matches have been published for this section.</p> : null}
    </section>
    <section className="panel-card browser-overlay-card bracket-links" aria-label="Bracket browser source"><h2>Browser overlay links</h2><p>Set the OBS or vMix browser source to 1920 × 1080.</p><code>{OVERLAY_URL}</code><div className="bracket-actions"><button className="button secondary" onClick={async () => { try { await navigator.clipboard.writeText(OVERLAY_URL); setCopyStatus("Bracket link copied"); } catch { setCopyStatus("Could not copy the link; select the address above."); } }}>Copy link</button><a className="button secondary" href={OVERLAY_URL} target="_blank" rel="noreferrer">Open</a><span role="status">{copyStatus}</span></div></section>
    <section className="panel-card bracket-preview-panel" aria-label="Bracket preview"><h2>Preview</h2><div ref={preview} className="bracket-preview" style={{ height: 1080 * scale }}><div style={{ width: 1920, height: 1080, transform: `scale(${scale})`, transformOrigin: "0 0" }}><BracketStage value={value} /></div></div></section>
  </div>;
}
