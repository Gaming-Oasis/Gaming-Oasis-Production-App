import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { MAP_ASSET_KEYS, MAP_ASSET_SIZES, MAP_TEMPLATE_VERSION, standardMapCatalog, generatedMapFilename } from "./valorant-map-library.mjs";
import { PLACEHOLDER_FILENAMES } from "./valorant-map-placeholder.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const hash = (body) => createHash("sha256").update(body).digest("hex");
const idPattern = /^(?:[a-f0-9-]{36}|custom-[a-f0-9-]{36})$/;
const hashPattern = /^[a-f0-9]{64}$/;

export function validateMapPng(body, key) {
  const [width, height] = MAP_ASSET_SIZES[key];
  if (body.length < 45 || body.length > 6_000_000 || !body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    || body.toString("ascii", 12, 16) !== "IHDR" || body.readUInt32BE(16) !== width || body.readUInt32BE(20) !== height
    || body[24] !== 8 || ![2, 6].includes(body[25]) || body[28] !== 0) throw new Error(`Invalid ${key} PNG dimensions or format`);
  // Decode the compressed scanlines to reject truncated/header-only uploads.
  const chunks = [];
  let offset = 8;
  let ended = false;
  while (offset + 12 <= body.length) {
    const length = body.readUInt32BE(offset);
    if (offset + length + 12 > body.length) throw new Error("Truncated map PNG");
    const type = body.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") chunks.push(body.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
    if (type === "IEND") { ended = true; break; }
  }
  const expected = (width * (body[25] === 6 ? 4 : 3) + 1) * height;
  if (!ended || !chunks.length || inflateSync(Buffer.concat(chunks), { maxOutputLength: expected }).length !== expected) throw new Error("Incomplete map PNG");
}

