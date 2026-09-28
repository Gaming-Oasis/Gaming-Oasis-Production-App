import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { formatSocialHandle } from "../lib/social-handle.mjs";
import { buildLeagueScoreFields } from "../lib/league-of-legends.mjs";
import { JSON_FILENAMES, startJsonWriter } from "../scripts/json-writer.mjs";

test("prefixes a social handle and keeps a single @", () => {
  assert.equal(formatSocialHandle(""), "");
  assert.equal(formatSocialHandle("   "), "");
  assert.equal(formatSocialHandle("@"), "");
  assert.equal(formatSocialHandle("BepicCasts"), "@BepicCasts");
  assert.equal(formatSocialHandle("@Infernos1s"), "@Infernos1s");
  assert.equal(formatSocialHandle("  @@handle  "), "@handle");
});

test("live JSON output writes social handles with @", async () => {
  const outputDir = await mkdtemp(path.join(tmpdir(), "go-social-"));
  const writer = await startJsonWriter({
    port: 0,
    outputDir,
    enableRocketLeagueStatsApi: false,
    enableLeagueLiveClient: false,
  });
  try {
    const origin = "http://localhost:3000";
    const session = await fetch(`${writer.url}/api/live-json/session`, { headers: { Origin: origin } });
    assert.equal(session.status, 200);
    const { token } = await session.json();
    const files = [];
    for (const filename of JSON_FILENAMES) {
      const data = JSON.parse(await readFile(new URL(`../JSONs/${filename}`, import.meta.url), "utf8"));
      if (filename === "FinalOutput.json") {
        Object.assign(data[0], buildLeagueScoreFields({ bestOf: "Bo5", confirmedGames: [{ gameNumber: 1, winner: "team1" }, { gameNumber: 2, winner: "team2" }] }));
        data[0].mainsocial = "BepicCasts";
        data[0].secondarysocial = "@Infernos1s";
      }
      files.push({ filename, data });
    }
    const claim = await fetch(`${writer.url}/api/live-json/claim`, {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        "X-Gaming-Oasis-Writer-Token": token,
      },
      body: JSON.stringify({ writerId: "social-handle-test", force: false }),
    });
    assert.equal(claim.status, 200);
    const { fence } = await claim.json();
    const write = await fetch(`${writer.url}/api/live-json`, {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        "X-Gaming-Oasis-Writer-Token": token,
      },
      body: JSON.stringify({ writerId: "social-handle-test", fence, revision: 1, files }),
    });
    assert.equal(write.status, 200);
    const saved = JSON.parse(await readFile(path.join(outputDir, "FinalOutput.json"), "utf8"));
    assert.equal(saved[0].mainsocial, "@BepicCasts");
    assert.equal(saved[0].secondarysocial, "@Infernos1s");
    assert.equal(saved[0].lolscore1, "1 - 0");
    assert.equal(saved[0].lolscore2, "0 - 1");
    assert.equal(saved[0].lolscore5, "");
  } finally {
    await writer.close();
    await rm(outputDir, { recursive: true, force: true });
  }
});
