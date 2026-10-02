import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRocketLeagueSceneMode, resolveRocketLeagueScene } from "../lib/rocket-league-scene.mjs";
import { buildRocketLeagueOverlayState } from "../lib/rocket-league-live.mjs";
import { mergeRocketLeagueOverlayLive } from "../lib/rocket-league-stats-api.mjs";

test("automatic scene follows match activity and the selected lobby scene", () => {
  for (const sceneMode of [undefined, "auto", "invalid"]) {
    assert.equal(normalizeRocketLeagueSceneMode(sceneMode), "auto");
    for (const lobbyScene of ["vs", "stats"]) {
      assert.equal(resolveRocketLeagueScene({ sceneMode, lobbyScene, game: { hasGame: true } }), "scoreboard");
      assert.equal(resolveRocketLeagueScene({ sceneMode, lobbyScene, game: { hasGame: false } }), lobbyScene);
    }
  }
});

test("manual scenes survive publication and feed changes without altering game data", () => {
  for (const sceneMode of ["scoreboard", "vs", "stats"]) {
    for (const debugLiveOverride of [false, true]) {
      const base = buildRocketLeagueOverlayState({ sceneMode, savedGames: [] }, {}, {});
      assert.equal(base.sceneMode, sceneMode);
      for (const hasGame of [false, true]) {
        const game = { ...base.game, hasGame, scoreOne: 3, scoreTwo: 1 };
        const merged = mergeRocketLeagueOverlayLive({ ...base, debugLiveOverride, game }, { game });
        assert.equal(merged.sceneMode, sceneMode);
        assert.equal(resolveRocketLeagueScene(merged), sceneMode);
        assert.deepEqual(merged.game, game);
        assert.equal(resolveRocketLeagueScene({ ...merged, sceneMode: "auto", lobbyScene: "vs" }), hasGame ? "scoreboard" : "vs");
      }
    }
  }
});
