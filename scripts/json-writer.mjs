import { createServer } from "node:http";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { lookup as defaultDnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { access, copyFile, mkdir, readFile, readdir, rename, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { formatSocialHandle } from "../lib/social-handle.mjs";
import { isLeagueScoreboard } from "../lib/league-scoreboard.mjs";
import { googleDriveFileId } from "../lib/sponsor-logo-url.mjs";
import { createValorantMapStore } from "../lib/valorant-map-store.mjs";
import { VALORANT_MAP_ARTWORK } from "../lib/valorant.mjs";
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
const TRANSACTION_FILENAME = ".live-json-transaction.json";
const TRUSTED_ORIGINS = new Set(["http://localhost:3000", "http://127.0.0.1:3000"]);
const MAX_REQUEST_BYTES = 2_000_000;
const MAX_JSON_RESPONSE_BYTES = 5_000_000;
const MAX_IMAGE_RESPONSE_BYTES = 10_000_000;
const UPSTREAM_TIMEOUT_MS = 8_000;
const MAP_ARTWORK_CACHE_MAX_BYTES = 64_000_000;
const MAP_ARTWORK_CACHE_TTL_MS = 5 * 60_000;
const MAP_ARTWORK_CACHE_MAX_STALE_MS = 60 * 60_000;
const MAP_ARTWORK_MAX_INFLIGHT = 8;
const HUB_PUBLIC_MAX_INFLIGHT = 8;
const HUB_LOGO_CACHE_MAX_ENTRIES = 256;
const HUB_LOGO_CACHE_MAX_BYTES = 32_000_000;
const HUB_LOGO_CACHE_TTL_MS = 5 * 60_000;
const HUB_LOGO_CACHE_MAX_STALE_MS = 60 * 60_000;
const HUB_LOGO_RETRY_CACHE_TTL_MS = 5_000;
const HUB_LOGO_CACHE_MAX_CONFIGURED_TTL_MS = 24 * 60 * 60_000;
const HUB_LOGO_RETRY_CACHE_MAX_CONFIGURED_TTL_MS = 60_000;
const WRITER_OWNER_LEASE_MS = 12_000;
const WRITER_OWNER_LEASE_MAX_MS = 60_000;
const LEAGUE_MEMORY_CACHE_MAX_BYTES = 64_000_000;

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function renameWithRetry(source, target) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rename(source, target);
      return;
    } catch (error) {
      if (!["EBUSY", "EPERM", "EACCES"].includes(error.code) || attempt === 4) {
        throw error;
      }
      await wait(60 * (attempt + 1));
    }
  }
}

