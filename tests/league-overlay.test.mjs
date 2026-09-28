import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { assignLeaguePickRole, buildLeagueOverlayState, createLeagueDebugFeed, createLeagueDraftState, draftSlots, lockLeagueDraftSelection, normalizeLeagueDraft, undoLeagueDraftSelection } from "../lib/league-of-legends.mjs";
import { isLeagueOverlayData, leagueFearlessChampions, leagueFearlessPage, leagueLiveStatsAvailable } from "../lib/league-overlay.mjs";
import { startJsonWriter } from "../scripts/json-writer.mjs";
import { normalizeLeagueLiveFeed } from "../lib/league-of-legends.mjs";
import { leagueDraftSteps } from "../lib/league-of-legends.mjs";
import { buildLeagueScoreFields } from "../lib/league-of-legends.mjs";
import { startLeagueLiveClient } from "../lib/league-of-legends-live.mjs";

test("complete game snapshots replace previous events across new games and replay seeks", () => {
  const players = [{ riotId: "Blue#GO", team: "ORDER", scores: { kills: 0 } }];
  const snapshot = (time, events) => ({ allgamedata: { allPlayers: players, gameData: { gameTime: time }, events: { Events: events } } });
  const first = normalizeLeagueLiveFeed(snapshot(900, [
    { EventID: 0, EventTime: 0, EventName: "GameStart" },
    { EventID: 1, EventTime: 350, EventName: "HordeKill", KillerName: "Blue#GO" },
    { EventID: 2, EventTime: 400, EventName: "DragonKill", KillerName: "Blue#GO", DragonType: "Water" },
    { EventID: 3, EventTime: 800, EventName: "GameEnd", WinningTeam: "ORDER" },
  ]));
  assert.equal(first.objectives.ORDER.elementalDragons, 1);
  assert.equal(first.game.finished, true);
  for (const time of [100, 1000]) {
    const next = normalizeLeagueLiveFeed(snapshot(time, [{ EventID: 0, EventTime: 0.5, EventName: "GameStart" }]), first);
    assert.equal(next.game.finished, false);
    assert.equal(next.game.winnerTeam, null);
    assert.equal(next.objectives.ORDER.grubs, 0);
    assert.equal(next.objectives.ORDER.dragons, 0);
    assert.equal(next.events.length, 1);
  }
  assert.equal(normalizeLeagueLiveFeed(snapshot(600, []), first).events.length, 0);
});

test("tower last hits by minions and unidentified actors credit the destroyed tower's opponent", () => {
  const feed = normalizeLeagueLiveFeed({ eventdata: { Events: [
    { EventID: 1, EventTime: 600, EventName: "TurretKilled", KillerName: "Minion_T100L1S39N0240", TurretKilled: "Turret_TChaos_L1_P3_2254202041_0" },
    { EventID: 2, EventTime: 700, EventName: "TurretKilled", KillerName: "RiftHeraldMercenary", TurretKilled: "Turret_TOrder_L1_P3_1_0" },
    { EventID: 3, EventTime: 800, EventName: "TurretKilled", TurretKilled: "Turret_T2_L_03_A" },
  ] } });
  assert.equal(feed.objectives.ORDER.towers, 2);
  assert.equal(feed.objectives.CHAOS.towers, 1);
});

test("objective totals use full event history even when the inspection list is capped", () => {
  const Events = [{ EventID: 0, EventTime: 1, EventName: "DragonKill", Team: "ORDER", DragonType: "Water" },
    ...Array.from({ length: 510 }, (_, i) => ({ EventID: i + 1, EventTime: i + 2, EventName: "ChampionKill", Team: "CHAOS" }))];
  const feed = normalizeLeagueLiveFeed({ eventdata: { Events } });
  assert.equal(feed.events.length, 500);
  assert.equal(feed.objectives.ORDER.elementalDragons, 1);
});

