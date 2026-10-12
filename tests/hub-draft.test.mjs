import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { acceptHubCollection, clearHubGame, emptyHubSource, hubEligibility, hubIdentity, hubLeagueResultMetadata, hydrateHubSource, normalizeHubCollection, projectHubGame, reconcileHubMatch, resetHubSource, selectHubSession, setHubMode } from "../lib/hub-draft.mjs";
import { buildLeagueOverlayState, createLeagueDraftState, draftSlots } from "../lib/league-of-legends.mjs";
import { leagueFearlessChampions } from "../lib/league-overlay.mjs";
import { buildValorantFields, getValorantCurrentSides } from "../lib/valorant.mjs";
import { startHubPolling } from "../lib/hub-polling.mjs";

const names = ["league-01-live-pick-ban", "league-02-one-team-confirmed", "league-03-revealed-lineups", "league-04-game-2-fearless",
  "valorant-01-live-map-veto", "valorant-02-maps-ready-agents-pending", "valorant-03-game-1-reported"];
const payloads = await Promise.all(names.map(async (name) => JSON.parse(await readFile(new URL(`fixtures/hub-drafts/${name}.match.json`, import.meta.url), "utf8"))));
const matchFor = (p) => ({ id: p.match.id, syncedId: p.match.id, hubIdentity: hubIdentity(p) });
const normalize = (p) => normalizeHubCollection(p, matchFor(p));
const collections = payloads.map(normalize);
const league = () => ({ hubDraft: { mode: "live", matchId: "demo-match-league", collection: null }, bestOf: "Bo3", draftMode: "fearless", currentGame: 1,
  blueTeam: "team1", firstPickTeam: "", draft: createLeagueDraftState(), confirmedGames: [], results: [{ winner: "" }], scoreboard: {} });
const valorant = () => ({ hubDraft: { mode: "live", matchId: "demo-match-valorant", collection: null }, bestOf: "Bo3", flipSides: false, banSwap: false,
  games: Array.from({ length: 5 }, () => ({ home: "", away: "" })), savedGames: [],
  bo3: { ban1: "", ban2: "", pick1: "", pick2: "", ban3: "", ban4: "", decider: "", side1: "", side2: "", side3: "" },
  bo5: { ban1: "", ban2: "", pick1: "", pick2: "", pick3: "", pick4: "", decider: "", side1: "", side2: "", side3: "", side4: "", side5: "" } });

test("all seven public examples normalize without roster or private fields", () => {
  assert.deepEqual(collections.map((c) => c.revision), [12, 26, 27, 30, 5, 14, 17]);
  assert.ok(collections.every((c) => !JSON.stringify(c).includes("rosters")));
  assert.deepEqual(emptyHubSource(), { mode: "manual", matchId: "", collection: null });
});

test("synced Match 1 automatically enables Live for its game, including existing workspaces", () => {
  for (const [key, createGame, payload] of [["leagueOfLegends", league, payloads[0]], ["valorant", valorant, payloads[4]]]) {
    const game = { ...createGame(), hubDraft: emptyHubSource() };
    const match = matchFor(payload);
    const live = reconcileHubMatch(game, key, match);
    assert.deepEqual(live.hubDraft, { mode: "live", matchId: match.id, collection: null });
    assert.strictEqual(reconcileHubMatch(live, key, match), live, "unchanged match must not cause another production write");
    assert.strictEqual(live.results, game.results);
    assert.strictEqual(live.games, game.games);
    assert.strictEqual(live.savedGames, game.savedGames);
    assert.strictEqual(live.confirmedGames, game.confirmedGames);
  }
});

test("missing, unsynced, and other-game match data cannot enable Live", () => {
  for (const [key, createGame, payload, other] of [["leagueOfLegends", league, payloads[0], payloads[4]], ["valorant", valorant, payloads[4], payloads[0]]]) {
    const game = { ...createGame(), hubDraft: emptyHubSource() };
    for (const match of [{ id: "", syncedId: "", hubIdentity: null }, { ...matchFor(payload), id: "new-unsynced-match" },
      { ...matchFor(payload), hubIdentity: null }, matchFor(other)]) {
      assert.strictEqual(reconcileHubMatch(game, key, match), game);
    }
  }
});

