import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const layout = JSON.parse(await readFile(new URL("../lib/league-overlay-layout.json", import.meta.url), "utf8"));

// Read the PSD's stored layer rectangles independently of the Python exporter.
function psdRectangles(bytes) {
  assert.equal(bytes.toString("ascii", 0, 4), "8BPS");
  assert.equal(bytes.readUInt16BE(4), 1);
  let offset = 26;
  offset += 4 + bytes.readUInt32BE(offset); // Color-mode data.
  offset += 4 + bytes.readUInt32BE(offset); // Image resources.
  offset += 8; // Layer/mask section length and layer-info length.
  const count = Math.abs(bytes.readInt16BE(offset));
  offset += 2;
  const rectangles = new Set();
  for (let index = 0; index < count; index++) {
    const top = bytes.readInt32BE(offset);
    const left = bytes.readInt32BE(offset + 4);
    const bottom = bytes.readInt32BE(offset + 8);
    const right = bytes.readInt32BE(offset + 12);
    rectangles.add([left, top, right - left, bottom - top].join(","));
    const channels = bytes.readUInt16BE(offset + 16);
    offset += 18 + channels * 6 + 12;
    const extraLength = bytes.readUInt32BE(offset);
    offset += 4 + extraLength;
  }
  return rectangles;
}

function placedRectangles(value, prefix = "") {
  if (Array.isArray(value) && value.length === 4 && value.every(Number.isFinite)) return [[prefix, value]];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => placedRectangles(child, prefix ? `${prefix}.${key}` : key));
}

test("League layout matches the supplied PSD layer rectangles and source revisions", async () => {
  for (const [name, hash] of Object.entries(layout.sources)) {
    const bytes = await readFile(new URL(`../assets/league-of-legends/${name}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), hash, `${name}: regenerate extracted artwork after changing the source`);
    if (!name.endsWith(".psd")) continue;
    const scene = name.startsWith("PickBan") ? "draft" : "score";
    assert.deepEqual(layout[scene].size, [bytes.readUInt32BE(18), bytes.readUInt32BE(14)]);
    const sourceRects = psdRectangles(bytes);
    for (const [key, rect] of placedRectangles(layout[scene])) {
      // These three groups have calculated unions, not raster layer bounds.
      if (scene === "score" && ["main", "timers.0.plate", "timers.1.plate"].includes(key)) continue;
      assert.ok(sourceRects.has(rect.join(",")), `${scene}.${key}: ${rect} is not a rectangle in the source PSD`);
    }
  }
});

test("series and role masks retain each placed source layer's native dimensions", async () => {
  for (const scene of ["draft", "score"]) {
    for (const bestOf of ["bo3", "bo5"]) {
      for (const [index, rect] of layout[scene].series[bestOf].entries()) {
        for (const state of ["empty", "filled"]) {
          const image = await readFile(new URL(`../public/league-of-legends-overlay/${scene}-${bestOf}-${index}-${state}.png`, import.meta.url));
          assert.deepEqual([image.readUInt32BE(16), image.readUInt32BE(20)], rect.slice(2));
        }
      }
    }
  }
  const roles = ["Top", "Jungle", "Mid", "Bottom", "Support"];
  for (const side of ["blue", "red"]) {
    for (const [index, role] of roles.entries()) {
      const image = await readFile(new URL(`../public/league-of-legends-overlay/role-${side}-${role.toLowerCase()}.png`, import.meta.url));
      assert.deepEqual([image.readUInt32BE(16), image.readUInt32BE(20)], layout.draft[side].picks[index].roles[role].slice(2));
    }
  }
});

test("League scoreboard replaces the center league logo with VS", async () => {
  const source = await readFile(new URL("../app/overlays/league-of-legends/LeagueOverlay.tsx", import.meta.url), "utf8");
  const liveOverlay = source.slice(source.indexOf("export function LiveOverlay"), source.indexOf("export function LeagueOverlayFrame"));
  assert.doesNotMatch(liveOverlay, /StableArtwork[^\n]*leagueLogo|label="League"/);
  assert.match(liveOverlay, /value="VS" rect=\{centered\([^\n]*topCenter\)\}[^>]*label="Versus"/);
});

test("League Pick/Ban sponsor uses the shared overlay card treatment", async () => {
  const component = await readFile(new URL("../app/overlays/league-of-legends/LeagueOverlay.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/overlays/league-of-legends/league-overlay.module.css", import.meta.url), "utf8");
  assert.match(component, /<SponsorCarousel sponsors=\{data\.sponsors\} className=\{styles\.draftSponsor\} \/>/);
  assert.doesNotMatch(css, /draftSponsor::before[^}]*display:\s*none/);
  assert.match(css, /\.draftCenter \.draftSponsor > div \{ inset: 3px 10px 0; \}/);
  assert.match(css, /\.draftCenter \.draftSponsor span \{[^}]*font-size: 16px;[^}]*font-weight: 700;[^}]*letter-spacing: \.035em;/);
});

test("League graphics use the General Info event name unless the scoreboard header is overridden", async () => {
  const source = await readFile(new URL("../lib/league-of-legends.mjs", import.meta.url), "utf8");
  const builder = source.slice(source.indexOf("export function buildLeagueOverlayState"));
  assert.match(builder, /header: resolveScoreboardHeader\(league\.scoreboardHeader, options\.eventName\)/);
  assert.doesNotMatch(builder, /header:[^\n]*LEAGUE OF LEGENDS/);
});

test("League series indicators use Rocket League-style pills in the source artwork slots", async () => {
  const component = await readFile(new URL("../app/overlays/league-of-legends/LeagueOverlay.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/overlays/league-of-legends/league-overlay.module.css", import.meta.url), "utf8");
  const indicators = component.slice(component.indexOf("function SeriesIndicators"), component.indexOf("function FearlessStrip"));
  assert.match(indicators, /styles\.seriesPill/);
  assert.match(indicators, /styles\.seriesPillFilled/);
  assert.match(indicators, /styles\.seriesPillEmpty/);
  assert.doesNotMatch(indicators, /<Icon/);
  assert.match(css, /\.seriesPill \{[^}]*border: 3px solid currentColor;[^}]*border-radius: 999px;/);
  assert.match(css, /\.seriesPillEmpty \{[^}]*background: transparent;[^}]*opacity: \.45;/);
  assert.match(css, /\.seriesPillFilled \{[^}]*background: currentColor;[^}]*opacity: 1;/);
});
