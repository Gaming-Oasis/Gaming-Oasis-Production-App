import test from 'node:test';
import assert from 'node:assert/strict';
import { acknowledgePhantom, phantomAction, phantomBroadcast, phantomStatus, pausePhantom, reconcilePhantom,
  resetPhantom, restorePhantom, revealDelay, acknowledgePhantoms, tickPhantoms } from '../lib/phantom-draft.mjs';
import { buildValorantFields, buildValorantOverlayState } from '../lib/valorant.mjs';
import { createLeagueDraftState, buildLeagueOverlayState, leagueDraftSteps } from '../lib/league-of-legends.mjs';

const val = (bestOf = 'Bo3') => ({ bestOf, games: [], savedGames: [],
  bo3: { ban1: 'Ascent', ban2: 'Bind', pick1: 'Haven', pick2: 'Split', ban3: 'Lotus', ban4: 'Pearl', decider: 'Sunset', side1: 'attack', side2: 'defense', side3: 'attack' },
  bo5: { ban1: 'Ascent', ban2: 'Bind', pick1: 'Haven', pick2: 'Split', pick3: 'Lotus', pick4: 'Pearl', decider: 'Sunset', side1: 'attack', side2: 'defense', side3: 'attack', side4: 'attack', side5: 'defense' } });
const lol = (draftMode = 'standard', firstPickSide = 'ORDER') => ({ bestOf: 'Bo3', currentGame: 1, draftMode, blueTeam: 'team1', confirmedGames: [],
  draft: { ...createLeagueDraftState(30, firstPickSide), currentStep: 20, selections: Array.from({ length: 20 }, (_, i) => `Champion ${i}`) } });
const ack = (game, now = 1000, random = () => 0) => acknowledgePhantom(game, game.phantom.pending, now, random);
const enable = (game, key) => ack(phantomAction(game, key, '', 'enable'));
const reveal = (game, key, id) => ack(phantomAction(game, key, '', 'reveal', id));

test('VAL sequence includes every side immediately after its map and gates complete inputs', () => {
  for (const format of ['Bo3', 'Bo5']) {
    const game = enable(val(format), 'valorant');
    const status = phantomStatus(game, 'valorant');
    assert.equal(status.rows.length, format === 'Bo3' ? 10 : 12);
    assert.equal(status.ready, true);
    status.rows.forEach((row, index) => { if (row.dependsOn) assert.equal(status.rows[index - 1].id, row.dependsOn); });
    assert.equal(status.rows.find(r => r.id === 'side1').canReveal, false);
    assert.equal(phantomAction(game, 'valorant', '', 'reveal', 'side1'), game);
    const edited = { ...game, [format.toLowerCase()]: { ...game[format.toLowerCase()], side1: '' } };
    assert.equal(phantomStatus(edited, 'valorant').ready, false);
    assert.equal(phantomStatus(edited, 'valorant').next, '');
  }
  assert.equal(phantomStatus(enable(val('Bo1'), 'valorant'), 'valorant').rows.length, 0);
});

test('manual reveals allow arbitrary order; sides remain separately hidden in legacy fields', () => {
  let game = enable(val(), 'valorant');
  game = reveal(game, 'valorant', 'pick2');
  let broadcast = phantomBroadcast(game, 'valorant');
  assert.equal(broadcast.bo3.pick2, 'Split');
  assert.equal(broadcast.bo3.pick1, '');
  assert.equal(broadcast.bo3.side2, '');
  assert.equal(phantomStatus(game, 'valorant').rows.find(r => r.id === 'side2').canReveal, true);
  game = reveal(game, 'valorant', 'side2');
  broadcast = phantomBroadcast(game, 'valorant');
  assert.equal(broadcast.bo3.side2, 'defense');
  const fields = buildValorantFields(broadcast, {}, {});
  assert.equal(fields.valbo3maptext4, 'SPLIT');
  assert.equal(fields.valbo3maptext3, '');
  assert.equal(fields.valbo3s1text, 'TBD');
  assert.equal(fields.valbo3s2text, 'DEF');
  assert.equal(fields.valbo5maptext1, '');
  assert.deepEqual(Object.keys(fields), Object.keys(buildValorantFields(val(), {}, {})));
  assert.ok(!JSON.stringify(buildValorantOverlayState(broadcast, {}, {})).includes('Haven'));
});

