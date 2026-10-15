import { leagueDraftSteps, normalizeLeaguePickOrder } from './league-of-legends.mjs';

const KEYS = ['valorant', 'leagueOfLegends'];
const text = value => typeof value === 'string' ? value.trim() : '';
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const other = team => team === 'team1' ? 'team2' : 'team1';

export function resetPhantom(value, enabled = value?.enabled === true) {
  return { version: 2, enabled, snapshot: null, revealed: [], running: false, deadline: 0,
    pending: '', revision: (Number.isSafeInteger(value?.revision) ? value.revision : 0) + 1, reason: '' };
}

/** Reloads and controller handoffs retain the broadcast snapshot, but never resume timers. */
export function restorePhantom(value) {
  if (value?.version !== 2) return resetPhantom(null, false);
  const fresh = resetPhantom(value);
  const s = value.snapshot;
  if (!s || !KEYS.includes(s.key) || typeof s.scope !== 'string' || !Array.isArray(s.rows)
    || ![0, 10, 12, 20].includes(s.rows.length) || new Set(s.rows.map(r => r?.id)).size !== s.rows.length
    || !s.rows.every(r => r && ['id', 'label', 'value', 'team', 'identity', 'dependsOn'].every(k => typeof r[k] === 'string')
      && Number.isInteger(r.index) && r.index >= 0 && r.index < 20)) return fresh;
  const snapshot = { key: s.key, scope: s.scope, rows: s.rows.map(r => ({ id: r.id, label: r.label, value: r.value,
    team: r.team, identity: r.identity, dependsOn: r.dependsOn, index: r.index })),
    banSwap: s.banSwap === true, blueTeam: s.blueTeam === 'team2' ? 'team2' : 'team1',
    firstPickSide: s.firstPickSide === 'CHAOS' ? 'CHAOS' : 'ORDER',
    bluePickOrder: normalizeLeaguePickOrder(s.bluePickOrder), redPickOrder: normalizeLeaguePickOrder(s.redPickOrder) };
  const revealed = snapshot.rows.filter(r => Array.isArray(value.revealed) && value.revealed.includes(r.id)).map(r => r.id);
  return { ...fresh, snapshot, revealed: revealed.filter(id => {
    const row = snapshot.rows.find(r => r.id === id);
    return !row.dependsOn || revealed.includes(row.dependsOn);
  }), reason: value.running || value.pending ? 'Paused after reload or control change.' : text(value.reason) };
}

export function phantomMatchKey(state) {
  const match = state.general?.matches?.[0];
  return JSON.stringify([match?.id, match?.syncedId, match?.hubIdentity]);
}

function sourceSnapshot(game, key, matchKey) {
  const scope = JSON.stringify([matchKey, game.hubDraft?.matchId, game.bestOf,
    key === 'leagueOfLegends' ? [game.currentGame, game.draftMode] : null]);
  const blueTeam = game.blueTeam === 'team2' ? 'team2' : 'team1';
  const firstPickSide = game.draft?.firstPickSide === 'CHAOS' ? 'CHAOS' : 'ORDER';
  let rows;
  if (key === 'valorant') {
    const five = game.bestOf === 'Bo5';
    const veto = (five ? game.bo5 : game.bo3) ?? {};
    const ids = game.bestOf === 'Bo1' ? [] : five
      ? ['ban1', 'ban2', 'pick1', 'side1', 'pick2', 'side2', 'pick3', 'side3', 'pick4', 'side4', 'decider', 'side5']
      : ['ban1', 'ban2', 'pick1', 'side1', 'pick2', 'side2', 'ban3', 'ban4', 'decider', 'side3'];
    const teamA = game.banSwap ? 'team2' : 'team1';
    rows = ids.map((id, index) => {
      const n = Number(id.slice(-1));
      const side = id.startsWith('side');
      const role = side ? (five ? ['B', 'A', 'B', 'A', 'B'] : ['B', 'A', 'A'])[n - 1] : n % 2 ? 'A' : 'B';
      const team = id === 'decider' ? '' : role === 'A' ? teamA : other(teamA);
      const dependsOn = side ? n === (five ? 5 : 3) ? 'decider' : `pick${n}` : '';
      return { id, label: side ? `Map ${n} side` : id === 'decider' ? 'Decider' : `${id.startsWith('ban') ? 'Ban' : 'Pick'} ${n}`,
        value: text(veto[id]), team, identity: `${id}:${team}`, dependsOn, index };
    });
  } else {
    rows = leagueDraftSteps(game.draftMode, firstPickSide).map(step => {
      const team = step.side === 'ORDER' ? blueTeam : other(blueTeam);
      const id = `${step.side}:${step.action}:${step.slot}`;
      return { id, label: `${step.side === 'ORDER' ? 'Blue' : 'Red'} ${step.action} ${step.slot + 1}`,
        value: text(game.draft?.selections?.[step.index]), team, identity: `${id}:${team}`, dependsOn: '', index: step.index };
    });
  }
  return { key, scope, rows, banSwap: game.banSwap === true, blueTeam, firstPickSide,
    bluePickOrder: normalizeLeaguePickOrder(game.draft?.bluePickOrder), redPickOrder: normalizeLeaguePickOrder(game.draft?.redPickOrder) };
}

