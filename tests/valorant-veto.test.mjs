import assert from "node:assert/strict";
import test from "node:test";
import { resetValorantVeto } from "../lib/valorant.mjs";

const bo3 = {
  ban1: "Ascent",
  ban2: "Bind",
  pick1: "Haven",
  pick2: "Lotus",
  ban3: "Sunset",
  ban4: "Abyss",
  decider: "Split",
  side1: "attack",
  side2: "defense",
  side3: "",
};

const bo5 = {
  ban1: "Ascent",
  ban2: "Bind",
  pick1: "Haven",
  pick2: "Lotus",
  pick3: "Sunset",
  pick4: "Abyss",
  decider: "Split",
  side1: "attack",
  side2: "defense",
  side3: "attack",
  side4: "",
  side5: "",
};

test("reset clears every Bo3 pick, ban, and decider but keeps starting sides", () => {
  const next = resetValorantVeto(bo3);
  for (const key of ["ban1", "ban2", "pick1", "pick2", "ban3", "ban4", "decider"]) {
    assert.equal(next[key], "", `${key} should be cleared`);
  }
  assert.equal(next.side1, "attack");
  assert.equal(next.side2, "defense");
  assert.equal(next.side3, "");
});

test("reset clears every Bo5 pick, ban, and decider but keeps starting sides", () => {
  const next = resetValorantVeto(bo5);
  for (const key of ["ban1", "ban2", "pick1", "pick2", "pick3", "pick4", "decider"]) {
    assert.equal(next[key], "", `${key} should be cleared`);
  }
  assert.equal(next.side1, "attack");
  assert.equal(next.side2, "defense");
  assert.equal(next.side3, "attack");
});

test("repeated resets are safe and do not mutate the input", () => {
  const input = { ...bo3 };
  const once = resetValorantVeto(input);
  const twice = resetValorantVeto(once);
  assert.deepEqual(once, twice);
  assert.deepEqual(input, bo3, "input must not be mutated");
  assert.notEqual(once, input, "returns a new object");
});

test("reset tolerates missing or empty veto data", () => {
  assert.deepEqual(resetValorantVeto(undefined), {});
  assert.deepEqual(resetValorantVeto(null), {});
  assert.deepEqual(resetValorantVeto({}), {});
});
