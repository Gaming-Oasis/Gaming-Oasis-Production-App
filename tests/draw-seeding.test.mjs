import assert from "node:assert/strict";
import test from "node:test";
import {
  applyTierSeedOffset,
  buildByGroupExport,
  emptyPoolValues,
  filterSeedTeams,
  groupSeedTeamsByHat,
  parseSeedingCsv,
  placedSeedTeamIds,
  shortDrawNames,
  sortSeedTeams,
  serializeByGroupCsv,
  unplacedSeedTeams,
} from "../lib/draw-seeding.mjs";

const OVERALL = `Seed,Team ID,Name
1,c8d589e2-2818-4074-a793-9b6d1ea33b21,GT VALORANT A - Georgia Tech Gold
2,baead384-3a6a-474d-90a9-0cb86bd3ca7d,UCF VALORANT A - Knights Gold
8,330597b8-f1ba-473f-b95b-bafb88812ef1,"Florida, A"
`;

const BY_GROUP = `Group,Group Seed,Team ID,Name
Group 1,1,c8d589e2-2818-4074-a793-9b6d1ea33b21,GT VALORANT A - Georgia Tech Gold
`;

const IMPORT_ERROR = "Import the overall seed list (Seed, Team ID, Name). Groups are assigned on export.";

test("imports an overall seed list and leaves every team unplaced", () => {
  const parsed = parseSeedingCsv(OVERALL);
  assert.equal(parsed.format, "overall");
  assert.equal(parsed.teams.length, 3);
  assert.equal(parsed.teams[0].teamId, "c8d589e2-2818-4074-a793-9b6d1ea33b21");
  assert.equal(parsed.teams[0].group, null);
  assert.equal(parsed.teams[0].seed, 1);
  assert.equal(parsed.teams[2].name, "Florida, A");
  assert.equal(unplacedSeedTeams(parsed.teams, emptyPoolValues(2, 4)).length, 3);
});

test("assigns groups from the pool a team is dropped into", () => {
  const parsed = parseSeedingCsv(OVERALL);
  const values = emptyPoolValues(2, 4);
  values.P21 = parsed.teams[1].name;
  values.P24 = parsed.teams[2].name;
  const slots = { P21: parsed.teams[1].id, P24: parsed.teams[2].id };
  const exported = buildByGroupExport(2, 4, values, parsed.teams, slots);
  assert.deepEqual(exported, [
    {
      group: "Group 2",
      groupSeed: "1",
      teamId: "baead384-3a6a-474d-90a9-0cb86bd3ca7d",
      name: "UCF VALORANT A - Knights Gold",
    },
    {
      group: "Group 2",
      groupSeed: "4",
      teamId: "330597b8-f1ba-473f-b95b-bafb88812ef1",
      name: "Florida, A",
    },
  ]);
  assert.equal(unplacedSeedTeams(parsed.teams, values, slots).map((team) => team.seed).join(","), "1");

  const csv = serializeByGroupCsv(exported);
  assert.match(csv, /^Group,Group Seed,Team ID,Name\r\n/);
  assert.match(csv, /"Florida, A"/);
  assert.equal(parseSeedingCsv(csv).error, IMPORT_ERROR);
});

test("exports a typed pool name with a blank team id", () => {
  const parsed = parseSeedingCsv(OVERALL);
  const values = emptyPoolValues(2, 4);
  values.P11 = "Typed team";
  const exported = buildByGroupExport(2, 4, values, parsed.teams, { P11: parsed.teams[0].id });
  assert.equal(exported[0].teamId, "");
  assert.equal(exported[0].name, "Typed team");
  assert.equal(exported[0].group, "Group 1");
  assert.equal(exported[0].groupSeed, "1");
});

