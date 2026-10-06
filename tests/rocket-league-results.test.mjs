import test from "node:test";
import assert from "node:assert/strict";
import { applyStatsApiMessage, createEmptyLiveFeed, mergeRocketLeagueOverlayLive } from "../lib/rocket-league-stats-api.mjs";
import { buildRocketLeagueOverlayState } from "../lib/rocket-league-live.mjs";
import { resolveRocketLeagueScene } from "../lib/rocket-league-scene.mjs";
import { createRocketLeagueGames, proposeRocketLeagueLiveResult } from "../lib/rocket-league.mjs";

function snapshot(blue, orange, winner = true, reversed = false) {
  const teams = [{ TeamNum: 0, Score: blue }, { TeamNum: 1, Score: orange }];
  return { Event: "UpdateState", Data: { Players: [], Game: {
    Teams: reversed ? teams.reverse() : teams, bHasWinner: winner, TimeSeconds: winner ? 0 : 300,
  } } };
}

const completedPlayers = [
  { PrimaryId: "b1", Name: "Blue1", TeamNum: 0, Goals: 2, Assists: 1, Shots: 6, Saves: 2, Demos: 1, Touches: 22 },
  { PrimaryId: "b2", Name: "Blue2", TeamNum: 0, Goals: 1, Assists: 2, Shots: 3, Saves: 1, Demos: 2, Touches: 15 },
  { PrimaryId: "o1", Name: "Orange1", TeamNum: 1, Goals: 1, Assists: 0, Shots: 4, Saves: 3, Demos: 0, Touches: 19 },
];

function statsSnapshot(players) {
  const message = snapshot(3, 1);
  message.Data.Players = players;
  return message;
}

for (const event of [null, "MatchEnded", "PodiumStart", "MatchDestroyed"]) {
  test(`completed stats survive departures after ${event || "winner update"}`, () => {
    let feed = applyStatsApiMessage(createEmptyLiveFeed(), statsSnapshot(completedPlayers), 1000);
    const expected = structuredClone(feed.matchTeamStats);
    assert.deepEqual(expected.teamOne, { goals: 3, assists: 3, shots: 9, saves: 3, demos: 3, touches: 37 });
    const resultId = feed.finishedGame.id;
    if (event) feed = applyStatsApiMessage(feed, { Event: event, Data: {} }, 2000);
    for (const players of [completedPlayers.slice(1), [], completedPlayers.map(player => ({ ...player, Shots: 99 }))]) {
      feed = applyStatsApiMessage(feed, statsSnapshot(players), 3000);
      assert.deepEqual(feed.matchTeamStats, expected);
      assert.equal(feed.finishedGame.id, resultId);
    }
  });
}

test("each completed game captures once, including a delayed populated winner update", () => {
  let feed = createEmptyLiveFeed();
  let now = 1000;
  let previous = null;
  let previousId = null;
  for (const shots of [6, 8]) {
    for (const event of ["MatchCreated", "CountdownBegin", "RoundStarted"]) {
      feed = applyStatsApiMessage(feed, { Event: event, Data: {} }, now++);
      assert.deepEqual(feed.matchTeamStats, previous);
    }
    feed = applyStatsApiMessage(feed, statsSnapshot([]), now++);
    assert.deepEqual(feed.matchTeamStats, previous);
    assert.notEqual(feed.finishedGame.id, previousId);
    feed = applyStatsApiMessage(feed, { Event: "MatchEnded", Data: {} }, now++);
    const players = completedPlayers.map((player, index) => index === 0 ? { ...player, Shots: shots } : player);
    feed = applyStatsApiMessage(feed, statsSnapshot(players), now++);
    assert.equal(feed.matchTeamStats.teamOne.shots, shots + 3);
    previous = structuredClone(feed.matchTeamStats);
    previousId = feed.finishedGame.id;
    feed = applyStatsApiMessage(feed, statsSnapshot(players.slice(1)), now++);
    assert.deepEqual(feed.matchTeamStats, previous);
  }
});

