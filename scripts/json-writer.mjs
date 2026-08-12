import { createServer } from "node:http";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const LIVE_JSON_PORT = 4877;
export const LEAGUE_HUB_PUBLIC_URL = "https://hub.gamingoasis.gg/api/public";
export const GOOGLE_DRIVE_THUMBNAIL_URL = "https://drive.google.com/thumbnail";
export const VALORANT_MAP_DATA_FILENAME = "VALORANT MAP DATA.json";
export const JSON_FILENAMES = new Set([
  "FinalOutput.json",
  "sponsors.json",
  "RLT1DS.json",
  "RLT2DS.json",
  "VALT1DS.json",
  "VALT2DS.json",
]);

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function writeJsonWithRetry(outputDir, filename, data) {
  const target = path.join(outputDir, filename);
  const temporary = path.join(outputDir, `.${filename}.${process.pid}.tmp`);
  await writeFile(temporary, JSON.stringify(data, null, 2), "utf8");

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rename(temporary, target);
      return;
    } catch (error) {
      if (!["EBUSY", "EPERM", "EACCES"].includes(error.code) || attempt === 4) {
        await unlink(temporary).catch(() => {});
        throw error;
      }
      await wait(60 * (attempt + 1));
    }
  }
}

function corsHeaders(origin) {
  const allowed = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin ?? "")
    ? origin
    : "http://localhost:3000";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  };
}

async function readBody(request, maximumBytes = 2_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBytes) throw new Error("Payload is too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function validOverlayTeam(value) {
  return value && typeof value === "object"
    && ["name", "standing", "logo", "color", "logoBackground", "seriesScore"]
      .every((key) => typeof value[key] === "string");
}

function validValorantMapWidget(value) {
  if (!value || typeof value !== "object" || typeof value.visible !== "boolean" || !Array.isArray(value.maps)) return false;
  if (value.visible && value.maps.length !== 3) return false;
  return value.maps.every((map) => map && typeof map === "object"
    && Number.isInteger(map.mapNumber)
    && typeof map.name === "string"
    && typeof map.background === "string"
    && ["result", "current", "next", "decider"].includes(map.status)
    && typeof map.scoreOne === "string"
    && typeof map.scoreTwo === "string"
    && ["one", "two", ""].includes(map.picker));
}

function validOverlaySponsors(value) {
  return Array.isArray(value)
    && value.every((sponsor) => sponsor && typeof sponsor === "object"
      && typeof sponsor.id === "string"
      && typeof sponsor.name === "string"
      && typeof sponsor.logo === "string");
}

function validValorantOverlay(value) {
  return value && typeof value === "object"
    && value.version === 1
    && typeof value.updatedAt === "string"
    && typeof value.header === "string"
    && typeof value.leaguePrimary === "string"
    && typeof value.leagueSecondary === "string"
    && validValorantMapWidget(value.mapWidget)
    && typeof value.sponsorWidgetEnabled === "boolean"
    && validOverlaySponsors(value.sponsors)
    && validOverlayTeam(value.teamOne)
    && validOverlayTeam(value.teamTwo);
}

function validValorantMapData(value) {
  return value && typeof value === "object"
    && Array.isArray(value.maps)
    && value.maps.length > 0
    && value.maps.every((map) => map && typeof map === "object"
      && typeof map.name === "string"
      && typeof map.nextMap === "string"
      && typeof map.pickCard === "string"
      && typeof map.banCard === "string");
}