const ready = snapshot => snapshot.rows.length > 0 && snapshot.rows.every(r => r.dependsOn
  ? ['attack', 'defense'].includes(r.value) : Boolean(r.value));

function differences(before, after) {
  const changes = after.rows.flatMap(row => {
    const old = before.rows.find(r => r.id === row.id);
    return !old || old.value !== row.value || old.identity !== row.identity
      ? [{ label: row.label, before: old ? `${old.value || 'Empty'}${old.team ? ` (${old.team})` : ''}` : 'Empty',
        after: `${row.value || 'Empty'}${row.team ? ` (${row.team})` : ''}` }] : [];
  });
  if (before.firstPickSide !== after.firstPickSide) changes.unshift({ label: 'First pick', before: before.firstPickSide === 'ORDER' ? 'Blue' : 'Red', after: after.firstPickSide === 'ORDER' ? 'Blue' : 'Red' });
  if (after.key === 'leagueOfLegends') for (const side of ['blue', 'red']) {
    const previous = normalizeLeaguePickOrder(before[`${side}PickOrder`]);
    const current = after[`${side}PickOrder`];
    if (!equal(previous, current)) changes.push({ label: `${side === 'blue' ? 'Blue' : 'Red'} role order`,
      before: previous.map(slot => `Pick ${slot + 1}`).join(', '), after: current.map(slot => `Pick ${slot + 1}`).join(', ') });
  }
  return changes;
}

/** Resolve context and corrections before any broadcast projection, not only in a later effect. */
export function reconcilePhantom(game, key, matchKey = '') {
  const p = game.phantom;
  if (!p?.enabled || p.version !== 2) return game;
  const source = sourceSnapshot(game, key, matchKey);
  let next = p;
  if (!p.snapshot || p.snapshot.scope !== source.scope) next = { ...resetPhantom(p), snapshot: source };
  else if (!p.revealed.length && !equal(p.snapshot, source)) {
    next = { ...p, snapshot: source, running: false, deadline: 0, reason: p.running ? 'Draft changed. Review before restarting.' : '' };
    if (p.pending) next = queueOutput(next);
  } else if (differences(p.snapshot, source).length && (p.running || p.deadline)) {
    next = { ...p, running: false, deadline: 0, reason: 'Draft changed. Review corrections.' };
  }
  return next === p ? game : { ...game, phantom: next };
}

export function phantomStatus(game, key, matchKey = '') {
  const resolved = reconcilePhantom(game, key, matchKey);
  const source = sourceSnapshot(game, key, matchKey);
  const p = resolved.phantom?.version === 2 ? resolved.phantom : resetPhantom(null, false);
  const snapshot = p.snapshot ?? source;
  const changes = p.enabled ? differences(snapshot, source) : [];
  const rows = source.rows.map(row => {
    const staged = snapshot.rows.find(r => r.id === row.id);
    const revealed = p.revealed.includes(row.id);
    return { ...row, stagedValue: staged?.value ?? '', revealed,
      canReveal: p.enabled && ready(snapshot) && !changes.length && !p.pending && !revealed
        && (!row.dependsOn || p.revealed.includes(row.dependsOn)) };
  });
  return { enabled: p.enabled, ready: ready(snapshot), sourceReady: ready(source), rows, changes,
    count: p.revealed.length, running: p.running, deadline: p.deadline, pending: Boolean(p.pending), reason: p.reason,
    next: rows.find(r => r.canReveal)?.id ?? '' };
}

export function revealDelay(random = Math.random) { return (15 + Math.floor(random() * 16)) * 1000; }
function queueOutput(p) {
  const revision = p.revision + 1;
  return { ...p, revision, deadline: 0, pending: JSON.stringify([revision, p.snapshot, p.revealed]) };
}

