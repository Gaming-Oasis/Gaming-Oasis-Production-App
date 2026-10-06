import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { createValorantMapStore, validateMapPng } from "../lib/valorant-map-store.mjs";
import { MAP_ASSET_SIZES, MAP_TEMPLATE_VERSION, MAP_SYNC_INTERVAL, generatedMapFilename, hasArtworkOverride, mergeMapArtwork, standardMapCatalog, coverCrop, mapSyncDue } from "../lib/valorant-map-library.mjs";
import { prepareMapExport } from "../lib/valorant-map-export.mjs";
import { startJsonWriter, FINAL_OUTPUT_KEYS, JSON_FILENAMES } from "../scripts/json-writer.mjs";
import { VALORANT_MAP_ARTWORK } from "../lib/valorant.mjs";
import { VALORANT_PLACEHOLDER, PLACEHOLDER_FILENAMES, migrateValorantPlaceholder } from "../lib/valorant-map-placeholder.mjs";

const summitId = "756da597-416b-c0f2-f47b-afbdf28670bc";
const origin = "http://localhost:3000";
const seed = JSON.parse(await readFile(new URL("../lib/valorant-map-seed.json", import.meta.url), "utf8"));
const provider = { data: seed.map((map) => ({ uuid: map.id, displayName: map.name, splash: map.sourceUrl, tacticalDescription: "A/B Sites" })) };

function png(width, height) {
  const chunk = (type, body) => {
    const output = Buffer.alloc(body.length + 12);
    output.writeUInt32BE(body.length);
    output.write(type, 4);
    body.copy(output, 8);
    let crc = 0xffffffff;
    for (const value of output.subarray(4, -4)) {
      crc ^= value;
      for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    output.writeUInt32BE((crc ^ 0xffffffff) >>> 0, output.length - 4);
    return output;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.alloc((width * 4 + 1) * height))), chunk("IEND", Buffer.alloc(0))]);
}
const images = Object.fromEntries(Object.entries(MAP_ASSET_SIZES).map(([key, size]) => [key, png(...size).toString("base64")]));
const request = { id: summitId, name: "Summit", sourceHash: "a".repeat(64), focal: { x: 0.5, y: 0.5 }, override: false, templateVersion: MAP_TEMPLATE_VERSION, images };

test("neutral placeholders migrate only legacy defaults and work offline in local and recovery output", async (t) => {
  const legacy = { name: "Placeholder", nextMap: "https://drive.google.com/uc?export=view&id=1SwFGRHOcTuy4eNhdZgoWPk2vRMb-_Xsw", pickCard: "https://drive.google.com/uc?export=view&id=1bMnszxe7Gul-UHWoyxmFnJW45Ubx_gDs", banCard: "https://drive.google.com/uc?export=view&id=144YTLCUdiGBHlH7DsrZBVC_t_4R9CoFd" };
  assert.deepEqual(migrateValorantPlaceholder(legacy), VALORANT_PLACEHOLDER);
  assert.equal(migrateValorantPlaceholder({ ...legacy, pickCard: "https://example.com/custom.png" }).pickCard, "https://example.com/custom.png");
  assert.deepEqual(migrateValorantPlaceholder({ ...legacy, name: "Custom" }), { ...legacy, name: "Custom" });
  const outputDir = await mkdtemp(path.join(tmpdir(), "oasis-placeholder-"));
  t.after(() => rm(outputDir, { recursive: true, force: true }));
  const store = createValorantMapStore({ outputDir, fetchResource: async () => { throw new Error("Offline"); } });
  for (const [index, key] of ["nextMap", "pickCard", "banCard"].entries()) validateMapPng(await store.asset(PLACEHOLDER_FILENAMES[index]), key);
  const files = [{ filename: "VALORANT MAP DATA.json", data: { maps: [VALORANT_PLACEHOLDER] } }];
  const local = store.localizeFiles(files);
  assert.ok((await readFile(local[0].data.maps[0].pickCard)).length);
  const exported = await prepareMapExport(files, async (url) => new Response(await store.asset(generatedMapFilename(url))));
  assert.equal(exported.length, 4);
  assert.ok(exported[0].data.maps[0].nextMap.startsWith("map-"));
});

test("catalog includes every standard map and excludes training, TDM, invalid identities and remote image hosts", () => {
  const data = [...provider.data, { ...provider.data[0], displayName: "Training", tacticalDescription: null }, { ...provider.data[0], uuid: "../../bad", displayName: "Bad" }, { ...provider.data[0], splash: "https://other.example/source.png" }, provider.data[0]];
  const maps = standardMapCatalog({ data });
  assert.equal(maps.length, 13);
  assert.ok(maps.some((map) => map.name === "Summit"));
  assert.ok(maps.some((map) => map.name === "Icebox"));
  assert.throws(() => standardMapCatalog({ data: [] }));
});

