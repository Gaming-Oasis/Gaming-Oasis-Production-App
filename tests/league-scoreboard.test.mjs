import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLeagueScoreboard, isLeagueScoreboard, resetLeagueScoreboardCounts, leagueScoreboardValue, leagueScoreboardTeam, updateLeagueDragons, setLeagueBaronActive, leagueBaronSecondsRemaining, setLeagueElderActive, leagueElderSecondsRemaining } from "../lib/league-scoreboard.mjs";
import { buildLeagueOverlayState, createLeagueDebugFeed, createLeagueDraftState } from "../lib/league-of-legends.mjs";
import { isLeagueOverlayData } from "../lib/league-overlay.mjs";

test("League scoreboard defaults hide the scoreboard and countdowns and disable unreliable API choices", () => {
  const settings = normalizeLeagueScoreboard();
  assert.equal(settings.hideScoreboard, true);
  assert.equal(settings.hideCountdowns, true);
  assert.equal(settings.goldSource, "disabled");
  assert.equal(settings.stats.gold, undefined);
  const unsupportedGold = { ...settings, goldSource: "api" };
  assert.equal(isLeagueScoreboard(unsupportedGold), false);
  assert.equal(normalizeLeagueScoreboard(unsupportedGold).goldSource, "disabled");
  assert.equal(settings.clockSource, "api");
  assert.equal(settings.stats.kills.source, "api");
  assert.equal(settings.stats.towers.source, "api");
  for (const key of ["grubs", "barons", "dragons"]) {
    assert.deepEqual(settings.stats[key], { source: "manual", team1: 0, team2: 0 });
    const invalid = structuredClone(settings);
    invalid.stats[key].source = "api";
    assert.equal(isLeagueScoreboard(invalid), false);
    assert.equal(normalizeLeagueScoreboard(invalid).stats[key].source, "manual");
  }
});

test("manual values survive reloads and API outages, follow side flips, and reset for new games", () => {
  const settings = normalizeLeagueScoreboard({ hideScoreboard: false, hideCountdowns: false, goldSource: "disabled", clockSource: "disabled", stats: { grubs: { team1: 3, team2: 1 }, kills: { source: "manual", team1: 60, team2: 9 } } });
  const reloaded = normalizeLeagueScoreboard(JSON.parse(JSON.stringify(settings)));
  assert.deepEqual(reloaded, settings);
  const live = createLeagueDebugFeed("live");
  assert.equal(leagueScoreboardValue(settings, "grubs", "ORDER", "team1", live, false), 3);
  assert.equal(leagueScoreboardValue(settings, "grubs", "ORDER", "team2", live, true), 1);
  assert.equal(leagueScoreboardValue(settings, "grubs", "CHAOS", "team2", live, true), 3);
  assert.equal(leagueScoreboardValue(settings, "kills", "ORDER", "team1", live, false), 60);
  assert.equal(leagueScoreboardValue(settings, "towers", "ORDER", "team1", live, false), "—");
  const reset = resetLeagueScoreboardCounts(settings);
  assert.equal(reset.hideScoreboard, false);
  assert.equal(reset.hideCountdowns, false);
  assert.equal(reset.goldSource, "disabled");
  assert.equal(reset.clockSource, "disabled");
  assert.equal(reset.stats.kills.source, "manual");
  assert.ok(Object.values(reset.stats).every(stat => stat.team1 === 0 && stat.team2 === 0));
  assert.equal(settings.stats.grubs.team1, 3);
});

test("manual controls validate finite bounded whole counts and retain API kills", () => {
  const settings = normalizeLeagueScoreboard({ stats: { grubs: { team1: -1, team2: 3.8 }, barons: { team1: Infinity, team2: "2" }, dragons: { team1: 8 } } });
  assert.equal(settings.stats.grubs.team1, 0);
  assert.equal(settings.stats.grubs.team2, 3);
  assert.equal(settings.stats.barons.team1, 0);
  assert.equal(settings.stats.barons.team2, 2);
  assert.equal(settings.stats.dragons.team1, 4);
  const live = createLeagueDebugFeed("live");
  assert.equal(leagueScoreboardValue(settings, "kills", "ORDER", "team1", live, true), live.players.filter(p => p.team === "ORDER").reduce((total, p) => total + p.kills, 0));
  assert.equal(isLeagueScoreboard(settings), true);
  for (const invalid of [-1, NaN, Infinity, "3", null, 1.5]) {
    const bad = structuredClone(settings); bad.stats.grubs.team1 = invalid;
    assert.equal(isLeagueScoreboard(bad), false);
  }
});

