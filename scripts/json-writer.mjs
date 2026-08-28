import { createServer } from "node:http";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  mergeRocketLeagueOverlayLive,
  startRocketLeagueStatsApiClient,
} from "../lib/rocket-league-stats-api.mjs";
import {
  mergeLeagueOverlayLive,
  startLeagueLiveClient,
} from "../lib/league-of-legends-live.mjs";

export const LIVE_JSON_PORT = 4877;
export const LEAGUE_HUB_PUBLIC_URL = "https://hub.gamingoasis.gg/api/public";
export const GOOGLE_DRIVE_THUMBNAIL_URL = "https://drive.google.com/thumbnail";
export const DATA_DRAGON_URL = "https://ddragon.leagueoflegends.com";
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

function validRocketLeagueOverlayPlayer(value) {
  return value && typeof value === "object"
    && typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.team === "number"
    && typeof value.goals === "number"
    && typeof value.shots === "number"
    && typeof value.saves === "number"
    && typeof value.assists === "number"
    && typeof value.boost === "number"
    && typeof value.isDead === "boolean";
}

function validRocketLeagueOverlayGame(value) {
  return value && typeof value === "object"
    && typeof value.hasGame === "boolean"
    && typeof value.hasWinner === "boolean"
    && typeof value.isOT === "boolean"
    && typeof value.isReplay === "boolean"
    && typeof value.timeSeconds === "number"
    && typeof value.target === "string"
    && typeof value.scoreOne === "number"
    && typeof value.scoreTwo === "number"
    && (value.targetPlayer === null || validRocketLeagueOverlayPlayer(value.targetPlayer));
}

function validRocketLeagueOverlayActivity(value) {
  return value && typeof value === "object"
    && typeof value.id === "string"
    && typeof value.type === "string"
    && typeof value.primaryName === "string"
    && typeof value.secondaryName === "string"
    && typeof value.team === "number"
    && typeof value.createdAt === "string";
}

function validRocketLeagueOverlayActivities(value) {
  return Array.isArray(value) && value.every(validRocketLeagueOverlayActivity);
}

function validRocketLeagueOverlayReplayCard(value) {
  return value === null
    || (value && typeof value === "object"
      && typeof value.scorerName === "string"
      && typeof value.assisterName === "string"
      && typeof value.team === "number"
      && typeof value.scorerId === "string"
      && typeof value.goals === "number"
      && typeof value.assists === "number"
      && typeof value.saves === "number"
      && typeof value.shots === "number"
      && typeof value.score === "number"
      && typeof value.ballSpeedMph === "number"
      && typeof value.createdAt === "string");
}

function validRocketLeagueOverlay(value) {
  const connection = value?.connection;
  return value && typeof value === "object"
    && value.version === 1
    && typeof value.updatedAt === "string"
    && typeof value.skin === "string"
    && typeof value.header === "string"
    && typeof value.bestOf === "string"
    && typeof value.flipSides === "boolean"
    && typeof value.playerCardEnabled === "boolean"
    && typeof value.sponsorWidgetEnabled === "boolean"
    && typeof value.broadcastSetupEnabled === "boolean"
    && validOverlaySponsors(value.sponsors)
    && typeof value.roundNumber === "number"
    && typeof value.winsNeeded === "number"
    && typeof value.leaguePrimary === "string"
    && typeof value.leagueSecondary === "string"
    && validOverlayTeam(value.teamOne)
    && validOverlayTeam(value.teamTwo)
    && typeof value.debugLiveOverride === "boolean"
    && connection && typeof connection === "object"
    && typeof connection.connected === "boolean"
    && (connection.lastEventAt === null || typeof connection.lastEventAt === "string")
    && validRocketLeagueOverlayGame(value.game)
    && validRocketLeagueOverlayActivities(value.activities)
    && validRocketLeagueOverlayReplayCard(value.replayCard ?? null);
}

function validLeagueDraft(value) {
  return value && typeof value === "object"
    && ["bluePicks", "redPicks", "blueBans", "redBans"].every((key) => Array.isArray(value[key]) && value[key].length === 5)
    && typeof value.currentStep === "number"
    && typeof value.timer === "number"
    && typeof value.timerRunning === "boolean";
}

