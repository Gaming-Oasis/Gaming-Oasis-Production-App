import assert from "node:assert/strict";
import test from "node:test";
import { acceptBracketSnapshot, bracketEventPath, bracketEventUrl, bracketSections, bracketSourceFromMatch, bracketStagePath, buildBracketOverlayState, emptyBracketState, hydrateBracketState, isBracketOverlayState, layoutBracket, normalizeBracketSnapshot, parseBracketEventUrl, parseBracketProxyPath } from "../lib/bracket.mjs";
import { loadBracketSnapshot, readBracketResource, refreshBracketSnapshot } from "../lib/bracket-client.mjs";
import { startHubPolling } from "../lib/hub-polling.mjs";
import { bracketFixture, doubleBracketFixture } from "./fixtures/bracket-fixture.mjs";

const normalize = fixture => normalizeBracketSnapshot(fixture.detail, fixture.workspace, fixture.source);
const loaded = fixture => ({ ...emptyBracketState(), snapshot: normalize(fixture) });

test("public event URLs and proxy routes cannot address another host or private endpoint", () => {
  const fixture = bracketFixture();
  assert.deepEqual(parseBracketEventUrl("https://hub.gamingoasis.gg/portal/sel/seasons/fall-2026/events/rocket-league?tab=stage-test"), { ...fixture.source, stageId: "" });
  for (const url of ["https://hub.gamingoasis.gg.evil/portal/a/seasons/b/events/c", "http://hub.gamingoasis.gg/portal/a/seasons/b/events/c", "https://user@hub.gamingoasis.gg/portal/a/seasons/b/events/c", "https://hub.gamingoasis.gg/admin/events/a"]) assert.throws(() => parseBracketEventUrl(url));
  for (const path of ["/api/portal/leagues/a/seasons/b/events/%2f%2fhost", "/api/portal/leagues/a/seasons/b/events/c?url=https://evil", "/api/portal/leagues/a/seasons/b/events/c/stages/not-a-uuid", "/api/me/events"]) assert.equal(parseBracketProxyPath(path), null);
  assert.deepEqual(bracketSourceFromMatch({ ...fixture.detail, stage: fixture.workspace.stage }), fixture.source);
});

test("normalization preserves actual qualifier cutoff, feeder labels, seed separation and series scores", () => {
  const fixture = bracketFixture();
  fixture.workspace.rounds[0].matches.reverse();
  fixture.workspace.rounds[0].matches[0].privateNotes = "private";
  const snapshot = normalize(fixture);
  assert.deepEqual(snapshot.rounds.map(round => round.matches.length), [16, 8, 4]);
  assert.equal(snapshot.rounds[0].matches[0].team1.name, "University 1");
  assert.equal(snapshot.rounds[0].matches[0].team1.seed, 1);
  assert.equal(snapshot.rounds[0].matches[0].team1.score, 3);
  assert.equal(snapshot.rounds[1].matches[0].team1.name, "Winner of M1");
  assert.ok(!JSON.stringify(snapshot).includes("privateNotes"));
  assert.equal(snapshot.rounds.length, 3, "no invented semifinals or championship final");
});

test("every match in large and partial brackets is reachable; pages never overflow or overlap", () => {
  for (const [size, cutoff] of [[4, 1], [16, 1], [32, 4], [64, 1], [128, 8]]) {
    const state = loaded(bracketFixture(size, cutoff));
    const covered = new Set();
    for (let roundStart = 0; roundStart < state.snapshot.rounds.length; roundStart++) {
      const initial = layoutBracket({ ...state, roundStart });
      for (let page = 0; page < initial.pageCount; page++) {
        const layout = layoutBracket({ ...state, roundStart, page });
        assert.ok(layout.headers.length <= 4);
        for (const card of layout.cards) {
          covered.add(card.match.id);
          assert.ok(card.x >= 96 && card.x + card.width <= 1824);
          assert.ok(card.y >= 284 && card.y + card.height <= 964);
          const peers = layout.cards.filter(other => other.column === card.column && other.y < card.y);
          assert.ok(peers.every(other => other.y + other.height <= card.y));
        }
      }
    }
    assert.equal(covered.size, state.snapshot.rounds.flatMap(round => round.matches).length);
  }
});