test("malformed live responses hold the last good frame and recover on a complete snapshot", async () => {
  let response = { allPlayers: [{ riotId: "Blue#GO", team: "ORDER", scores: { kills: 2 } }], gameData: { gameTime: 500 }, events: { Events: [{ EventID: 1, EventTime: 400, EventName: "DragonKill", KillerName: "Blue#GO", DragonType: "Water" }] } };
  const client = startLeagueLiveClient({ intervalMs: 60000, requestJson: async () => response });
  try {
    await new Promise(resolve => setTimeout(resolve, 0));
    const good = client.getFeed();
    assert.equal(good.objectives.ORDER.elementalDragons, 1);
    for (const invalid of [{}, { ...response, events: {} }, { ...response, gameData: { gameTime: "500" } }]) {
      response = invalid;
      await client.poll();
      assert.equal(client.getFeed().connection.connected, false);
      assert.deepEqual(client.getFeed().objectives, good.objectives);
    }
    response = { allPlayers: [{ riotId: "Blue#GO", team: "ORDER", scores: { kills: 0 } }], gameData: { gameTime: 2 }, events: { Events: [] } };
    await client.poll();
    assert.equal(client.getFeed().connection.connected, true);
    assert.equal(client.getFeed().objectives.ORDER.dragons, 0);
  } finally { client.stop(); }
});

test("League score exports use saved winners in Team 1/Team 2 order", () => {
  const league = { bestOf: "Bo5", blueTeam: "team2", results: [{ winner: "team2" }], confirmedGames: [{ gameNumber: 1, winner: "team1" }, { gameNumber: 2, winner: "team2" }, { gameNumber: 5, winner: "team1" }] };
  assert.deepEqual(buildLeagueScoreFields(league), { lolscore1: "1 - 0", lolscore2: "0 - 1", lolscore3: "", lolscore4: "", lolscore5: "1 - 0" });
  assert.equal(buildLeagueScoreFields({ ...league, bestOf: "Bo3" }).lolscore5, "");
  assert.equal(buildLeagueScoreFields({ ...league, confirmedGames: [] }).lolscore1, "");
});

test("online Standard records all bans before picks and preserves tournament drafts", () => {
  const steps = leagueDraftSteps("online");
  assert.ok(steps.slice(0, 10).every((step) => step.action === "ban"));
  assert.deepEqual(steps.slice(10).map((step) => step.side), ["ORDER", "CHAOS", "CHAOS", "ORDER", "ORDER", "CHAOS", "CHAOS", "ORDER", "ORDER", "CHAOS"]);
  assert.equal(leagueDraftSteps("standard")[6].action, "pick");
  let draft = createLeagueDraftState();
  draft = lockLeagueDraftSelection(draft, "Ahri", new Set(), "online").draft;
  assert.equal(lockLeagueDraftSelection(draft, "Ahri", new Set(), "online").changed, true);
  assert.equal(lockLeagueDraftSelection(draft, "Ahri", new Set(), "standard").changed, false);
  for (let index = 1; index < 20; index++) draft = lockLeagueDraftSelection(draft, `Champion${index}`, new Set(), "online").draft;
  assert.equal(draftSlots(draft, "online").bluePicks[0], "Champion10");
  assert.equal(draftSlots(draft, "online").redPicks[4], "Champion19");
  assert.equal(draftSlots(undoLeagueDraftSelection(draft), "online").redPicks[4], "");
  const frame = fixture({ draftMode: "online", draft });
  assert.equal(isLeagueOverlayData(frame), true);
});