for (const flipSides of [false, true]) {
  test(`live results preserve game and team order (swap sides: ${flipSides})`, () => {
    let feed = createEmptyLiveFeed();
    let state = { bestOf: "Bo7", flipSides, autoAcceptLiveResults: true,
      games: createRocketLeagueGames(), savedGames: createRocketLeagueGames() };
    let now = Date.parse("2026-09-28T20:00:00Z");
    const expected = [];
    // Identical consecutive scores must still count as distinct games.
    for (const [blue, orange] of [[4, 2], [1, 3], [1, 3]]) {
      feed = applyStatsApiMessage(feed, { Event: "MatchCreated", Data: {} }, now++);
      feed = applyStatsApiMessage(feed, snapshot(0, 0, false), now++);
      feed = applyStatsApiMessage(feed, snapshot(blue, orange, true, true), now++);
      const result = proposeRocketLeagueLiveResult(state, feed.finishedGame);
      assert.equal(result.accepted, true);
      assert.equal(result.gameIndex, expected.length);
      state = result.rocketLeague;
      expected.push(flipSides ? { home: String(orange), away: String(blue) }
        : { home: String(blue), away: String(orange) });
      const finishedId = feed.finishedGame.id;
      for (const event of ["MatchEnded", "PodiumStart", "MatchDestroyed"]) {
        feed = applyStatsApiMessage(feed, { Event: event, Data: {} }, now++);
        feed = applyStatsApiMessage(feed, snapshot(blue, orange), now++);
        assert.equal(feed.finishedGame.id, finishedId, `${event} must not create another result`);
        assert.equal(proposeRocketLeagueLiveResult(state, feed.finishedGame).changed, false);
      }
      assert.deepEqual(state.savedGames.slice(0, expected.length), expected);
      assert.deepEqual(state.savedGames[expected.length], { home: "", away: "" });
    }
  });
}

for (const endBeforeWinner of [null, "MatchEnded", "PodiumStart", "MatchDestroyed"]) {
  for (const autoAcceptLiveResults of [false, true]) {
    for (const flipSides of [false, true]) {
      test(`new games refresh stats and results (${endBeforeWinner || "winner first"}, auto: ${autoAcceptLiveResults}, flipped: ${flipSides})`, () => {
        let feed = createEmptyLiveFeed();
        let state = { bestOf: "Bo7", flipSides, autoAcceptLiveResults,
          games: createRocketLeagueGames(), savedGames: createRocketLeagueGames() };
        let now = 1000;
        let previousStats = null;
        const ids = new Set();
        const expectedResults = [];
        for (const [index, [blue, orange]] of [[3, 1], [3, 1], [1, 4]].entries()) {
          for (const event of ["MatchCreated", "MatchInitialized", "CountdownBegin", "RoundStarted"]) {
            feed = applyStatsApiMessage(feed, { Event: event, Data: {} }, now++);
            assert.deepEqual(feed.matchTeamStats, previousStats);
          }
          feed = applyStatsApiMessage(feed, snapshot(0, 0, false), now++);
          assert.deepEqual(feed.matchTeamStats, previousStats);
          if (endBeforeWinner) {
            feed = applyStatsApiMessage(feed, { Event: endBeforeWinner, Data: {} }, now++);
            assert.deepEqual(feed.matchTeamStats, previousStats);
          }
          // Final player stats may arrive after the winner and end events.
          feed = applyStatsApiMessage(feed, snapshot(blue, orange), now++);
          assert.deepEqual(feed.matchTeamStats, previousStats);
          const id = feed.finishedGame.id;
          assert.equal(ids.has(id), false, "a new game must not reuse a processed result ID");
          ids.add(id);
          const result = proposeRocketLeagueLiveResult(state, feed.finishedGame);
          assert.equal(result.proposed, true);
          assert.equal(result.accepted, autoAcceptLiveResults);
          assert.equal(result.gameIndex, index);
          state = result.rocketLeague;
          expectedResults.push(flipSides ? { home: String(orange), away: String(blue) }
            : { home: String(blue), away: String(orange) });
          assert.deepEqual(state.games.slice(0, index + 1), expectedResults);
          assert.deepEqual(state.savedGames[index], autoAcceptLiveResults
            ? expectedResults[index] : { home: "", away: "" });
          if (!autoAcceptLiveResults) {
            // The operator saves the proposed row before the next game.
            state = { ...state, savedGames: state.games.map(game => ({ ...game })) };
          }
          feed = applyStatsApiMessage(feed, { Event: "MatchEnded", Data: {} }, now++);
          const populated = snapshot(blue, orange);
          populated.Data.Players = [
            { Name: "Blue", TeamNum: 0, Goals: blue, Assists: index + 1, Shots: index + 5,
              Saves: index + 2, Demos: index + 3, Touches: index + 20 },
            { Name: "Orange", TeamNum: 1, Goals: orange, Assists: index + 2, Shots: index + 7,
              Saves: index + 4, Demos: index + 1, Touches: index + 30 },
          ];
          feed = applyStatsApiMessage(feed, populated, now++);
          const expectedStats = {
            scoreOne: blue, scoreTwo: orange, winnerTeam: blue > orange ? 0 : 1,
            teamOne: { goals: blue, assists: index + 1, shots: index + 5,
              saves: index + 2, demos: index + 3, touches: index + 20 },
            teamTwo: { goals: orange, assists: index + 2, shots: index + 7,
              saves: index + 4, demos: index + 1, touches: index + 30 },
          };
          assert.deepEqual(feed.matchTeamStats, expectedStats);
          assert.equal(feed.finishedGame.id, id);
          for (const sceneMode of ["auto", "stats"]) {
            const base = buildRocketLeagueOverlayState({ ...state, sceneMode, lobbyScene: "stats" }, {}, {});
            const published = mergeRocketLeagueOverlayLive(base, feed, now);
            assert.deepEqual(published.matchTeamStats, expectedStats);
            assert.equal(resolveRocketLeagueScene(published), "stats");
            assert.equal("currentGameCompleted" in published, false);
            assert.equal("completedGameSequence" in published, false);
          }
          for (const event of ["PodiumStart", "MatchDestroyed"]) {
            feed = applyStatsApiMessage(feed, { Event: event, Data: {} }, now++);
            feed = applyStatsApiMessage(feed, populated, now++);
            assert.equal(feed.finishedGame.id, id);
            assert.deepEqual(feed.matchTeamStats, expectedStats);
            assert.equal(proposeRocketLeagueLiveResult(state, feed.finishedGame).changed, false);
          }
          previousStats = expectedStats;
        }
      });
    }
  }
}

