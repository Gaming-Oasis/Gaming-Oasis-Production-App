"use client";

import type { PhantomStatus } from '../lib/phantom-draft.mjs';
import { useCountdownClock } from './useCountdownClock';

export function PhantomDraftControls({ status, onAction }: { status: PhantomStatus; onAction: (action: string) => void }) {
  const now = useCountdownClock(status.deadline);
  const countingDown = status.running && status.deadline > 0 && !status.pending && !status.changes.length;
  const seconds = countingDown && now > 0 ? Math.max(0, Math.ceil((status.deadline - now) / 1000)) : null;
  const nextSelection = status.rows.find(row => row.id === status.next);
  const message = status.changes.length ? 'Draft changed. Review corrections before revealing more.'
    : status.pending ? 'Waiting for JSON writer acknowledgement.'
    : !status.ready ? 'Complete all selections before revealing.'
    : status.count === status.rows.length ? 'All selections revealed.'
    : countingDown ? 'Automatic reveals running.'
    : status.reason || 'Ready. Select Start reveal to begin automatic reveals.';
  return <section className="panel-card phantom-controls" aria-label="Phantom pick and ban">
    <div className="card-title-row"><div><h2>Phantom pick / ban</h2><p>Hold selections off air, then reveal them individually or automatically.</p></div>
      <label className="phantom-enable"><span>Phantom mode</span><span className="switch large"><input type="checkbox" aria-label="Enable phantom mode" checked={status.enabled} onChange={() => onAction(status.enabled ? 'disable' : 'enable')} /><span /></span></label>
    </div>
    {status.enabled ? <>
      <div className="phantom-reveal-status">
        <div><p role="status">{message}</p><p className="field-hint">{status.count} of {status.rows.length} revealed{nextSelection ? ` · Next: ${nextSelection.label}` : ''}.</p></div>
        <div className="phantom-countdown">
          <span>Next reveal · Local only</span>
          <strong role="timer" aria-label="Time until next reveal" aria-live="off">{seconds === null ? '—' : `00:${String(seconds).padStart(2, '0')}`}</strong>
        </div>
      </div>
      <div className="league-draft-actions">
        <button className="button primary" type="button" disabled={!status.running && !status.next} onClick={() => onAction(status.running ? 'pause' : 'start')}>{status.running ? 'Pause' : 'Start reveal'}</button>
        <button className="button secondary" type="button" disabled={!status.next} onClick={() => onAction('next')}>Reveal next</button>
        <button className="button secondary" type="button" onClick={() => onAction('hide')}>Hide all</button>
      </div>
      <p className="field-hint">Start reveal begins a local 15–30 second countdown before the first selection and each following reveal. Manual reveal pauses automation; a starting side needs its map revealed first.</p>
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