test("overlay payload carries validated operator controls and remains compatible with older frames", () => {
  const scoreboard = normalizeLeagueScoreboard({ hideScoreboard: false, stats: { grubs: { team2: 3 } } });
  const team = { name: "Team", standing: "", logo: "", color: "#171717", logoBackground: "#FFFFFF" };
  const overlay = { ...buildLeagueOverlayState({ bestOf: "Bo3", draftMode: "standard", draft: createLeagueDraftState(), blueTeam: "team2", confirmedGames: [], scoreboard }, team, team), live: createLeagueDebugFeed("live") };
  assert.deepEqual(overlay.scoreboard, scoreboard);
  assert.equal(overlay.blueTeamKey, "team2");
  assert.equal(isLeagueOverlayData(overlay), true);
  const bad = structuredClone(overlay); bad.scoreboard.clockSource = "manual";
  assert.equal(isLeagueOverlayData(bad), false);
  delete overlay.scoreboard; delete overlay.blueTeamKey;
  assert.equal(isLeagueOverlayData(overlay), true);
});

test("the fourth dragon automatically grants Soul and corrections update its type", () => {
  let settings = updateLeagueDragons(normalizeLeagueScoreboard(), "team1", { types: ["ocean", "mountain", "hextech", "hextech"] });
  assert.equal(settings.stats.dragons.team1, 4);
  assert.equal(settings.dragons.team1.soulType, "hextech");
  settings = updateLeagueDragons(settings, "team1", { soulActive: false, soulType: "ocean" });
  assert.equal(settings.dragons.team1.soulActive, true);
  assert.equal(settings.dragons.team1.soulType, "hextech");
  assert.deepEqual(normalizeLeagueScoreboard(JSON.parse(JSON.stringify(settings))), settings);
  assert.deepEqual(settings.dragons[leagueScoreboardTeam("CHAOS", "team2")].types, ["ocean", "mountain", "hextech", "hextech"]);
  assert.equal(leagueScoreboardValue(settings, "dragons", "CHAOS", "team2", null, false), 4);
  settings = updateLeagueDragons(settings, "team2", { soulActive: true, soulType: "ocean" });
  assert.equal(settings.dragons.team1.soulActive, true);
  assert.equal(settings.dragons.team2.soulActive, false);
  assert.equal(settings.stats.dragons.team2, 0);
  settings = updateLeagueDragons(settings, "team1", { types: ["mountain", "hextech", "hextech"] });
  assert.equal(settings.stats.dragons.team1, 3);
  assert.equal(settings.dragons.team1.soulActive, false);
  assert.equal(settings.dragons.team1.soulType, "unknown");
  settings = updateLeagueDragons(settings, "team1", { types: ["mountain", "hextech", "hextech", "ocean"] });
  assert.equal(settings.dragons.team1.soulActive, true);
  assert.equal(settings.dragons.team1.soulType, "ocean");
  const reset = resetLeagueScoreboardCounts(settings);
  assert.deepEqual(reset.dragons, { team1: { types: [], soulActive: false, soulType: "unknown" }, team2: { types: [], soulActive: false, soulType: "unknown" } });
  assert.equal(isLeagueScoreboard(settings), true);
});

test("fixed dragon slots preserve empty positions, count only taken dragons, and derive Soul from slot four", () => {
  let settings = updateLeagueDragons(normalizeLeagueScoreboard(), "team1", { types: ["ocean", "", "hextech", "mountain"] });
  assert.deepEqual(settings.dragons.team1.types, ["ocean", "", "hextech", "mountain"]);
  assert.equal(settings.stats.dragons.team1, 3);
  assert.equal(settings.dragons.team1.soulActive, true);
  assert.equal(settings.dragons.team1.soulType, "mountain");
  assert.equal(isLeagueScoreboard(settings), true);
  assert.deepEqual(normalizeLeagueScoreboard(JSON.parse(JSON.stringify(settings))), settings);
  settings = updateLeagueDragons(settings, "team1", { types: ["ocean", "", "hextech", ""] });
  assert.deepEqual(settings.dragons.team1.types, ["ocean", "", "hextech"]);
  assert.equal(settings.stats.dragons.team1, 2);
  assert.equal(settings.dragons.team1.soulActive, false);
  assert.equal(settings.dragons.team1.soulType, "unknown");
  settings = updateLeagueDragons(settings, "team1", { types: ["", "", "", ""] });
  assert.equal(settings.stats.dragons.team1, 0);
  assert.deepEqual(settings.dragons.team1.types, []);
  assert.equal(isLeagueScoreboard(settings), true);
});