test("Dragon Soul belongs to the fourth elemental dragon's team and excludes Elder", () => {
  const raw = (types) => ({
    playerlist: [{ riotId: "Blue#GO", team: "ORDER", scores: {} }, { riotId: "Red#GO", team: "CHAOS", scores: {} }],
    gamestats: { gameTime: 1800 },
    eventdata: { Events: types.map(([DragonType, KillerName], EventID) => ({ EventID, EventTime: EventID * 100, EventName: "DragonKill", DragonType, KillerName })) },
  });
  const first = [["Fire", "Red#GO"], ["Air", "Red#GO"], ["Earth", "Red#GO"], ["Elder", "Red#GO"]];
  const noSoul = normalizeLeagueLiveFeed(raw(first));
  assert.equal(noSoul.objectives.CHAOS.elementalDragons, 3);
  assert.equal(noSoul.objectives.CHAOS.dragonSoul, null);
  const soul = normalizeLeagueLiveFeed(raw([...first, ["Earth", "Red#GO"], ["Elder", "Blue#GO"]]));
  assert.equal(soul.objectives.CHAOS.dragonSoul, "earth");
  assert.equal(soul.objectives.ORDER.dragonSoul, null);
  const repeated = normalizeLeagueLiveFeed(raw([...first, ["Earth", "Red#GO"]]), soul);
  assert.equal(repeated.objectives.CHAOS.elementalDragons, 4);
  assert.equal(repeated.objectives.CHAOS.dragonSoul, "earth");
});

const team = (name) => ({ name, standing: "", logo: "", color: "#F6AC18", logoBackground: "#FFFFFF" });
test("Void Grubs count individual Horde kills by killer team without double-counting polls", () => {
  const raw = {
    playerlist: [
      { riotId: "Blue#GO", riotIdGameName: "Blue", team: "ORDER" },
      { riotId: "Bot#GO", riotIdGameName: "Bot", summonerName: "Bot Bot", team: "CHAOS" },
    ],
    gamestats: { gameTime: 600 },
    eventdata: { Events: [
      { EventID: 1, EventName: "HordeKill", KillerName: "Blue", EventTime: 400 },
      { EventID: 2, EventName: "HordeKill", KillerName: "Blue#GO", EventTime: 401 },
      { EventID: 3, EventName: "HordeKill", KillerName: "Bot Bot", EventTime: 402, Stolen: "True" },
      { EventID: 4, EventName: "HeraldKill", KillerName: "Blue", EventTime: 500 },
      { EventID: 5, EventName: "HordeKill", KillerName: "Unknown", EventTime: 501 },
    ] },
  };
  const first = normalizeLeagueLiveFeed(raw);
  const repeated = normalizeLeagueLiveFeed(raw, first);
  assert.equal(repeated.objectives.ORDER.grubs, 2);
  assert.equal(repeated.objectives.CHAOS.grubs, 1);
  assert.equal(repeated.objectives.ORDER.heralds, 1);
  assert.equal(normalizeLeagueLiveFeed().objectives.ORDER.grubs, 0);
  const frame = fixture();
  delete frame.live.objectives.ORDER.grubs;
  assert.equal(isLeagueOverlayData(frame), true);
  for (const invalid of [-1, 1.5, "3", null]) {
    frame.live.objectives.ORDER.grubs = invalid;
    assert.equal(isLeagueOverlayData(frame), false);
  }
});

function fixture(options = {}) {
  return { ...buildLeagueOverlayState({
    bestOf: "Bo5", draftMode: "fearless", draft: createLeagueDraftState(), confirmedGames: [], ...options,
  }, team("Alpha"), team("Beta"), { logo: "/league.png" }), live: createLeagueDebugFeed("live") };
}

test("League scoreboard header uses the General Info event name unless overridden", () => {
  const baseLeague = {
    scoreboardHeader: "",
    bestOf: "Bo3",
    draftMode: "standard",
    draft: createLeagueDraftState(),
    confirmedGames: [],
  };
  const fromEvent = buildLeagueOverlayState(
    baseLeague,
    team("Alpha"),
    team("Beta"),
    {},
    [],
    { eventName: "SEL Finals" },
  );
  assert.equal(fromEvent.header, "SEL Finals");

  const overridden = buildLeagueOverlayState(
    { ...baseLeague, scoreboardHeader: "Championship Match" },
    team("Alpha"),
    team("Beta"),
    {},
    [],
    { eventName: "SEL Finals" },
  );
  assert.equal(overridden.header, "Championship Match");
});