export function createValorantMapStore({ outputDir, fetchResource }) {
  const storage = path.join(outputDir, ".valorant-maps");
  const assetsDir = path.join(outputDir, "valorant-maps");
  const sourceDir = path.join(storage, "sources");
  let catalogPromise;
  const sourceRequests = new Map();

  async function readJson(filename, fallback) {
    try { return JSON.parse(await readFile(path.join(storage, filename), "utf8")); }
    catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
  }
  async function saveJson(filename, data) {
    await mkdir(storage, { recursive: true });
    const temp = path.join(storage, `${filename}.${randomUUID()}.tmp`);
    await writeFile(temp, JSON.stringify(data));
    await rename(temp, path.join(storage, filename));
  }
  async function seed() {
    return JSON.parse(await readFile(path.join(root, "lib", "valorant-map-seed.json"), "utf8"));
  }
  async function catalog(refresh = false) {
    if (catalogPromise) return catalogPromise;
    catalogPromise = (async () => {
      const cached = await readJson("catalog.json", null);
      if (!refresh) return { maps: cached?.maps ?? await seed(), stale: !cached };
      try {
        const result = await fetchResource("https://valorant-api.com/v1/maps?language=en-US", "json");
        const maps = standardMapCatalog(JSON.parse(result.body.toString("utf8")));
        await saveJson("catalog.json", { maps });
        return { maps, stale: false };
      } catch {
        return { maps: cached?.maps ?? await seed(), stale: true };
      }
    })();
    try { return await catalogPromise; } finally { catalogPromise = undefined; }
  }
  async function library() {
    const data = await readJson("library.json", { maps: [], lastSync: 0 });
    if (!Array.isArray(data.maps)) throw new Error("Saved map library is invalid");
    return data;
  }
  async function source(id, refresh = false) {
    if (!idPattern.test(id)) throw new Error("Invalid map identity");
    if (sourceRequests.has(id)) return sourceRequests.get(id);
    const job = (async () => {
      const map = (await catalog()).maps.find((entry) => entry.id === id);
      if (!map) throw new Error("Map is not in the standard map catalog");
      const cachePath = path.join(sourceDir, `${id}.png`);
      let body;
      let stale = false;
      try {
        if (!refresh) body = await readFile(cachePath);
        else throw new Error("Refresh requested");
      } catch {
        try {
          body = (await fetchResource(map.sourceUrl, "image")).body;
          await mkdir(sourceDir, { recursive: true });
          const temp = `${cachePath}.${randomUUID()}.tmp`;
          await writeFile(temp, body);
          await rename(temp, cachePath);
        } catch {
          stale = true;
          body = await readFile(cachePath).catch(() => readFile(path.join(root, "public", "valorant-map-sources", `${id}.png`)));
        }
      }
      return { body, hash: hash(body), stale };
    })();
    sourceRequests.set(id, job);
    try { return await job; } finally { sourceRequests.delete(id); }
  }
  async function asset(filename) {
    if (!/^[a-f0-9]{64}-(?:nextMap|pickCard|banCard)\.png$/.test(filename)) throw new Error("Invalid map asset");
    if (PLACEHOLDER_FILENAMES.includes(filename)) return readFile(path.join(root, "public", "valorant-map-placeholders", filename));
    return readFile(path.join(assetsDir, filename));
  }
  async function save(payload, baseUrl) {
    const { id, name, sourceHash, focal, override, templateVersion, images, customSource } = payload;
    if (!idPattern.test(id) || typeof name !== "string" || !name.trim() || name.length > 80 || !hashPattern.test(sourceHash)
      || templateVersion !== MAP_TEMPLATE_VERSION || typeof override !== "boolean"
      || !focal || ![focal.x, focal.y].every((v) => typeof v === "number" && v >= 0 && v <= 1)) throw new Error("Invalid map generation metadata");
    if (!id.startsWith("custom-") && !(await catalog()).maps.some((map) => map.id === id)) throw new Error("Unknown map identity");
    const buffers = Object.fromEntries(MAP_ASSET_KEYS.map((key) => {
      if (typeof images?.[key] !== "string" || !/^[A-Za-z0-9+/]+=*$/.test(images[key])) throw new Error("Missing generated image");
      const body = Buffer.from(images[key], "base64");
      validateMapPng(body, key);
      return [key, body];
    }));
    const generation = hash(Buffer.concat(MAP_ASSET_KEYS.map((key) => buffers[key])));
    await mkdir(assetsDir, { recursive: true });
    for (const key of MAP_ASSET_KEYS) {
      const destination = path.join(assetsDir, `${generation}-${key}.png`);
      const temporary = `${destination}.${randomUUID()}.tmp`;
      await writeFile(temporary, buffers[key]);
      await rename(temporary, destination);
    }
    const previous = await library();
    const existing = previous.maps.find((map) => map.id === id);
    let customSourceHash = existing?.customSourceHash ?? "";
    if (customSource) {
      const bytes = Buffer.from(customSource, "base64");
      if (bytes.length > 6_000_000 || hash(bytes) !== sourceHash) throw new Error("Invalid custom map source");
      await mkdir(sourceDir, { recursive: true });
      customSourceHash = sourceHash;
      await writeFile(path.join(sourceDir, `${sourceHash}.image`), bytes);
    }
    if (!override) customSourceHash = "";
    const artwork = { name: name.trim(), ...Object.fromEntries(MAP_ASSET_KEYS.map((key) => [key, `${baseUrl}/api/valorant-maps/assets/${generation}-${key}.png`])) };
    const entry = { id, name: name.trim(), sourceHash, focal, override, templateVersion, customSourceHash, artwork, ...(existing ? { previousArtwork: existing.artwork } : {}) };
    if (!existing && previous.maps.length >= 64) throw new Error("Map library is full");
    await saveJson("library.json", { ...previous, maps: [...previous.maps.filter((map) => map.id !== id), entry] });
    return entry;
  }
  async function customImage(sourceHash) {
    if (!hashPattern.test(sourceHash)) throw new Error("Invalid source image");
    return readFile(path.join(sourceDir, `${sourceHash}.image`));
  }
  async function complete() {
    const current = await library();
    const lastSync = Date.now();
    await saveJson("library.json", { ...current, lastSync });
    return lastSync;
  }
  async function reset() {
    // Keep cached sources and immutable PNGs available for recovery. Clearing
    // the manifest removes saved focal/source overrides and forces regeneration.
    const defaults = { maps: [], lastSync: 0 };
    await saveJson("library.json", defaults);
    return defaults;
  }
  function localizeFiles(files) {
    // Only recognized, application-generated references are translated for vMix.
    const localize = (value) => {
      if (typeof value === "string") {
        const filename = generatedMapFilename(value);
        const directory = PLACEHOLDER_FILENAMES.includes(filename) ? path.join(root, "public", "valorant-map-placeholders") : assetsDir;
        return filename ? path.join(directory, filename).replaceAll("\\", "/") : value;
      }
      if (Array.isArray(value)) return value.map(localize);
      if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, localize(entry)]));
      return value;
    };
    return files.map((file) => ["FinalOutput.json", "VALORANT MAP DATA.json"].includes(file.filename) ? { ...file, data: localize(file.data) } : file);
  }
  return { catalog, library, source, asset, save, customImage, complete, reset, localizeFiles };
}