test("focused qualifier page follows four to two to one and uses only actual feeder connectors", () => {
  const state = loaded(bracketFixture());
  const layout = layoutBracket(state);
  assert.deepEqual(layout.headers.map((_, index) => layout.cards.filter(card => card.column === index).length), [4, 2, 1]);
  assert.equal(layout.connectors.length, 6);
  assert.equal(layout.pageCount, 4);
  assert.equal(layout.canOverview, false);
  const overview = layoutBracket({ ...loaded(bracketFixture(16, 1)), view: "overview" });
  assert.equal(overview.overview, true);
  assert.equal(overview.cards.length, 15);
});

test("double elimination partitions loser feeders, third place, final and reset without a synthetic champion", () => {
  const fixture = doubleBracketFixture();
  fixture.workspace.rounds[0].matches[0].isBye = true;
  fixture.workspace.rounds[0].matches[0].team2 = { teamId: null };
  const state = loaded(fixture);
  assert.deepEqual(bracketSections(state.snapshot).map(section => section.id), ["winners", "losers", "finals", "third_place"]);
  const losers = state.snapshot.rounds.find(round => round.section === "losers");
  assert.equal(losers.matches[0].team1.name, "Bye");
  assert.equal(losers.matches[0].team2.name, "Loser of M2");
  assert.equal(state.snapshot.rounds[0].matches[0].team2.name, "Bye");
  assert.equal(layoutBracket({ ...state, section: "finals" }).cards.length, 2);
});

test("hold, identical payloads and old-source replies cannot replace the accepted snapshot", () => {
  const fixture = bracketFixture();
  const state = loaded(fixture);
  assert.strictEqual(acceptBracketSnapshot(state, structuredClone(state.snapshot), fixture.source), state);
  const changed = structuredClone(state.snapshot);
  changed.rounds[0].matches[0].team1.score = 2;
  const held = { ...state, hold: true };
  assert.strictEqual(acceptBracketSnapshot(held, changed, fixture.source), held);
  assert.strictEqual(acceptBracketSnapshot(state, changed, { ...fixture.source, stageId: "22222222-2222-4222-8222-222222222222" }), state);
  assert.equal(acceptBracketSnapshot(state, changed, fixture.source).snapshot.rounds[0].matches[0].team1.score, 2);
  const reorderedSource = { stageId: fixture.source.stageId, eventSlug: fixture.source.eventSlug, seasonSlug: fixture.source.seasonSlug, leagueSlug: fixture.source.leagueSlug };
  assert.equal(acceptBracketSnapshot(state, changed, reorderedSource).snapshot.rounds[0].matches[0].team1.score, 2);
});

test("reload retains hold/framing and corrupt snapshots hydrate safely", () => {
  const state = { ...loaded(bracketFixture()), hold: true, autoRotate: true, section: "losers", roundStart: 1, page: 2, background: "solid" };
  assert.deepEqual(hydrateBracketState(JSON.parse(JSON.stringify(state))), state);
  assert.deepEqual(hydrateBracketState(undefined), emptyBracketState());
  for (const corrupt of [value => { value.rounds[0].matches[0].team1.score = -1; }, value => { value.rounds[0].matches[0].team1 = null; }, value => { value.rounds[0].matches.push(value.rounds[0].matches[0]); }]) {
    const snapshot = structuredClone(state.snapshot); corrupt(snapshot);
    assert.equal(hydrateBracketState({ snapshot }).snapshot, null);
    assert.equal(isBracketOverlayState({ ...buildBracketOverlayState(state), snapshot }), false);
  }
});

test("forfeits, reverts, long names and missing artwork stay public and valid", () => {
  const fixture = bracketFixture();
  const first = fixture.workspace.rounds[0].matches[0];
  first.matchOutcome = "forfeit"; first.team1.logo = "javascript:alert(1)"; first.team1.name = "A".repeat(400);
  let state = loaded(fixture);
  assert.equal(state.snapshot.rounds[0].matches[0].outcome, "forfeit");
  assert.equal(state.snapshot.rounds[0].matches[0].team1.logo, "");
  assert.equal(isBracketOverlayState(buildBracketOverlayState(state)), true);
  first.team1.score = null; first.team1.result = null;
  state = acceptBracketSnapshot(state, normalize(fixture), fixture.source);
  assert.equal(state.snapshot.rounds[0].matches[0].team1.score, null);
  assert.equal(state.snapshot.rounds[0].matches[0].team1.result, "");
});