test("migration preserves manual artwork, supports Icebox aliases, and does not overwrite an edit during sync", () => {
  const old = VALORANT_MAP_ARTWORK.find((map) => map.name === "Ice Box");
  assert.equal(hasArtworkOverride(old, undefined, VALORANT_MAP_ARTWORK), false);
  const override = { ...old, pickCard: "custom.png" };
  assert.equal(hasArtworkOverride(override, undefined, VALORANT_MAP_ARTWORK), true);
  const next = { ...old, name: "Icebox", pickCard: "new.png" };
  assert.equal(mergeMapArtwork([old], old, next)[0].name, "Ice Box");
  const current = [override];
  assert.equal(mergeMapArtwork(current, old, next), current);
  assert.equal(mergeMapArtwork(current, undefined, next), current);
  assert.equal(hasArtworkOverride(old, { previousArtwork: old, artwork: next }, []), false);
});

test("crop maintains aspect ratios and respects focal endpoints", () => {
  assert.deepEqual(coverCrop(1920, 1080, 617, 1080, { x: 0, y: 0 }), [0, 0, 617, 1080]);
  assert.deepEqual(coverCrop(1920, 1080, 617, 1080, { x: 1, y: 1 }), [1303, 0, 617, 1080]);
});

test("startup and daily sync use a bounded retry interval after provider failures", () => {
  const now = 100 * MAP_SYNC_INTERVAL;
  assert.equal(mapSyncDue(0, 0, now), true);
  assert.equal(mapSyncDue(now - MAP_SYNC_INTERVAL + 1, 0, now), false);
  assert.equal(mapSyncDue(now - MAP_SYNC_INTERVAL, 0, now), true);
  assert.equal(mapSyncDue(0, now - 59 * 60 * 1000, now), false);
  assert.equal(mapSyncDue(0, now - 60 * 60 * 1000, now), true);
});

test("map store commits complete assets, survives restart, and retains working metadata on invalid replacement", async (t) => {
  const outputDir = await mkdtemp(path.join(tmpdir(), "oasis-map-store-"));
  t.after(() => rm(outputDir, { recursive: true, force: true }));
  const config = { outputDir, fetchResource: async () => ({ body: Buffer.from(JSON.stringify(provider)) }) };
  const store = createValorantMapStore(config);
  assert.equal((await store.catalog(true)).stale, false);
  const saved = await store.save(request, "http://127.0.0.1:4877");
  for (const key of Object.keys(images)) {
    const body = await store.asset(generatedMapFilename(saved.artwork[key]));
    validateMapPng(body, key);
  }
  await assert.rejects(store.save({ ...request, images: { ...images, banCard: png(435, 93).toString("base64") } }, "http://127.0.0.1:4877"), /dimensions/);
  assert.deepEqual((await store.library()).maps, [saved]);
  const time = await store.complete();
  const restarted = createValorantMapStore(config);
  assert.equal((await restarted.library()).lastSync, time);
  assert.deepEqual((await restarted.library()).maps, [saved]);
  const files = restarted.localizeFiles([{ filename: "FinalOutput.json", data: [{ valbo3nextmapi: saved.artwork.nextMap }] }]);
  assert.ok(files[0].data[0].valbo3nextmapi.startsWith(outputDir.replaceAll("\\", "/")));
  await assert.rejects(store.asset("../library.json"));
  assert.throws(() => validateMapPng(Buffer.from(images.nextMap, "base64").subarray(0, 40), "nextMap"));
});

test("map reset persists cleared crop overrides, forces regeneration, and retains recoverable assets", async (t) => {
  const outputDir = await mkdtemp(path.join(tmpdir(), "oasis-map-reset-"));
  t.after(() => rm(outputDir, { recursive: true, force: true }));
  const config = { outputDir, fetchResource: async () => ({ body: Buffer.from(JSON.stringify(provider)) }) };
  const store = createValorantMapStore(config);
  const cropped = await store.save({ ...request, focal: { x: 0.1, y: 0.9 }, override: true }, origin);
  await store.save({ ...request, id: "custom-12345678-1234-1234-1234-123456789abc", name: "Custom", override: true }, origin);
  await store.complete();
  assert.deepEqual(await store.reset(), { maps: [], lastSync: 0 });
  const restarted = createValorantMapStore(config);
  assert.deepEqual(await restarted.library(), { maps: [], lastSync: 0 });
  assert.equal(mapSyncDue((await restarted.library()).lastSync, 0), true);
  assert.ok((await restarted.asset(generatedMapFilename(cropped.artwork.nextMap))).length);
  assert.equal((await restarted.catalog()).maps.length, seed.length);
  const regenerated = await restarted.save(request, origin);
  assert.deepEqual(regenerated.focal, { x: 0.5, y: 0.5 });
  assert.equal(regenerated.override, false);
  assert.equal(regenerated.customSourceHash, "");
  assert.deepEqual((await restarted.library()).maps, [regenerated]);
});

test("offline sync retains catalog and bundled Summit source without claiming freshness", async (t) => {
  const outputDir = await mkdtemp(path.join(tmpdir(), "oasis-map-offline-"));
  t.after(() => rm(outputDir, { recursive: true, force: true }));
  const store = createValorantMapStore({ outputDir, fetchResource: async () => { throw new Error("Offline"); } });
  const catalog = await store.catalog(true);
  assert.equal(catalog.stale, true);
  assert.equal(catalog.maps.length, 13);
  const source = await store.source(summitId, true);
  assert.equal(source.stale, true);
  assert.ok(source.body.length > 1000);
  assert.equal((await store.library()).lastSync, 0);
  await assert.rejects(store.source("../../../private"));
});

