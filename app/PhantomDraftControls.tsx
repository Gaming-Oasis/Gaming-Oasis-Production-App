"use client";

import type { PhantomStatus } from '../lib/phantom-draft.mjs';
import { useCountdownClock } from './useCountdownClock';

export function PhantomDraftControls({ status, onAction }: { status: PhantomStatus; onAction: (action: string) => void }) {
  const now = useCountdownClock(status.deadline);
  const message = status.changes.length ? 'Draft changed. Review corrections before revealing more.'
    : status.pending ? 'Waiting for JSON writer acknowledgement.'
    : !status.ready ? 'Complete all selections before revealing.'
    : status.count === status.rows.length ? 'All selections revealed.'
    : status.deadline ? `Next reveal in ${Math.max(0, Math.ceil((status.deadline - now) / 1000))} seconds.`
    : status.reason || `${status.count} of ${status.rows.length} revealed.`;
  return <section className="panel-card phantom-controls" aria-label="Phantom pick and ban">
    <div className="card-title-row"><div><h2>Phantom pick / ban</h2><p>Hold selections off air, then reveal them individually or automatically.</p></div>
      <label className="phantom-enable"><span>Phantom mode</span><span className="switch large"><input type="checkbox" aria-label="Enable phantom mode" checked={status.enabled} onChange={() => onAction(status.enabled ? 'disable' : 'enable')} /><span /></span></label>
    </div>
    {status.enabled ? <>
      <p role="status">{message}</p>
      <div className="league-draft-actions">
        <button className="button primary" type="button" disabled={!status.next} onClick={() => onAction('next')}>Reveal next</button>
        <button className="button secondary" type="button" disabled={!status.running && !status.next} onClick={() => onAction(status.running ? 'pause' : 'start')}>{status.running ? 'Pause' : 'Auto reveal'}</button>
        <button className="button secondary" type="button" onClick={() => onAction('hide')}>Hide all</button>
      </div>
      <p className="field-hint">Auto reveal waits 15–30 seconds per selection. Row buttons allow any order; a starting side needs its map revealed first. Manual reveal pauses automation.</p>
      {status.reason && status.pending ? <p className="field-hint">{status.reason}</p> : null}
      {status.changes.length ? <div className="phantom-corrections">
        <h3>Review corrections</h3>
        <p>Current on-air selections remain visible until you apply these changes.</p>
        <ul>{status.changes.map((change, index) => <li key={`${change.label}-${index}`}><strong>{change.label}:</strong> {change.before} → {change.after}</li>)}</ul>
        <button className="button secondary" type="button" disabled={!status.sourceReady || status.pending} onClick={() => onAction('apply')}>Apply corrections</button>
        {!status.sourceReady ? <p className="field-hint">Complete the corrected draft before applying it.</p> : null}
      </div> : null}
    </> : <p className="field-hint">Enable before entering or importing selections. The countdown is visible only here.</p>}
  </section>;
}

export function PhantomRowControl({ status, id, onReveal }: { status: PhantomStatus; id: string; onReveal: () => void }) {
  if (!status.enabled) return null;
  const row = status.rows.find(row => row.id === id);
  if (!row) return null;
  return <div className="phantom-row-control">
    <span>{row.revealed ? 'Revealed' : 'Hidden'}{row.revealed && row.stagedValue !== row.value ? ` · On air: ${row.stagedValue}` : ''}</span>
    <button className="button secondary" type="button" aria-label={`Reveal ${row.label}`} disabled={!row.canReveal} onClick={onReveal}>Reveal</button>
  </div>;
}