test("wrong stage, unsupported formats and duplicate matches reject without mutation", () => {
  const fixture = bracketFixture();
  assert.throws(() => normalizeBracketSnapshot(fixture.detail, fixture.workspace, { ...fixture.source, stageId: "22222222-2222-4222-8222-222222222222" }));
  fixture.workspace.stage.type = "swiss"; assert.throws(() => normalize(fixture));
  fixture.workspace.stage.type = "single_elimination";
  fixture.workspace.rounds[0].matches.push(fixture.workspace.rounds[0].matches[0]); assert.throws(() => normalize(fixture));
});

test("bounded client loads normalized event/stage data and propagates failure/cancellation", async () => {
  const fixture = bracketFixture();
  const fetchImpl = async url => Response.json(url.endsWith(bracketEventPath(fixture.source)) ? fixture.detail : fixture.workspace);
  assert.deepEqual(await loadBracketSnapshot(fixture.source, undefined, fetchImpl), normalize(fixture));
  await assert.rejects(readBracketResource("/test", undefined, async () => new Response("x".repeat(2_000_001))), /too large/);
  await assert.rejects(readBracketResource("/test", undefined, async () => Response.json({ error: "Hub unavailable" }, { status: 502 })), /Hub unavailable/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(readBracketResource("/test", controller.signal, async (_url, options) => { options.signal.throwIfAborted(); }), /abort/i);
});

test("live refreshes request only the stage and keep the loaded league and event details", async () => {
  const fixture = bracketFixture();
  const loadedSnapshot = normalize(fixture);
  fixture.workspace.rounds[0].matches[0].team1.score = 2;
  const requests = [];
  const refreshed = await refreshBracketSnapshot(loadedSnapshot, undefined, async url => { requests.push(url); return Response.json(fixture.workspace); });
  assert.deepEqual(requests, [`http://127.0.0.1:4877${bracketStagePath(fixture.source)}`]);
  assert.deepEqual(refreshed, normalize(fixture));
  assert.equal(refreshed.rounds[0].matches[0].team1.score, 2);
  assert.notDeepEqual(acceptBracketSnapshot(loaded(bracketFixture()), refreshed, fixture.source).snapshot, loadedSnapshot);
});

test("the qualification marker sits only under the stage's last published round", () => {
  const lcq = layoutBracket(loaded(bracketFixture()));
  assert.equal(lcq.qualifier?.match.id, lcq.rounds.at(-1).matches[0].id, "LCQ page ends on its cutoff round");
  const deep = loaded(bracketFixture(128, 1));
  assert.equal(layoutBracket(deep).headers.at(-1).label, "Round of 16");
  assert.equal(layoutBracket(deep).qualifier, null, "a window that stops at the Round of 16 has no qualifier");
  const final = layoutBracket({ ...deep, roundStart: 3 });
  assert.equal(final.qualifier?.match.id, deep.snapshot.rounds.at(-1).matches[0].id);
  const double = loaded(doubleBracketFixture());
  for (const section of ["winners", "losers", "third_place"]) assert.equal(layoutBracket({ ...double, section }).qualifier, null, section);
  assert.equal(layoutBracket({ ...double, section: "finals" }).qualifier?.match.id, "f12");
});

test("a loaded source restores the public event link it was read from", () => {
  const source = bracketFixture().source;
  assert.equal(bracketEventUrl(source), "https://hub.gamingoasis.gg/portal/sel/seasons/fall-2026/events/rocket-league");
  assert.deepEqual(parseBracketEventUrl(bracketEventUrl(source)), { ...source, stageId: "" });
});

test("poller stops late responses on Hold/handoff, resumes immediately and backs off", async () => {
  let finish;
  const accepted = [], timers = [];
  const poller = startHubPolling({ load: () => new Promise(resolve => { finish = resolve; }), accept: value => accepted.push(value), status() {}, schedule: (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; }, cancel() {} });
  poller.stop(); finish("old source"); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(accepted, []);
  let requests = 0;
  const retry = startHubPolling({ load: async () => { requests++; throw new Error("offline"); }, accept() {}, status() {}, schedule: (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; }, cancel() {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests, 1); assert.equal(timers.at(-1).ms, 4000);
  for (let index = 0; index < 4; index++) { timers.at(-1).fn(); await new Promise(resolve => setImmediate(resolve)); }
  assert.equal(timers.at(-1).ms, 30000); retry.stop();
});
