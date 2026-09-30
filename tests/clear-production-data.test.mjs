import assert from "node:assert/strict";
import test from "node:test";
import { clearProductionData } from "../lib/clear-production-data.mjs";
import { applyProductionDefaults, matchesProductionDefaults } from "../lib/production-defaults.mjs";
import { createLeagueDraftState } from "../lib/league-of-legends.mjs";
import { normalizeLeagueScoreboard, setLeagueBaronActive, setLeagueElderActive, updateLeagueDragons } from "../lib/league-scoreboard.mjs";

test("clearing production data retains both presets and customized settings while clearing show entries", () => {
  const empty = {
    general: { eventName: "", matches: [{ id: "" }] },
    settings: { drawShowEnabled: false, generalInfoEnabled: true },
    valorantMapData: { maps: [] },
    sponsors: [{ id: "sponsor1", name: "", logo: "", enabled: true }],
    draws: { RLT1: { P11: "" } }, drawSeeding: { RLT1: { teams: [], slots: {} } },
    rocketLeague: { scoreboardHeader: "", games: [], savedGames: [], lastLiveResultProposalKey: "", debugLive: {} },
    valorant: { scoreboardHeader: "", games: [], savedGames: [], bo3: {}, bo5: {} },
    leagueOfLegends: { scoreboardHeader: "", scoreboard: normalizeLeagueScoreboard(), currentGame: 1, results: [], draft: createLeagueDraftState(), confirmedGames: [], resultProposal: null, playerOverrides: {} },
  };
  for (const conferences of [true, false]) {
    const current = applyProductionDefaults(structuredClone(empty), conferences);
    current.settings = { drawShowEnabled: true, generalInfoEnabled: false };
    current.general = { eventName: "Finals", matches: [{ id: "123" }] };
    current.valorantMapData = { maps: [{ name: "Custom artwork" }] };
    current.sponsors[0] = { id: "sponsor1", name: "Sponsor", logo: "logo.png", enabled: false };
    current.draws.RLT1.P11 = "Team";
    current.drawSeeding.RLT1.teams.push({ name: "Team" });
    Object.assign(current.rocketLeague, { bestOf: "Bo7", flipSides: true, autoAcceptLiveResults: true, scoreboardHeader: "Final", games: [{ home: "2", away: "1" }], savedGames: [{ home: "2", away: "1" }], lastLiveResultProposalKey: "result", debugLive: { gameTime: 50 } });
    Object.assign(current.valorant, { bestOf: "Bo5", flipSides: true, banSwap: true, scoreboardHeader: "Final", games: [{ home: "13", away: "2" }], savedGames: [{ home: "13", away: "2" }], bo3: { pick1: "Ascent" }, bo5: { ban1: "Bind" } });
    Object.assign(current.leagueOfLegends, { bestOf: "Bo5", draftMode: "fearless", blueTeam: "team2", autoAcceptLiveResults: true, scoreboardHeader: "Final", currentGame: 3, results: [{ winner: "team1" }], confirmedGames: [{ winner: "team1" }], resultProposal: { winner: "team1" }, playerOverrides: { player: "Name" } });
    current.leagueOfLegends.draft = createLeagueDraftState(45);
    current.leagueOfLegends.draft.selections[0] = "Ahri";
    current.leagueOfLegends.scoreboard.stats.kills.team1 = 12;
    current.leagueOfLegends.scoreboard = setLeagueElderActive(setLeagueBaronActive(updateLeagueDragons(current.leagueOfLegends.scoreboard, "team1", { types: ["ocean"] }), "team1", true), "team2", true);
    const original = structuredClone(current);
    const cleared = clearProductionData(current, structuredClone(empty));
    assert.deepEqual(current, original);
    assert.equal(matchesProductionDefaults(cleared, conferences), true);
    for (const key of ["general", "draws", "drawSeeding"]) assert.deepEqual(cleared[key], empty[key]);
    for (const key of ["settings", "valorantMapData"]) assert.deepEqual(cleared[key], current[key]);
    assert.deepEqual(cleared.sponsors, [{ ...empty.sponsors[0], enabled: false }]);
    for (const game of ["rocketLeague", "valorant", "leagueOfLegends"]) {
      for (const key of ["bestOf", "autoAcceptLiveResults", "flipSides", "blueTeam", "draftMode", "banSwap"]) assert.equal(cleared[game][key], current[game][key]);
      assert.equal(cleared[game].scoreboardHeader, "");
    }
    for (const game of ["rocketLeague", "valorant"]) {
      assert.deepEqual(cleared[game].games, []);
      assert.deepEqual(cleared[game].savedGames, []);
    }
    assert.equal(cleared.rocketLeague.lastLiveResultProposalKey, "");
    assert.deepEqual(cleared.valorant.bo3, {});
    assert.deepEqual(cleared.valorant.bo5, {});
    assert.equal(cleared.leagueOfLegends.currentGame, 1);
    for (const key of ["results", "confirmedGames", "resultProposal", "playerOverrides"]) assert.deepEqual(cleared.leagueOfLegends[key], empty.leagueOfLegends[key]);
    assert.deepEqual(cleared.leagueOfLegends.draft, createLeagueDraftState(45));
    assert.ok(Object.values(cleared.leagueOfLegends.scoreboard.stats).every(stat => stat.team1 === 0 && stat.team2 === 0));
    assert.deepEqual(cleared.leagueOfLegends.scoreboard.dragons, empty.leagueOfLegends.scoreboard.dragons);
    for (const key of ["baronBuffs", "elderBuffs"]) assert.deepEqual(cleared.leagueOfLegends.scoreboard[key], empty.leagueOfLegends.scoreboard[key]);
    current.leagueOfLegends.scoreboard.stats.kills.source = "api";
    current.leagueOfLegends.scoreboard.clockSource = "api";
    const custom = clearProductionData(current, empty);
    assert.equal(custom.leagueOfLegends.scoreboard.stats.kills.source, "api");
    assert.equal(custom.leagueOfLegends.scoreboard.clockSource, "api");
  }
});