test("groups Rocket League and VALORANT seeds into draw hats", () => {
  const teams = [1, 4, 5, 8, 9, 16, 17, 28, 32, 40, 53, 64, 65].map((seed) => ({
    id: String(seed),
    teamId: String(seed),
    name: `Team ${seed}`,
    seed,
    group: null,
  }));
  assert.deepEqual(groupSeedTeamsByHat("RLT1", teams).map((group) => [group.label, group.range, group.teams.map((team) => team.seed)]), [
    ["Hat 1", "1-4", [1, 4]],
    ["Hat 2", "5-8", [5, 8]],
    ["Hat 3", "9-12", [9]],
    ["Hat 4", "13-16", [16]],
    ["Outside the hats", "", [17, 28, 32, 40, 53, 64, 65]],
  ]);
  assert.deepEqual(groupSeedTeamsByHat("RLT2", teams).filter((group) => group.label.startsWith("Hat")).map((group) => group.teams.map((team) => team.seed)), [
    [17, 28],
    [32, 40],
    [53, 64],
  ]);
  assert.deepEqual(groupSeedTeamsByHat("VALT1", teams).filter((group) => group.label.startsWith("Hat")).map((group) => group.teams.map((team) => team.seed)), [
    [1, 4],
    [5, 8],
  ]);
  assert.deepEqual(groupSeedTeamsByHat("VALT2", teams).map((group) => [group.label, group.teams.map((team) => team.seed)]), [
    ["Hat 1", [9]],
    ["Hat 2", [16, 17]],
    ["Hat 4", [28, 32]],
    ["Outside the hats", [1, 4, 5, 8, 40, 53, 64, 65]],
  ]);
  assert.deepEqual(sortSeedTeams("VALT2", teams).slice(0, 4).map((team) => team.seed), [9, 16, 17, 28]);
});

test("shifts tier 2 file seeds onto the overall ranking", () => {
  const parsed = parseSeedingCsv(OVERALL);
  assert.deepEqual(applyTierSeedOffset("RLT1", parsed.teams).map((team) => team.seed), [1, 2, 8]);
  assert.deepEqual(applyTierSeedOffset("VALT1", parsed.teams).map((team) => team.seed), [1, 2, 8]);
  const rocket = applyTierSeedOffset("RLT2", parsed.teams);
  const valorant = applyTierSeedOffset("VALT2", parsed.teams);
  assert.deepEqual(rocket.map((team) => team.seed), [17, 18, 24]);
  assert.deepEqual(valorant.map((team) => team.seed), [9, 10, 16]);
  assert.equal(rocket[0].id, parsed.teams[0].id);
  assert.deepEqual(groupSeedTeamsByHat("RLT2", rocket).map((group) => group.label), ["Hat 1"]);
  assert.deepEqual(groupSeedTeamsByHat("VALT2", valorant).map((group) => [group.label, group.teams.map((team) => team.seed)]), [
    ["Hat 1", [9, 10]],
    ["Hat 2", [16]],
  ]);
});

test("marks a team placed only when the pool still shows that team", () => {
  const parsed = parseSeedingCsv(OVERALL);
  const values = emptyPoolValues(2, 4);
  values.P11 = parsed.teams[0].name;
  const slots = { P11: parsed.teams[0].id };
  assert.deepEqual([...placedSeedTeamIds(parsed.teams, values, slots)], [parsed.teams[0].id]);
  values.P11 = "Someone else";
  assert.equal(placedSeedTeamIds(parsed.teams, values, slots).size, 0);
});

test("shortens draw show JSON names to the school and squad", () => {
  assert.deepEqual(shortDrawNames({
    P11: "Cumberland Rocket League A - Cumberland Phoenix",
    P12: "Daytona State Rocket League A",
    P13: "Cumberland Rocket League B - Cumberland Maroon",
    P14: "University of Texas at Dallas Rocket League C - UTD Black",
    P15: "",
  }, "Rocket League"), {
    P11: "Cumberland A",
    P12: "Daytona State A",
    P13: "Cumberland B",
    P14: "University of Texas at Dallas C",
    P15: "",
  });
  assert.equal(shortDrawNames({ P11: "GT VALORANT A - Georgia Tech Gold" }, "VALORANT").P11, "GT A");
});

test("filters imported teams by name or seed", () => {
  const parsed = parseSeedingCsv(OVERALL);
  assert.equal(filterSeedTeams(parsed.teams, "").length, 3);
  assert.deepEqual(filterSeedTeams(parsed.teams, "ucf").map((team) => team.seed), [2]);
  assert.deepEqual(filterSeedTeams(parsed.teams, "8").map((team) => team.name), ["Florida, A"]);
});

test("rejects a group list and a seed file without team ids", () => {
  assert.equal(parseSeedingCsv(BY_GROUP).error, IMPORT_ERROR);
  assert.equal(parseSeedingCsv("Seed,Name\n1,Example\n").error, IMPORT_ERROR);
});