test("older four-dragon counts automatically gain Soul without inventing its type", () => {
  const legacy = normalizeLeagueScoreboard();
  delete legacy.dragons;
  legacy.stats.dragons.team1 = 4;
  assert.equal(isLeagueScoreboard(legacy), true);
  const migrated = normalizeLeagueScoreboard(legacy);
  assert.deepEqual(migrated.dragons.team1.types, ["unknown", "unknown", "unknown", "unknown"]);
  assert.equal(migrated.dragons.team1.soulActive, true);
  assert.equal(migrated.dragons.team1.soulType, "unknown");
  assert.equal(migrated.stats.dragons.team1, 4);
});

test("dragon payload validation rejects invalid fields and normalization ignores legacy Soul toggles", () => {
  const valid = updateLeagueDragons(normalizeLeagueScoreboard(), "team1", { types: ["ocean"] });
  for (const patch of [
    { types: ["../../file"] }, { types: "ocean" }, { types: Array(5).fill("ocean") },
    { types: [] }, { soulType: "elder" }, { soulActive: "yes" },
  ]) {
    const bad = structuredClone(valid); Object.assign(bad.dragons.team1, patch);
    assert.equal(isLeagueScoreboard(bad), false);
  }
  const bad = structuredClone(valid);
  bad.dragons.team1.soulActive = bad.dragons.team2.soulActive = true;
  assert.equal(isLeagueScoreboard(bad), true);
  assert.equal(normalizeLeagueScoreboard(bad).dragons.team1.soulActive, false);
  assert.equal(normalizeLeagueScoreboard(bad).dragons.team2.soulActive, false);
  assert.equal(isLeagueScoreboard(normalizeLeagueScoreboard(bad)), true);
});

test("Baron activation starts a persisted three-minute timer without changing kill counts", () => {
  const started = 1_800_000_000_000;
  const settings = setLeagueBaronActive(normalizeLeagueScoreboard({ stats: { barons: { team1: 2 } } }), "team1", true, started);
  const buff = settings.baronBuffs.team1;
  assert.equal(buff.expiresAt, started + 180_000);
  assert.equal(leagueBaronSecondsRemaining(buff, started), 180);
  assert.equal(leagueBaronSecondsRemaining(buff, started + 999), 180);
  assert.equal(leagueBaronSecondsRemaining(buff, started + 1_000), 179);
  assert.equal(leagueBaronSecondsRemaining(buff, started + 179_001), 1);
  assert.equal(leagueBaronSecondsRemaining(buff, started + 180_000), 0);
  assert.equal(leagueBaronSecondsRemaining(buff, started + 300_000), 0);
  assert.equal(settings.stats.barons.team1, 2);
  const reloaded = normalizeLeagueScoreboard(JSON.parse(JSON.stringify(settings)));
  assert.deepEqual(reloaded, settings);
  assert.equal(leagueBaronSecondsRemaining(reloaded.baronBuffs[leagueScoreboardTeam("CHAOS", "team2")], started + 45_000), 135);
  assert.equal(isLeagueScoreboard(reloaded), true);
});

test("Baron deactivation, ownership changes, reactivation, and game reset clear the correct timer", () => {
  const started = 1_800_000_000_000;
  let settings = setLeagueBaronActive(normalizeLeagueScoreboard(), "team1", true, started);
  settings = setLeagueBaronActive(settings, "team2", true, started + 10_000);
  assert.equal(settings.baronBuffs.team1.expiresAt, null);
  assert.equal(leagueBaronSecondsRemaining(settings.baronBuffs.team2, started + 10_000), 180);
  settings = setLeagueBaronActive(settings, "team2", false, started + 11_000);
  assert.equal(leagueBaronSecondsRemaining(settings.baronBuffs.team2, started + 11_000), 0);
  settings = setLeagueBaronActive(settings, "team2", true, started + 20_000);
  assert.equal(settings.baronBuffs.team2.expiresAt, started + 200_000);
  assert.deepEqual(resetLeagueScoreboardCounts(settings).baronBuffs, { team1: { expiresAt: null }, team2: { expiresAt: null } });
});