test("role swaps survive persistence and undo without changing chronological picks or bans", () => {
  let draft = createLeagueDraftState();
  for (const champion of ["Aatrox", "Ahri", "Akali", "Akshan", "Alistar", "Ambessa", "Amumu", "Anivia", "Annie", "Aphelios", "Ashe"]) {
    draft = lockLeagueDraftSelection(draft, champion).draft;
  }
  const slots = draftSlots(draft);
  const reordered = assignLeaguePickRole(draft, "blue", 0, 2);
  assert.deepEqual(reordered.bluePickOrder, [2, 1, 0, 3, 4]);
  assert.deepEqual(reordered.redPickOrder, [0, 1, 2, 3, 4]);
  assert.deepEqual(draftSlots(reordered), slots);
  const restored = normalizeLeagueDraft(JSON.parse(JSON.stringify(reordered)));
  assert.deepEqual(restored.bluePickOrder, reordered.bluePickOrder);
  const undone = undoLeagueDraftSelection(restored);
  assert.equal(draftSlots(undone).bluePicks[2], "");
  assert.deepEqual(undone.bluePickOrder, reordered.bluePickOrder);
  assert.deepEqual(createLeagueDraftState().bluePickOrder, [0, 1, 2, 3, 4]);
});

test("old drafts and invalid role orders normalize safely", () => {
  const legacy = { selections: Array(20).fill(""), timerSeconds: 45 };
  assert.deepEqual(normalizeLeagueDraft(legacy).redPickOrder, [0, 1, 2, 3, 4]);
  for (const order of [null, [0, 0, 2, 3, 4], [0, 1, 2, 3, 5], ["0", 1, 2, 3, 4]]) {
    assert.deepEqual(normalizeLeagueDraft({ ...legacy, bluePickOrder: order }).bluePickOrder, [0, 1, 2, 3, 4]);
  }
  assert.deepEqual(assignLeaguePickRole(legacy, "blue", 0, 9), normalizeLeagueDraft(legacy));
});

test("payload validates complete frames and rejects malformed nested data", () => {
  const good = fixture();
  assert.equal(isLeagueOverlayData(good), true);
  assert.equal(good.leagueLogo, "/league.png");
  assert.equal(good.playerBoardEnabled, false);
  for (const mutate of [
    (x) => { x.live.players = [null]; },
    (x) => { x.live.objectives.ORDER.towers = "0"; },
    (x) => { x.draft.bluePicks = null; },
    (x) => { x.draft.bluePickOrder = [0, 0, 2, 3, 4]; },
    (x) => { x.confirmedGames = [null]; },
    (x) => { x.sponsors = [{ name: "Broken" }]; },
    (x) => { x.blueTeam = null; },
  ]) {
    const bad = structuredClone(good);
    mutate(bad);
    assert.equal(isLeagueOverlayData(bad), false);
  }
  const legacy = structuredClone(good);
  delete legacy.leagueLogo;
  delete legacy.draft.bluePickOrder;
  delete legacy.draft.redPickOrder;
  assert.equal(isLeagueOverlayData(legacy), true);
});

test("side swap keeps team branding and saved series wins together", () => {
  const games = [{ gameNumber: 1, winner: "team1", bluePicks: Array(5).fill(""), redPicks: Array(5).fill("") }];
  for (const bestOf of ["Bo1", "Bo3", "Bo5"]) {
    const value = fixture({ bestOf, confirmedGames: games, blueTeam: "team2" });
    assert.equal(value.blueTeam.name, "Beta");
    assert.equal(value.blueTeam.seriesScore, "0");
    assert.equal(value.redTeam.seriesScore, "1");
  }
});

