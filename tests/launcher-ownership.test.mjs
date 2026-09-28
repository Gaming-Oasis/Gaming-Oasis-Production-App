import assert from "node:assert/strict";
import test from "node:test";
import { ownedRunnerPid } from "../scripts/launch-production.mjs";

test("launcher restarts only a writer whose identity and saved runner PID match", () => {
  const writer = { identityMatches: true, payload: { pid: 12345 } };
  assert.equal(ownedRunnerPid(writer, "12345\n"), 12345);
  assert.equal(ownedRunnerPid(writer, "54321"), null);
  assert.equal(ownedRunnerPid({ ...writer, identityMatches: false }, "12345"), null);
  assert.equal(ownedRunnerPid({ identityMatches: true, payload: { pid: process.pid } }, String(process.pid)), null);
  assert.equal(ownedRunnerPid({ identityMatches: true, payload: { pid: -1 } }, "-1"), null);
});