test('League follows each existing format and first-pick order, with out-of-order masks', () => {
  for (const mode of ['standard', 'online', 'fearless']) for (const side of ['ORDER', 'CHAOS']) {
    let game = enable(lol(mode, side), 'leagueOfLegends');
    const rows = phantomStatus(game, 'leagueOfLegends').rows;
    assert.equal(rows.length, 20);
    assert.deepEqual(rows.map(r => r.id), leagueDraftSteps(mode, side).map(s => `${s.side}:${s.action}:${s.slot}`));
    game = reveal(game, 'leagueOfLegends', rows[19].id);
    const broadcast = phantomBroadcast(game, 'leagueOfLegends');
    assert.equal(broadcast.draft.selections[19], 'Champion 19');
    assert.equal(broadcast.draft.selections.filter(Boolean).length, 1);
    const overlay = buildLeagueOverlayState(broadcast, {}, {});
    assert.equal([...overlay.draft.bluePicks, ...overlay.draft.redPicks, ...overlay.draft.blueBans, ...overlay.draft.redBans].filter(Boolean).length, 1);
  }
});

for (const [key, create] of [['valorant', val], ['leagueOfLegends', lol]]) {
  test(`${key}: automatic reveal waits for exact acknowledgements and skips manual reveals`, () => {
    let game = enable(create(), key);
    const ids = phantomStatus(game, key).rows.map(r => r.id);
    game = reveal(game, key, ids[1]);
    game = phantomAction(game, key, '', 'start');
    assert.equal(game.phantom.deadline, 0);
    assert.equal(acknowledgePhantom(game, 'old'), game);
    assert.equal(phantomAction(game, key, '', 'tick', '', 90000), game);
    game = ack(game, 1000);
    assert.equal(game.phantom.deadline, 16000);
    assert.equal(phantomAction(game, key, '', 'tick', '', 15999), game);
    game = phantomAction(game, key, '', 'tick', '', 90000);
    assert.deepEqual(game.phantom.revealed, [ids[1], ids[0]]);
    assert.equal(game.phantom.deadline, 0);
    assert.equal(phantomAction(game, key, '', 'tick', '', 190000), game);
    game = ack(game, 190000, () => 0.99999);
    assert.equal(game.phantom.deadline, 220000);
    game = phantomAction(game, key, '', 'next');
    assert.equal(game.phantom.running, false);
    assert.equal(game.phantom.deadline, 0);
    game = ack(game);
    while (phantomStatus(game, key).next) game = ack(phantomAction(game, key, '', 'next'));
    assert.equal(game.phantom.revealed.length, ids.length);
    assert.equal(phantomAction(game, key, '', 'start'), game);
  });
}

test('writer failure preserves pending output, stops automation and ignores stale acknowledgements', () => {
  let game = ack(phantomAction(enable(val(), 'valorant'), 'valorant', '', 'start'));
  game = phantomAction(game, 'valorant', '', 'tick', '', 20000);
  const ticket = game.phantom.pending;
  game = pausePhantom(game, 'Writer unavailable');
  assert.equal(game.phantom.pending, ticket);
  assert.equal(game.phantom.revealed.length, 1);
  game = ack(game, 30000);
  assert.equal(game.phantom.deadline, 0);
  assert.equal(game.phantom.running, false);
  game = phantomAction(game, 'valorant', '', 'hide');
  assert.equal(acknowledgePhantom(game, ticket), game);
});

test('corrections freeze on-air picks, pause, and require explicit application', () => {
  let game = reveal(enable(val(), 'valorant'), 'valorant', 'pick1');
  game = ack(phantomAction(game, 'valorant', '', 'start'));
  game = { ...game, bo3: { ...game.bo3, pick1: 'Breeze' } };
  const status = phantomStatus(game, 'valorant');
  assert.equal(status.running, false);
  assert.equal(status.changes.length, 1);
  assert.equal(status.next, '');
  assert.equal(phantomBroadcast(game, 'valorant').bo3.pick1, 'Haven');
  game = ack(phantomAction(game, 'valorant', '', 'apply'));
  assert.equal(phantomBroadcast(game, 'valorant').bo3.pick1, 'Breeze');
  assert.equal(game.phantom.running, false);
  game = { ...game, banSwap: true };
  game = ack(phantomAction(game, 'valorant', '', 'apply'));
  assert.equal(game.phantom.revealed.length, 0, 'reassigned slots must be revealed again');
});