test("turning Live off is retained across reconciliation and reload, even before the first response", () => {
  for (const [key, createGame, payload, collection] of [["leagueOfLegends", league, payloads[0], collections[0]], ["valorant", valorant, payloads[4], collections[4]]]) {
    const match = matchFor(payload);
    const live = reconcileHubMatch({ ...createGame(), hubDraft: emptyHubSource() }, key, match);
    for (const game of [live, acceptHubCollection(live, key, collection)]) {
      const off = setHubMode(game, key, "manual", match.id);
      assert.strictEqual(reconcileHubMatch(off, key, { ...match }), off);
      const reloaded = { ...off, hubDraft: hydrateHubSource(JSON.parse(JSON.stringify(off.hubDraft))) };
      assert.strictEqual(reconcileHubMatch(reloaded, key, match), reloaded);
      assert.strictEqual(acceptHubCollection(off, key, collection), off, "late replies must not override Off");
      assert.equal(setHubMode(off, key, "live", match.id).hubDraft.mode, "live");
    }
  }
});

test("an operator reset stays Off through reconciliation and reload until explicitly re-enabled", () => {
  const match = matchFor(payloads[2]);
  const imported = acceptHubCollection(league(), "leagueOfLegends", collections[2]);
  for (const mode of ["live", "manual"]) {
    const game = setHubMode(imported, "leagueOfLegends", mode, match.id);
    const reset = { ...clearHubGame(game, "leagueOfLegends"), hubDraft: resetHubSource(match, "leagueOfLegends") };
    assert.deepEqual(reset.hubDraft, { mode: "manual", matchId: match.id, collection: null });
    assert.strictEqual(reconcileHubMatch(reset, "leagueOfLegends", match), reset);
    assert.ok(reset.draft.selections.every((selection) => selection === ""));
    assert.equal(reset.hubPresentation, undefined);
    assert.strictEqual(acceptHubCollection(reset, "leagueOfLegends", collections[2]), reset, "reject late reply from before reset");
    const reloaded = { ...reset, hubDraft: hydrateHubSource(JSON.parse(JSON.stringify(reset.hubDraft))) };
    assert.strictEqual(reconcileHubMatch(reloaded, "leagueOfLegends", match), reloaded);
    assert.strictEqual(acceptHubCollection(reloaded, "leagueOfLegends", collections[2]), reloaded);
    const resumed = setHubMode(reloaded, "leagueOfLegends", "live", match.id);
    assert.equal(acceptHubCollection(resumed, "leagueOfLegends", collections[2]).draft.currentStep, 20);
    const nextMatch = { ...match, id: "new-match", syncedId: "new-match" };
    assert.equal(reconcileHubMatch(reloaded, "leagueOfLegends", nextMatch).hubDraft.mode, "live");
  }
  assert.deepEqual(resetHubSource({ ...match, id: "not-synced" }, "leagueOfLegends"), emptyHubSource());
  assert.deepEqual(resetHubSource(matchFor(payloads[4]), "leagueOfLegends"), emptyHubSource());
});

test("a different synced Match 1 enables Live and clears the old import without publishing scores", () => {
  for (const [key, createGame, payload, collection] of [["leagueOfLegends", league, payloads[0], collections[0]], ["valorant", valorant, payloads[4], collections[4]]]) {
    const old = setHubMode(acceptHubCollection(createGame(), key, collection), key, "manual", collection.matchId);
    const match = { ...matchFor(payload), id: "replacement-match", syncedId: "replacement-match" };
    const next = reconcileHubMatch(old, key, match);
    assert.deepEqual(next.hubDraft, { mode: "live", matchId: match.id, collection: null });
    if (key === "valorant") {
      assert.ok(Object.values(next.bo3).every((value) => value === ""));
      assert.strictEqual(next.games, old.games);
      assert.strictEqual(next.savedGames, old.savedGames);
    } else {
      assert.ok(next.draft.selections.every((value) => value === ""));
      assert.deepEqual(next.results.map((row) => row.winner), old.results.map((row) => row.winner));
    }
    assert.strictEqual(acceptHubCollection(next, key, collection), next, "late old-match reply must be discarded");
  }
});