export async function startJsonWriter({
  port = LIVE_JSON_PORT,
  outputDir = path.resolve("JSONs"),
  fetchImpl = fetch,
} = {}) {
  await mkdir(outputDir, { recursive: true });
  let writeQueue = Promise.resolve();
  let lastWrite = null;
  let valorantOverlayState = null;
  const mapArtworkCache = new Map();

  const server = createServer(async (request, response) => {
    const headers = corsHeaders(request.headers.origin);
    Object.entries(headers).forEach(([name, value]) => response.setHeader(name, value));

    if (request.method === "OPTIONS") {
      response.writeHead(204).end();
      return;
    }

    if (request.method === "GET" && request.url === "/api/live-json/status") {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ ok: true, outputDir, lastWrite }));
      return;
    }

    if (request.method === "GET" && request.url === "/api/overlays/valorant") {
      if (!valorantOverlayState) {
        response.writeHead(204).end();
        return;
      }
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(valorantOverlayState));
      return;
    }

    const publicMatchRequest = request.method === "GET"
      ? request.url?.match(/^\/api\/public\/matches\/([0-9a-f-]{36})$/i)
      : null;
    if (publicMatchRequest) {
      try {
        const upstream = await fetchImpl(`${LEAGUE_HUB_PUBLIC_URL}/matches/${encodeURIComponent(publicMatchRequest[1])}`, {
          headers: { Accept: "application/json" },
        });
        const body = await upstream.text();
        response.writeHead(upstream.status, { "Content-Type": upstream.headers.get("content-type") ?? "application/json" });
        response.end(body);
      } catch {
        response.writeHead(502, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: "League Hub is unavailable" }));
      }
      return;
    }

    const publicLogoRequest = request.method === "GET"
      ? request.url?.match(/^\/api\/public\/logos\/(teams|leagues)\/([0-9a-f-]{36})$/i)
      : null;
    if (publicLogoRequest) {
      try {
        const [, scope, logoId] = publicLogoRequest;
        const upstream = await fetchImpl(`${LEAGUE_HUB_PUBLIC_URL}/logos/${scope}/${encodeURIComponent(logoId)}`, {
          headers: { Accept: "image/*" },
        });
        const body = Buffer.from(await upstream.arrayBuffer());
        response.writeHead(upstream.status, {
          "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
          "Content-Length": body.length,
        });
        response.end(body);
      } catch {
        response.writeHead(502, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: "League Hub logo is unavailable" }));
      }
      return;
    }

    const mapArtworkRequest = request.method === "GET"
      ? request.url?.match(/^\/api\/public\/map-artwork\/([A-Za-z0-9_-]{10,})$/)
      : null;
    if (mapArtworkRequest) {
      const artworkId = mapArtworkRequest[1];
      const cached = mapArtworkCache.get(artworkId);
      if (cached) {
        response.writeHead(200, {
          "Content-Type": cached.contentType,
          "Content-Length": cached.body.length,
        });
        response.end(cached.body);
        return;
      }

      try {
        const upstream = await fetchImpl(`${GOOGLE_DRIVE_THUMBNAIL_URL}?id=${encodeURIComponent(artworkId)}&sz=w1000`, {
          headers: { Accept: "image/*" },
        });
        const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
        if (!upstream.ok || !contentType.toLowerCase().startsWith("image/")) {
          throw new Error("Map artwork is unavailable");
        }
        const body = Buffer.from(await upstream.arrayBuffer());
        mapArtworkCache.set(artworkId, { body, contentType });
        response.writeHead(200, {
          "Content-Type": contentType,
          "Content-Length": body.length,
        });
        response.end(body);
      } catch {
        response.writeHead(502, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: "Map artwork is unavailable" }));
      }
      return;
    }

    if (request.method !== "POST" || request.url !== "/api/live-json") {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    try {
      const payload = await readBody(request);
      if (!Array.isArray(payload.files) || payload.files.length !== JSON_FILENAMES.size) {
        throw new Error("Expected the complete six-file JSON package");
      }

      const seen = new Set();
      for (const file of payload.files) {
        if (!file || !JSON_FILENAMES.has(file.filename) || seen.has(file.filename)) {
          throw new Error("Invalid or duplicate JSON filename");
        }
        if (file.data === null || typeof file.data !== "object") {
          throw new Error(`Invalid JSON data for ${file.filename}`);
        }
        seen.add(file.filename);
      }

      const nextValorantOverlay = payload.overlays?.valorant;
      if (nextValorantOverlay !== undefined && !validValorantOverlay(nextValorantOverlay)) {
        throw new Error("Invalid VALORANT overlay state");
      }
      const nextValorantMapData = payload.valorantMapData;
      if (nextValorantMapData !== undefined && !validValorantMapData(nextValorantMapData)) {
        throw new Error("Invalid VALORANT map data");
      }

      writeQueue = writeQueue.then(async () => {
        await Promise.all(payload.files.map((file) => writeJsonWithRetry(outputDir, file.filename, file.data)));
        if (nextValorantMapData !== undefined) await writeJsonWithRetry(outputDir, VALORANT_MAP_DATA_FILENAME, nextValorantMapData);
        if (nextValorantOverlay !== undefined) valorantOverlayState = nextValorantOverlay;
        lastWrite = new Date().toISOString();
      });
      await writeQueue;

      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true, files: payload.files.length, outputDir, lastWrite }));
    } catch (error) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: error.message }));
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

  const address = server.address();
  const activePort = typeof address === "object" && address ? address.port : port;

  return {
    server,
    outputDir,
    url: `http://127.0.0.1:${activePort}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const writer = await startJsonWriter();
  console.log(`Live JSON writer: ${writer.outputDir}`);
}
