import assert from "node:assert/strict";
import test from "node:test";
import { readableVsText } from "../lib/readable-text.mjs";

test("VS labels and series markers account for the logo plate beneath the team wash", () => {
  assert.equal(readableVsText("#F6AC18", "#FFFFFF"), "#171717");
  assert.equal(readableVsText("#F6AC18", "#171717"), "#FFFFFF");
  assert.equal(readableVsText("#171717", "#FFFFFF"), "#FFFFFF");
  assert.equal(readableVsText("#FFFFFF", "#FFFFFF"), "#171717");
});

test("VS contrast preserves automatic plate fallback and legacy dark backgrounds", () => {
  assert.equal(readableVsText("#F6AC18", ""), readableVsText("#F6AC18", "#FFFFFF"));
  assert.equal(readableVsText("#F6AC18", "#000000"), readableVsText("#F6AC18", "#171717"));
});