test("partial League picks and bans follow their owners and chronological slots", () => {
  const game = acceptHubCollection(league(), "leagueOfLegends", collections[0]);
  assert.equal(game.draft.currentStep, 9);
  assert.deepEqual(draftSlots(game.draft, game.draftMode).bluePicks, ["Aatrox", "", "", "", ""]);
  assert.equal(game.hubPresentation.activeSelection, true);
  assert.equal(game.hubPresentation.rolesRevealed, false);
  assert.equal(game.draft.timerRunning, false);
});

test("one confirmation never exposes lineup assignments, even if mistakenly supplied", () => {
  const payload = structuredClone(payloads[1]);
  for (const session of [payload.draft.session, payload.draft.currentSession, ...payload.draft.gameSessions]) {
    session.state.league.assignments = payloads[2].draft.session.state.league.assignments;
    session.assignmentPlayers = payloads[2].draft.session.assignmentPlayers;
  }
  const session = normalize(payload).sessions[0];
  assert.equal(session.revealed, false);
  assert.deepEqual(session.lineups, { team1: [], team2: [] });
  assert.ok(!JSON.stringify(session).includes("Alex A"));
});

test("both confirmations map roles to picks; missing records never guess roster names", () => {
  const payload = structuredClone(payloads[2]);
  for (const s of [payload.draft.session, payload.draft.currentSession, ...payload.draft.gameSessions]) s.assignmentPlayers = [];
  const c = normalize(payload);
  const game = acceptHubCollection(league(), "leagueOfLegends", c);
  assert.deepEqual(game.draft.bluePickOrder, [0, 3, 1, 2, 4]);
  assert.equal(c.sessions[0].lineups.team1[0].player, "Player unavailable");
  assert.equal(game.hubPresentation.rolesRevealed, true);
  assert.equal(game.hubPresentation.activeSelection, false);
});

test("Blue/Red is independent of first pick and Match 1 slots", () => {
  const payload = structuredClone(payloads[0]);
  for (const s of [payload.draft.session, payload.draft.currentSession, ...payload.draft.gameSessions]) {
    s.state.league.sides = { blue: payload.match.team2.teamId, red: payload.match.team1.teamId };
    [s.snapshot.team1Id, s.snapshot.team2Id] = [s.snapshot.team2Id, s.snapshot.team1Id];
  }
  const game = acceptHubCollection(league(), "leagueOfLegends", normalize(payload));
  assert.equal(game.blueTeam, "team2");
  assert.equal(game.firstPickTeam, "team1");
  assert.equal(game.draft.firstPickSide, "CHAOS");
  assert.equal(draftSlots(game.draft, game.draftMode).redPicks[0], "Aatrox");
});

test("Hub game 2 is held until manual results are published, with no result writes", () => {
  const original = league();
  const game = acceptHubCollection(original, "leagueOfLegends", collections[3]);
  assert.equal(game.currentGame, 1);
  assert.equal(game.draft.currentStep, 20);
  assert.equal(game.results, original.results);
  assert.equal(game.confirmedGames, original.confirmedGames);
  const next = projectHubGame({ ...game, confirmedGames: [{ gameNumber: 1, winner: "team1" }] }, "leagueOfLegends");
  assert.equal(next.currentGame, 2);
  assert.equal(next.draft.currentStep, 0);
  assert.equal(next.hubPresentation.sidesReady, false);
  const overlay = buildLeagueOverlayState(next, {}, {});
  const pool = leagueFearlessChampions(overlay);
  assert.equal(pool.length, 10);
  assert.ok(pool.includes("Aatrox"));
  assert.ok(!pool.includes("Akali")); // previous ban is available again
});

test("missing next session clears the previous draft, and absent/reset collections clear all imports", () => {
  let game = acceptHubCollection(league(), "leagueOfLegends", collections[2]);
  game = projectHubGame({ ...game, confirmedGames: [{ gameNumber: 1, winner: "team1" }] }, "leagueOfLegends");
  assert.ok(game.draft.selections.every((value) => !value));
  assert.equal(game.hubPresentation.progress, "Waiting for Hub draft");
  const payload = structuredClone(payloads[3]);
  payload.draft = { required: false, collectionRevision: 31, currentGameIndex: null, session: null, currentSession: null, gameSessions: [] };
  game = acceptHubCollection(game, "leagueOfLegends", normalize(payload));
  assert.equal(game.hubDraft.collection.sessions.length, 0);
  assert.equal(game.confirmedGames.length, 1);
});