test('League corrections retain the original champion and honor withdrawn Hub roles', () => {
  let game = { ...lol(), hubDraft: { mode: 'live', matchId: 'match' }, hubPresentation: { rolesRevealed: true, activeSelection: false } };
  game = reveal(enable(game, 'leagueOfLegends'), 'leagueOfLegends', 'ORDER:pick:0');
  const index = leagueDraftSteps('standard').find(s => s.side === 'ORDER' && s.action === 'pick').index;
  const selections = [...game.draft.selections]; selections[index] = 'Correction';
  game = { ...game, draft: { ...game.draft, selections }, hubPresentation: { ...game.hubPresentation, rolesRevealed: false } };
  let output = buildLeagueOverlayState(phantomBroadcast(game, 'leagueOfLegends'), {}, {});
  assert.equal(output.draft.bluePicks[0], `Champion ${index}`);
  assert.equal(output.draft.hub.rolesRevealed, false);
  game = ack(phantomAction(game, 'leagueOfLegends', '', 'apply'));
  output = buildLeagueOverlayState(phantomBroadcast(game, 'leagueOfLegends'), {}, {});
  assert.equal(output.draft.bluePicks[0], 'Correction');
});

test('reset scopes differ from corrections; VAL score progression retains the veto', () => {
  const game = reveal(enable(val(), 'valorant'), 'valorant', 'ban1');
  assert.equal(phantomStatus({ ...game, savedGames: [{ home: '13', away: '4' }] }, 'valorant').count, 1);
  for (const [changed, key, match] of [[{ ...game, bestOf: 'Bo5' }, 'valorant', ''], [game, 'valorant', 'new match'],
    [{ ...reveal(enable(lol(), 'leagueOfLegends'), 'leagueOfLegends', 'ORDER:ban:0'), currentGame: 2 }, 'leagueOfLegends', '']]) {
    const reset = reconcilePhantom(changed, key, match);
    assert.equal(reset.phantom.enabled, true);
    assert.equal(reset.phantom.revealed.length, 0);
    assert.equal(reset.phantom.running, false);
  }
  assert.equal(resetPhantom(game.phantom).enabled, true);
});

test('League role corrections preserve staged order until explicitly applied', () => {
  const source = lol();
  source.draft.bluePickOrder = [2, 1, 0, 3, 4];
  let game = reveal(enable(source, 'leagueOfLegends'), 'leagueOfLegends', 'ORDER:pick:0');
  game = ack(phantomAction(game, 'leagueOfLegends', '', 'start'));
  game = { ...game, draft: { ...game.draft, bluePickOrder: [1, 2, 0, 3, 4] } };
  assert.equal(phantomStatus(game, 'leagueOfLegends').running, false);
  assert.equal(phantomStatus(game, 'leagueOfLegends').changes[0].label, 'Blue role order');
  assert.deepEqual(phantomBroadcast(game, 'leagueOfLegends').draft.bluePickOrder, [2, 1, 0, 3, 4]);
  game = ack(phantomAction(game, 'leagueOfLegends', '', 'apply'));
  assert.deepEqual(phantomBroadcast(game, 'leagueOfLegends').draft.bluePickOrder, [1, 2, 0, 3, 4]);
  assert.equal(game.phantom.revealed.length, 1);
  assert.equal(game.phantom.running, false);
});

test('reload and handoff retain revealed content while incompatible prototypes default off', () => {
  let game = reveal(enable(val(), 'valorant'), 'valorant', 'ban1');
  game = ack(phantomAction(game, 'valorant', '', 'start'));
  const restored = restorePhantom(game.phantom);
  assert.deepEqual(restored.revealed, ['ban1']);
  assert.equal(restored.deadline, 0);
  assert.equal(restored.running, false);
  assert.equal(restored.pending, '');
  assert.equal(restorePhantom({ enabled: true, count: 5 }).enabled, false);
  assert.equal(restorePhantom(null).enabled, false);
  assert.equal(revealDelay(() => 0), 15000);
  assert.equal(revealDelay(() => 0.99999), 30000);
});

test('timers are workspace-level and independent of navigation or the other game', () => {
  const state = { general: { matches: [] }, valorant: val(), leagueOfLegends: lol(), section: 'sponsors' };
  const match = '[null,null,null]';
  state.valorant = phantomAction(state.valorant, 'valorant', match, 'enable');
  state.valorant = ack(state.valorant);
  state.valorant = phantomAction(state.valorant, 'valorant', match, 'start');
  let next = acknowledgePhantoms(state, { valorant: state.valorant.phantom.pending }, 1000, () => 0);
  next = tickPhantoms(next, 16000);
  assert.deepEqual(next.valorant.phantom.revealed, ['ban1']);
  assert.equal(next.leagueOfLegends, state.leagueOfLegends);
  assert.equal(next.section, 'sponsors');
});
