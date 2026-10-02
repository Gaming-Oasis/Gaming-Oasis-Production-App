import assert from "node:assert/strict";
import test from "node:test";
import { applyProductionDefaults, matchesProductionDefaults } from "../lib/production-defaults.mjs";
import { normalizeLeagueScoreboard } from "../lib/league-scoreboard.mjs";

test("presets update all production controls while preserving show data and manual values", () => {
  const state = {
    general: { eventName: "Live show" },
    settings: { drawShowEnabled: false },
    rocketLeague: { games: [{ team1: 2 }], playerCardEnabled: false, sceneMode: "stats" },
    valorant: { bestOf: "Bo5", mapWidgetEnabled: false },
    leagueOfLegends: { scoreboard: normalizeLeagueScoreboard({ stats: { kills: { source: "api", team1: 12 } } }), currentGame: 2 },
  };
  const original = structuredClone(state);
  const conference = applyProductionDefaults(state, true);
  assert.equal(matchesProductionDefaults(conference, true), true);
  assert.equal(conference.rocketLeague.lobbyScene, "stats");
  assert.equal(conference.rocketLeague.statsSceneBackground, "transparent");
  assert.equal(conference.rocketLeague.sceneMode, "auto");
  assert.equal(conference.rocketLeague.broadcastSetupEnabled, true);
  assert.equal(conference.rocketLeague.sponsorWidgetEnabled, true);
  assert.equal(conference.rocketLeague.playerCardEnabled, true);
  assert.equal(conference.valorant.mapWidgetEnabled, true);
  assert.equal(conference.valorant.sponsorWidgetEnabled, true);
  assert.equal(conference.leagueOfLegends.scoreboard.goldSource, "disabled");
  assert.equal(conference.leagueOfLegends.scoreboard.stats.kills.team1, 12);
  assert.equal(conference.leagueOfLegends.currentGame, 2);
  assert.deepEqual(state, original);
  assert.equal(conference.general, state.general);
  assert.equal(conference.settings, state.settings);
  assert.equal(conference.rocketLeague.games, state.rocketLeague.games);
  const reloaded = JSON.parse(JSON.stringify(conference));
  assert.equal(matchesProductionDefaults(reloaded, true), true);
  reloaded.rocketLeague.sceneMode = "vs";
  assert.equal(matchesProductionDefaults(reloaded, true), false);
  reloaded.rocketLeague.sceneMode = "auto";
  reloaded.rocketLeague.statsSceneBackground = "team-split";
  assert.equal(matchesProductionDefaults(reloaded, true), false);
  reloaded.rocketLeague.statsSceneBackground = "transparent";
  reloaded.valorant.mapWidgetEnabled = false;
  assert.equal(matchesProductionDefaults(reloaded, true), false);
  const standard = applyProductionDefaults(conference, false);
  assert.equal(matchesProductionDefaults(standard, true), false);
  assert.equal(matchesProductionDefaults(standard, false), true);
  assert.equal(matchesProductionDefaults(conference, false), false);
  assert.equal(matchesProductionDefaults(reloaded, false), false);
  assert.equal(standard.leagueOfLegends.vsScreenEnabled, true);
  assert.equal(standard.rocketLeague.statsSceneBackground, "team-split");
  assert.equal(standard.leagueOfLegends.scoreboard.hideCountdowns, false);
  assert.equal(standard.leagueOfLegends.scoreboard.hideScoreboard, false);
  assert.equal(standard.leagueOfLegends.scoreboard.clockSource, "disabled");
  assert.equal(standard.leagueOfLegends.scoreboard.goldSource, "disabled");
  assert.deepEqual(applyProductionDefaults(standard, false), standard);
});
