import assert from "node:assert/strict";
import test from "node:test";
import {
  CASTER_PRESET_LIMIT,
  findCasterPreset,
  loadCasterPresets,
  normalizeCasterPresets,
  removeCasterPreset,
  saveCasterPresets,
  upsertCasterPreset,
} from "../lib/caster-presets.mjs";

const KEY = "test-presets";

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
    removeItem: (key) => { delete data[key]; },
    data,
  };
}

test("normalize keeps valid presets, drops malformed entries, and dedupes case-insensitively", () => {
  const presets = normalizeCasterPresets([
    { name: "  Joe  ", social: "@joe" },
    { name: "joe", social: "@dupe" },
    { name: "", social: "@empty" },
    { social: "@noname" },
    "not-an-object",
    null,
    { name: "Jane" },
  ]);
  assert.deepEqual(presets, [
    { name: "Joe", social: "@joe" },
    { name: "Jane", social: "" },
  ]);
});

test("normalize caps the list at the preset limit", () => {
  const many = Array.from({ length: CASTER_PRESET_LIMIT + 5 }, (_, index) => ({ name: `Caster ${index}` }));
  assert.equal(normalizeCasterPresets(many).length, CASTER_PRESET_LIMIT);
  assert.deepEqual(normalizeCasterPresets("junk"), []);
});

test("upsert creates a new preset and updates an existing one by name", () => {
  const created = upsertCasterPreset([], { name: "Joe", social: "@joe" });
  assert.equal(created.created, true);
  assert.deepEqual(created.presets, [{ name: "Joe", social: "@joe" }]);

  const updated = upsertCasterPreset(created.presets, { name: "JOE", social: "@new" });
  assert.equal(updated.created, false);
  assert.deepEqual(updated.presets, [{ name: "JOE", social: "@new" }]);

  const second = upsertCasterPreset(updated.presets, { name: "Jane", social: "" });
  assert.equal(second.presets.length, 2);
});

test("upsert rejects an empty caster name", () => {
  assert.equal(upsertCasterPreset([], { name: "   ", social: "@x" }), null);
  assert.equal(upsertCasterPreset([], {}), null);
});

test("remove deletes by name case-insensitively and tolerates missing presets", () => {
  const presets = [{ name: "Joe", social: "" }, { name: "Jane", social: "@jane" }];
  assert.deepEqual(removeCasterPreset(presets, "JOE"), [{ name: "Jane", social: "@jane" }]);
  assert.deepEqual(removeCasterPreset(presets, "Nobody"), presets);
  assert.equal(findCasterPreset(presets, "jane").social, "@jane");
  assert.equal(findCasterPreset(presets, "nobody"), undefined);
});

test("load reads stored presets and reports corrupt or unreadable data", () => {
  const good = memoryStorage({ [KEY]: JSON.stringify([{ name: "Joe", social: "@joe" }]) });
  assert.deepEqual(loadCasterPresets(good, KEY), { presets: [{ name: "Joe", social: "@joe" }], error: false });

  const empty = memoryStorage();
  assert.deepEqual(loadCasterPresets(empty, KEY), { presets: [], error: false });

  const corruptJson = memoryStorage({ [KEY]: "{not json" });
  assert.deepEqual(loadCasterPresets(corruptJson, KEY), { presets: [], error: true });

  const wrongShape = memoryStorage({ [KEY]: JSON.stringify({ name: "Joe" }) });
  assert.deepEqual(loadCasterPresets(wrongShape, KEY), { presets: [], error: true });

  const throwing = { getItem: () => { throw new Error("denied"); } };
  assert.deepEqual(loadCasterPresets(throwing, KEY), { presets: [], error: true });

  assert.deepEqual(loadCasterPresets(null, KEY), { presets: [], error: false });
});

test("save persists a normalized list and reports storage failures", () => {
  const storage = memoryStorage();
  assert.equal(saveCasterPresets(storage, KEY, [{ name: " Joe ", social: "@joe" }]), true);
  assert.deepEqual(loadCasterPresets(storage, KEY).presets, [{ name: "Joe", social: "@joe" }]);

  const throwing = { setItem: () => { throw new Error("quota"); } };
  assert.equal(saveCasterPresets(throwing, KEY, [{ name: "Joe" }]), false);
  assert.equal(saveCasterPresets(null, KEY, [{ name: "Joe" }]), false);
});