async function unlinkWithRetry(target) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await unlink(target);
      return;
    } catch (error) {
      if (error?.code === "ENOENT") return;
      if (!["EBUSY", "EPERM", "EACCES"].includes(error?.code) || attempt === 4) throw error;
      await wait(60 * (attempt + 1));
    }
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function hasExactKeys(value, keys) {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isTrustedOrigin(origin) {
  return TRUSTED_ORIGINS.has(origin ?? "");
}

function isTrustedHost(host) {
  return /^(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(host ?? "");
}

function corsHeaders(origin) {
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Gaming-Oasis-Writer-Token",
    "Cache-Control": "no-store",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
  };
  if (isTrustedOrigin(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function readBody(request, maximumBytes = MAX_REQUEST_BYTES) {
  const contentType = String(request.headers["content-type"] ?? "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") throw new HttpError(415, "Content-Type must be application/json");
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBytes) throw new HttpError(413, "Payload is too large");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Request body must be valid JSON");
  }
}

function tokensMatch(received, expected) {
  if (typeof received !== "string" || !received) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function pathExists(candidate) {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function recoverInterruptedTransaction(outputDir) {
  const journalPath = path.join(outputDir, TRANSACTION_FILENAME);
  let serialized;
  try {
    serialized = await readFile(journalPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  let journal;
  try {
    journal = JSON.parse(serialized);
  } catch {
    throw new Error("Live JSON recovery journal is malformed");
  }
  const stageName = String(journal?.stageDir ?? "");
  const backupName = String(journal?.backupDir ?? "");
  const entries = Array.isArray(journal?.entries) ? journal.entries : [];
  const validStageName = /^\.live-json-stage-[A-Za-z0-9-]+$/.test(stageName);
  const validBackupName = /^\.live-json-backup-[A-Za-z0-9-]+$/.test(backupName);
  const seenEntries = new Set();
  const validEntries = entries.length >= JSON_FILENAMES.size
    && entries.length <= JSON_FILENAMES.size + 1
    && entries.every((entry) => {
      const filename = String(entry?.filename ?? "");
      if ((!JSON_FILENAMES.has(filename) && filename !== VALORANT_MAP_DATA_FILENAME)
        || seenEntries.has(filename)
        || typeof entry?.existed !== "boolean") return false;
      seenEntries.add(filename);
      return true;
    });
  if (journal?.version !== 1 || journal?.phase !== "committing" || !validStageName || !validBackupName || !validEntries) {
    throw new Error("Live JSON recovery journal is invalid");
  }
  const resolvedOutputDir = path.resolve(outputDir);
  const stageDir = path.resolve(resolvedOutputDir, stageName);
  const backupDir = path.resolve(resolvedOutputDir, backupName);
  if (path.dirname(stageDir) !== resolvedOutputDir || path.dirname(backupDir) !== resolvedOutputDir) {
    throw new Error("Live JSON recovery journal escapes the output directory");
  }
  for (const entry of [...entries].reverse()) {
    const filename = String(entry?.filename ?? "");
    if (!JSON_FILENAMES.has(filename) && filename !== VALORANT_MAP_DATA_FILENAME) continue;
    const target = path.join(outputDir, filename);
    const backup = path.join(backupDir, filename);
    if (await pathExists(backup)) {
      await renameWithRetry(backup, target);
    } else if (entry?.existed === false) {
      await unlinkWithRetry(target);
    }
  }
  await rm(stageDir, { recursive: true, force: true });
  await rm(backupDir, { recursive: true, force: true });
  await unlinkWithRetry(journalPath);
}

// The shipped defaults live in JSONs/templates and are never a write target.
// The live file is runtime output, seeded once so a fresh workspace resolves
// artwork without ever replacing an operator's existing map data.
async function seedValorantMapDataFile(outputDir, valorantMaps) {
  const target = path.join(outputDir, VALORANT_MAP_DATA_FILENAME);
  try {
    await access(target);
    return;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const [seeded] = valorantMaps.localizeFiles([
    { filename: VALORANT_MAP_DATA_FILENAME, data: { maps: VALORANT_MAP_ARTWORK } },
  ]);
  const temporary = `${target}.${process.pid}-${Date.now()}-${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temporary, JSON.stringify(seeded.data, null, 2));
  await rename(temporary, target);
}

async function commitJsonPackage(outputDir, files, beforeInstallFile, afterBackupFile) {
  // Never replace an unresolved recovery plan. If a prior rollback could not
  // finish, recovery must succeed before a new generation is staged.
  await recoverInterruptedTransaction(outputDir);
  const transactionId = `${process.pid}-${Date.now()}-${randomBytes(4).toString("hex")}`;
  const stageDirName = `.live-json-stage-${transactionId}`;
  const backupDirName = `.live-json-backup-${transactionId}`;
  const stageDir = path.join(outputDir, stageDirName);
  const backupDir = path.join(outputDir, backupDirName);
  const journalPath = path.join(outputDir, TRANSACTION_FILENAME);
  const journalStagePath = `${journalPath}.stage-${transactionId}`;
  const entries = files.map((file) => ({ filename: file.filename, existed: null }));
  const journal = { version: 1, phase: "committing", stageDir: stageDirName, backupDir: backupDirName, entries };
  await mkdir(stageDir, { recursive: false });
  await mkdir(backupDir, { recursive: false });
  try {
    await Promise.all(files.map((file) => writeFile(path.join(stageDir, file.filename), JSON.stringify(file.data, null, 2), "utf8")));
    for (const entry of entries) entry.existed = await pathExists(path.join(outputDir, entry.filename));
    await writeFile(journalStagePath, JSON.stringify(journal), "utf8");
    await renameWithRetry(journalStagePath, journalPath);
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      await beforeInstallFile?.(entry.filename, index);
      const target = path.join(outputDir, entry.filename);
      if (entry.existed) {
        const backup = path.join(backupDir, entry.filename);
        const backupStage = `${backup}.stage`;
        await copyFile(target, backupStage);
        await renameWithRetry(backupStage, backup);
        await afterBackupFile?.(entry.filename, index, target);
      }
      await renameWithRetry(path.join(stageDir, entry.filename), target);
    }
    // Removing the journal is the commit point. Any crash before it rolls back;
    // any crash after it leaves the complete new generation in place.
    await unlinkWithRetry(journalPath);
  } catch (error) {
    let recoveryFailure = null;
    try {
      await recoverInterruptedTransaction(outputDir);
    } catch (recoveryError) {
      recoveryFailure = recoveryError;
    }
    if (recoveryFailure) {
      throw new Error(`JSON package commit failed and rollback could not complete: ${recoveryFailure.message}`, { cause: error });
    }
    await rm(stageDir, { recursive: true, force: true }).catch(() => {});
    await rm(backupDir, { recursive: true, force: true }).catch(() => {});
    await unlink(journalStagePath).catch(() => {});
    throw error;
  }
  await rm(stageDir, { recursive: true, force: true }).catch(() => {});
  await rm(backupDir, { recursive: true, force: true }).catch(() => {});
  await unlink(journalStagePath).catch(() => {});
}

export const FINAL_OUTPUT_KEYS = (() => {
  const keys = [
    "eventname", "maincaster", "secondcaster", "guest1", "guest2", "mainsocial", "secondarysocial",
    "startingtitle", "interviewname", "podcasttitle", "currentsegment", "regionallogo",
  ];
  for (let index = 1; index <= 8; index += 1) keys.push(`segment${index}`, `currentseg${index}`);
  for (let match = 1; match <= 2; match += 1) {
    for (let team = 1; team <= 2; team += 1) {
      for (const suffix of ["name", "standing", "logo", "color"]) keys.push(`m${match}t${team}${suffix}`);
    }
  }
  for (let index = 1; index <= 7; index += 1) keys.push(`rlscore${index}`);
  for (let index = 1; index <= 5; index += 1) keys.push(`lolscore${index}`);
  keys.push("rlheader", "rlformat#", "rlroundnumber", "rlseriesscore1", "rlseriesscore2");
  keys.push(
    "valname1", "valname2", "vallogo1", "vallogo2", "valcolor1", "valcolor2", "valcolor1a", "valcolor2a",
    "valstanding1", "valstanding2", "vallogobg1", "vallogobg2", "valbanteamaname", "valbanteamastanding",
    "valbanteamalogo", "valbanteamacolor", "valbanteambname", "valbanteambstanding", "valbanteamblogo",
    "valbanteambcolor", "valorantroundnumber", "valseriesscore1", "valseriesscore2", "valheader", "valformat#",
  );
  for (let index = 1; index <= 5; index += 1) keys.push(`valscore${index}`);
  for (let index = 1; index <= 7; index += 1) keys.push(`valbo3maptext${index}`, `valbo3mapimage${index}`);
  for (let index = 1; index <= 3; index += 1) keys.push(`valbo3s${index}text`);
  for (const key of ["b1", "b2", "p1", "s1", "p2", "s2", "b3", "b4", "s3"]) keys.push(`valbo3${key}logo`);
  for (let index = 1; index <= 3; index += 1) {
    keys.push(`valbo3map${index}name`, `valbo3map${index}teamlogo`, `valbo3map${index}winnerlogo`, `valbo3nextmap${index}`);
  }
  keys.push("valbo3nextmapi");
  for (let index = 1; index <= 7; index += 1) keys.push(`valbo5maptext${index}`, `valbo5mapimage${index}`);
  for (let index = 1; index <= 5; index += 1) keys.push(`valbo5s${index}text`);
  for (const key of ["b1", "b2", "p1", "s1", "p2", "s2", "p3", "s3", "p4", "s4", "s5"]) keys.push(`valbo5${key}logo`);
  for (let index = 1; index <= 5; index += 1) {
    keys.push(
      `valbo5map${index}name`, `valbo5map${index}teamlogo`, `valbo5map${index}winnerlogo`,
      `valbo5nextmap${index}`, `valbo5widgetlogo${index}`, `valbo5widgetmap${index}`,
    );
  }
  keys.push("valbo5nextmapi");
  for (let index = 1; index <= 3; index += 1) keys.push(`valwidgetlogo${index}`, `valwidgetmap${index}`);
  return new Set(keys);
})();

const DRAW_FILE_SHAPES = new Map([
  ["RLT1DS.json", { pools: 2, rows: 8 }],
  ["RLT2DS.json", { pools: 6, rows: 8 }],
  ["VALT1DS.json", { pools: 2, rows: 4 }],
  ["VALT2DS.json", { pools: 6, rows: 4 }],
]);

function validFinalOutput(value) {
  if (!Array.isArray(value) || value.length !== 1 || !hasExactKeys(value[0], FINAL_OUTPUT_KEYS)) return false;
  return Object.values(value[0]).every((field) => typeof field === "string");
}

const GAMING_OASIS_LOGO_URL = "http://localhost:3000/gaming-oasis-logo-light.png";
const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const VMIX_IMAGE_EXTENSIONS = new Map([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/gif", ".gif"],
  ["image/bmp", ".bmp"],
  ["image/x-ms-bmp", ".bmp"],
]);

function vmixImageExtension(contentType) {
  return VMIX_IMAGE_EXTENSIONS.get(String(contentType || "").split(";", 1)[0].trim().toLowerCase()) ?? "";
}

function sniffVmixExtension(body) {
  if (!body || body.length < 2) return "";
  if (body.length >= 4 && body[0] === 0x89 && body[1] === 0x50 && body[2] === 0x4e && body[3] === 0x47) return ".png";
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return ".jpg";
  if (body.length >= 3 && body[0] === 0x47 && body[1] === 0x49 && body[2] === 0x46) return ".gif";
  if (body[0] === 0x42 && body[1] === 0x4d) return ".bmp";
  return "";
}

function extensionFromPath(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".jpeg") return ".jpg";
  return [".png", ".jpg", ".gif", ".bmp"].includes(extension) ? extension : "";
}

function validGamingOasisLogo(logo) {
  if (logo === GAMING_OASIS_LOGO_URL) return true;
  return typeof logo === "string" && /\/sponsor-logos\/gaming-oasis-[a-f0-9]{8}\.png$/i.test(logo.replaceAll("\\", "/"));
}

function validSponsorsFile(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 11) return false;
  if (value[0]?.id !== "gaming-oasis"
    || value[0]?.name !== "Gaming Oasis"
    || !validGamingOasisLogo(value[0]?.logo)
    || value[0]?.enabled !== true) return false;
  const canonicalIds = new Set(["gaming-oasis", ...Array.from({ length: 10 }, (_, index) => `sponsor${index + 1}`)]);
  const ids = new Set();
  return value.every((sponsor) => {
    if (!hasExactKeys(sponsor, ["id", "name", "logo", "enabled"])) return false;
    if (typeof sponsor.id !== "string" || !canonicalIds.has(sponsor.id) || ids.has(sponsor.id)) return false;
    ids.add(sponsor.id);
    return typeof sponsor.name === "string" && typeof sponsor.logo === "string" && typeof sponsor.enabled === "boolean";
  });
}

function validDrawFile(filename, value) {
  const shape = DRAW_FILE_SHAPES.get(filename);
  if (!shape || !Array.isArray(value) || value.length !== 1 || !isPlainObject(value[0])) return false;
  const keys = [];
  for (let pool = 1; pool <= shape.pools; pool += 1) {
    for (let row = 1; row <= shape.rows; row += 1) keys.push(`P${pool}${row}`);
  }
  return hasExactKeys(value[0], keys) && Object.values(value[0]).every((field) => typeof field === "string");
}

function withSocialHandles(files) {
  return files.map((file) => {
    if (file.filename !== "FinalOutput.json" || !Array.isArray(file.data) || file.data.length !== 1 || !isPlainObject(file.data[0])) {
      return file;
    }
    const row = file.data[0];
    return {
      ...file,
      data: [{
        ...row,
        mainsocial: formatSocialHandle(row.mainsocial),
        secondarysocial: formatSocialHandle(row.secondarysocial),
      }],
    };
  });
}

function validExportFile(file) {
  if (!isPlainObject(file) || !hasExactKeys(file, ["filename", "data"]) || typeof file.filename !== "string") return false;
  if (file.filename === "FinalOutput.json") return validFinalOutput(file.data);
  if (file.filename === "sponsors.json") return validSponsorsFile(file.data);
  return validDrawFile(file.filename, file.data);
}

function validOverlayTeam(value) {
  return hasExactKeys(value, ["name", "standing", "logo", "color", "logoBackground", "seriesScore"])
    && ["name", "standing", "logo", "color", "logoBackground", "seriesScore"]
      .every((key) => typeof value[key] === "string");
}

function validValorantMapWidget(value) {
  if (!hasExactKeys(value, ["visible", "maps"]) || typeof value.visible !== "boolean" || !Array.isArray(value.maps)) return false;
  if (value.visible && value.maps.length !== 3) return false;
  if (!value.visible && value.maps.length !== 0) return false;
  return value.maps.every((map) => hasExactKeys(map, ["mapNumber", "name", "background", "status", "scoreOne", "scoreTwo", "picker"])
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
    && value.length <= 11
    && value.every((sponsor) => hasExactKeys(sponsor, ["id", "name", "logo"])
      && typeof sponsor.id === "string"
      && typeof sponsor.name === "string"
      && typeof sponsor.logo === "string");
}

function validValorantOverlay(value) {
  return hasExactKeys(value, [
    "version", "updatedAt", "header", "bestOf", "leaguePrimary", "leagueSecondary", "mapWidget",
    "sponsorWidgetEnabled", "sponsors", "teamOne", "teamTwo",
  ])
    && value.version === 1
    && typeof value.updatedAt === "string"
    && typeof value.header === "string"
    && ["Bo1", "Bo3", "Bo5"].includes(value.bestOf)
    && typeof value.leaguePrimary === "string"
    && typeof value.leagueSecondary === "string"
    && validValorantMapWidget(value.mapWidget)
    && typeof value.sponsorWidgetEnabled === "boolean"
    && validOverlaySponsors(value.sponsors)
    && validOverlayTeam(value.teamOne)
    && validOverlayTeam(value.teamTwo);
}

function validRocketLeagueOverlayPlayer(value) {
  return hasExactKeys(value, ["id", "name", "team", "goals", "shots", "saves", "assists", "boost", "isDead"])
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
  return hasExactKeys(value, ["hasGame", "hasWinner", "isOT", "isReplay", "timeSeconds", "target", "scoreOne", "scoreTwo", "targetPlayer"])
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
  return hasExactKeys(value, ["id", "type", "primaryName", "secondaryName", "team", "createdAt"])
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
    || (hasExactKeys(value, ["scorerName", "assisterName", "team", "scorerId", "goals", "assists", "saves", "shots", "score", "ballSpeedMph", "createdAt"])
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
  return hasExactKeys(value, [
    "version", "updatedAt", "skin", "header", "bestOf", "flipSides", "playerCardEnabled",
    "sponsorWidgetEnabled", "broadcastSetupEnabled", "lobbyScene", "statsSceneBackground", "sponsors",
    ...(Object.hasOwn(value ?? {}, "sceneMode") ? ["sceneMode"] : []),
    "roundNumber", "winsNeeded", "leaguePrimary", "leagueSecondary", "teamOne", "teamTwo",
    "debugLiveOverride", "connection", "game", "activities", "replayCard",
  ])
    && value.version === 1
    && typeof value.updatedAt === "string"
    && typeof value.skin === "string"
    && typeof value.header === "string"
    && typeof value.bestOf === "string"
    && typeof value.flipSides === "boolean"
    && typeof value.playerCardEnabled === "boolean"
    && typeof value.sponsorWidgetEnabled === "boolean"
    && typeof value.broadcastSetupEnabled === "boolean"
    && ["vs", "stats"].includes(value.lobbyScene)
    && (value.sceneMode === undefined || ["auto", "scoreboard", "vs", "stats"].includes(value.sceneMode))
    && ["transparent", "team-split"].includes(value.statsSceneBackground)
    && validOverlaySponsors(value.sponsors)
    && typeof value.roundNumber === "number"
    && typeof value.winsNeeded === "number"
    && typeof value.leaguePrimary === "string"
    && typeof value.leagueSecondary === "string"
    && validOverlayTeam(value.teamOne)
    && validOverlayTeam(value.teamTwo)
    && typeof value.debugLiveOverride === "boolean"
    && hasExactKeys(connection, ["connected", "lastEventAt"])
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
    && (value.scoreboard === undefined || isLeagueScoreboard(value.scoreboard))
    && (value.blueTeamKey === undefined || ["team1", "team2"].includes(value.blueTeamKey))
    && value.version === 1
    && typeof value.updatedAt === "string"
    && typeof value.assetVersion === "string"
    && typeof value.header === "string"
    && ["Bo1", "Bo3", "Bo5"].includes(value.bestOf)
    && Number.isInteger(value.currentGame)
    && ["standard", "online", "fearless"].includes(value.draftMode)
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
  const names = new Set();
  return hasExactKeys(value, ["maps"])
    && Array.isArray(value.maps)
    && value.maps.length > 0 && value.maps.length <= 32
    && value.maps.every((map) => {
      if (!hasExactKeys(map, ["name", "nextMap", "pickCard", "banCard"]) || typeof map.name !== "string") return false;
      const name = map.name.trim().toLowerCase();
      if (!name || names.has(name)) return false;
      names.add(name);
      return typeof map.nextMap === "string" && typeof map.pickCard === "string" && typeof map.banCard === "string";
    });
}

function getLru(cache, key) {
  const value = cache.get(key);
  if (value === undefined) return undefined;
  cache.delete(key);
  cache.set(key, value);
  return value;
}

function setLru(cache, key, value, maximumEntries, maximumBytes = Number.POSITIVE_INFINITY) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  let totalBytes = 0;
  for (const entry of cache.values()) totalBytes += Number(entry?.body?.length ?? 0);
  while (cache.size > maximumEntries || totalBytes > maximumBytes) {
    const oldestKey = cache.keys().next().value;
    const oldest = cache.get(oldestKey);
    totalBytes -= Number(oldest?.body?.length ?? 0);
    cache.delete(oldestKey);
  }
}

function cacheDuration(value, fallback, maximum) {
  return Number.isSafeInteger(value) && value >= 0 && value <= maximum ? value : fallback;
}

function isPrivateAddress(address) {
  const version = isIP(address);
  if (version === 4) {
    const [a, b] = address.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  if (version === 6) {
    const normalized = address.toLowerCase();
    if (normalized === "::" || normalized === "::1") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:")) return true;
    if (normalized.startsWith("::ffff:")) return isPrivateAddress(normalized.slice("::ffff:".length));
    return false;
  }
  return true;
}

function sponsorLogoUpstreamUrl(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host.includes(".") || host.endsWith(".local") || host.endsWith(".localhost") || host.endsWith(".internal")) return null;
  if (isIP(host)) return null;
  return url;
}

async function fetchBounded(fetchImpl, url, {
  headers,
  maximumBytes,
  expectedType,
  timeoutMs = UPSTREAM_TIMEOUT_MS,
  redirect = "follow",
} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const upstream = await fetchImpl(url, { headers, redirect, signal: controller.signal });
    const contentType = String(upstream.headers.get("content-type") ?? "").toLowerCase();
    const contentLength = Number.parseInt(upstream.headers.get("content-length") ?? "", 10);
    if (Number.isFinite(contentLength) && contentLength > maximumBytes) throw new HttpError(502, "Upstream response is too large");
    if (upstream.ok && expectedType === "json" && !/(?:application|text)\/(?:[a-z0-9.+-]*\+)?json\b/i.test(contentType)) {
      throw new HttpError(502, "Upstream returned an invalid content type");
    }
    if (upstream.ok && expectedType === "image" && !contentType.startsWith("image/")) {
      throw new HttpError(502, "Upstream returned an invalid content type");
    }
    const chunks = [];
    let size = 0;
    if (upstream.body) {
      for await (const chunk of upstream.body) {
        const buffer = Buffer.from(chunk);
        size += buffer.length;
        if (size > maximumBytes) throw new HttpError(502, "Upstream response is too large");
        chunks.push(buffer);
      }
    }
    return { upstream, body: Buffer.concat(chunks), contentType: contentType || "application/octet-stream" };
  } catch (error) {
    if (error?.name === "AbortError") throw new HttpError(504, "Upstream request timed out");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function startJsonWriter({
  port = LIVE_JSON_PORT,
  outputDir = path.resolve("JSONs"),
  fetchImpl = fetch,
  enableRocketLeagueStatsApi = true,
  enableLeagueLiveClient = true,
  sessionToken,
  beforeInstallFile,
  afterBackupFile,
  mapArtworkCacheTtlMs = MAP_ARTWORK_CACHE_TTL_MS,
  hubLogoCacheTtlMs = HUB_LOGO_CACHE_TTL_MS,
  hubLogoCacheMaxStaleMs = HUB_LOGO_CACHE_MAX_STALE_MS,
  hubLogoRetryCacheTtlMs = HUB_LOGO_RETRY_CACHE_TTL_MS,
  writerOwnerLeaseMs = WRITER_OWNER_LEASE_MS,
  dnsLookup = defaultDnsLookup,
  seedValorantMapData = false,
} = {}) {
  await mkdir(outputDir, { recursive: true });
  await recoverInterruptedTransaction(outputDir);
  const writerSessionToken = typeof sessionToken === "string" && sessionToken.length >= 32
    ? sessionToken
    : randomBytes(32).toString("base64url");
  const effectiveMapArtworkCacheTtlMs = Number.isFinite(mapArtworkCacheTtlMs) && mapArtworkCacheTtlMs >= 0
    ? mapArtworkCacheTtlMs
    : MAP_ARTWORK_CACHE_TTL_MS;
  const effectiveHubLogoCacheTtlMs = cacheDuration(
    hubLogoCacheTtlMs,
    HUB_LOGO_CACHE_TTL_MS,
    HUB_LOGO_CACHE_MAX_CONFIGURED_TTL_MS,
  );
  const effectiveHubLogoCacheMaxStaleMs = cacheDuration(
    hubLogoCacheMaxStaleMs,
    HUB_LOGO_CACHE_MAX_STALE_MS,
    HUB_LOGO_CACHE_MAX_CONFIGURED_TTL_MS,
  );
  const effectiveHubLogoRetryCacheTtlMs = cacheDuration(
    hubLogoRetryCacheTtlMs,
    HUB_LOGO_RETRY_CACHE_TTL_MS,
    HUB_LOGO_RETRY_CACHE_MAX_CONFIGURED_TTL_MS,
  );
  const effectiveWriterOwnerLeaseMs = cacheDuration(
    writerOwnerLeaseMs,
    WRITER_OWNER_LEASE_MS,
    WRITER_OWNER_LEASE_MAX_MS,
  );
  let writeQueue = Promise.resolve();
  let lastWrite = null;
  let lastError = null;
  let pendingWrites = 0;
  let generation = 0;
  let activeFence = 0;
  let activeFenceWriterId = "";
  let activeFenceExpiresAt = 0;
  let valorantOverlayState = null;
  let rocketLeagueOverlayState = null;
  let leagueOverlayState = null;
  const mapArtworkCache = new Map();
  const mapArtworkRequests = new Map();
  const hubPublicRequests = new Map();
  const hubLogoCache = new Map();
  const hubLogoRetryCache = new Map();
  const sponsorLogoCache = new Map();
  const sponsorLogoRequests = new Map();
  const leagueAssetMemoryCache = new Map();
  const lastRevisionByWriter = new Map();
  const leagueCacheDir = path.join(outputDir, ".league-cache");
  const valorantMaps = createValorantMapStore({
    outputDir,
    fetchResource: async (url, expectedType) => {
      const result = await fetchBounded(fetchImpl, url, {
        headers: { Accept: expectedType === "json" ? "application/json" : "image/png" },
        expectedType,
        maximumBytes: expectedType === "json" ? MAX_JSON_RESPONSE_BYTES : MAX_IMAGE_RESPONSE_BYTES,
      });
      if (!result.upstream.ok) throw new Error("VALORANT map provider is unavailable");
      return result;
    },
  });
  if (seedValorantMapData) await seedValorantMapDataFile(outputDir, valorantMaps);
  const rocketLeagueStatsApi = enableRocketLeagueStatsApi
    ? startRocketLeagueStatsApiClient()
    : null;
  const leagueLiveClient = enableLeagueLiveClient ? startLeagueLiveClient() : null;

  async function getMapArtwork(artworkId) {
    const cached = getLru(mapArtworkCache, artworkId);
    if (cached?.expiresAt > Date.now()) return cached;
    const pending = mapArtworkRequests.get(artworkId);
    if (pending) return pending;
    if (mapArtworkRequests.size >= MAP_ARTWORK_MAX_INFLIGHT) {
      throw new HttpError(429, "Too many map artwork requests are in progress");
    }

    const requestPromise = (async () => {
      try {
        const { upstream, body, contentType } = await fetchBounded(fetchImpl, `${GOOGLE_DRIVE_THUMBNAIL_URL}?id=${encodeURIComponent(artworkId)}&sz=w1000`, {
          headers: { Accept: "image/*" },
          expectedType: "image",
          maximumBytes: MAX_IMAGE_RESPONSE_BYTES,
        });
        if (!upstream.ok) throw new HttpError(upstream.status === 404 ? 404 : 502, "Map artwork is unavailable");
        const entry = { body, contentType, expiresAt: Date.now() + effectiveMapArtworkCacheTtlMs };
        setLru(mapArtworkCache, artworkId, entry, 32, MAP_ARTWORK_CACHE_MAX_BYTES);
        return entry;
      } catch (error) {
        if (cached && cached.expiresAt + MAP_ARTWORK_CACHE_MAX_STALE_MS > Date.now()) return cached;
        if (cached) mapArtworkCache.delete(artworkId);
        throw error;
      }
    })();
    mapArtworkRequests.set(artworkId, requestPromise);
    try {
      return await requestPromise;
    } finally {
      if (mapArtworkRequests.get(artworkId) === requestPromise) mapArtworkRequests.delete(artworkId);
    }
  }

  async function getHubPublicResource(resourceKey, loader) {
    const pending = hubPublicRequests.get(resourceKey);
    if (pending) return pending;
    if (hubPublicRequests.size >= HUB_PUBLIC_MAX_INFLIGHT) {
      throw new HttpError(429, "Too many League Hub requests are in progress");
    }
    const requestPromise = Promise.resolve().then(loader);
    hubPublicRequests.set(resourceKey, requestPromise);
    try {
      return await requestPromise;
    } finally {
      if (hubPublicRequests.get(resourceKey) === requestPromise) hubPublicRequests.delete(resourceKey);
    }
  }

  function cachedHubLogoFailure(cacheKey, cached, now) {
    const failure = getLru(hubLogoRetryCache, cacheKey);
    if (!failure) return null;
    if (failure.expiresAt <= now) {
      hubLogoRetryCache.delete(cacheKey);
      return null;
    }
    if (cached && cached.expiresAt + effectiveHubLogoCacheMaxStaleMs > now) {
      return { ...cached, stale: true };
    }
    if (cached) hubLogoCache.delete(cacheKey);
    throw new HttpError(failure.status, failure.message);
  }

  async function getHubLogo(scope, logoId) {
    const normalizedScope = scope.toLowerCase();
    const cacheKey = `${normalizedScope}:${logoId.toLowerCase()}`;
    const now = Date.now();
    const cached = getLru(hubLogoCache, cacheKey);
    if (cached?.expiresAt > now) return { ...cached, stale: false };
    const retryResult = cachedHubLogoFailure(cacheKey, cached, now);
    if (retryResult) return retryResult;

    return getHubPublicResource(`logo:${cacheKey}`, async () => {
      try {
        const { upstream, body, contentType } = await fetchBounded(
          fetchImpl,
          `${LEAGUE_HUB_PUBLIC_URL}/logos/${normalizedScope}/${encodeURIComponent(logoId)}`,
          {
            headers: { Accept: "image/*" },
            expectedType: "image",
            maximumBytes: MAX_IMAGE_RESPONSE_BYTES,
          },
        );
        if (!upstream.ok) {
          throw new HttpError(
            upstream.status === 404 ? 404 : 502,
            upstream.status === 404 ? "Logo was not found" : "League Hub logo is unavailable",
          );
        }
        const entry = {
          body,
          contentType,
          expiresAt: Date.now() + effectiveHubLogoCacheTtlMs,
        };
        setLru(hubLogoCache, cacheKey, entry, HUB_LOGO_CACHE_MAX_ENTRIES, HUB_LOGO_CACHE_MAX_BYTES);
        hubLogoRetryCache.delete(cacheKey);
        return { ...entry, stale: false };
      } catch (error) {
        const failure = error instanceof HttpError
          ? error
          : new HttpError(502, "League Hub logo is unavailable");
        setLru(hubLogoRetryCache, cacheKey, {
          status: failure.status,
          message: failure.message,
          expiresAt: Date.now() + effectiveHubLogoRetryCacheTtlMs,
        }, HUB_LOGO_CACHE_MAX_ENTRIES);
        if (cached && cached.expiresAt + effectiveHubLogoCacheMaxStaleMs > Date.now()) {
          return { ...cached, stale: true };
        }
        if (cached) hubLogoCache.delete(cacheKey);
        throw failure;
      }
    });
  }

  async function fetchSponsorLogo(urlString, hops = 0) {
    const driveId = googleDriveFileId(urlString);
    if (driveId) {
      const artwork = await getMapArtwork(driveId);
      return {
        body: artwork.body,
        contentType: String(artwork.contentType || "").split(";", 1)[0] || "application/octet-stream",
      };
    }
    const url = sponsorLogoUpstreamUrl(urlString);
    if (!url) throw new HttpError(400, "Sponsor logo URL is not allowed");
    let records;
    try {
      records = await dnsLookup(url.hostname, { all: true, verbatim: true });
    } catch {
      throw new HttpError(502, "Sponsor logo is unavailable");
    }
    if (!Array.isArray(records) || records.length === 0 || records.some((record) => isPrivateAddress(record?.address))) {
      throw new HttpError(400, "Sponsor logo URL is not allowed");
    }
    const { upstream, body, contentType } = await fetchBounded(fetchImpl, url.toString(), {
      headers: { Accept: "image/*" },
      expectedType: "image",
      maximumBytes: MAX_IMAGE_RESPONSE_BYTES,
      redirect: "manual",
    });
    if ([301, 302, 303, 307, 308].includes(upstream.status)) {
      const location = upstream.headers.get("location");
      if (!location || hops >= 3) throw new HttpError(502, "Sponsor logo is unavailable");
      return fetchSponsorLogo(new URL(location, url).toString(), hops + 1);
    }
    if (!upstream.ok) throw new HttpError(upstream.status === 404 ? 404 : 502, "Sponsor logo is unavailable");
    return { body, contentType: contentType.split(";", 1)[0] || "application/octet-stream" };
  }

  async function getSponsorLogo(src) {
    const cached = getLru(sponsorLogoCache, src);
    if (cached?.expiresAt > Date.now()) return cached;
    const pending = sponsorLogoRequests.get(src);
    if (pending) return pending;
    if (sponsorLogoRequests.size >= HUB_PUBLIC_MAX_INFLIGHT) {
      throw new HttpError(429, "Too many sponsor logo requests are in progress");
    }
    const requestPromise = fetchSponsorLogo(src).then((entry) => {
      const stored = { ...entry, expiresAt: Date.now() + HUB_LOGO_CACHE_TTL_MS };
      setLru(sponsorLogoCache, src, stored, HUB_LOGO_CACHE_MAX_ENTRIES, HUB_LOGO_CACHE_MAX_BYTES);
      return stored;
    });
    sponsorLogoRequests.set(src, requestPromise);
    try {
      return await requestPromise;
    } finally {
      if (sponsorLogoRequests.get(src) === requestPromise) sponsorLogoRequests.delete(src);
    }
  }

  async function readExistingVmixImage(logo) {
    const normalized = String(logo || "").replaceAll("\\", "/");
    if (!/^[A-Za-z]:\//.test(normalized)) return null;
    const extension = extensionFromPath(normalized);
    if (!extension) return null;
    try {
      return { body: await readFile(normalized), extension };
    } catch {
      return null;
    }
  }

  async function readPublicVmixImage(pathname) {
    const extension = extensionFromPath(pathname);
    if (!extension || pathname.includes("..")) return null;
    const file = path.resolve(PUBLIC_DIR, pathname.replace(/^\/+/, ""));
    const relative = path.relative(PUBLIC_DIR, file);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
    try {
      return { body: await readFile(file), extension };
    } catch {
      return null;
    }
  }

  async function loadVmixSponsorImage(logo) {
    const trimmed = String(logo || "").trim();
    if (!trimmed) return null;
    const existing = await readExistingVmixImage(trimmed);
    if (existing) return existing;
    let url;
    try {
      url = new URL(trimmed);
    } catch {
      return null;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return readPublicVmixImage(url.pathname);
    try {
      const fetched = await fetchSponsorLogo(trimmed);
      const extension = vmixImageExtension(fetched.contentType) || sniffVmixExtension(fetched.body);
      if (!extension) return null;
      return { body: fetched.body, extension };
    } catch {
      return null;
    }
  }

  async function withVmixSponsorLogos(files) {
    const sponsors = files.find((file) => file.filename === "sponsors.json");
    if (!Array.isArray(sponsors?.data)) return files;
    const dir = path.join(outputDir, "sponsor-logos");
    const next = [];
    for (const sponsor of sponsors.data) {
      const image = await loadVmixSponsorImage(sponsor?.logo);
      if (!image || !/^[A-Za-z0-9-]+$/.test(String(sponsor?.id || ""))) {
        next.push(sponsor);
        continue;
      }
      const hash = createHash("sha256").update(image.body).digest("hex").slice(0, 8);
      const filename = `${sponsor.id}-${hash}${image.extension}`;
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, filename), image.body);
      const names = await readdir(dir).catch(() => []);
      await Promise.all(names
        .filter((name) => name.startsWith(`${sponsor.id}-`) && name !== filename)
        .map((name) => unlink(path.join(dir, name)).catch(() => {})));
      next.push({ ...sponsor, logo: path.resolve(dir, filename).replaceAll("\\", "/") });
    }
    return files.map((file) => file.filename === "sponsors.json" ? { ...file, data: next } : file);
  }

  function hubLogoCacheControl(logo) {
    const maxAgeSeconds = logo.stale
      ? 0
      : Math.max(0, Math.ceil((logo.expiresAt - Date.now()) / 1_000));
    const staleIfErrorSeconds = Math.floor(effectiveHubLogoCacheMaxStaleMs / 1_000);
    return staleIfErrorSeconds > 0
      ? `public, max-age=${maxAgeSeconds}, stale-if-error=${staleIfErrorSeconds}`
      : `public, max-age=${maxAgeSeconds}`;
  }

  async function cachedLeagueResource(cacheKey, upstreamUrl, accept, requireType) {
    const safeKey = cacheKey.replace(/[^A-Za-z0-9._-]/g, "_");
    const diskPath = path.join(leagueCacheDir, safeKey);
    const memory = getLru(leagueAssetMemoryCache, safeKey);
    if (memory) return memory;
    try {
      const body = await readFile(diskPath);
      const cached = { body, contentType: requireType === "image" ? (safeKey.endsWith(".jpg") ? "image/jpeg" : "image/png") : "application/json" };
      setLru(leagueAssetMemoryCache, safeKey, cached, 256, LEAGUE_MEMORY_CACHE_MAX_BYTES);
      return cached;
    } catch {
      // Populate the last-known cache below.
    }
    const { upstream, body, contentType } = await fetchBounded(fetchImpl, upstreamUrl, {
      headers: { Accept: accept },
      expectedType: requireType,
      maximumBytes: requireType === "image" ? MAX_IMAGE_RESPONSE_BYTES : MAX_JSON_RESPONSE_BYTES,
    });
    if (!upstream.ok) {
      throw new Error("League asset is unavailable");
    }
    await mkdir(leagueCacheDir, { recursive: true });
    await writeFile(diskPath, body);
    const cached = { body, contentType };
    setLru(leagueAssetMemoryCache, safeKey, cached, 256, LEAGUE_MEMORY_CACHE_MAX_BYTES);
    return cached;
  }

  function enqueueWrite(job) {
    pendingWrites += 1;
    const run = writeQueue.then(job);
    writeQueue = run.catch(() => {});
    return run.finally(() => { pendingWrites = Math.max(0, pendingWrites - 1); });
  }

  function rejectJson(response, status, message) {
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: message }));
  }

  function authorizeMutation(request, response) {
    if (!isTrustedOrigin(request.headers.origin)) {
      rejectJson(response, 403, "Mutation requests are only accepted from the local Production OS");
      return false;
    }
    if (!tokensMatch(request.headers["x-gaming-oasis-writer-token"], writerSessionToken)) {
      rejectJson(response, 403, "Writer session is missing or expired");
      return false;
    }
    return true;
  }

  const server = createServer(async (request, response) => {
    const headers = corsHeaders(request.headers.origin);
    Object.entries(headers).forEach(([name, value]) => response.setHeader(name, value));

    if (!isTrustedHost(request.headers.host)) {
      rejectJson(response, 421, "Writer is available only on this workstation");
      return;
    }

    if (request.method === "OPTIONS") {
      const allowedPath = request.url === "/api/live-json"
        || request.url === "/api/valorant-maps/save"
        || request.url === "/api/valorant-maps/complete"
        || request.url === "/api/valorant-maps/reset"
        || request.url === "/api/live-json/claim"
        || request.url === "/api/rocket-league/match-paused"
        || request.url === "/api/live-json/session";
      const requestedMethod = String(request.headers["access-control-request-method"] ?? "").toUpperCase();
      const expectedMethod = request.url === "/api/live-json/session" ? "GET" : "POST";
      const requestedHeaders = String(request.headers["access-control-request-headers"] ?? "")
        .split(",")
        .map((header) => header.trim().toLowerCase())
        .filter(Boolean);
      const allowedHeaders = new Set(["content-type", "x-gaming-oasis-writer-token"]);
      if (!allowedPath || !isTrustedOrigin(request.headers.origin) || requestedMethod !== expectedMethod || requestedHeaders.some((header) => !allowedHeaders.has(header))) {
        rejectJson(response, 403, "CORS preflight was rejected");
        return;
      }
      response.writeHead(204).end();
      return;
    }

    if (request.url?.startsWith("/api/valorant-maps/")) {
      try {
        const url = new URL(request.url, "http://127.0.0.1");
        const route = url.pathname.slice("/api/valorant-maps/".length);
        if (request.method === "GET") {
          if (route === "library" || route === "catalog") {
            const data = route === "library" ? await valorantMaps.library() : await valorantMaps.catalog(url.searchParams.get("refresh") === "1");
            response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
            response.end(JSON.stringify(data));
          } else if (route.startsWith("source/")) {
            const source = await valorantMaps.source(route.slice(7), url.searchParams.get("refresh") === "1");
            response.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store", "X-Map-Source-Hash": source.hash, "X-Map-Source-Stale": String(source.stale), "Access-Control-Expose-Headers": "X-Map-Source-Hash, X-Map-Source-Stale" });
            response.end(source.body);
          } else if (route.startsWith("assets/") || route.startsWith("custom/")) {
            const custom = route.startsWith("custom/");
            const body = custom ? await valorantMaps.customImage(route.slice(7)) : await valorantMaps.asset(route.slice(7));
            response.writeHead(200, { "Content-Type": custom && body[0] === 0xff ? "image/jpeg" : "image/png", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" });
            response.end(body);
          } else throw new HttpError(404, "Map resource not found");
        } else if (request.method === "POST" && ["save", "complete", "reset"].includes(route)) {
          if (!authorizeMutation(request, response)) return;
          const payload = await readBody(request, 20_000_000);
          let result;
          await enqueueWrite(async () => {
            if (payload?.fence !== activeFence || payload?.writerId !== activeFenceWriterId || activeFenceExpiresAt <= Date.now()) throw new HttpError(409, "Claim the JSON writer before updating maps");
            if (route === "save") result = await valorantMaps.save(payload, `http://127.0.0.1:${server.address().port}`);
            else if (route === "reset") result = await valorantMaps.reset();
            else result = { lastSync: await valorantMaps.complete() };
          });
          response.writeHead(200, { "Content-Type": "application/json" });
          response.end(JSON.stringify(result));
        } else throw new HttpError(404, "Map resource not found");
      } catch (error) {
        rejectJson(response, error instanceof HttpError ? error.status : error.code === "ENOENT" ? 404 : 422, error.message || "Map update failed");
      }
      return;
    }

    if (request.method === "GET" && request.url === "/api/live-json/session") {
      if (!isTrustedOrigin(request.headers.origin)) {
        rejectJson(response, 403, "Writer sessions are only issued to the local Production OS");
        return;
      }
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ token: writerSessionToken }));
      return;
    }

    if (request.method === "GET" && request.url === "/api/live-json/status") {
      response.setHeader("Content-Type", "application/json");
      response.writeHead(lastError ? 503 : 200);
      response.end(JSON.stringify({
        ok: !lastError,
        service: "gaming-oasis-production-os-writer",
        protocolVersion: 2,
        pid: process.pid,
        outputDir,
        lastWrite,
        generation,
        activeFence,
        pendingWrites,
        lastError,
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
          const { upstream: versionsResponse, body: versionsBody } = await fetchBounded(fetchImpl, `${DATA_DRAGON_URL}/api/versions.json`, {
            headers: { Accept: "application/json" },
            expectedType: "json",
            maximumBytes: 128_000,
          });
          if (!versionsResponse.ok) throw new Error("Version catalog is unavailable");
          const versions = JSON.parse(versionsBody.toString("utf8"));
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
      ? request.url?.match(/^\/api\/public\/league-of-legends\/assets\/(\d+\.\d+\.\d+)\/(champion|item|spell|portrait)\/([A-Za-z0-9_]+\.(?:png|jpg))$/)
      : null;
    if (leagueAssetRequest) {
      try {
        const [, version, kind, filename] = leagueAssetRequest;
        if (kind === "portrait" && !/^[A-Za-z0-9]+_0\.jpg$/.test(filename)) {
          response.writeHead(404).end();
          return;
        }
        const asset = await cachedLeagueResource(
          `${version}-${kind}-${filename}`,
          kind === "portrait"
            ? `${DATA_DRAGON_URL}/cdn/img/champion/loading/${encodeURIComponent(filename)}`
            : `${DATA_DRAGON_URL}/cdn/${encodeURIComponent(version)}/img/${kind}/${encodeURIComponent(filename)}`,
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

    if (request.method === "GET" && request.url?.startsWith("/api/sponsor-logos?")) {
      if (request.url.length > 4096) {
        rejectJson(response, 414, "Sponsor logo URL is too long");
        return;
      }
      let src = "";
      try {
        src = new URL(request.url, "http://127.0.0.1").searchParams.get("src") ?? "";
      } catch {
        rejectJson(response, 400, "Sponsor logo URL is not allowed");
        return;
      }
      try {
        const logo = await getSponsorLogo(src);
        response.writeHead(200, {
          "Content-Type": logo.contentType,
          "Content-Length": logo.body.length,
          "Cache-Control": "public, max-age=300",
        });
        response.end(logo.body);
      } catch (error) {
        if (error instanceof HttpError && error.status === 429) response.setHeader("Retry-After", "1");
        rejectJson(response, error instanceof HttpError ? error.status : 502, error instanceof HttpError ? error.message : "Sponsor logo is unavailable");
      }
      return;
    }

    const publicMatchRequest = request.method === "GET"
      ? request.url?.match(/^\/api\/public\/matches\/([0-9a-f-]{36})$/i)
      : null;
    if (publicMatchRequest) {
      try {
        const matchId = publicMatchRequest[1];
        const { upstream, body } = await getHubPublicResource(`match:${matchId.toLowerCase()}`, () => (
          fetchBounded(fetchImpl, `${LEAGUE_HUB_PUBLIC_URL}/matches/${encodeURIComponent(matchId)}`, {
            headers: { Accept: "application/json" },
            expectedType: "json",
            maximumBytes: 1_000_000,
          })
        ));
        if (!upstream.ok) {
          rejectJson(response, upstream.status === 404 ? 404 : 502, upstream.status === 404 ? "Match was not found" : "League Hub is unavailable");
          return;
        }
        JSON.parse(body.toString("utf8"));
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(body);
      } catch (error) {
        if (error instanceof HttpError && error.status === 429) response.setHeader("Retry-After", "1");
        rejectJson(response, error instanceof HttpError ? error.status : 502, error instanceof HttpError ? error.message : "League Hub is unavailable");
      }
      return;
    }

    const publicLogoRequest = request.method === "GET"
      ? request.url?.match(/^\/api\/public\/logos\/(teams|leagues)\/([0-9a-f-]{36})$/i)
      : null;
    if (publicLogoRequest) {
      try {
        const [, scope, logoId] = publicLogoRequest;
        const logo = await getHubLogo(scope, logoId);
        response.writeHead(200, {
          "Content-Type": logo.contentType,
          "Content-Length": logo.body.length,
          "Cache-Control": hubLogoCacheControl(logo),
        });
        response.end(logo.body);
      } catch (error) {
        if (error instanceof HttpError && error.status === 429) response.setHeader("Retry-After", "1");
        rejectJson(response, error instanceof HttpError ? error.status : 502, error instanceof HttpError ? error.message : "League Hub logo is unavailable");
      }
      return;
    }

    const mapArtworkRequest = request.method === "GET"
      ? request.url?.match(/^\/api\/public\/map-artwork\/([A-Za-z0-9_-]{10,128})$/)
      : null;
    if (mapArtworkRequest) {
      const artworkId = mapArtworkRequest[1];
      try {
        const { body, contentType } = await getMapArtwork(artworkId);
        response.writeHead(200, {
          "Content-Type": contentType,
          "Content-Length": body.length,
        });
        response.end(body);
      } catch (error) {
        if (error instanceof HttpError && error.status === 429) response.setHeader("Retry-After", "1");
        rejectJson(response, error instanceof HttpError ? error.status : 502, error instanceof HttpError ? error.message : "Map artwork is unavailable");
      }
      return;
    }

    if (request.method === "POST" && request.url === "/api/rocket-league/match-paused") {
      if (!authorizeMutation(request, response)) return;
      try {
        const payload = await readBody(request);
        if (!hasExactKeys(payload, ["paused"]) || typeof payload.paused !== "boolean") {
          throw new HttpError(422, "Expected exactly one boolean paused field");
        }
        const paused = payload.paused;
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
        rejectJson(response, error instanceof HttpError ? error.status : 500, error.message || "Pause request failed");
      }
      return;
    }

    if (request.method === "POST" && request.url === "/api/live-json/claim") {
      if (!authorizeMutation(request, response)) return;
      try {
        const payload = await readBody(request);
        if (!hasExactKeys(payload, ["writerId", "force"])
          || typeof payload.writerId !== "string"
          || !/^[A-Za-z0-9_-]{8,128}$/.test(payload.writerId)
          || typeof payload.force !== "boolean") {
          throw new HttpError(422, "A valid writerId and boolean force flag are required");
        }
        let fence = 0;
        let expiresAt = 0;
        await enqueueWrite(() => {
          const now = Date.now();
          const sameOwner = activeFenceWriterId === payload.writerId;
          const ownerLeaseActive = Boolean(activeFenceWriterId) && activeFenceExpiresAt > now;
          if (!sameOwner && ownerLeaseActive && !payload.force) {
            throw new HttpError(409, "Another browser controls the JSON writer; use explicit takeover to continue");
          }
          if (!sameOwner) {
            if (activeFence >= Number.MAX_SAFE_INTEGER) throw new HttpError(503, "Writer fence space is exhausted");
            activeFence += 1;
            activeFenceWriterId = payload.writerId;
          }
          activeFenceExpiresAt = now + effectiveWriterOwnerLeaseMs;
          fence = activeFence;
          expiresAt = activeFenceExpiresAt;
        });
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ ok: true, fence, expiresAt }));
      } catch (error) {
        if (error instanceof HttpError && error.status === 409) response.setHeader("Retry-After", "1");
        rejectJson(response, error instanceof HttpError ? error.status : 500, error.message || "Writer claim failed");
      }
      return;
    }

    if (request.method !== "POST" || request.url !== "/api/live-json") {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    if (!authorizeMutation(request, response)) return;

    try {
      const payload = await readBody(request);
      if (!isPlainObject(payload)) throw new HttpError(422, "Expected a JSON object");
      const allowedPayloadKeys = new Set(["writerId", "fence", "revision", "files", "overlays", "valorantMapData"]);
      if (Object.keys(payload).some((key) => !allowedPayloadKeys.has(key))) {
        throw new HttpError(422, "Unexpected JSON package field");
      }
      if (!Array.isArray(payload.files) || payload.files.length !== JSON_FILENAMES.size) {
        throw new HttpError(422, "Expected the complete six-file JSON package");
      }
      if (typeof payload.writerId !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(payload.writerId)) {
        throw new HttpError(422, "A valid writerId is required");
      }
      if (!Number.isSafeInteger(payload.fence) || payload.fence < 1) {
        throw new HttpError(422, "A positive writer fence is required");
      }
      if (!Number.isSafeInteger(payload.revision) || payload.revision < 1) {
        throw new HttpError(422, "A positive integer revision is required");
      }

      const seen = new Set();
      for (const file of payload.files) {
        if (!file || !JSON_FILENAMES.has(file.filename) || seen.has(file.filename)) {
          throw new HttpError(422, "Invalid or duplicate JSON filename");
        }
        if (!validExportFile(file)) {
          throw new HttpError(422, `Invalid JSON shape for ${file.filename}`);
        }
        seen.add(file.filename);
      }

      if (payload.overlays !== undefined && (!isPlainObject(payload.overlays)
        || Object.keys(payload.overlays).some((key) => !["valorant", "rocketLeague", "leagueOfLegends"].includes(key)))) {
        throw new HttpError(422, "Invalid overlay state container");
      }
      const nextValorantOverlay = payload.overlays?.valorant;
      if (nextValorantOverlay !== undefined && !validValorantOverlay(nextValorantOverlay)) {
        throw new HttpError(422, "Invalid VALORANT overlay state");
      }
      const nextRocketLeagueOverlay = payload.overlays?.rocketLeague;
      if (nextRocketLeagueOverlay !== undefined && !validRocketLeagueOverlay(nextRocketLeagueOverlay)) {
        throw new HttpError(422, "Invalid Rocket League overlay state");
      }
      const nextLeagueOverlay = payload.overlays?.leagueOfLegends;
      if (nextLeagueOverlay !== undefined && !validLeagueOverlay(nextLeagueOverlay)) {
        throw new HttpError(422, "Invalid League of Legends overlay state");
      }
      const nextValorantMapData = payload.valorantMapData;
      if (nextValorantMapData !== undefined && !validValorantMapData(nextValorantMapData)) {
        throw new HttpError(422, "Invalid VALORANT map data");
      }
      const payloadDigest = createHash("sha256").update(JSON.stringify({
        files: payload.files,
        overlays: payload.overlays,
        valorantMapData: payload.valorantMapData,
      })).digest("hex");

      let duplicate = false;
      await enqueueWrite(async () => {
        if (payload.fence !== activeFence
          || payload.writerId !== activeFenceWriterId
          || activeFenceExpiresAt <= Date.now()) {
          throw new HttpError(409, "This browser tab must claim the JSON writer before publishing");
        }
        activeFenceExpiresAt = Date.now() + effectiveWriterOwnerLeaseMs;
        const previousWrite = getLru(lastRevisionByWriter, payload.writerId);
        const lastRevision = previousWrite?.revision ?? 0;
        if (payload.revision < lastRevision) throw new HttpError(409, "A newer JSON revision has already been written");
        if (payload.revision === lastRevision && previousWrite?.digest !== payloadDigest) {
          throw new HttpError(409, "A JSON revision cannot be reused for different content");
        }
        if (payload.revision === lastRevision) {
          duplicate = true;
          return;
        }
        const transactionFiles = await withVmixSponsorLogos(withSocialHandles(nextValorantMapData === undefined
          ? payload.files
          : [...payload.files, { filename: VALORANT_MAP_DATA_FILENAME, data: nextValorantMapData }]));
        await commitJsonPackage(outputDir, valorantMaps.localizeFiles(transactionFiles), beforeInstallFile, afterBackupFile);
        if (nextValorantOverlay !== undefined) valorantOverlayState = nextValorantOverlay;
        if (nextRocketLeagueOverlay !== undefined) {
          rocketLeagueOverlayState = nextRocketLeagueOverlay;
          rocketLeagueStatsApi?.setBroadcastSetupEnabled?.(nextRocketLeagueOverlay.broadcastSetupEnabled !== false);
        }
        if (nextLeagueOverlay !== undefined) leagueOverlayState = nextLeagueOverlay;
        lastWrite = new Date().toISOString();
        generation += 1;
        setLru(lastRevisionByWriter, payload.writerId, { revision: payload.revision, digest: payloadDigest }, 256);
        lastError = null;
      });

      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true, files: payload.files.length, outputDir, lastWrite, generation, revision: payload.revision, duplicate }));
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      if (status >= 500) lastError = String(error?.message || "JSON package write failed");
      rejectJson(response, status, error?.message || "JSON package write failed");
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
  const writer = await startJsonWriter({ seedValorantMapData: true });
  console.log(`Live JSON writer: ${writer.outputDir}`);
}