export function phantomAction(game, key, matchKey, action, id = '', now = Date.now()) {
  game = reconcilePhantom(game, key, matchKey);
  let p = game.phantom?.version === 2 ? game.phantom : resetPhantom(null, false);
  if (action === 'enable' || action === 'hide' || action === 'disable') {
    p = { ...resetPhantom(p, action !== 'disable'), snapshot: sourceSnapshot(game, key, matchKey) };
    return { ...game, phantom: queueOutput(p) };
  }
  if (!p.enabled) return game;
  const status = phantomStatus(game, key, matchKey);
  if (action === 'pause') return pausePhantom(game);
  if (action === 'apply') {
    if (!status.changes.length || !status.sourceReady || p.pending) return game;
    const snapshot = sourceSnapshot(game, key, matchKey);
    const revealed = p.revealed.filter(id => snapshot.rows.some(row => row.id === id
      && p.snapshot.rows.some(old => old.id === id && old.identity === row.identity)));
    return { ...game, phantom: queueOutput({ ...p, snapshot,
      revealed: revealed.filter(id => { const row = snapshot.rows.find(r => r.id === id); return !row.dependsOn || revealed.includes(row.dependsOn); }),
      running: false, reason: '' }) };
  }
  if (!status.next) return game;
  if (action === 'start') return { ...game, phantom: queueOutput({ ...p, running: true, reason: '' }) };
  if (action === 'tick' && (!p.running || !p.deadline || now < p.deadline)) return game;
  const selected = action === 'reveal' ? id : status.next;
  if (!['reveal', 'next', 'tick'].includes(action) || !status.rows.some(row => row.id === selected && row.canReveal)) return game;
  return { ...game, phantom: queueOutput({ ...p, revealed: [...p.revealed, selected], running: action === 'tick', reason: '' }) };
}

export function pausePhantom(game, reason = '') {
  const p = game.phantom;
  if (!p?.enabled || !p.running && !p.deadline && (!reason || p.reason === reason)) return game;
  return { ...game, phantom: { ...p, running: false, deadline: 0, reason } };
}

export function acknowledgePhantom(game, ticket, now = Date.now(), random = Math.random) {
  const p = game.phantom;
  if (!ticket || p?.pending !== ticket) return game;
  const running = p.running && p.revealed.length < p.snapshot.rows.length;
  return { ...game, phantom: { ...p, pending: '', running, deadline: running ? now + revealDelay(random) : 0 } };
}

function mapGames(state, transform) {
  let next = state;
  const matchKey = phantomMatchKey(state);
  for (const key of KEYS) {
    const game = transform(next[key], key, matchKey);
    if (game !== next[key]) next = { ...next, [key]: game };
  }
  return next;
}
export const reconcilePhantoms = state => mapGames(state, reconcilePhantom);
export const tickPhantoms = (state, now) => mapGames(state, (game, key, match) => phantomAction(game, key, match, 'tick', '', now));
export const pausePhantoms = (state, reason) => mapGames(state, game => pausePhantom(game, reason));
export const phantomTickets = state => Object.fromEntries(KEYS.map(key => [key, state[key].phantom?.pending || '']));
export const acknowledgePhantoms = (state, tickets, now, random) => mapGames(state, (game, key, match) => acknowledgePhantom(reconcilePhantom(game, key, match), tickets[key], now, random));

/** Only broadcast selections are substituted. Scores, history, source imports and local draft stay intact. */
export function phantomBroadcast(game, key, matchKey = '') {
  game = reconcilePhantom(game, key, matchKey);
  const p = game.phantom;
  if (!p?.enabled || p.version !== 2) return game;
  const s = p.snapshot;
  const visible = row => p.revealed.includes(row.id) && (!row.dependsOn || p.revealed.includes(row.dependsOn));
  if (key === 'valorant') {
    const mask = veto => Object.fromEntries(Object.keys(veto ?? {}).map(id => [id, '']));
    const bo3 = mask(game.bo3), bo5 = mask(game.bo5);
    const target = game.bestOf === 'Bo5' ? bo5 : bo3;
    s.rows.forEach(row => { target[row.id] = visible(row) ? row.value : ''; });
    return { ...game, banSwap: s.banSwap, bo3, bo5 };
  }
  const selections = Array(20).fill('');
  s.rows.forEach(row => { if (visible(row)) selections[row.index] = row.value; });
  const sourceMatches = !differences(s, sourceSnapshot(game, key, matchKey)).length;
  // Publish the next slot with the reveal transaction so the existing border pulses
  // throughout the wait. The writer acknowledgement only starts the local timer.
  const next = p.running && ready(s) && sourceMatches ? s.rows.find(row => !visible(row)) : undefined;
  return { ...game, blueTeam: s.blueTeam,
    hubPresentation: game.hubPresentation ? { ...game.hubPresentation, activeSelection: Boolean(next),
      rolesRevealed: game.hubPresentation.rolesRevealed && sourceMatches } : undefined,
    draft: { ...game.draft, selections, firstPickSide: s.firstPickSide,
      currentStep: next?.index ?? 20, timerRunning: false,
      bluePickOrder: normalizeLeaguePickOrder(s.bluePickOrder),
      redPickOrder: normalizeLeaguePickOrder(s.redPickOrder) } };
}
