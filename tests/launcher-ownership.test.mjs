import assert from "node:assert/strict";
import test from "node:test";
import { ownedRunnerPid, packagedBuildMatches } from "../scripts/launch-production.mjs";

test("launcher restarts only a writer whose identity and saved runner PID match", () => {
  const writer = { identityMatches: true, payload: { pid: 12345 } };
  assert.equal(ownedRunnerPid(writer, "12345\n"), 12345);
  assert.equal(ownedRunnerPid(writer, "54321"), null);
  assert.equal(ownedRunnerPid({ ...writer, identityMatches: false }, "12345"), null);
  assert.equal(ownedRunnerPid({ identityMatches: true, payload: { pid: process.pid } }, String(process.pid)), null);
  assert.equal(ownedRunnerPid({ identityMatches: true, payload: { pid: -1 } }, "-1"), null);
});

test("launcher accepts only a versioned packaged build for the current lockfile", () => {
  const digest = "a".repeat(64);
  const marker = {
    formatVersion: 1,
    lockSha256: digest,
    commit: "b".repeat(40),
  };

  assert.equal(packagedBuildMatches(marker, digest), true);
  assert.equal(packagedBuildMatches({ ...marker, formatVersion: 2 }, digest), false);
  assert.equal(packagedBuildMatches({ ...marker, lockSha256: "c".repeat(64) }, digest), false);
  assert.equal(packagedBuildMatches({ ...marker, commit: "not-a-commit" }, digest), false);
});
