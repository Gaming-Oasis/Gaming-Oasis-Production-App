import assert from "node:assert/strict";
import test from "node:test";
import {
  createLeagueDraftState,
  expectedLeagueSelection,
  leagueFirstPickSide,
  buildLeagueOverlayState,
  leagueSeedHolder,
  leagueSideStatus,
  leagueSidesReady,
  resolveLeagueFirstPickTeam,
} from "../lib/league-of-legends.mjs";

test("leagueSeedHolder only picks a holder when seeds are distinct numbers", () => {
  assert.equal(leagueSeedHolder("1", "3"), "team1");
  assert.equal(leagueSeedHolder("#5", "2"), "team2");
  assert.equal(leagueSeedHolder("Seed 4", "Seed 4"), "");
  assert.equal(leagueSeedHolder("", "2"), "");
  assert.equal(leagueSeedHolder("TBD", "TBD"), "");
});

test("expectedLeagueSelection drives the holder to first pick and the opponent to blue", () => {
  assert.deepEqual(expectedLeagueSelection("team2"), { firstPickTeam: "team2", blueTeam: "team1" });
  assert.deepEqual(expectedLeagueSelection("team1"), { firstPickTeam: "team1", blueTeam: "team2" });
  assert.equal(expectedLeagueSelection(""), null);
});

test("leagueFirstPickSide binds draft order to the first-pick team, not a fixed side", () => {
  assert.equal(leagueFirstPickSide("team1", "team1"), "ORDER");
  assert.equal(leagueFirstPickSide("team1", "team2"), "CHAOS");
  assert.equal(leagueFirstPickSide("team2", "team2"), "ORDER");
  assert.equal(leagueFirstPickSide("team2", "team1"), "CHAOS");
  assert.equal(leagueFirstPickSide("team1", ""), "ORDER");
});

test("resolveLeagueFirstPickTeam migrates side-keyed drafts through the saved side assignment", () => {
  assert.equal(resolveLeagueFirstPickTeam({ firstPickTeam: "team2" }), "team2");
  assert.equal(resolveLeagueFirstPickTeam({ blueTeam: "team1", draft: { firstPickSide: "CHAOS" } }), "team2");
  assert.equal(resolveLeagueFirstPickTeam({ blueTeam: "team2", draft: { firstPickSide: "CHAOS" } }), "team1");
  assert.equal(resolveLeagueFirstPickTeam({ blueTeam: "team2", draft: { firstPickSide: "ORDER" } }), "team2");
  assert.equal(resolveLeagueFirstPickTeam({}), "team1");
});

test("createLeagueDraftState accepts a derived first-pick side instead of defaulting to blue", () => {
  assert.equal(createLeagueDraftState().firstPickSide, "ORDER");
  assert.equal(createLeagueDraftState(30, "CHAOS").firstPickSide, "CHAOS");
  assert.equal(createLeagueDraftState(30, "nonsense").firstPickSide, "ORDER");
});

const sideLeague = (patch = {}) => ({ bestOf: "Bo3", draftMode: "fearless", currentGame: 1, sideControl: "draft", blueTeam: "team1", firstPickTeam: "",
  draft: createLeagueDraftState(), confirmedGames: [], hubDraft: { mode: "manual", matchId: "", collection: null }, ...patch });
const hubPresentation = (sidesReady) => ({ gameNumber: 1, progress: "", activeSelection: false, rolesRevealed: false, sidesReady, fearlessChampions: [] });

test("sides are only ready once Flip Sides, League Hub, or the manual draft assigned them", () => {
  assert.equal(leagueSidesReady(sideLeague()), false);
  assert.equal(leagueSidesReady(sideLeague({ firstPickTeam: "team2" })), true);
  assert.equal(leagueSidesReady(sideLeague({ sideControl: "manual" })), true);
  const started = createLeagueDraftState();
  started.selections[0] = "Aatrox";
  assert.equal(leagueSidesReady(sideLeague({ draft: started })), true);
  const live = { hubDraft: { mode: "live", matchId: "m", collection: null } };
  assert.equal(leagueSidesReady(sideLeague({ ...live, firstPickTeam: "team1" })), false, "a Hub first pick alone does not choose sides");
  assert.equal(leagueSidesReady(sideLeague({ ...live, hubPresentation: hubPresentation(false) })), false);
  assert.equal(leagueSidesReady(sideLeague({ ...live, hubPresentation: hubPresentation(true) })), true);
  assert.equal(leagueSidesReady(sideLeague({ ...live, hubPresentation: hubPresentation(false), sideControl: "manual" })), true);
});

test("Pick/Ban side labels publish only when enabled and sides are ready", () => {
  const overlay = (patch) => buildLeagueOverlayState(sideLeague(patch), { name: "Aurora" }, { name: "Tempest" });
  assert.equal(overlay({}).sideLabels, false);
  assert.equal(overlay({ firstPickTeam: "team1" }).sideLabels, true);
  assert.equal(overlay({ firstPickTeam: "team1", sideLabelsEnabled: false }).sideLabels, false);
  assert.equal(overlay({ hubDraft: { mode: "live", matchId: "m", collection: null }, hubPresentation: hubPresentation(false) }).sideLabels, false);
});

test("side status names the source and anything keeping Pick/Ban from matching", () => {
  const teamName = (key) => (key === "team1" ? "Aurora" : "Tempest");
  const status = (patch) => leagueSideStatus({ hubLive: true, sideControl: "draft", sidesReady: true, hubRequired: true, hubHasSession: true,
    hubBlueTeam: "team1", blueTeam: "team1", onAirBlueTeam: "team1", firstPickTeam: "team1", gameNumber: 2, teamName, ...patch });
  assert.equal(status({}), "Sides follow League Hub side selection.");
  assert.match(status({ sidesReady: false, hubBlueTeam: null }), /^Waiting for Hub side selection\. Pick\/Ban hides its side labels/);
  assert.match(status({ sidesReady: false, hubBlueTeam: null, hubHasSession: false }), /^League Hub has not published a Game 2 draft yet\./);
  assert.match(status({ sidesReady: false, hubBlueTeam: null, hubHasSession: false, hubRequired: false }), /^League Hub drafting is off for this match\. Set sides with Flip Sides/);
  assert.equal(status({ sideControl: "manual" }), "Sides are set with Flip Sides for this game.");
  assert.equal(status({ sideControl: "manual", blueTeam: "team2", onAirBlueTeam: "team2" }),
    "Flip Sides is overriding League Hub for this game. Hub has Aurora on Blue.");
  // Phantom mode keeps publishing its staged sides until corrections are applied.
  assert.equal(status({ sideControl: "manual", blueTeam: "team2", onAirBlueTeam: "team1" }),
    "Pick/Ban still shows Aurora on Blue. Apply corrections in Phantom pick / ban to update the scene.");
  const manual = (patch) => status({ hubLive: false, hubRequired: undefined, hubHasSession: false, hubBlueTeam: null, ...patch });
  assert.equal(manual({}), "");
  assert.equal(manual({ firstPickTeam: "", sidesReady: false }),
    "Set each team's side and pick order. Blue picks first until then. Pick/Ban hides its side labels until then.");
  assert.equal(manual({ firstPickTeam: "", sideControl: "manual" }), "Set which team picks first. Blue picks first until then.");
});