test("new revisions replace corrected/reverted sessions; older and identical polls do not rewrite state", () => {
  let game = acceptHubCollection(league(), "leagueOfLegends", collections[3]);
  assert.equal(acceptHubCollection(game, "leagueOfLegends", collections[2]), game);
  assert.equal(acceptHubCollection(game, "leagueOfLegends", structuredClone(collections[3])), game);
  const reverted = { ...collections[0], revision: 31 };
  game = acceptHubCollection(game, "leagueOfLegends", reverted);
  assert.equal(game.hubDraft.collection.sessions.length, 1);
  assert.equal(game.draft.currentStep, 9);
  assert.equal(game.hubPresentation.rolesRevealed, false);
});

test("Manual keeps the latest selections and rejects late responses; source changes drop imports", () => {
  const game = acceptHubCollection(league(), "leagueOfLegends", collections[2]);
  const manual = setHubMode(game, "leagueOfLegends", "manual", game.hubDraft.matchId);
  assert.equal(manual.draft, game.draft);
  assert.equal(manual.hubPresentation, undefined);
  assert.equal(acceptHubCollection(manual, "leagueOfLegends", collections[3]), manual);
  const restored = hydrateHubSource(JSON.parse(JSON.stringify(game.hubDraft)));
  assert.deepEqual(restored, game.hubDraft);
  assert.equal(hydrateHubSource({ mode: "live", collection: {} }).mode, "manual");
  assert.deepEqual(hydrateHubSource({ mode: "live", matchId: game.hubDraft.matchId, collection: null }),
    { mode: "live", matchId: game.hubDraft.matchId, collection: null }); // reload before the first successful request
  const cleared = clearHubGame(game, "leagueOfLegends");
  assert.equal(cleared.hubDraft.mode, "manual");
  assert.equal(cleared.confirmedGames, game.confirmedGames);
  assert.ok(cleared.draft.selections.every((s) => !s));
  const finished = { ...game, confirmedGames: [{ gameNumber: 1, winner: "team1", bluePicks: ["Aatrox"], redPicks: ["Ahri"] }] };
  const switched = clearHubGame(finished, "leagueOfLegends");
  assert.equal(switched.confirmedGames[0].winner, "team1");
  assert.deepEqual(leagueFearlessChampions(buildLeagueOverlayState(switched, {}, {})), []);
});

test("VALORANT always reads the series veto, including after game 1 reporting", () => {
  const original = valorant();
  const live = acceptHubCollection(original, "valorant", collections[4]);
  assert.deepEqual([live.bo3.ban1, live.bo3.ban2, live.bo3.pick1, live.bo3.pick2], ["Bind", "Breeze", "Ascent", ""]);
  const ready = acceptHubCollection(live, "valorant", collections[6]);
  assert.deepEqual([ready.bo3.pick1, ready.bo3.pick2, ready.bo3.decider], ["Ascent", "Haven", "Split"]);
  assert.deepEqual(getValorantCurrentSides(ready, 1), { one: "attack", two: "defense" });
  assert.deepEqual(getValorantCurrentSides(ready, 3), { one: "defense", two: "attack" });
  assert.equal(ready.games, original.games);
  assert.equal(ready.savedGames, original.savedGames);
  assert.equal(selectHubSession(ready.hubDraft.collection, 1).revealed, true);
  assert.equal(selectHubSession(ready.hubDraft.collection, 2).revealed, false);
  const fields = buildValorantFields(ready, {}, {}, []);
  assert.equal(fields.valbo3map1name, "ASCENT");
  assert.equal(fields.valseriesscore1, "0");
  assert.equal(fields.valscore1, "X - X");
});

test("VALORANT side-choice ownership and flip side are respected", () => {
  const c = structuredClone(collections[5]);
  c.veto.roles = { A: "team2", B: "team1" };
  c.veto.maps[0].choosingTeam = "team2"; c.veto.maps[0].side = "attack";
  const game = acceptHubCollection(valorant(), "valorant", c);
  assert.equal(game.banSwap, true);
  assert.deepEqual(getValorantCurrentSides(game, 1), { one: "defense", two: "attack" });
  assert.deepEqual(getValorantCurrentSides({ ...game, flipSides: true }, 1), { one: "attack", two: "defense" });
});

