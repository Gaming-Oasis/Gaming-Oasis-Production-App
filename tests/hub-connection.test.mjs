import assert from "node:assert/strict";
import test from "node:test";
import { BRACKET_CONNECTION_COPY, hubConnectionState, hubDraftProgress } from "../lib/hub-connection.mjs";

const ready = { owner: true, reason: "", mode: "live", hasSnapshot: true,
  status: { busy: false, connected: true, error: "", lastSuccess: "2026-10-12T16:00:00Z" } };

test("a retained snapshot and refresh time do not claim a new connection is healthy", () => {
  const view = hubConnectionState({ ...ready, status: { ...ready.status, busy: true, connected: false } });
  assert.equal(view.label, "Connecting");
  assert.match(view.detail, /last imported draft/);
  assert.equal(hubConnectionState(ready).label, "Connected");
  assert.equal(hubConnectionState({ ...ready, status: { ...ready.status, busy: true } }).label, "Connected");
});

test("outages explain retained data; missing first response never claims a successful import", () => {
  const failure = { ...ready, status: { ...ready.status, error: "Writer is unavailable." } };
  assert.equal(hubConnectionState(failure).label, "Updates interrupted");
  assert.match(hubConnectionState(failure).detail, /last successful import/);
  assert.equal(hubConnectionState({ ...failure, hasSnapshot: false }).label, "Unable to connect");
  assert.equal(hubConnectionState({ ...failure, mode: "manual" }).label, "Manual");
});

test("setup and production ownership take priority over an old connection status", () => {
  assert.equal(hubConnectionState({ ...ready, owner: false }).label, "Standby");
  const view = hubConnectionState({ ...ready, reason: "Match 1 is not a VALORANT match." });
  assert.equal(view.label, "Match setup needed");
  assert.match(view.detail, /not a VALORANT/);
});

test("an empty published collection explains why the map veto has no selections", () => {
  const collection = { required: true, veto: null, sessions: [] };
  assert.equal(hubDraftProgress(collection, "valorant", 2), "No map veto has been published in League Hub yet.");
  assert.equal(hubDraftProgress(collection, "leagueOfLegends", 2), "No draft has been published for Game 2 yet.");
  assert.match(hubDraftProgress({ ...collection, required: false }, "valorant", 2), /disabled/);
});

test("VALORANT veto progress remains complete while game agents are pending", () => {
  const collection = { required: true, veto: { phase: "complete", progress: "Complete" },
    sessions: [{ gameIndex: 2, phase: "awaiting_final_confirmation", progress: "Waiting for score and agent report" }] };
  assert.equal(hubDraftProgress(collection, "valorant", 2), "Map veto complete");
});

test("League progress follows the production game, including when Hub has advanced", () => {
  const collection = { required: true, currentGameIndex: 2, sessions: [
    { gameIndex: 1, phase: "complete", progress: "Complete" },
    { gameIndex: 2, phase: "in_progress", progress: "Champion pick" },
  ] };
  assert.equal(hubDraftProgress(collection, "leagueOfLegends", 1), "Draft complete");
  assert.equal(hubDraftProgress(collection, "leagueOfLegends", 2), "Champion pick");
});

test("bracket status uses the same guards with Hold as its manual mode", () => {
  const bracket = { ...ready, copy: BRACKET_CONNECTION_COPY };
  const resumed = hubConnectionState({ ...bracket, status: { ...ready.status, busy: true, connected: false } });
  assert.equal(resumed.label, "Connecting", "a refresh time saved before Hold does not claim the resumed poll is healthy");
  assert.match(resumed.detail, /current bracket stays on air/);
  assert.equal(hubConnectionState({ ...bracket, mode: "manual" }).label, "Updates held");
  assert.equal(hubConnectionState({ ...bracket, owner: false }).label, "Standby");
  assert.equal(hubConnectionState({ ...bracket, reason: "Choose an event and load a stage to begin." }).label, "No bracket loaded");
  const failure = hubConnectionState({ ...bracket, status: { ...ready.status, error: "League Hub is unavailable" } });
  assert.equal(failure.label, "Updates interrupted");
  assert.equal(failure.detail, "League Hub is unavailable. The current bracket stays on air. Retrying automatically.");
  assert.match(hubConnectionState(bracket).detail, /Hold freezes/);
});
