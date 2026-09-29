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
