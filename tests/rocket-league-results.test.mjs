import test from "node:test";
import assert from "node:assert/strict";
import { applyStatsApiMessage, createEmptyLiveFeed } from "../lib/rocket-league-stats-api.mjs";
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