function validLeagueOverlay(value) {
  return value && typeof value === "object"
    && value.version === 1
    && typeof value.updatedAt === "string"
    && typeof value.assetVersion === "string"
    && typeof value.header === "string"
    && ["Bo1", "Bo3", "Bo5"].includes(value.bestOf)
    && Number.isInteger(value.currentGame)
    && ["standard", "fearless"].includes(value.draftMode)
    && typeof value.playerBoardEnabled === "boolean"
    && typeof value.sponsorWidgetEnabled === "boolean"
    && typeof value.vsScreenEnabled === "boolean"
    && typeof value.debugLiveOverride === "boolean"
    && ["live", "finished", "stale"].includes(value.debugLiveScenario)
    && typeof value.leaguePrimary === "string"
    && typeof value.leagueSecondary === "string"
    && validOverlayTeam(value.teamOne)
    && validOverlayTeam(value.teamTwo)
    && validOverlayTeam(value.blueTeam)
    && validOverlayTeam(value.redTeam)
    && validLeagueDraft(value.draft)
    && validOverlaySponsors(value.sponsors)
    && Array.isArray(value.confirmedGames)
    && value.playerOverrides && typeof value.playerOverrides === "object";
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
  enableRocketLeagueStatsApi = true,
  enableLeagueLiveClient = true,
} = {}) {
  await mkdir(outputDir, { recursive: true });
  let writeQueue = Promise.resolve();
  let lastWrite = null;
  let valorantOverlayState = null;
  let rocketLeagueOverlayState = null;
  let leagueOverlayState = null;
  const mapArtworkCache = new Map();
  const leagueAssetMemoryCache = new Map();
  const leagueCacheDir = path.join(outputDir, ".league-cache");
  const rocketLeagueStatsApi = enableRocketLeagueStatsApi
    ? startRocketLeagueStatsApiClient()
    : null;
  const leagueLiveClient = enableLeagueLiveClient ? startLeagueLiveClient() : null;

  async function cachedLeagueResource(cacheKey, upstreamUrl, accept, requireType) {
    const safeKey = cacheKey.replace(/[^A-Za-z0-9._-]/g, "_");
    const diskPath = path.join(leagueCacheDir, safeKey);
    const memory = leagueAssetMemoryCache.get(safeKey);
    if (memory) return memory;
    try {
      const body = await readFile(diskPath);
      const cached = { body, contentType: requireType === "image" ? "image/png" : "application/json" };
      leagueAssetMemoryCache.set(safeKey, cached);
      return cached;
    } catch {
      // Populate the last-known cache below.
    }
    const upstream = await fetchImpl(upstreamUrl, { headers: { Accept: accept } });
    const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
    if (!upstream.ok || (requireType === "image" && !contentType.toLowerCase().startsWith("image/"))) {
      throw new Error("League asset is unavailable");
    }
    const body = Buffer.from(await upstream.arrayBuffer());
    await mkdir(leagueCacheDir, { recursive: true });
    await writeFile(diskPath, body);
    const cached = { body, contentType };
    leagueAssetMemoryCache.set(safeKey, cached);
    return cached;
  }

  const server = createServer(async (request, response) => {
    const headers = corsHeaders(request.headers.origin);
    Object.entries(headers).forEach(([name, value]) => response.setHeader(name, value));

    if (request.method === "OPTIONS") {
      response.writeHead(204).end();
      return;
    }

    if (request.method === "GET" && request.url === "/api/live-json/status") {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({
        ok: true,
        outputDir,
        lastWrite,
        rocketLeagueStatsApi: rocketLeagueStatsApi
          ? {
              connected: Boolean(rocketLeagueStatsApi.getFeed().connection?.connected),
              lastEventAt: rocketLeagueStatsApi.getFeed().connection?.lastEventAt ?? null,
              broadcastSetupEnabled: rocketLeagueStatsApi.getBroadcastSetupEnabled?.() !== false,
            }
          : null,
        leagueOfLegends: leagueLiveClient
          ? {
              ...leagueLiveClient.getFeed().connection,
              game: leagueLiveClient.getFeed().game,
              playerCount: leagueLiveClient.getFeed().players.length,
              activePlayerRiotId: leagueLiveClient.getFeed().activePlayer?.riotId ?? null,
            }
          : null,
      }));
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

    if (request.method === "GET" && request.url === "/api/overlays/rocket-league") {
      if (!rocketLeagueOverlayState) {
        response.writeHead(204).end();
        return;
      }
      const liveFeed = rocketLeagueStatsApi?.getFeed() ?? null;
      const merged = mergeRocketLeagueOverlayLive(rocketLeagueOverlayState, liveFeed);
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(merged));
      return;
    }

    if (request.method === "GET" && request.url === "/api/overlays/league-of-legends") {
      if (!leagueOverlayState) {
        response.writeHead(204).end();
        return;
      }
      const merged = mergeLeagueOverlayLive(leagueOverlayState, leagueLiveClient?.getFeed() ?? null);
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(merged));
      return;
    }

    if (request.method === "GET" && request.url === "/api/public/league-of-legends/catalog") {
      try {
        let version = "";
        try {
          const versionsResponse = await fetchImpl(`${DATA_DRAGON_URL}/api/versions.json`, { headers: { Accept: "application/json" } });
          const versions = await versionsResponse.json();
          version = Array.isArray(versions) && typeof versions[0] === "string" ? versions[0] : "";
          if (version) {
            await mkdir(leagueCacheDir, { recursive: true });
            await writeFile(path.join(leagueCacheDir, "catalog-version.txt"), version, "utf8");
          }
        } catch {
          version = String(await readFile(path.join(leagueCacheDir, "catalog-version.txt"), "utf8")).trim();
        }
        if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("No cached League catalog");
        const catalog = await cachedLeagueResource(
          `catalog-${version}.json`,
          `${DATA_DRAGON_URL}/cdn/${encodeURIComponent(version)}/data/en_US/champion.json`,
          "application/json",
          "json",
        );
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ version, data: JSON.parse(catalog.body.toString("utf8")).data ?? {} }));
      } catch {
        response.writeHead(503, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: "League champion catalog is unavailable" }));
      }
      return;
    }

    const leagueAssetRequest = request.method === "GET"
      ? request.url?.match(/^\/api\/public\/league-of-legends\/assets\/([0-9.]+)\/(champion|item|spell)\/([A-Za-z0-9_.-]+)$/)
      : null;
    if (leagueAssetRequest) {
      try {
        const [, version, kind, filename] = leagueAssetRequest;
        const asset = await cachedLeagueResource(
          `${version}-${kind}-${filename}`,
          `${DATA_DRAGON_URL}/cdn/${encodeURIComponent(version)}/img/${kind}/${encodeURIComponent(filename)}`,
          "image/*",
          "image",
        );
        response.writeHead(200, { "Content-Type": asset.contentType, "Content-Length": asset.body.length });
        response.end(asset.body);
      } catch {
        response.writeHead(404, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: "League asset is unavailable" }));
      }
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

    if (request.method === "POST" && request.url === "/api/rocket-league/match-paused") {
      try {
        const payload = await readBody(request);
        const paused = payload?.paused !== false && payload?.paused !== "false";
        if (!rocketLeagueStatsApi) {
          response.writeHead(503, { "Content-Type": "application/json" });
          response.end(JSON.stringify({ error: "Rocket League Stats API client is disabled" }));
          return;
        }
        const connected = Boolean(rocketLeagueStatsApi.getFeed().connection?.connected);
        if (!connected) {
          response.writeHead(503, { "Content-Type": "application/json" });
          response.end(JSON.stringify({ error: "Rocket League Stats API is not connected" }));
          return;
        }
        const result = await rocketLeagueStatsApi.setMatchPaused?.(paused);
        if (!result?.sent) {
          response.writeHead(502, { "Content-Type": "application/json" });
          response.end(JSON.stringify({
            error: "Could not send SetMatchPaused to Rocket League",
            ...result,
          }));
          return;
        }
        response.writeHead(result.confirmed ? 200 : 202, { "Content-Type": "application/json" });
        response.end(JSON.stringify({
          ok: true,
          paused: Boolean(paused),
          confirmed: Boolean(result.confirmed),
          matchPaused: Boolean(result.matchPaused),
          hint: result.confirmed
            ? undefined
            : "Command sent, but Rocket League did not confirm. Pause usually requires this client to be match admin/host (not only a spectator).",
        }));
      } catch (error) {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: error.message || "Invalid pause request" }));
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
      const nextRocketLeagueOverlay = payload.overlays?.rocketLeague;
      if (nextRocketLeagueOverlay !== undefined && !validRocketLeagueOverlay(nextRocketLeagueOverlay)) {
        throw new Error("Invalid Rocket League overlay state");
      }
      const nextLeagueOverlay = payload.overlays?.leagueOfLegends;
      if (nextLeagueOverlay !== undefined && !validLeagueOverlay(nextLeagueOverlay)) {
        throw new Error("Invalid League of Legends overlay state");
      }
      const nextValorantMapData = payload.valorantMapData;
      if (nextValorantMapData !== undefined && !validValorantMapData(nextValorantMapData)) {
        throw new Error("Invalid VALORANT map data");
      }

      writeQueue = writeQueue.then(async () => {
        await Promise.all(payload.files.map((file) => writeJsonWithRetry(outputDir, file.filename, file.data)));
        if (nextValorantMapData !== undefined) await writeJsonWithRetry(outputDir, VALORANT_MAP_DATA_FILENAME, nextValorantMapData);
        if (nextValorantOverlay !== undefined) valorantOverlayState = nextValorantOverlay;
        if (nextRocketLeagueOverlay !== undefined) {
          rocketLeagueOverlayState = nextRocketLeagueOverlay;
          rocketLeagueStatsApi?.setBroadcastSetupEnabled?.(nextRocketLeagueOverlay.broadcastSetupEnabled !== false);
        }
        if (nextLeagueOverlay !== undefined) leagueOverlayState = nextLeagueOverlay;
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
    close: async () => {
      rocketLeagueStatsApi?.stop();
      leagueLiveClient?.stop();
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const writer = await startJsonWriter();
  console.log(`Live JSON writer: ${writer.outputDir}`);
}