test("Bo5 maps/sides project without altering the legacy key set", () => {
  const payload = structuredClone(payloads[5]); payload.match.bestOf = 5;
  payload.draft.currentSession = null; payload.draft.gameSessions = [];
  const veto = payload.draft.session; veto.snapshot.bestOf = 5;
  veto.state.roles = { A: payload.match.team2.teamId, B: payload.match.team1.teamId };
  veto.history = veto.history.filter((action) => action.type === "ban").slice(0, 2)
    .map((action, index) => ({ ...action, teamId: veto.state.roles[index ? "B" : "A"] }));
  veto.state.maps = ["ascent", "haven", "icebox", "lotus", "split"].map((name, index) => ({
    mapNumber: index + 1, itemId: `demo-map-${name}`, pickedByTeamId: index === 4 ? null : veto.state.roles[index % 2 ? "B" : "A"],
    decider: index === 4, sideChoiceByTeamId: payload.match.team1.teamId, startingSide: "defense",
  })).reverse(); // input order must not decide draft slots
  const c = normalize(payload);
  const initial = valorant(); const game = acceptHubCollection(initial, "valorant", c);
  assert.equal(game.banSwap, true);
  assert.equal(game.bo5.pick4, "Lotus"); assert.equal(game.bo5.decider, "Split");
  assert.deepEqual(getValorantCurrentSides(game, 5), { one: "defense", two: "attack" });
  assert.deepEqual(Object.keys(buildValorantFields(game, {}, {})), Object.keys(buildValorantFields(initial, {}, {})));
});

test("mismatched games/teams, unknown item IDs and unsupported formats are rejected", () => {
  assert.match(hubEligibility(matchFor(payloads[0]), "VALORANT"), /not a VALORANT/);
  assert.match(hubEligibility({ ...matchFor(payloads[0]), id: "changed" }, "League of Legends"), /Sync Match 1/);
  const wrong = structuredClone(payloads[0]); wrong.match.team1.teamId = "other";
  assert.throws(() => normalizeHubCollection(wrong, matchFor(payloads[0])), /do not match/);
  const bad = structuredClone(payloads[0]); bad.draft.session.history[2].itemId = "missing";
  assert.throws(() => normalize(bad), /missing from its catalog/);
  const format = structuredClone(payloads[4]); format.match.bestOf = 1;
  assert.throws(() => normalize(format), /not supported/);
});

test("completed legacy League drafts remain usable without player assignments", () => {
  const payload = structuredClone(payloads[2]);
  for (const s of [payload.draft.session, payload.draft.currentSession, ...payload.draft.gameSessions]) {
    s.snapshot.profile.version = 1;
    delete s.state.league.assignments;
    delete s.assignmentPlayers;
  }
  const game = acceptHubCollection(league(), "leagueOfLegends", normalize(payload));
  assert.equal(game.draft.currentStep, 20);
  assert.equal(game.hubPresentation.rolesRevealed, false);
  assert.deepEqual(game.hubDraft.collection.sessions[0].lineups, { team1: [], team2: [] });
});

test("Fearless snapshots retain older prior-game records without optional game indices", () => {
  const payload = structuredClone(payloads[3]);
  for (const s of [payload.draft.session, payload.draft.currentSession, ...payload.draft.gameSessions]) {
    for (const game of s.snapshot.priorGames) delete game.gameIndex;
  }
  assert.equal(normalize(payload).sessions.find((s) => s.gameIndex === 2).priorPicks.length, 10);
});

test("a public reset also clears selections from the previously imported VALORANT format", () => {
  let game = acceptHubCollection(valorant(), "valorant", collections[5]);
  game = { ...game, bestOf: "Bo5", bo5: { ...game.bo5, pick1: "Ascent", side1: "attack" } };
  const reset = { ...collections[5], revision: 99, required: false, veto: null, sessions: [] };
  game = acceptHubCollection(game, "valorant", reset);
  assert.ok(Object.values(game.bo3).every((value) => value === ""));
  assert.ok(Object.values(game.bo5).every((value) => value === ""));
});