test("fearless pages show all 20, 30 and 40 picks without increasing strip height", () => {
  for (const count of [0, 20, 30, 40]) {
    const champions = Array.from({ length: count }, (_, i) => "Champion " + i);
    const first = leagueFearlessPage(champions, 0);
    const second = leagueFearlessPage(champions, 15_000);
    assert.equal(first.page, 0);
    assert.equal(first.champions.length, Math.min(20, count));
    assert.equal(second.page, count > 20 ? 1 : 0);
    if (count > 20) assert.deepEqual([...first.champions, ...second.champions], champions);
    assert.equal(leagueFearlessPage(champions, 30_000).page, 0);
  }
  const games = [2, 1].map((gameNumber) => ({ gameNumber, bluePicks: ["Gnar", "", "", "", ""], redPicks: ["Ahri", "", "", "", ""] }));
  assert.deepEqual(leagueFearlessChampions({ draftMode: "standard", confirmedGames: games }), []);
  assert.deepEqual(leagueFearlessChampions({ draftMode: "fearless", bestOf: "Bo3", confirmedGames: games }), ["Gnar", "Ahri"]);
});

test("statistics survive brief client failures but expire for client or writer outages", () => {
  const now = Date.now();
  const live = createLeagueDebugFeed("live", new Date(now));
  assert.equal(leagueLiveStatsAvailable(live, now, now), true);
  assert.equal(leagueLiveStatsAvailable(live, now, now + 10_000), false);
  live.connection.connected = false;
  assert.equal(leagueLiveStatsAvailable(live, now + 9_000, now + 9_000), true);
  assert.equal(leagueLiveStatsAvailable(live, now + 11_000, now + 11_000), false);
  live.connection.stale = true;
  assert.equal(leagueLiveStatsAvailable(live, now, now), false);
  live.connection.stale = false;
  live.players = [];
  assert.equal(leagueLiveStatsAvailable(live, now, now), false);
});

test("portrait cache uses only base-skin Riot artwork and survives offline restart", async () => {
  const outputDir = await mkdtemp(path.join(tmpdir(), "go-league-portrait-"));
  const bytes = await readFile(new URL("../public/gaming-oasis-favicon.png", import.meta.url));
  const upstreams = [];
  let writer = await startJsonWriter({
    port: 0, outputDir, enableRocketLeagueStatsApi: false, enableLeagueLiveClient: false,
    fetchImpl: async (url) => { upstreams.push(url); return new Response(bytes, { headers: { "content-type": "image/jpeg" } }); },
  });
  try {
    const assetPath = "/api/public/league-of-legends/assets/16.19.1/portrait/Ahri_0.jpg";
    const first = await fetch(writer.url + assetPath);
    assert.equal(first.status, 200);
    assert.deepEqual(Buffer.from(await first.arrayBuffer()), bytes);
    assert.deepEqual(upstreams, ["https://ddragon.leagueoflegends.com/cdn/img/champion/loading/Ahri_0.jpg"]);
    assert.equal((await fetch(writer.url + assetPath.replace("Ahri_0", "Ahri_1"))).status, 404);
    assert.equal((await fetch(writer.url + assetPath.replace("16.19.1", "latest"))).status, 404);
    await writer.close();
    writer = await startJsonWriter({ port: 0, outputDir, enableRocketLeagueStatsApi: false, enableLeagueLiveClient: false, fetchImpl: async () => { throw new Error("Offline"); } });
    const cached = await fetch(writer.url + assetPath);
    assert.equal(cached.status, 200);
    assert.equal(cached.headers.get("content-type"), "image/jpeg");
    assert.deepEqual(Buffer.from(await cached.arrayBuffer()), bytes);
    assert.equal((await fetch(writer.url + assetPath.replace("Ahri_0", "Gnar_0"))).status, 404);
  } finally { await writer.close(); }
});
