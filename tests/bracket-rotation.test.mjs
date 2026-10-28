import assert from "node:assert/strict";
import test from "node:test";
import { buildBracketOverlayState, emptyBracketState, hydrateBracketState, isBracketOverlayState, layoutBracket, normalizeBracketSnapshot } from "../lib/bracket.mjs";
import { bracketFramingKey, bracketRotationFrames, nextBracketFrame, startBracketRotation } from "../lib/bracket-rotation.mjs";
import { bracketFixture, doubleBracketFixture } from "./fixtures/bracket-fixture.mjs";

const loaded = fixture => ({ ...emptyBracketState(), autoRotate: true, snapshot: normalizeBracketSnapshot(fixture.detail, fixture.workspace, fixture.source) });

test("rotation covers every published match, including deep windows and disconnected feeders", () => {
  for (const fixture of [bracketFixture(4, 1), bracketFixture(), bracketFixture(128, 1), doubleBracketFixture()]) {
    for (const view of ["focus", "overview"]) {
      const value = { ...loaded(fixture), view };
      value.snapshot.rounds.at(-1).matches[0].team1.feederId = "unpublished-feeder";
      const frames = bracketRotationFrames(value), covered = new Set();
      for (const frame of frames) for (const card of layoutBracket({ ...value, ...frame }).cards) covered.add(card.match.id);
      assert.deepEqual([...covered].sort(), value.snapshot.rounds.flatMap(round => round.matches.map(match => match.id)).sort());
      assert.equal(new Set(frames.map(frame => bracketFramingKey({ ...value, ...frame }))).size, frames.length);
    }
  }
});

test("a partial LCQ rotates its four pages, wraps, and preserves Hold and background", () => {
  const initial = { ...loaded(bracketFixture()), hold: true, background: "solid" };
  assert.equal(bracketRotationFrames(initial).length, 4, "no redundant windows after the published cutoff");
  let current = initial;
  for (const page of [1, 2, 3, 0]) {
    current = nextBracketFrame(current);
    assert.equal(current.page, page);
    assert.equal(current.roundStart, 0);
    assert.equal(current.hold, true);
    assert.equal(current.background, "solid");
    assert.equal(current.autoRotate, true);
    assert.strictEqual(current.snapshot, initial.snapshot);
  }
});

test("double elimination rotates winners, losers, finals/reset and third place", () => {
  let state = loaded(doubleBracketFixture());
  assert.deepEqual(bracketRotationFrames(state).map(frame => frame.section), ["winners", "losers", "finals", "third_place"]);
  for (const section of ["losers", "finals", "third_place", "winners"]) {
    state = nextBracketFrame(state);
    assert.equal(state.section, section);
  }
});

test("single frames stay unchanged and a manual later-round window rejoins the loop", () => {
  const only = loaded(bracketFixture(4, 1));
  assert.strictEqual(nextBracketFrame(only), only);
  const empty = emptyBracketState();
  assert.strictEqual(nextBracketFrame(empty), empty);
  const manual = { ...loaded(doubleBracketFixture()), roundStart: 2, page: 0 };
  assert.equal(nextBracketFrame(manual).section, "losers");
  const overview = { ...loaded(doubleBracketFixture()), view: "overview" };
  assert.ok(bracketRotationFrames(overview).every(frame => frame.view === "overview" && frame.roundStart === 0 && frame.page === 0));
});

test("rotation defaults off for old drafts and its preference survives reload", () => {
  const state = loaded(bracketFixture());
  assert.equal(hydrateBracketState(JSON.parse(JSON.stringify(state))).autoRotate, true);
  const legacy = buildBracketOverlayState(state); delete legacy.autoRotate;
  assert.equal(isBracketOverlayState(legacy), true);
  assert.equal(hydrateBracketState(legacy).autoRotate, false);
  assert.equal(isBracketOverlayState({ ...legacy, autoRotate: "yes" }), false);
  assert.equal(hydrateBracketState(undefined).autoRotate, false);
});

function clockedRotation() {
  let clock = 0, pending, stopped = false;
  const model = { enabled: true, value: loaded(bracketFixture()), publishedKey: "" };
  const advances = [];
  const rotation = startBracketRotation({ read: () => model, now: () => clock,
    advance: key => { advances.push(key); model.value = nextBracketFrame(model.value); },
    schedule: fn => { pending = fn; return fn; }, cancel: () => { pending = null; stopped = true; } });
  return { model, advances, rotation, acknowledge() { model.publishedKey = bracketFramingKey(model.value); },
    tick(ms = 0) { clock += ms; const callback = pending; pending = null; callback?.(); }, get stopped() { return stopped; } };
}

test("each page waits ten seconds after publication, with no catch-up during writer failures", () => {
  const clock = clockedRotation();
  clock.tick(30_000); assert.equal(clock.advances.length, 0);
  clock.acknowledge(); clock.tick();
  clock.tick(9_999); assert.equal(clock.advances.length, 0);
  clock.tick(1); assert.equal(clock.advances.length, 1);
  clock.tick(40_000); assert.equal(clock.advances.length, 1, "pending page must be accepted before rotating again");
  clock.acknowledge(); clock.tick();
  clock.tick(10_000); assert.equal(clock.advances.length, 2);
  clock.model.publishedKey = ""; clock.tick(100_000);
  assert.equal(clock.advances.length, 2);
  clock.rotation.stop();
});

test("score imports and Hold do not restart rotation; manual framing does", () => {
  const clock = clockedRotation(); clock.acknowledge(); clock.tick();
  clock.tick(5_000);
  clock.model.value = structuredClone(clock.model.value);
  clock.model.value.snapshot.rounds[0].matches[0].team1.score = 2;
  clock.model.value.hold = true;
  clock.tick(5_000); assert.equal(clock.advances.length, 1);
  clock.model.value = { ...clock.model.value, page: 2 };
  clock.acknowledge(); clock.tick();
  clock.tick(9_999); assert.equal(clock.advances.length, 1);
  clock.tick(1); assert.equal(clock.model.value.page, 3);
  clock.rotation.stop();
});

test("handoff, new sources, disabling rotation and teardown discard old deadlines", () => {
  const clock = clockedRotation(); clock.acknowledge(); clock.tick();
  clock.tick(5_000); clock.model.enabled = false; clock.tick(30_000);
  assert.equal(clock.advances.length, 0);
  clock.model.enabled = true; clock.tick();
  clock.tick(9_999); assert.equal(clock.advances.length, 0);
  clock.model.value = { ...clock.model.value, snapshot: structuredClone(clock.model.value.snapshot) };
  clock.model.value.snapshot.source.stageId = "22222222-2222-4222-8222-222222222222";
  clock.tick(30_000); assert.equal(clock.advances.length, 0);
  clock.acknowledge(); clock.tick();
  clock.model.value.autoRotate = false; clock.tick(30_000);
  assert.equal(clock.advances.length, 0);
  clock.rotation.stop(); assert.equal(clock.stopped, true);
  clock.tick(100_000); assert.equal(clock.advances.length, 0);
});
