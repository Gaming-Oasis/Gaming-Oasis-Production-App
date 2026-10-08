import assert from "node:assert/strict";
import test from "node:test";
import {
  createLeagueDraftState,
  expectedLeagueSelection,
  leagueFirstPickSide,
  leagueSeedHolder,
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
  assert.deepEqual(expectedLeagueSelection("team2"), {
    firstSelectionTeam: "team2",
    firstSelectionEntitlement: "order",
    firstPickTeam: "team2",
    blueTeam: "team1",
  });
  assert.deepEqual(expectedLeagueSelection("team1"), {
    firstSelectionTeam: "team1",
    firstSelectionEntitlement: "order",
    firstPickTeam: "team1",
    blueTeam: "team2",
  });
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