test("invalid saved lineup rows do not survive hydration and crash the operator panel", () => {
  const source = structuredClone(acceptHubCollection(league(), "leagueOfLegends", collections[2]).hubDraft);
  source.collection.sessions[0].lineups.team1[0] = null;
  assert.deepEqual(hydrateHubSource(source), emptyHubSource());
});

test("League mapping matrix uses IDs for slots, first pick, Blue/Red, and role icons", () => {
  for (const reverseSlots of [false, true]) for (const reverseFirst of [false, true]) for (const reverseBlue of [false, true]) {
    const payload = structuredClone(payloads[2]);
    const [one, two] = [payload.match.team1.teamId, payload.match.team2.teamId];
    if (reverseSlots) [payload.match.team1, payload.match.team2] = [payload.match.team2, payload.match.team1];
    payload.match.team1.name = payload.match.team2.name = "Same display name";
    const swap = (id) => id === one ? two : one;
    for (const s of [payload.draft.session, payload.draft.currentSession, ...payload.draft.gameSessions]) {
      s.snapshot.items.reverse();
      [s.snapshot.team1Id, s.snapshot.team2Id] = [two, one];
      s.state.league.sides = { blue: reverseBlue ? two : one, red: reverseBlue ? one : two };
      if (reverseFirst) {
        s.state.roles = { A: two, B: one };
        for (const action of s.history) if (action.teamId) action.teamId = swap(action.teamId);
        const assignments = s.state.league.assignments;
        s.state.league.assignments = { [one]: assignments[two], [two]: assignments[one] };
      }
      Object.values(s.state.league.assignments).forEach((rows) => rows.reverse());
    }
    const raw = payload.draft.gameSessions[0];
    const namesById = new Map(raw.snapshot.items.map((item) => [item.id, item.name]));
    const playersById = new Map(raw.assignmentPlayers.map((player) => [player.id, player.name]));
    const game = acceptHubCollection(league(), "leagueOfLegends", normalize(payload));
    const slots = draftSlots(game.draft, game.draftMode);
    const keyFor = (id) => id === payload.match.team1.teamId ? "team1" : "team2";
    assert.equal(game.blueTeam, keyFor(raw.state.league.sides.blue));
    assert.equal(game.firstPickTeam, keyFor(raw.state.roles.A));
    for (const side of ["blue", "red"]) {
      const id = raw.state.league.sides[side];
      for (const action of ["pick", "ban"]) {
        const expected = raw.history.filter((h) => h.type === action && h.teamId === id).map((h) => namesById.get(h.itemId));
        assert.deepEqual(slots[`${side}${action === "pick" ? "Picks" : "Bans"}`], expected);
      }
      for (const row of raw.state.league.assignments[id]) {
        const role = ["top", "jungle", "mid", "bot", "support"].indexOf(row.role);
        const pickSlot = slots[`${side}Picks`].indexOf(namesById.get(row.championId));
        assert.equal(game.draft[`${side}PickOrder`].indexOf(pickSlot), role);
        const lineup = game.hubDraft.collection.sessions[0].lineups[keyFor(id)][role];
        assert.equal(lineup.item, namesById.get(row.championId));
        assert.equal(lineup.player, playersById.get(row.playerId));
      }
    }
    assert.deepEqual(hydrateHubSource(JSON.parse(JSON.stringify(game.hubDraft))), game.hubDraft);
  }
});