test("consecutive identical results remain distinct even within the same millisecond", () => {
  let feed = createEmptyLiveFeed();
  const ids = new Set();
  for (let index = 0; index < 3; index += 1) {
    feed = applyStatsApiMessage(feed, { Event: "MatchCreated", Data: {} }, 1000);
    feed = applyStatsApiMessage(feed, statsSnapshot(completedPlayers), 1000);
    assert.equal(ids.has(feed.finishedGame.id), false);
    ids.add(feed.finishedGame.id);
  }
});

for (const startEvent of ["MatchInitialized", "CountdownBegin", "RoundStarted"]) {
  test(`${startEvent} can begin the next game when MatchCreated is missed`, () => {
    let feed = applyStatsApiMessage(createEmptyLiveFeed(), statsSnapshot(completedPlayers), 1000);
    const previousId = feed.finishedGame.id;
    const previousStats = structuredClone(feed.matchTeamStats);
    feed = applyStatsApiMessage(feed, { Event: "MatchEnded", Data: {} }, 2000);
    feed = applyStatsApiMessage(feed, { Event: startEvent, Data: {} }, 3000);
    assert.deepEqual(feed.matchTeamStats, previousStats);
    // Kickoffs within the same game must not re-arm completion tracking.
    feed = applyStatsApiMessage(feed, { Event: "RoundStarted", Data: {} }, 3100);
    feed = applyStatsApiMessage(feed, { Event: "MatchEnded", Data: {} }, 4000);
    feed = applyStatsApiMessage(feed, statsSnapshot(completedPlayers), 5000);
    assert.notEqual(feed.finishedGame.id, previousId);
    const nextId = feed.finishedGame.id;
    feed = applyStatsApiMessage(feed, { Event: "PodiumStart", Data: {} }, 6000);
    feed = applyStatsApiMessage(feed, statsSnapshot(completedPlayers), 7000);
    assert.equal(feed.finishedGame.id, nextId);
  });
}

test("a corrected game identity still protects a conflicting operator result", () => {
  let feed = applyStatsApiMessage(createEmptyLiveFeed(), snapshot(3, 1), 1000);
  let state = { bestOf: "Bo7", autoAcceptLiveResults: true,
    games: createRocketLeagueGames(), savedGames: createRocketLeagueGames() };
  state = proposeRocketLeagueLiveResult(state, feed.finishedGame).rocketLeague;
  state.games[1] = { home: "8", away: "2" };
  feed = applyStatsApiMessage(feed, { Event: "MatchCreated", Data: {} }, 2000);
  feed = applyStatsApiMessage(feed, { Event: "MatchEnded", Data: {} }, 3000);
  feed = applyStatsApiMessage(feed, snapshot(1, 4), 4000);
  const result = proposeRocketLeagueLiveResult(state, feed.finishedGame);
  assert.equal(result.changed, true);
  assert.equal(result.accepted, false);
  assert.deepEqual(result.rocketLeague.games[1], { home: "8", away: "2" });
  assert.deepEqual(result.rocketLeague.savedGames[1], { home: "", away: "" });
  assert.equal(proposeRocketLeagueLiveResult(result.rocketLeague, feed.finishedGame).changed, false);
});