test("recovery export includes deduplicated PNGs and relative references without altering legacy shapes", async () => {
  const src = `http://127.0.0.1:4877/api/valorant-maps/assets/${"a".repeat(64)}-pickCard.png`;
  const files = [{ filename: "FinalOutput.json", data: [{ one: src, two: src, logo: "https://example.com/logo.png" }] }, { filename: "VALORANT MAP DATA.json", data: { maps: [{ name: "Summit", nextMap: "", pickCard: src, banCard: "" }] } }];
  let fetched = 0;
  const result = await prepareMapExport(files, async () => { fetched++; return new Response(Buffer.from(images.pickCard, "base64")); });
  assert.equal(fetched, 1);
  assert.equal(result.length, 3);
  assert.equal(result[0].data[0].one, result[2].filename);
  assert.equal(result[1].data.maps[0].pickCard, result[2].filename);
  assert.equal(files[0].data[0].one, src);
  assert.equal(result[0].data[0].logo, "https://example.com/logo.png");
  assert.ok(result[2].bytes.length);
  await assert.rejects(prepareMapExport(files, async () => new Response("", { status: 404 })), /Reconnect/);
});

test("map routes require the writer owner and keep six-file JSON writes compatible", async (t) => {
  const outputDir = await mkdtemp(path.join(tmpdir(), "oasis-map-routes-"));
  const writer = await startJsonWriter({ outputDir, port: 0, enableLeagueLiveClient: false, enableRocketLeagueStatsApi: false, fetchImpl: async () => new Response(JSON.stringify(provider), { headers: { "Content-Type": "application/json" } }) });
  t.after(async () => { await writer.close(); await rm(outputDir, { recursive: true, force: true }); });
  const { token } = await (await fetch(`${writer.url}/api/live-json/session`, { headers: { Origin: origin } })).json();
  const headers = { Origin: origin, "Content-Type": "application/json", "X-Gaming-Oasis-Writer-Token": token };
  const post = (route, body, h = headers) => fetch(`${writer.url}${route}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  assert.equal((await post("/api/valorant-maps/save", request, { Origin: origin, "Content-Type": "application/json" })).status, 403);
  assert.equal((await post("/api/valorant-maps/save", request)).status, 409);
  const writerId = "map-test-writer";
  const { fence } = await (await post("/api/live-json/claim", { writerId, force: false })).json();
  const preflight = await fetch(`${writer.url}/api/valorant-maps/save`, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type,x-gaming-oasis-writer-token" } });
  assert.equal(preflight.status, 204);
  const response = await post("/api/valorant-maps/save", { ...request, writerId, fence });
  assert.equal(response.status, 200);
  const entry = await response.json();
  const files = await Promise.all([...JSON_FILENAMES].map(async (filename) => {
    if (filename === "FinalOutput.json") return { filename, data: [Object.fromEntries([...FINAL_OUTPUT_KEYS].map((key) => [key, key === "valbo3nextmapi" ? entry.artwork.nextMap : ""]))] };
    if (filename === "sponsors.json") return { filename, data: [{ id: "gaming-oasis", name: "Gaming Oasis", logo: "http://localhost:3000/gaming-oasis-logo-light.png", enabled: true }] };
    return { filename, data: JSON.parse(await readFile(new URL(`../JSONs/${filename}`, import.meta.url), "utf8")) };
  }));
  for (const revision of [1, 2]) {
    const written = await post("/api/live-json", { writerId, fence, revision, files, valorantMapData: { maps: [entry.artwork] } });
    assert.equal(written.status, 200, await written.text());
    for (const filename of JSON_FILENAMES) assert.ok(JSON.parse(await readFile(path.join(outputDir, filename), "utf8")));
  }
  const exported = JSON.parse(await readFile(path.join(outputDir, "VALORANT MAP DATA.json"), "utf8"));
  assert.deepEqual(Object.keys(exported.maps[0]).sort(), ["name", "nextMap", "pickCard", "banCard"].sort());
  assert.equal((await readFile(exported.maps[0].nextMap)).length, Buffer.from(images.nextMap, "base64").length);
  assert.equal((await post("/api/valorant-maps/complete", { writerId: "other-writer", fence })).status, 409);
  assert.equal((await post("/api/valorant-maps/reset", { writerId, fence }, { Origin: origin, "Content-Type": "application/json" })).status, 403);
  assert.equal((await post("/api/valorant-maps/reset", { writerId: "other-writer", fence })).status, 409);
  const resetPreflight = await fetch(`${writer.url}/api/valorant-maps/reset`, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type,x-gaming-oasis-writer-token" } });
  assert.equal(resetPreflight.status, 204);
  const reset = await post("/api/valorant-maps/reset", { writerId, fence });
  assert.equal(reset.status, 200);
  assert.deepEqual(await reset.json(), { maps: [], lastSync: 0 });
});