test("64 VALORANT mapping combinations preserve map numbers, owners, sides, and legacy logos", () => {
  for (const bestOf of [3, 5]) for (const reverseSlots of [false, true]) for (const reverseA of [false, true])
    for (const reverseChooser of [false, true]) for (const side of ["attack", "defense"]) for (const flipSides of [false, true]) {
      const payload = structuredClone(payloads[5]);
      payload.match.bestOf = bestOf;
      if (reverseSlots) [payload.match.team1, payload.match.team2] = [payload.match.team2, payload.match.team1];
      payload.match.team1.name = payload.match.team2.name = "Same display name";
      payload.draft.currentSession = null; payload.draft.gameSessions = [];
      const veto = payload.draft.session;
      const [one, two] = [payload.match.team1.teamId, payload.match.team2.teamId];
      veto.snapshot.bestOf = bestOf;
      veto.snapshot.items.reverse();
      veto.state.roles = { A: reverseA ? two : one, B: reverseA ? one : two };
      veto.history = veto.history.filter((h) => h.type === "ban").slice(0, bestOf === 5 ? 2 : 4)
        .map((h, i) => ({ ...h, teamId: veto.state.roles[i % 2 ? "B" : "A"] }));
      veto.state.maps = (bestOf === 5 ? ["ascent", "haven", "icebox", "lotus", "split"] : ["ascent", "haven", "split"])
        .map((name, i) => ({ mapNumber: i + 1, itemId: `demo-map-${name}`, decider: i === bestOf - 1,
          pickedByTeamId: i === bestOf - 1 ? null : veto.state.roles[i % 2 ? "B" : "A"],
          sideChoiceByTeamId: reverseChooser ? two : one, startingSide: side })).reverse();
      const game = acceptHubCollection({ ...valorant(), flipSides }, "valorant", normalize(payload));
      const teams = [{ name: "Same display name", logo: one }, { name: "Same display name", logo: two }];
      const fields = buildValorantFields(game, ...teams, []);
      const prefix = `valbo${bestOf}`;
      assert.equal(fields.valbanteamalogo, veto.state.roles.A);
      assert.equal(fields.valbanteamblogo, veto.state.roles.B);
      for (const map of veto.state.maps) {
        const expectedOne = map.sideChoiceByTeamId === one ? side : side === "attack" ? "defense" : "attack";
        const expectedTwo = expectedOne === "attack" ? "defense" : "attack";
        assert.deepEqual(getValorantCurrentSides(game, map.mapNumber), flipSides ? { one: expectedTwo, two: expectedOne } : { one: expectedOne, two: expectedTwo });
        assert.equal(fields[`${prefix}map${map.mapNumber}name`], veto.snapshot.items.find((item) => item.id === map.itemId).name.toUpperCase());
        assert.equal(fields[`${prefix}map${map.mapNumber}teamlogo`], map.pickedByTeamId || "");
        const legacyChooser = fields[`${prefix}s${map.mapNumber}logo`];
        const expectedSide = legacyChooser === map.sideChoiceByTeamId ? side : side === "attack" ? "defense" : "attack";
        assert.equal(fields[`${prefix}s${map.mapNumber}text`], expectedSide === "attack" ? "ATK" : "DEF");
      }
      const blank = buildValorantFields(valorant(), ...teams);
      assert.deepEqual(Object.keys(fields), Object.keys(blank));
      assert.equal(fields.valscore1, "X - X");
      assert.equal(fields.valseriesscore1, "0");
      assert.deepEqual(hydrateHubSource(JSON.parse(JSON.stringify(game.hubDraft))), game.hubDraft);
    }
});

test("partial Standard result metadata retains five slots and the operator's winner", () => {
  const payload = structuredClone(payloads[0]);
  for (const s of [payload.draft.session, payload.draft.currentSession, ...payload.draft.gameSessions]) s.snapshot.profile.availability = "standard";
  const game = acceptHubCollection(league(), "leagueOfLegends", normalize(payload));
  const metadata = hubLeagueResultMetadata(game.hubDraft.collection, 1);
  assert.deepEqual(metadata.bluePicks, ["Aatrox", "", "", "", ""]);
  assert.deepEqual(metadata.redPicks, ["Ahri", "Sejuani", "", "", ""]);
  const confirmed = { gameNumber: 1, winner: "team2", ...metadata };
  const advanced = projectHubGame({ ...game, confirmedGames: [confirmed] }, "leagueOfLegends");
  assert.equal(advanced.currentGame, 2);
  assert.equal(advanced.confirmedGames[0].winner, "team2");
  assert.equal(advanced.hubPresentation.progress, "Waiting for Hub draft");
});

test("all fixtures survive reload; corrupt nested saved data fails closed to Manual", () => {
  for (const c of collections) {
    const source = { mode: "live", matchId: c.matchId, collection: c };
    assert.deepEqual(hydrateHubSource(JSON.parse(JSON.stringify(source))), source);
  }
  const corruptions = [
    (c) => { c.veto.maps[0] = null; },
    (c) => { c.veto.bans[0].team = "other"; },
    (c) => { c.games = [{ team1: {}, team2: 0 }]; },
    (c) => { c.sessions[0].pickOrders.team1 = [0, 0, 0, 0, 0]; },
    (c) => { c.sessions[0].progress = {}; },
    (c) => { c.sessions[0].gameIndex = 99; },
    (c) => { c.veto.maps[0].side = "blue"; },
  ];
  for (const corrupt of corruptions) {
    const c = structuredClone(collections[6]); corrupt(c);
    assert.deepEqual(hydrateHubSource({ mode: "live", matchId: c.matchId, collection: c }), emptyHubSource());
  }
});

