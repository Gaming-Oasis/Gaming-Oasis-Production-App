import assert from "node:assert/strict";
import test from "node:test";
import { applyMatchLookupResult } from "../lib/match-sync.mjs";

function makeTeam(name, overrides = {}) {
  return {
    sourceName: `${name} source`,
    name,
    placement: "2nd",
    standing: "1-0",
    seed: "#3",
    standingDisplay: "standing",
    logo: `https://example.com/${name}.png`,
    color: "#F6AC18",
    alternateColor: "#C7564B",
    backupColor1: "#F6AC18",
    backupColor2: "#47213F",
    selectedColor: "primary",
    logoBackground: "light",
    overrides: {
      name: "",
      standing: "",
      logo: "",
      color: "",
      logoBackground: "",
      ...overrides,
    },
  };
}

function makeMatch({ id = "", syncedId = "", team1 = makeTeam("Alpha"), team2 = makeTeam("Beta"), league = { name: "League" } } = {}) {
  return { id, syncedId, team1, team2, league };
}

test("loading a different match ID clears both custom team-name overrides", () => {
  const current = makeMatch({
    id: "match-b",
    syncedId: "match-a",
    team1: makeTeam("Alpha", { name: "Custom Alpha", standing: "9-0", logo: "custom.png" }),
    team2: makeTeam("Beta", { name: "Custom Beta", color: "#123456" }),
  });
  // Callers merge the existing overrides onto the synced teams before applying
  // the lookup result (mergeSyncedTeam), matching app/page.tsx syncMatch.
  const team1 = { ...makeTeam("Gamma"), overrides: { ...current.team1.overrides } };
  const team2 = { ...makeTeam("Delta"), overrides: { ...current.team2.overrides } };
  const league = { name: "New League" };
  const next = applyMatchLookupResult(current, { requestedId: "match-b", league, team1, team2 });

  assert.equal(next.syncedId, "match-b");
  assert.equal(next.team1.overrides.name, "");
  assert.equal(next.team2.overrides.name, "");
  // Non-name overrides survive the reset.
  assert.equal(next.team1.overrides.standing, "9-0");
  assert.equal(next.team1.overrides.logo, "custom.png");
  assert.equal(next.team2.overrides.color, "#123456");
  // Synced team records and league data are applied untouched.
  assert.equal(next.team1.name, "Gamma");
  assert.equal(next.team2.name, "Delta");
  assert.equal(next.league, league);
});

test("re-syncing the same match ID keeps the name overrides", () => {
  const current = makeMatch({
    id: "match-a",
    syncedId: "match-a",
    team1: makeTeam("Alpha", { name: "Custom Alpha" }),
    team2: makeTeam("Beta", { name: "Custom Beta" }),
  });
  const next = applyMatchLookupResult(current, {
    requestedId: "match-a",
    league: { name: "League" },
    team1: current.team1,
    team2: current.team2,
  });
  assert.equal(next.team1.overrides.name, "Custom Alpha");
  assert.equal(next.team2.overrides.name, "Custom Beta");
  assert.equal(next.syncedId, "match-a");
});

test("first successful load marks the synced ID and clears empty overrides harmlessly", () => {
  const current = makeMatch({ id: "match-a", syncedId: "" });
  const next = applyMatchLookupResult(current, {
    requestedId: "match-a",
    league: { name: "League" },
    team1: current.team1,
    team2: current.team2,
  });
  assert.equal(next.syncedId, "match-a");
  assert.equal(next.team1.overrides.name, "");
  assert.equal(next.team2.overrides.name, "");
});

test("repeat loads of alternating match IDs clear overrides each time", () => {
  const withOverride = makeMatch({
    syncedId: "match-a",
    team1: makeTeam("Alpha", { name: "Custom Alpha" }),
    team2: makeTeam("Beta"),
  });
  const toB = applyMatchLookupResult(withOverride, {
    requestedId: "match-b",
    league: {},
    team1: makeTeam("Gamma", { name: "New Override" }),
    team2: makeTeam("Delta"),
  });
  assert.equal(toB.team1.overrides.name, "");
  const backToA = applyMatchLookupResult(
    { ...toB, team1: { ...toB.team1, overrides: { ...toB.team1.overrides, name: "Again" } } },
    { requestedId: "match-a", league: {}, team1: makeTeam("Alpha"), team2: makeTeam("Beta") },
  );
  assert.equal(backToA.syncedId, "match-a");
  assert.equal(backToA.team1.overrides.name, "");
});

test("whitespace differences in the requested ID are normalized", () => {
  const current = makeMatch({ syncedId: "match-a" });
  const next = applyMatchLookupResult(current, {
    requestedId: "  match-a  ",
    league: {},
    team1: makeTeam("Alpha", { name: "Custom" }),
    team2: makeTeam("Beta"),
  });
  assert.equal(next.syncedId, "match-a");
  assert.equal(next.team1.overrides.name, "Custom");
});