test("Baron timers default inactive for old drafts and reject malformed expiry values", () => {
  const settings = normalizeLeagueScoreboard();
  delete settings.baronBuffs;
  assert.equal(isLeagueScoreboard(settings), true);
  assert.deepEqual(normalizeLeagueScoreboard(settings).baronBuffs, { team1: { expiresAt: null }, team2: { expiresAt: null } });
  for (const expiresAt of [undefined, "180000", -1, 0, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER]) {
    const bad = normalizeLeagueScoreboard(); bad.baronBuffs.team1.expiresAt = expiresAt;
    assert.equal(isLeagueScoreboard(bad), false);
    assert.equal(normalizeLeagueScoreboard(bad).baronBuffs.team1.expiresAt, null);
    assert.equal(leagueBaronSecondsRemaining(bad.baronBuffs.team1, 1_800_000_000_000), 0);
  }
});

test("Elder activation persists a 150-second countdown through reloads and side flips", () => {
  const started = 1_800_000_000_000;
  const settings = setLeagueElderActive(normalizeLeagueScoreboard(), "team1", true, started);
  assert.equal(settings.elderBuffs.team1.expiresAt, started + 150_000);
  const reloaded = normalizeLeagueScoreboard(JSON.parse(JSON.stringify(settings)));
  assert.deepEqual(reloaded, settings);
  const buff = reloaded.elderBuffs[leagueScoreboardTeam("CHAOS", "team2")];
  for (const [elapsed, expected] of [[0, 150], [999, 150], [1_000, 149], [45_000, 105], [149_001, 1], [150_000, 0], [300_000, 0]]) {
    assert.equal(leagueElderSecondsRemaining(buff, started + elapsed), expected);
  }
  assert.equal(isLeagueScoreboard(reloaded), true);
});

test("Elder transfers, deactivates, and resets independently of Soul, dragon counts, and Baron", () => {
  const started = 1_800_000_000_000;
  let settings = updateLeagueDragons(normalizeLeagueScoreboard(), "team1", { types: ["ocean", "hextech", "hextech", "hextech"], soulActive: true, soulType: "hextech" });
  settings = setLeagueBaronActive(settings, "team1", true, started);
  const dragons = structuredClone(settings.dragons);
  const baron = structuredClone(settings.baronBuffs);
  settings = setLeagueElderActive(settings, "team1", true, started);
  settings = setLeagueElderActive(settings, "team2", true, started + 10_000);
  assert.equal(settings.elderBuffs.team1.expiresAt, null);
  assert.equal(leagueElderSecondsRemaining(settings.elderBuffs.team2, started + 10_000), 150);
  settings = setLeagueElderActive(settings, "team2", false, started + 11_000);
  assert.equal(leagueElderSecondsRemaining(settings.elderBuffs.team2, started + 11_000), 0);
  settings = setLeagueElderActive(settings, "team2", true, started + 20_000);
  assert.equal(settings.elderBuffs.team2.expiresAt, started + 170_000);
  assert.deepEqual(settings.dragons, dragons);
  assert.deepEqual(settings.baronBuffs, baron);
  assert.equal(settings.stats.dragons.team1, 4);
  assert.equal(settings.stats.dragons.team2, 0);
  assert.deepEqual(resetLeagueScoreboardCounts(settings).elderBuffs, { team1: { expiresAt: null }, team2: { expiresAt: null } });
});

test("old Soul settings do not activate Elder and malformed Elder deadlines are rejected", () => {
  const legacy = updateLeagueDragons(normalizeLeagueScoreboard(), "team1", { soulActive: true, soulType: "ocean" });
  delete legacy.elderBuffs;
  assert.equal(isLeagueScoreboard(legacy), true);
  assert.deepEqual(normalizeLeagueScoreboard(legacy).elderBuffs, { team1: { expiresAt: null }, team2: { expiresAt: null } });
  for (const expiresAt of [undefined, "150000", -1, 0, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER]) {
    const bad = normalizeLeagueScoreboard(); bad.elderBuffs.team1.expiresAt = expiresAt;
    assert.equal(isLeagueScoreboard(bad), false);
    assert.equal(normalizeLeagueScoreboard(bad).elderBuffs.team1.expiresAt, null);
    assert.equal(leagueElderSecondsRemaining(bad.elderBuffs.team1, 1_800_000_000_000), 0);
  }
});