test("reported agents use slots and IDs, allow missing approved players, and clear after a revert", () => {
  const payload = structuredClone(payloads[6]);
  const raw = payload.draft.gameSessions.find((s) => s.snapshot.gameIndex === 1);
  const teamId = payload.match.team1.teamId;
  raw.state.agents.assignments[teamId].reverse();
  raw.state.agents.assignments[teamId][4].missingPlayer = true;
  raw.assignmentPlayers = [];
  const game = acceptHubCollection(valorant(), "valorant", normalize(payload));
  const rows = selectHubSession(game.hubDraft.collection, 1).lineups.team1;
  assert.deepEqual(rows.map((r) => r.position), ["Slot 1", "Slot 2", "Slot 3", "Slot 4", "Slot 5"]);
  assert.equal(rows[0].player, "Missing player (approved)");
  assert.equal(rows[1].player, "Player unavailable");
  const reverted = { ...collections[5], revision: 100 };
  const next = acceptHubCollection(game, "valorant", reverted);
  assert.equal(selectHubSession(next.hubDraft.collection, 1).revealed, false);
  assert.deepEqual(selectHubSession(next.hubDraft.collection, 1).lineups, { team1: [], team2: [] });
  assert.deepEqual(next.savedGames, []);
  assert.deepEqual(next.bo3, game.bo3);
});

const settle = () => new Promise((resolve) => setImmediate(resolve));
function scheduler() {
  const tasks = new Map(); let id = 0;
  return { tasks, schedule(fn, delay) { tasks.set(++id, { fn, delay }); return id; }, cancel(key) { tasks.delete(key); },
    fire(delay) { const [key, task] = [...tasks].find(([, task]) => task.delay === delay) ?? []; assert.ok(task, `No ${delay}ms task`); tasks.delete(key); task.fn(); } };
}

test("polling coalesces manual refresh, retains success through outages, backs off and cancels on handoff", async () => {
  const clock = scheduler(); const accepted = []; const states = [];
  let resolveLoad; let rejectLoad; let calls = 0; let signal;
  const polling = startHubPolling({ ...clock, now: () => "2026-10-12T00:00:00Z", status: (s) => states.push(s), accept: (c) => accepted.push(c),
    load: (s) => { calls++; signal = s; return new Promise((resolve, reject) => { resolveLoad = resolve; rejectLoad = reject; }); } });
  polling.refresh(); polling.refresh(); assert.equal(calls, 1);
  resolveLoad(collections[0]); await settle(); assert.equal(accepted.length, 1);
  clock.fire(0); rejectLoad(new Error("offline")); await settle();
  assert.equal(states.at(-1).lastSuccess, "2026-10-12T00:00:00Z"); assert.equal(states.at(-1).error, "offline");
  for (const delay of [4000, 8000, 16000]) {
    clock.fire(delay);
    assert.equal(states.at(-1).busy, true);
    assert.equal(states.at(-1).error, "offline"); // A pending retry must not briefly claim that stale data is live.
    rejectLoad(new Error("offline")); await settle();
  }
  clock.fire(30000); polling.stop(); assert.equal(signal.aborted, true);
  resolveLoad(collections[2]); await settle(); assert.equal(accepted.length, 1); assert.equal(clock.tasks.size, 0);
});

test("polling times out requests and resumes the normal interval after recovery", async () => {
  const clock = scheduler(); let calls = 0; const states = [];
  const polling = startHubPolling({ ...clock, status: (s) => states.push(s), accept: () => {}, load: (signal) => {
    if (++calls > 1) return Promise.resolve(collections[0]);
    return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
  } });
  clock.fire(10000); await settle(); assert.match(states.at(-1).error, /timed out/);
  clock.fire(4000); await settle(); assert.equal(states.at(-1).error, "");
  assert.ok([...clock.tasks.values()].some((task) => task.delay === 2000)); polling.stop();
});
