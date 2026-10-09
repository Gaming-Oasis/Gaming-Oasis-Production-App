import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import test from "node:test";
import { startRocketLeagueStatsApiClient } from "../lib/rocket-league-stats-api.mjs";
import { startLeagueLiveClient } from "../lib/league-of-legends-live.mjs";
import { startJsonWriter } from "../scripts/json-writer.mjs";

async function waitFor(predicate, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return predicate();
}

test("Rocket League stats client refresh bypasses reconnect backoff", async () => {
  const sockets = new Set();
  const tcpServer = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.resume();
  });
  await new Promise((resolve) => tcpServer.listen(0, "127.0.0.1", resolve));
  const tcpPort = tcpServer.address().port;
  const client = startRocketLeagueStatsApiClient({
    tcpHost: "127.0.0.1",
    tcpPort,
    wsUrl: "ws://127.0.0.1:9",
    broadcastSetupEnabled: false,
  });
  try {
    assert.equal(await waitFor(() => client.getFeed().connection?.connected), true);

    for (const socket of sockets) socket.destroy();
    tcpServer.close();
    assert.equal(await waitFor(() => client.getFeed().connection?.connected === false), true);

    await new Promise((resolve) => tcpServer.listen(tcpPort, "127.0.0.1", resolve));
    assert.equal(client.refresh(), true);
    // Auto-reconnect backoff starts at 1s; a sub-600ms connect must come from refresh.
    assert.equal(await waitFor(() => client.getFeed().connection?.connected, 600), true);

    client.stop();
    assert.equal(client.refresh(), false);
  } finally {
    client.stop();
    tcpServer.close();
  }
});

test("League live client refresh polls immediately", async () => {
  const requests = [];
  const client = startLeagueLiveClient({
    intervalMs: 60_000,
    requestJson: async (url) => {
      requests.push(url);
      return {
        activePlayer: null,
        allPlayers: [{ riotId: "Blue#GO", team: "ORDER", scores: { kills: 0 } }],
        events: { Events: [] },
        gameData: { gameTime: 1, gameMode: "CLASSIC", mapName: "Map11", mapNumber: 11, mapTerrain: "Default" },
      };
    },
  });
  try {
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(requests.length, 1);
    await client.refresh();
    assert.equal(requests.length, 2);
  } finally {
    client.stop();
  }
});

test("live data refresh endpoint retries game API connections", async () => {
  const outputDir = await mkdtemp(path.join(tmpdir(), "go-refresh-"));
  const writer = await startJsonWriter({ port: 0, outputDir });
  try {
    const origin = "http://localhost:3000";
    const session = await fetch(`${writer.url}/api/live-json/session`, { headers: { Origin: origin } });
    assert.equal(session.status, 200);
    const { token } = await session.json();

    const post = (body, headers = {}) => fetch(`${writer.url}/api/live-data/refresh`, {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        "X-Gaming-Oasis-Writer-Token": token,
        ...headers,
      },
      body: JSON.stringify(body),
    });

    const unauthorized = await post({ game: "all" }, { "X-Gaming-Oasis-Writer-Token": "" });
    assert.equal(unauthorized.status, 403);

    const invalid = await post({ game: "valorant" });
    assert.equal(invalid.status, 422);

    const rocketOnly = await post({ game: "rocketLeague" });
    assert.equal(rocketOnly.status, 200);
    const rocketPayload = await rocketOnly.json();
    assert.deepEqual(Object.keys(rocketPayload.results), ["rocketLeague"]);
    assert.equal(rocketPayload.results.rocketLeague.connected, false);

    const all = await post({ game: "all" });
    assert.equal(all.status, 200);
    const allPayload = await all.json();
    assert.equal(allPayload.results.rocketLeague.connected, false);
    assert.equal(allPayload.results.leagueOfLegends.connected, false);
  } finally {
    await writer.close();
    await rm(outputDir, { recursive: true, force: true });
  }
});
