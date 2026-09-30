import assert from "node:assert/strict";
import test from "node:test";
import { createTwitchClient } from "../lib/twitch.mjs";

const user = { user_id: "42", client_id: "client", scopes: ["channel:manage:broadcast"] };
const channel = { broadcaster_id: "42", broadcaster_name: "GamingOasis", title: "Show", game_id: "123", game_name: "Rocket League" };
function mock(responses) {
  const calls = [];
  return { calls, fetcher: async (url, options) => {
    calls.push({ url, ...options });
    const response = responses.shift();
    assert.ok(response, "Unexpected request");
    return new Response(response.status === 204 ? null : JSON.stringify(response.body), { status: response.status || 200 });
  } };
}

test("loads the authenticated broadcaster using the token's own client ID", async () => {
  const api = mock([{ body: user }, { body: { data: [channel] } }]);
  assert.deepEqual(await createTwitchClient("oauth:secret", api.fetcher).load(), channel);
  assert.equal(api.calls[0].headers.Authorization, "OAuth secret");
  assert.equal(api.calls[1].headers["Client-Id"], "client");
  assert.equal(api.calls[1].url, "https://api.twitch.tv/helix/channels?broadcaster_id=42");
  assert.ok(api.calls.every((call) => !call.url.includes("secret")));
});

test("search encodes category text and returns Twitch IDs", async () => {
  const api = mock([{ body: user }, { body: { data: [{ id: "123", name: "A & B" }] } }]);
  assert.deepEqual(await createTwitchClient("secret", api.fetcher).search(" A & B "), [{ id: "123", name: "A & B" }]);
  assert.equal(new URL(api.calls[1].url).searchParams.get("query"), "A & B");
});

test("explicit update sends only title and category to the authorized broadcaster", async () => {
  const api = mock([{ body: user }, { status: 204 }]);
  await createTwitchClient("secret", api.fetcher).update("42", " New show ", "123");
  assert.equal(api.calls[1].method, "PATCH");
  assert.deepEqual(JSON.parse(api.calls[1].body), { title: "New show", game_id: "123" });
});

test("missing permission, app tokens and mismatched broadcasters cannot update", async () => {
  for (const identity of [{ ...user, scopes: [] }, { ...user, user_id: undefined }, { ...user, user_id: "other" }]) {
    const api = mock([{ body: identity }]);
    await assert.rejects(createTwitchClient("secret", api.fetcher).update("42", "Show", "123"));
    assert.equal(api.calls.length, 1);
  }
});

test("invalid title and category drafts never reach Twitch", async () => {
  const api = mock([]);
  const client = createTwitchClient("secret", api.fetcher);
  for (const title of [" ", "x".repeat(141)]) await assert.rejects(client.update("42", title, "123"));
  await assert.rejects(client.update("42", "Show", "Rocket League"));
  assert.equal(api.calls.length, 0);
});

test("Twitch errors have actionable messages and never repeat upstream credentials", async () => {
  for (const status of [400, 401, 403, 429, 500]) {
    const api = mock([{ status, body: { message: "secret" } }]);
    await assert.rejects(createTwitchClient("secret", api.fetcher).load(), (error) => error.status === status && !error.message.includes("secret"));
  }
  await assert.rejects(createTwitchClient("secret", async () => { throw new Error("secret"); }).load(), /could not be reached/);
});

test("a failed update is not reported as a successful PATCH", async () => {
  const api = mock([{ body: user }, { status: 401, body: {} }]);
  await assert.rejects(createTwitchClient("secret", api.fetcher).update("42", "Show", "123"), /authorization expired/);
});
