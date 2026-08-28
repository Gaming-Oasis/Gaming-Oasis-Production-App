import https from "node:https";
import { createEmptyLeagueLiveFeed, normalizeLeagueLiveFeed } from "./league-of-legends.mjs";

const DEFAULT_ORIGIN = "https://127.0.0.1:2999";
const POLL_INTERVAL_MS = 500;
const STALE_AFTER_MS = 10_000;

function getJson(url, timeoutMs = 1200) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { rejectUnauthorized: false, timeout: timeoutMs }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        if ((response.statusCode ?? 500) >= 400) {
          reject(new Error(`League client returned ${response.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch {
          reject(new Error("League client returned invalid JSON"));
        }
      });
    });
    request.on("timeout", () => request.destroy(new Error("League client timed out")));
    request.on("error", reject);
  });
}

export function mergeLeagueOverlayLive(base, feed, now = Date.now()) {
  if (!base) return null;
  const source = base.debugLiveOverride && base.debugLive ? base.debugLive : feed;
  if (!source) return { ...base, live: createEmptyLeagueLiveFeed() };
  const lastEventAt = source.connection?.lastEventAt ? Date.parse(source.connection.lastEventAt) : 0;
  const age = lastEventAt ? Math.max(0, now - lastEventAt) : Number.POSITIVE_INFINITY;
  const connected = Boolean(source.connection?.connected);
  const stale = !connected && age >= STALE_AFTER_MS;
  const live = stale
    ? {
        ...createEmptyLeagueLiveFeed(),
        connection: { connected: false, lastEventAt: source.connection?.lastEventAt ?? null, stale: true },
      }
    : {
        ...source,
        connection: { connected, lastEventAt: source.connection?.lastEventAt ?? null, stale: false },
      };
  return { ...base, updatedAt: new Date(now).toISOString(), live };
}

export function startLeagueLiveClient({
  origin = DEFAULT_ORIGIN,
  intervalMs = POLL_INTERVAL_MS,
  requestJson = getJson,
} = {}) {
  let stopped = false;
  let timer = null;
  let feed = createEmptyLeagueLiveFeed();
  let polling = false;

  async function poll() {
    if (stopped || polling) return;
    polling = true;
    try {
      const allgamedata = await requestJson(`${origin}/liveclientdata/allgamedata`);
      feed = normalizeLeagueLiveFeed({ allgamedata }, feed);
    } catch {
      feed = {
        ...feed,
        connection: {
          connected: false,
          lastEventAt: feed.connection?.lastEventAt ?? null,
          stale: feed.connection?.lastEventAt
            ? Date.now() - Date.parse(feed.connection.lastEventAt) >= STALE_AFTER_MS
            : false,
        },
      };
    } finally {
      polling = false;
    }
  }

  void poll();
  timer = setInterval(() => void poll(), intervalMs);
  timer.unref?.();

  return {
    getFeed: () => feed,
    poll,
    stop: () => {
      stopped = true;
      if (timer) clearInterval(timer);
    },
  };
}
