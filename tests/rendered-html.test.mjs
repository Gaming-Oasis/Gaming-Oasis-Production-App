import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { shortTeamName, TEAM_NAME_LIMIT } from "../lib/team-name.mjs";
import { calculateRocketLeagueSeries, formatRocketLeagueScore } from "../lib/rocket-league.mjs";
import { buildRocketLeagueOverlayState } from "../lib/rocket-league-live.mjs";
import { resolveScoreboardHeader } from "../lib/scoreboard-header.mjs";
import { buildValorantFields, buildValorantOverlayState, calculateValorantSeries, formatValorantScore, getValorantCurrentMap, getValorantCurrentSides, VALORANT_MAP_ARTWORK } from "../lib/valorant.mjs";
import { JSON_FILENAMES, startJsonWriter, VALORANT_MAP_DATA_FILENAME } from "../scripts/json-writer.mjs";

test("resolves scoreboard headers from event name with game-level override", () => {
  assert.equal(resolveScoreboardHeader("", "Spring Invitational"), "Spring Invitational");
  assert.equal(resolveScoreboardHeader("  ", "Spring Invitational"), "Spring Invitational");
  assert.equal(resolveScoreboardHeader("RL Finals", "Spring Invitational"), "RL Finals");
  assert.equal(resolveScoreboardHeader("", ""), "");
});

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Gaming Oasis production workspace", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Gaming Oasis Production OS<\/title>/i);
  assert.match(html, /Production workspace/);
  assert.match(html, /Show setup/);
  assert.match(html, /General info/);
  assert.match(html, /Team Info/);
  assert.match(html, /Sponsors/);
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /id: "gaming-oasis"/);
  assert.match(page, /gaming-oasis-logo-light\.png/);
  assert.match(page, /Always included/);
  assert.match(page, /readOnly=\{lockedSponsor\}/);
  assert.match(page, /current\.sponsors\[index\]\?\.id === GAMING_OASIS_SPONSOR\.id/);
  assert.match(page, /savedSponsors = \(saved\.sponsors \?\? \[\]\)\.filter/);
  assert.match(page, /const \[liveWriteReady, setLiveWriteReady\] = useState\(false\)/);
  assert.match(page, /if \(!hydrated \|\| !liveWriteReady\) return/);
  assert.match(page, /if \(state === initialStateRef\.current\) return/);
  assert.match(page, /function hasProductionContent\(state: ProductionState\)/);
  assert.match(page, /if \(!hasLiveProductionContent && !allowEmptyLiveWrite\) return/);
  assert.match(page, /setAllowEmptyLiveWrite\(true\)/);
  assert.match(html, /Export JSON package/);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview/i);
});

test("server-renders the transparent VALORANT browser overlay route", async () => {
  const response = await render("/overlays/valorant");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const page = await readFile(new URL("../app/overlays/valorant/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/overlays/valorant/valorant-overlay.module.css", import.meta.url), "utf8");
  assert.match(page, /width:100%.*background:transparent/);
  assert.match(page, /1920/);
  assert.match(page, /1080/);
  assert.match(page, /setInterval\(refresh, 500\)/);
  assert.match(page, /MapWidgetStrip/);
  assert.match(page, /MapArtwork/);
  assert.match(page, /className=\{styles\.mapArtwork\}/);
  assert.match(page, /api\/public\/map-artwork/);
  assert.match(page, /VALORANT series maps/);
  assert.match(page, /SponsorCarousel/);
  assert.match(page, /overlay\.sponsorWidgetEnabled \? <SponsorCarousel/);
  assert.match(page, /SPONSOR_ROTATION_MS = 15000/);
  assert.match(page, /aria-label="Sponsor rotation"/);
  assert.match(page, /displayableSignature/);
  assert.match(page, /status === "failed" && Boolean\(sponsor\.name\)/);
  assert.doesNotMatch(page, /SideIcon|<svg viewBox="0 0 16 16"/);
  assert.doesNotMatch(page, /pickerSide|SIDE TBD|starts attack|starts defense/);
  assert.doesNotMatch(page, /mapLogo[^\n]*style=\{\{ background: team\.logoBackground \}\}/);
  assert.doesNotMatch(page, /mapLoser|firstScore < secondScore|secondScore < firstScore/);
  assert.match(css, /width: 1920px/);
  assert.match(css, /height: 1080px/);
  assert.match(css, /\.logoFrame img \{[\s\S]*width: 41px;[\s\S]*height: 41px/);
  assert.match(css, /\.mapWidget \{[\s\S]*bottom: 0/);
  assert.match(css, /\.mapWidget \{[\s\S]*transform: scale\(1\.035\);[\s\S]*transform-origin: left bottom/);
  assert.match(css, /\.mapWidget \{[\s\S]*clip-path: polygon\(0 0, calc\(100% - 14px\) 0, 100% 50%, calc\(100% - 14px\) 100%, 0 100%\)/);
  assert.match(css, /grid-template-columns: repeat\(3, 170px\)/);
  assert.match(css, /\.mapArtwork \{[\s\S]*opacity: \.92;[\s\S]*object-fit: cover/);
  assert.match(css, /\.mapItem::before \{[\s\S]*linear-gradient/);
  assert.match(css, /\.mapCopy \{[\s\S]*position: absolute;[\s\S]*top: 6px;[\s\S]*left: 8px/);
  assert.match(css, /\.mapCopy span \{[\s\S]*top: 0;[\s\S]*height: 8px/);
  assert.match(css, /\.mapCopy strong \{[\s\S]*top: 10px;[\s\S]*height: 14px/);
  assert.doesNotMatch(css, /\.mapCopy::before/);
  assert.match(css, /text-shadow: 0 1px 2px rgb\(0 0 0 \/ 95%\), 0 0 4px rgb\(0 0 0 \/ 72%\)/);
  assert.match(css, /\.mapLogo \{[\s\S]*width: 34px;[\s\S]*height: 34px/);
  assert.match(css, /\.mapLogoSmall \{[\s\S]*width: 23px;[\s\S]*height: 23px/);
  assert.match(css, /\.mapLogoSmall \.logoImage \{[\s\S]*width: 22px;[\s\S]*height: 22px/);
  assert.match(css, /\.sponsorCard \{[\s\S]*left: 16px;[\s\S]*bottom: 57\.4px;[\s\S]*width: 380px;[\s\S]*height: 164px/);
  assert.match(css, /\.sponsorCard \{[\s\S]*background: #0E1520/);
  assert.match(css, /@keyframes sponsorFadeIn/);
  assert.match(css, /@keyframes sponsorFadeOut/);
  assert.match(css, /animation: sponsorFadeIn 400ms ease-out both/);
  assert.match(css, /animation: sponsorFadeOut 400ms ease-out both/);
  assert.doesNotMatch(css, /\.mapLogo \{[^}]*border:/);
  assert.doesNotMatch(css, /\.mapItem::after|skewX\(-35deg\)/);
  assert.match(css, /\.mapItem:last-child \{[^}]*clip-path: polygon/);
  assert.doesNotMatch(css, /\.mapWidget::before \{[^}]*clip-path/);
  assert.match(css, /animation: mapAccentGradientDrift 20s ease-in-out infinite/);
  assert.match(css, /\.sponsorCard::before,\s*\.mapWidget::before \{[\s\S]*animation: mapAccentGradientDrift 20s ease-in-out infinite;[\s\S]*will-change: background-position/);
  assert.match(css, /@keyframes mapAccentGradientDrift/);
  assert.doesNotMatch(css, /\.mapWidget::after/);
  assert.doesNotMatch(css, /margin-left: -7px/);
  assert.match(css, /center-rail\.png/);
  assert.match(css, /team-left\.png/);
  assert.match(css, /team-right\.png/);
  assert.match(page, /key=\{overlay\.teamOne\.seriesScore\}/);
  assert.match(page, /key=\{overlay\.teamTwo\.seriesScore\}/);
  assert.match(page, /key=\{overlay\.teamOne\.name\}/);
  assert.match(page, /key=\{overlay\.teamTwo\.name\}/);
  assert.match(css, /@keyframes railGradientDrift/);
  assert.match(css, /animation: railGradientDrift 16s ease-in-out infinite/);
  assert.match(css, /width: 112%/);
  assert.match(css, /0%, 50%, 100% \{ transform: translate3d\(0, 0, 0\)/);
  assert.match(css, /translate3d\(-4%, 0, 0\)/);
  assert.match(css, /translate3d\(4%, 0, 0\)/);
  assert.doesNotMatch(css, /railSheen/);
  assert.doesNotMatch(css, /teamSheen|changeInLeft|changeInRight/);
  assert.match(css, /@keyframes scoreChange/);
  assert.match(css, /@keyframes logoChange/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(page, /whiteContrast/);
  assert.match(page, /darkContrast/);
  assert.match(page, /PREFERRED_WHITE_MIN_CONTRAST = 2\.5/);
  assert.match(page, /whiteIsReadable \|\| whiteContrast >= darkContrast/);
  assert.match(page, /--team-one-shadow/);
  assert.match(page, /--team-two-shadow/);
  assert.match(page, /mixColors\(overlay\.leaguePrimary, overlay\.leagueSecondary\)/);
  assert.match(page, /--header-text/);
  assert.match(css, /\.header \{[^}]*color: var\(--header-text\)/);
  assert.match(css, /text-shadow: 0 1px 1px var\(--header-shadow\)/);
  assert.match(css, /\.scoreOne \{[^}]*color: var\(--team-one-text\)/);
  assert.match(css, /\.scoreTwo \{[^}]*color: var\(--team-two-text\)/);
  assert.match(css, /\.teamOneStanding \{ right: 48px/);
  assert.match(css, /\.teamTwoStanding \{ left: 48px/);
  assert.doesNotMatch(css, /filter:/);
});

test("server-renders the transparent Rocket League browser overlay route", async () => {
  const response = await render("/overlays/rocket-league");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const page = await readFile(new URL("../app/overlays/rocket-league/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/overlays/rocket-league/rocket-league-overlay.module.css", import.meta.url), "utf8");
  assert.match(page, /width:100%.*background:transparent/);
  assert.match(page, /1920/);
  assert.match(page, /1080/);
  assert.match(page, /api\/overlays\/rocket-league/);
  assert.match(page, /leaguePrimary/);
  assert.match(page, /leagueSecondary/);
  assert.match(page, /logoBackground/);
  assert.match(page, /primaryFill/);
  assert.match(page, /secondaryFill/);
  assert.match(css, /--league-primary/);
  assert.match(css, /--league-secondary/);
  assert.match(css, /primary-mask\.png/);
  assert.match(css, /secondary-mask\.png/);
  assert.match(css, /logo-one-mask\.png/);
  assert.match(css, /logo-two-mask\.png/);
  assert.match(page, /nameFill/);
  assert.match(page, /--team-one/);
  assert.match(page, /--team-two/);
  assert.match(page, /readableText\(SCORE_PANEL_NAVY\)/);
  assert.match(page, /--score-text/);
  assert.match(page, /scoreLabel/);
  assert.match(page, /SeriesPills/);
  assert.match(page, /headerText \? <div className=\{styles\.header\}/);
  assert.match(page, /--header-text/);
  assert.doesNotMatch(page, /scoreboard-chrome\.png/);
  assert.match(css, /--team-one/);
  assert.match(css, /--team-two/);
  assert.match(css, /--score-text/);
  assert.match(css, /--header-text/);
  assert.match(css, /nameFillOne/);
  assert.match(css, /\.primaryFill \{[\s\S]*z-index: 3/);
  assert.match(css, /\.teamStack \{[\s\S]*top: 99px;[\s\S]*height: 135px/);
  assert.match(css, /\.score \{[\s\S]*top: 99px;[\s\S]*height: 135px/);
  assert.match(css, /\.pillFilled \{[\s\S]*background: var\(--pill-color\)/);
  assert.match(css, /\.scoreboardSlot \{[\s\S]*width: 1000px;[\s\S]*height: 156\.25px/);
  assert.match(css, /\.scoreboard \{[\s\S]*transform: scale\(0\.5208333333\);[\s\S]*transform-origin: 0 0/);
  assert.match(css, /Orbitron/);
  assert.match(page, /ActivePlayerCard/);
  assert.match(page, /active-background\.png/);
  assert.match(page, /active-border-fill\.png/);
  assert.match(page, /active-stat-labels\.png/);
  assert.match(page, /playerCardEnabled && targetPlayer/);
  assert.match(css, /\.secondaryFill \{[\s\S]*background: #0E1520/);
  assert.doesNotMatch(css, /\.secondaryFill \{[\s\S]*background-image/);
  assert.match(css, /\.activeBorder \{[\s\S]*--league-primary[\s\S]*active-border-mask\.png/);
  assert.match(css, /\.activePlayerSlot \{[\s\S]*top: 930px;[\s\S]*left: calc\(\(89 \* 1000px \/ 1920\) - \(108 \* 970px \/ 1920\)\);[\s\S]*width: 970px/);
  assert.match(css, /\.activePlayer \{[\s\S]*transform: scale\(0\.5052083333\)/);
  assert.match(css, /\.activeBoost \{[\s\S]*width: 1661px/);
  assert.match(css, /\.activeStatGoals \{[\s\S]*left: 470px/);
  assert.match(css, /\.activeStatShots \{[\s\S]*left: 799px/);
  assert.match(css, /\.activeStatSaves \{[\s\S]*left: 1116px/);
  assert.match(css, /\.activeStatAssists \{[\s\S]*left: 1464px/);
  assert.match(css, /\.activeStat \{[\s\S]*top: 131px;[\s\S]*height: 38px/);
  assert.match(page, /SponsorCarousel/);
  assert.match(page, /sponsorWidgetEnabled/);
  assert.match(css, /\.sponsorCard \{[\s\S]*right: 16px;[\s\S]*bottom: calc\(1080px - 930px - \(201 \* 970px \/ 1920\)\)/);
  assert.match(css, /\.sponsorCard \{[\s\S]*background: #0E1520/);
});

test("builds Rocket League overlay state from Match 1 teams and league colors", () => {
  const state = buildRocketLeagueOverlayState(
    {
      scoreboardHeader: "NEL Finals",
      bestOf: "Bo5",
      flipSides: false,
      playerCardEnabled: true,
      sponsorWidgetEnabled: true,
      debugActivePlayerEnabled: false,
      debugActivePlayerScenario: "skyljn3",
      games: [{ home: "3", away: "1" }, { home: "", away: "" }, { home: "", away: "" }, { home: "", away: "" }, { home: "", away: "" }, { home: "", away: "" }, { home: "", away: "" }],
      savedGames: [{ home: "3", away: "1" }, { home: "", away: "" }, { home: "", away: "" }, { home: "", away: "" }, { home: "", away: "" }, { home: "", away: "" }, { home: "", away: "" }],
    },
    { name: "Alpha", standing: "2-0", logo: "a.png", color: "#111111", logoBackground: "#FFFFFF" },
    { name: "Beta", standing: "1-1", logo: "b.png", color: "#222222", logoBackground: "#000000" },
    { primaryColor: "#1A75FD", secondaryColor: "#FCC500" },
    {},
    [{ id: "oasis", name: "Gaming Oasis", logo: "oasis.png", enabled: true }],
  );

  assert.equal(state.version, 1);
  assert.equal(state.header, "NEL Finals");
  assert.equal(state.leaguePrimary, "#1A75FD");
  assert.equal(state.leagueSecondary, "#FCC500");
  assert.equal(state.teamOne.name, "Alpha");
  assert.equal(state.teamOne.logoBackground, "#FFFFFF");
  assert.equal(state.teamTwo.logoBackground, "#000000");
  assert.equal(state.teamOne.seriesScore, "1");
  assert.equal(state.teamTwo.seriesScore, "0");
  assert.equal(state.winsNeeded, 3);
  assert.equal(state.game.hasGame, false);
  assert.equal(state.game.scoreOne, 0);
  assert.equal(state.game.targetPlayer, null);
  assert.equal(state.connection.connected, false);
  assert.equal(state.sponsorWidgetEnabled, true);
  assert.deepEqual(state.sponsors, [{ id: "oasis", name: "Gaming Oasis", logo: "oasis.png" }]);

  const fromEvent = buildRocketLeagueOverlayState(
    {
      scoreboardHeader: "",
      bestOf: "Bo3",
      flipSides: false,
      playerCardEnabled: true,
      sponsorWidgetEnabled: false,
      debugActivePlayerEnabled: false,
      debugActivePlayerScenario: "skyljn3",
      games: [{ home: "", away: "" }, { home: "", away: "" }, { home: "", away: "" }, { home: "", away: "" }, { home: "", away: "" }, { home: "", away: "" }, { home: "", away: "" }],
      savedGames: [{ home: "", away: "" }, { home: "", away: "" }, { home: "", away: "" }, { home: "", away: "" }, { home: "", away: "" }, { home: "", away: "" }, { home: "", away: "" }],
    },
    { name: "Alpha", standing: "", logo: "", color: "#111111", logoBackground: "#FFFFFF" },
    { name: "Beta", standing: "", logo: "", color: "#222222", logoBackground: "#000000" },
    { primaryColor: "#1A75FD", secondaryColor: "#FCC500" },
    { eventName: "Spring Invitational" },
  );
  assert.equal(fromEvent.header, "Spring Invitational");
  assert.equal(fromEvent.sponsorWidgetEnabled, false);
  assert.deepEqual(fromEvent.sponsors, []);
});

test("fills Rocket League active player debug scenarios into overlay targetPlayer", () => {
  const teams = [
    { name: "Alpha", standing: "", logo: "", color: "#111111", logoBackground: "#FFFFFF" },
    { name: "Beta", standing: "", logo: "", color: "#222222", logoBackground: "#000000" },
  ];
  const emptyGames = Array.from({ length: 7 }, () => ({ home: "", away: "" }));

  const off = buildRocketLeagueOverlayState(
    {
      scoreboardHeader: "",
      bestOf: "Bo3",
      playerCardEnabled: true,
      debugActivePlayerEnabled: false,
      debugActivePlayerScenario: "skyljn3",
      games: emptyGames,
      savedGames: emptyGames,
    },
    teams[0],
    teams[1],
  );
  assert.equal(off.game.hasGame, false);
  assert.equal(off.game.targetPlayer, null);

  const on = buildRocketLeagueOverlayState(
    {
      scoreboardHeader: "",
      bestOf: "Bo3",
      playerCardEnabled: true,
      debugActivePlayerEnabled: true,
      debugActivePlayerScenario: "skyljn3",
      games: emptyGames,
      savedGames: emptyGames,
    },
    teams[0],
    teams[1],
  );
  assert.equal(on.game.hasGame, true);
  assert.equal(on.game.targetPlayer?.name, "SKYLIN3");
  assert.equal(on.game.targetPlayer?.team, 0);
  assert.equal(on.game.targetPlayer?.goals, 0);
  assert.equal(on.game.targetPlayer?.shots, 3);
  assert.equal(on.game.targetPlayer?.saves, 2);
  assert.equal(on.game.targetPlayer?.assists, 0);
  assert.equal(on.game.targetPlayer?.boost, 45);
  assert.equal(on.game.targetPlayer?.isDead, false);

  const teamTwo = buildRocketLeagueOverlayState(
    {
      scoreboardHeader: "",
      bestOf: "Bo3",
      playerCardEnabled: true,
      debugActivePlayerEnabled: true,
      debugActivePlayerScenario: "team-two",
      games: emptyGames,
      savedGames: emptyGames,
    },
    teams[0],
    teams[1],
  );
  assert.equal(teamTwo.game.targetPlayer?.team, 1);
  assert.equal(teamTwo.game.targetPlayer?.name, "ORANG3");

  const emptyBoost = buildRocketLeagueOverlayState(
    {
      scoreboardHeader: "",
      bestOf: "Bo3",
      playerCardEnabled: true,
      debugActivePlayerEnabled: true,
      debugActivePlayerScenario: "empty-boost",
      games: emptyGames,
      savedGames: emptyGames,
    },
    teams[0],
    teams[1],
  );
  assert.equal(emptyBoost.game.targetPlayer?.boost, 0);
  assert.equal(emptyBoost.game.targetPlayer?.isDead, true);

  const custom = buildRocketLeagueOverlayState(
    {
      scoreboardHeader: "",
      bestOf: "Bo3",
      playerCardEnabled: true,
      debugActivePlayerEnabled: true,
      debugActivePlayerScenario: "skyljn3",
      debugLive: {
        connected: true,
        hasGame: true,
        hasWinner: false,
        isOT: true,
        isReplay: false,
        timeSeconds: 42,
        target: "custom-id",
        scoreOne: 3,
        scoreTwo: 2,
        targetPlayer: {
          id: "custom-id",
          name: "CUSTOM",
          team: 1,
          goals: 4,
          shots: 7,
          saves: 1,
          assists: 2,
          boost: 88,
          isDead: false,
        },
      },
      games: emptyGames,
      savedGames: emptyGames,
    },
    teams[0],
    teams[1],
  );
  assert.equal(custom.connection.connected, true);
  assert.equal(custom.game.isOT, true);
  assert.equal(custom.game.timeSeconds, 42);
  assert.equal(custom.game.scoreOne, 3);
  assert.equal(custom.game.scoreTwo, 2);
  assert.equal(custom.game.targetPlayer?.name, "CUSTOM");
  assert.equal(custom.game.targetPlayer?.team, 1);
  assert.equal(custom.game.targetPlayer?.boost, 88);
});

test("fills Rocket League series pills from draft game wins left to right", () => {
  const empty = Array.from({ length: 6 }, () => ({ home: "", away: "" }));
  const oneWin = buildRocketLeagueOverlayState(
    {
      scoreboardHeader: "Series",
      bestOf: "Bo5",
      games: [{ home: "3", away: "1" }, ...empty],
      savedGames: [{ home: "", away: "" }, ...empty],
    },
    { name: "Alpha", standing: "", logo: "", color: "#111111", logoBackground: "#FFFFFF" },
    { name: "Beta", standing: "", logo: "", color: "#222222", logoBackground: "#000000" },
  );
  assert.equal(oneWin.teamOne.seriesScore, "1");
  assert.equal(oneWin.teamTwo.seriesScore, "0");
  assert.equal(oneWin.winsNeeded, 3);

  const twoOneBo5 = buildRocketLeagueOverlayState(
    {
      scoreboardHeader: "Series",
      bestOf: "Bo5",
      games: [
        { home: "3", away: "1" },
        { home: "2", away: "0" },
        { home: "0", away: "3" },
        ...empty.slice(0, 4),
      ],
      savedGames: Array.from({ length: 7 }, () => ({ home: "", away: "" })),
    },
    { name: "Alpha", standing: "", logo: "", color: "#111111", logoBackground: "#FFFFFF" },
    { name: "Beta", standing: "", logo: "", color: "#222222", logoBackground: "#000000" },
  );
  // Bo5 → 3 pills each; 2-1 series → team1 2/3 filled, team2 1/3 filled.
  assert.equal(twoOneBo5.winsNeeded, 3);
  assert.equal(twoOneBo5.teamOne.seriesScore, "2");
  assert.equal(twoOneBo5.teamTwo.seriesScore, "1");

  const twoWins = buildRocketLeagueOverlayState(
    {
      scoreboardHeader: "Series",
      bestOf: "Bo7",
      games: [{ home: "3", away: "1" }, { home: "2", away: "0" }, { home: "0", away: "1" }, ...empty.slice(0, 4)],
      savedGames: Array.from({ length: 7 }, () => ({ home: "", away: "" })),
    },
    { name: "Alpha", standing: "", logo: "", color: "#111111", logoBackground: "#FFFFFF" },
    { name: "Beta", standing: "", logo: "", color: "#222222", logoBackground: "#000000" },
  );
  assert.equal(twoWins.teamOne.seriesScore, "2");
  assert.equal(twoWins.teamTwo.seriesScore, "1");
  assert.equal(twoWins.winsNeeded, 4);
});

test("keeps every browser shape at its native PSD layer size", async () => {
  const expectedSizes = {
    "center-rail.png": [1920, 39],
    "team-left.png": [409, 49],
    "team-right.png": [409, 49],
    "score-left.png": [101, 28],
    "score-right.png": [101, 28],
    "logo-left.png": [50, 49],
    "logo-right.png": [50, 49],
  };

  for (const [filename, expected] of Object.entries(expectedSizes)) {
    const png = await readFile(new URL(`../public/valorant-overlay/masks/${filename}`, import.meta.url));
    assert.equal(png.toString("ascii", 1, 4), "PNG");
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], expected, filename);
  }
});

test("keeps the legacy JSON contract and removes the starter preview", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const packageJson = await readFile(new URL("../package.json", import.meta.url), "utf8");
  const launcher = await readFile(new URL("../Run Gaming Oasis Production OS.bat", import.meta.url), "utf8");
  const localRunner = await readFile(new URL("../scripts/local-runner.mjs", import.meta.url), "utf8");

  for (const filename of [
    "FinalOutput.json",
    "sponsors.json",
    "RLT1DS.json",
    "RLT2DS.json",
    "VALT1DS.json",
    "VALT2DS.json",
  ]) {
    assert.match(page, new RegExp(filename.replace(".", "\\.")));
  }

  assert.match(page, /rocketLeagueEnabled:\s*true/);
  assert.match(page, /valorantEnabled:\s*true/);
  assert.match(page, /sponsorsEnabled:\s*true/);
  assert.match(page, /drawShowEnabled:\s*true/);
  assert.match(page, /Sidebar visibility/);
  assert.match(page, /Hiding one does not change its data or JSON output/);
  assert.match(page, /\{ key: "general", label: "General info" \}/);
  assert.match(page, /Show Rocket League in sidebar/);
  assert.match(page, /Show VALORANT in sidebar/);
  assert.doesNotMatch(page, /state\.settings\.generalInfoEnabled/);
  assert.doesNotMatch(page, /Show General Info in sidebar/);
  assert.match(page, /MATCH_LOOKUP_ENDPOINT/);
  assert.match(page, /displayLogoUrl\(resolved\.logo\)/);
  assert.match(page, /detectLogoBackground/);
  assert.match(css, /\.team-logo-preview img \{[^}]*background-color: transparent/);
  assert.match(css, /\.team-logo-preview \{[^}]*isolation: isolate/);
  assert.match(css, /\.team-logo-preview \{[^}]*width: 72px; height: 72px/);
  assert.match(page, /Logo background/);
  assert.match(page, /Auto ·/);
  assert.match(page, /logoBackground: "#FFFFFF"/);
  assert.match(page, /logoBackground: "#000000"/);
  assert.match(page, /maxLength=\{TEAM_NAME_LIMIT\}/);
  assert.match(page, /nameNeedsOverride/);
  assert.match(page, /Override required: final name is/);
  assert.match(css, /\.field\.needs-override input/);
  assert.match(page, /standings\.team1/);
  assert.match(page, /Standing display/);
  assert.match(page, />Placement</);
  assert.match(page, />Standing</);
  assert.match(page, />Seed</);
  assert.match(page, /type StandingDisplay = "placement" \| "standing" \| "seed"/);
  assert.match(page, /standingDisplay: "standing"/);
  assert.match(page, /standingDisplay: record \? "standing" : placement \? "placement" : seed \? "seed" : "standing"/);
  assert.match(page, /`#\$\{seedValue\}`/);
  assert.match(page, /standing\.split\(\/\\s\*\\\/\\s\*\//);
  assert.match(css, /\.standing-display-options \{[^}]*repeat\(3/);
  assert.match(page, /league\.primaryColor/);
  assert.doesNotMatch(page, /state\.settings\.apiKey|type="password"|Test connection/);
  assert.match(packageJson, /"name": "gaming-oasis-production-os"/);
  assert.doesNotMatch(packageJson, /valospectra|observer/i);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(launcher, /Closing any previous Gaming Oasis Production OS instance/);
  assert.match(launcher, /Get-NetTCPConnection/);
  assert.match(launcher, /3000, 4877/);
  assert.doesNotMatch(launcher, /valospectra|Spectra Server/i);
  assert.match(localRunner, /\.production-os\.pid/);
  assert.match(page, /gaming-oasis-logo-light\.png/);
  assert.match(page, /gaming-oasis-favicon\.png/);
  assert.match(page, /Name override/);
  assert.match(page, /Color comparison/);
  assert.match(page, /key: "matches", label: "Team Info"/);
  assert.match(page, /rocketLeagueEnabled[\s\S]{0,100}label: "Rocket League"/);
  assert.match(page, /valorantEnabled[\s\S]{0,100}label: "VALORANT"/);
  assert.match(page, /rlscore\$\{index \+ 1\}/);
  assert.match(page, /output\["rlformat#"\]/);
  assert.match(page, /rlroundnumber/);
  assert.match(page, /rlseriesscore1/);
  assert.match(page, /rlseriesscore2/);
  assert.match(page, /buildValorantFields/);
  assert.match(page, /Picks \/ bans/);
  assert.match(page, /VAL Live info/);
  assert.match(page, /Browser overlay/);
  assert.match(page, /Open overlay/);
  assert.match(page, /Enable VALORANT map widget/);
  assert.match(page, /Enable VALORANT sponsor widget/);
  assert.match(page, /mapWidgetEnabled: true/);
  assert.match(page, /sponsorWidgetEnabled: true/);
  assert.match(page, /\/overlays\/valorant/);
  assert.match(page, /\/overlays\/rocket-league/);
  assert.match(page, /useState<"results" \| "pickBans" \| "mapArtwork" \| "overlay">/);
  assert.match(page, /useState<"results" \| "overlay" \| "debug">\("results"\)/);
  assert.match(page, /setValorantTab\("overlay"\)/);
  assert.match(page, /setRocketLeagueTab\("overlay"\)/);
  assert.match(page, /setRocketLeagueTab\("debug"\)/);
  assert.match(page, /setValorantTab\("mapArtwork"\)/);
  assert.match(page, /VALORANT MAP DATA\.json/);
  assert.match(page, /buildRocketLeagueOverlayState/);
  assert.match(page, /overlays: \{ valorant: valorantOverlay, rocketLeague: rocketLeagueOverlay \}/);
  assert.match(page, /Scoreboard header override/);
  assert.match(page, /Leave blank to use General Info event name\./);
  assert.match(page, /resolveScoreboardHeader/);
  assert.match(page, /Event name \/ header not configured/);
  assert.match(page, /Enable Rocket League active player debug/);
  assert.match(page, /debugActivePlayerEnabled/);
  assert.match(page, /debugActivePlayerScenario/);
  assert.match(page, /debugLive/);
  assert.match(page, /updateDebugLive/);
  assert.match(page, /updateDebugTargetPlayer/);
  assert.match(page, /applyActivePlayerScenario/);
  assert.match(page, /Target player/);
  assert.match(page, /Clock \(seconds\)/);
  assert.match(page, /Boost \(0-100\)/);
  assert.match(page, /Active player debug/);
  assert.match(page, /Use the Debug tab to preview scenarios/);
  assert.equal((page.match(/aria-label="Browser overlay"/g) ?? []).length, 2);
  assert.match(page, /aria-label="Rocket League debug"/);
  assert.match(page, /valorant-reference-ban-control/);
  assert.match(page, /Ban Team A/);
  assert.match(page, /Ban Team B/);
  assert.doesNotMatch(page, /valorant-live-ban-control/);
  assert.equal((page.match(/Swap VALORANT pick ban teams/g) ?? []).length, 1);
  assert.match(page, /valorantSideLabel\(valorantCurrentSides\.one\)/);
  assert.match(page, /valorantSideLabel\(valorantCurrentSides\.two\)/);
  assert.match(page, /savedRocketLeagueResults = saved\.rocketLeague\?\.savedGames \?\? saved\.rocketLeague\?\.games/);
  assert.match(page, /savedValorantResults = saved\.valorant\?\.savedGames \?\? saved\.valorant\?\.games/);
  assert.match(page, /rocketLeague\.savedGames\.forEach/);
  assert.match(page, /games: valorant\.savedGames/);
  assert.equal((page.match(/Update results/g) ?? []).length, 2);
  assert.equal((page.match(/unsaved/g) ?? []).length, 2);
  assert.equal((page.match(/Tie not allowed/g) ?? []).length, 2);
  assert.equal((page.match(/Enter both scores/g) ?? []).length, 4);
  assert.match(page, /function invalidResultCount\(games: RocketLeagueGame\[\]\)/);
  assert.match(page, /disabled=\{!rocketLeaguePendingResults \|\| Boolean\(rocketLeagueInvalidResults\)\}/);
  assert.match(page, /disabled=\{!valorantPendingResults \|\| Boolean\(valorantInvalidResults\)\}/);
  assert.doesNotMatch(page, /Event & matches/);
  assert.match(page, /Paste from Excel/);
  assert.match(page, /Copy to Match 1/);
  assert.match(page, /function copyMatchTwoToOne\(\)/);
  assert.match(page, /mergeMatch\(current\.general\.matches\[1\]\)/);
  assert.equal((page.match(/Copy to Match 1/g) ?? []).length, 1);
  assert.match(css, /\.match-sync\.with-copy/);
  assert.match(page, /parseExcelPool/);
  assert.match(page, /selectedTeamColor/);
  assert.match(page, /resolveTeam\(team\)/);
  assert.match(page, /function resolveLeague\(/);
  assert.match(page, /function normalizeLeague\(/);
  assert.match(page, /League info/);
  assert.match(page, /Reset league overrides/);
  assert.match(page, /League name override/);
  assert.match(page, /Event name override/);
  assert.match(page, /League logo URL override/);
  assert.match(page, /Primary color override/);
  assert.match(page, /Secondary color override/);
  assert.match(page, /updateLeagueOverride/);
  assert.match(page, /matchOneLeague\.primaryColor/);
  assert.match(page, /matchOneLeague\.secondaryColor/);
  assert.match(css, /\.league-info/);
  assert.doesNotMatch(page, /broadcastdate:\s*general\.broadcastDate/);
  assert.doesNotMatch(page, /label="Broadcast date"/);
  assert.doesNotMatch(page, /productionnote:\s*general\.productionNote/);

  assert.doesNotMatch(page, /label="Producer note"/);
  assert.doesNotMatch(page, /Show information/);
  assert.equal((page.match(/Export JSON package/g) ?? []).length, 1);
  assert.match(page, /className="sidebar-footer"[\s\S]*Export JSON package[\s\S]*sidebar-reset-button/);
  assert.equal((page.match(/Reset local data/g) ?? []).length, 2);
  assert.match(page, /className="confirmation-modal" role="dialog" aria-modal="true"/);
  assert.match(page, /function resetLocalData\(\)/);
  assert.doesNotMatch(page, /window\.confirm\("Reset all locally saved production data/);
  assert.deepEqual(await readdir(new URL("../app/_sites-preview", import.meta.url)), []);
});

test("derives the short production name while preserving team labels", () => {
  assert.equal(TEAM_NAME_LIMIT, 13);
  assert.equal(shortTeamName("#1 KU Rocket League A - Keiser University", "Rocket League"), "KU A");
  assert.equal(shortTeamName("#4 GT Rocket League A - Swarm", "Rocket League"), "GT A");
  assert.equal(shortTeamName("#2 MU VALORANT B - Midland University", "VALORANT"), "MU B");
  assert.equal(shortTeamName("Independent Team"), "Independent Team");
});

test("calculates the Rocket League overlay fields from seven game inputs", () => {
  const games = [
    { home: "3", away: "1" },
    { home: "2", away: "4" },
    { home: "0", away: "1" },
    { home: "", away: "" },
    { home: "", away: "" },
    { home: "", away: "" },
    { home: "", away: "" },
  ];
  assert.equal(formatRocketLeagueScore(games[0]), "3 - 1");
  assert.equal(formatRocketLeagueScore(games[3]), "X - X");
  assert.deepEqual(calculateRocketLeagueSeries(games), {
    roundNumber: 4,
    homeWins: 1,
    awayWins: 2,
    completedGames: 3,
  });
});

test("calculates VALORANT results and pick-ban outputs", () => {
  const games = [
    { home: "13", away: "9" },
    { home: "10", away: "13" },
    { home: "", away: "" },
    { home: "", away: "" },
    { home: "", away: "" },
  ];
  assert.equal(formatValorantScore(games[0]), "13 - 9");
  assert.deepEqual(calculateValorantSeries(games), { roundNumber: 3, homeWins: 1, awayWins: 1, completedGames: 2 });

  const teamOne = { name: "KU A", standing: "1st", logo: "one.png", color: "#111111", logoBackground: "#FFFFFF" };
  const teamTwo = { name: "GT A", standing: "2nd", logo: "two.png", color: "#222222", logoBackground: "#000000" };
  const fields = buildValorantFields({
    scoreboardHeader: "Final",
    bestOf: "Bo3",
    flipSides: true,
    banSwap: true,
    games,
    bo3: { ban1: "Abyss", ban2: "Bind", pick1: "Ascent", pick2: "Haven", ban3: "Lotus", ban4: "Split", decider: "Sunset", side1: "attack", side2: "defense", side3: "" },
    bo5: { ban1: "", ban2: "", pick1: "", pick2: "", pick3: "", pick4: "", decider: "", side1: "", side2: "", side3: "", side4: "", side5: "" },
  }, teamOne, teamTwo);
  assert.equal(fields.valname1, "GT A");
  assert.equal(fields.valbanteamaname, "GT A");
  assert.equal(fields.valscore1, "13 - 9");
  assert.equal(fields.valbo3maptext3, "ASCENT");
  assert.equal(fields.valbo3s1text, "ATK");
  assert.equal(fields.valbo3s3text, "TBD");
  assert.equal(fields.valbo3map1winnerlogo, "one.png");
  assert.match(fields.valbo3mapimage3, /^https:\/\//);
  assert.deepEqual(getValorantCurrentMap({ bestOf: "Bo3", bo3: fieldsFixtureBo3(), bo5: {} }, 2), { number: 2, name: "Haven" });
  assert.deepEqual(getValorantCurrentSides({
    bestOf: "Bo3",
    flipSides: true,
    banSwap: true,
    bo3: { side1: "attack", side2: "defense", side3: "" },
    bo5: {},
  }, 1), { one: "defense", two: "attack" });
  assert.deepEqual(getValorantCurrentSides({
    bestOf: "Bo3",
    flipSides: true,
    banSwap: false,
    bo3: { side1: "attack", side2: "defense", side3: "" },
    bo5: {},
  }, 1), { one: "attack", two: "defense" });
  assert.deepEqual(getValorantCurrentSides({
    bestOf: "Bo3",
    flipSides: false,
    banSwap: false,
    bo3: { side1: "attack", side2: "defense", side3: "" },
    bo5: {},
  }, 3), { one: "", two: "" });
});

test("routes editable map artwork into the legacy Bo3 and Bo5 scene fields", () => {
  const names = ["Ascent", "Bind", "Breeze", "Fracture", "Haven", "Ice Box", "Lotus"];
  const artwork = names.map((name, index) => ({
    name,
    nextMap: `next-${index + 1}.png`,
    pickCard: `pick-${index + 1}.png`,
    banCard: `ban-${index + 1}.png`,
  }));
  const teamOne = { name: "Team A", standing: "1-0", logo: "one.png", color: "#111111", logoBackground: "#FFFFFF" };
  const teamTwo = { name: "Team B", standing: "0-1", logo: "two.png", color: "#EEEEEE", logoBackground: "#000000" };
  const fields = buildValorantFields({
    scoreboardHeader: "Final",
    bestOf: "Bo3",
    flipSides: false,
    banSwap: false,
    games: Array.from({ length: 5 }, () => ({ home: "", away: "" })),
    bo3: { ban1: names[0], ban2: names[1], pick1: names[2], pick2: names[3], ban3: names[4], ban4: names[5], decider: names[6], side1: "", side2: "", side3: "" },
    bo5: { ban1: names[0], ban2: names[1], pick1: names[2], pick2: names[3], pick3: names[4], pick4: names[5], decider: names[6], side1: "", side2: "", side3: "", side4: "", side5: "" },
  }, teamOne, teamTwo, artwork);

  assert.deepEqual(Array.from({ length: 7 }, (_, index) => fields[`valbo3mapimage${index + 1}`]), [
    "ban-1.png", "ban-2.png", "pick-3.png", "pick-4.png", "ban-5.png", "ban-6.png", "pick-7.png",
  ]);
  assert.deepEqual(Array.from({ length: 7 }, (_, index) => fields[`valbo5mapimage${index + 1}`]), [
    "ban-1.png", "ban-2.png", "pick-3.png", "pick-4.png", "pick-5.png", "pick-6.png", "pick-7.png",
  ]);
  assert.equal(fields.valbo3nextmapi, "next-3.png");
  assert.equal(fields.valbo5nextmapi, "next-3.png");
  assert.equal(fields.valheader, "Final");

  const fromEvent = buildValorantFields({
    scoreboardHeader: "",
    bestOf: "Bo3",
    flipSides: false,
    banSwap: false,
    games: Array.from({ length: 5 }, () => ({ home: "", away: "" })),
    bo3: { ban1: names[0], ban2: names[1], pick1: names[2], pick2: names[3], ban3: names[4], ban4: names[5], decider: names[6], side1: "", side2: "", side3: "" },
    bo5: { ban1: names[0], ban2: names[1], pick1: names[2], pick2: names[3], pick3: names[4], pick4: names[5], decider: names[6], side1: "", side2: "", side3: "", side4: "", side5: "" },
  }, teamOne, teamTwo, artwork, { eventName: "Spring Invitational" });
  assert.equal(fromEvent.valheader, "Spring Invitational");
});

test("builds the VALORANT overlay from saved results and flips all team fields together", () => {
  const savedGames = [
    { home: "13", away: "8" },
    { home: "7", away: "13" },
    { home: "13", away: "11" },
    { home: "", away: "" },
    { home: "", away: "" },
  ];
  const teamOne = { name: "Team A", standing: "1-1", logo: "one.png", color: "#F47C20", logoBackground: "#000000" };
  const teamTwo = { name: "Team B", standing: "2-0", logo: "two.png", color: "#1D4E89", logoBackground: "#FFFFFF" };
  const state = buildValorantOverlayState({
    scoreboardHeader: "SEL Season 5",
    bestOf: "Bo5",
    flipSides: true,
    banSwap: false,
    games: [{ home: "13", away: "0" }],
    savedGames,
    bo3: {},
    bo5: {},
  }, teamOne, teamTwo, { primaryColor: "invalid", secondaryColor: "#FCC500" }, [
    { id: "sponsor1", name: "First", logo: " first.png ", enabled: true },
    { id: "sponsor2", name: "Disabled", logo: "disabled.png", enabled: false },
    { id: "sponsor3", name: " Name only ", logo: "", enabled: true },
    { id: "sponsor4", name: "", logo: "", enabled: true },
  ]);

  assert.equal(state.header, "SEL Season 5");
  assert.equal(state.leaguePrimary, "#644EB5");
  assert.equal(state.leagueSecondary, "#FCC500");
  assert.deepEqual(state.teamOne, {
    name: "Team B",
    standing: "2-0",
    logo: "two.png",
    color: "#1D4E89",
    logoBackground: "#FFFFFF",
    seriesScore: "1",
  });
  assert.equal(state.teamTwo.name, "Team A");
  assert.equal(state.teamTwo.seriesScore, "2");
  assert.equal(state.mapWidget.visible, true);
  assert.equal(state.sponsorWidgetEnabled, true);
  assert.deepEqual(state.mapWidget.maps.map((map) => map.status), ["result", "current", "decider"]);
  assert.equal(state.mapWidget.maps[0].mapNumber, 3);
  assert.equal(state.mapWidget.maps[0].scoreOne, "11");
  assert.equal(state.mapWidget.maps[0].scoreTwo, "13");
  assert.equal(state.mapWidget.maps[1].picker, "one");
  assert.deepEqual(state.sponsors, [
    { id: "sponsor1", name: "First", logo: "first.png" },
    { id: "sponsor3", name: "Name only", logo: "" },
  ]);
});

test("builds the three-map widget from saved results, picks, sides, and the neutral decider", () => {
  const teamOne = { name: "Team A", standing: "1-1", logo: "one.png", color: "#F47C20", logoBackground: "#000000" };
  const teamTwo = { name: "Team B", standing: "2-0", logo: "two.png", color: "#1D4E89", logoBackground: "#FFFFFF" };
  const state = buildValorantOverlayState({
    scoreboardHeader: "SEL Season 5",
    bestOf: "Bo3",
    flipSides: false,
    banSwap: false,
    games: [{ home: "13", away: "0" }],
    savedGames: [{ home: "13", away: "8" }, { home: "", away: "" }, { home: "", away: "" }],
    bo3: { pick1: "Ascent", pick2: "Haven", decider: "Sunset", side1: "attack", side2: "defense", side3: "" },
    bo5: {},
  }, teamOne, teamTwo);

  assert.deepEqual(state.mapWidget, {
    visible: true,
    maps: [
      { mapNumber: 1, name: "ASCENT", background: "https://drive.google.com/uc?export=view&id=1OPbVx7RmhWL6i0ybArZjwSl8LyTbIUkD", status: "result", scoreOne: "13", scoreTwo: "8", picker: "" },
      { mapNumber: 2, name: "HAVEN", background: "https://drive.google.com/uc?export=view&id=1CCUde2pjSPkl_T9D83T32XBE9sEBT--C", status: "current", scoreOne: "", scoreTwo: "", picker: "two" },
      { mapNumber: 3, name: "SUNSET", background: "https://drive.google.com/uc?export=view&id=13oEXeQLxTky5DlKVrM_Y2VEib4XkosqK", status: "decider", scoreOne: "", scoreTwo: "", picker: "" },
    ],
  });
});

test("honors the private VALORANT widget visibility controls", () => {
  const teamOne = { name: "Team A", standing: "1-1", logo: "one.png", color: "#F47C20", logoBackground: "#000000" };
  const teamTwo = { name: "Team B", standing: "2-0", logo: "two.png", color: "#1D4E89", logoBackground: "#FFFFFF" };
  const state = buildValorantOverlayState({
    scoreboardHeader: "SEL Season 5",
    bestOf: "Bo3",
    flipSides: false,
    banSwap: false,
    mapWidgetEnabled: false,
    sponsorWidgetEnabled: false,
    games: [],
    savedGames: [],
    bo3: { pick1: "Ascent", pick2: "Haven", decider: "Sunset" },
    bo5: {},
  }, teamOne, teamTwo, {}, [
    { id: "sponsor1", name: "Gaming Oasis", logo: "sponsor.png", enabled: true },
  ]);

  assert.equal(state.mapWidget.visible, false);
  assert.equal(state.sponsorWidgetEnabled, false);
  assert.equal(state.sponsors.length, 1);
});

function fieldsFixtureBo3() {
  return { pick1: "Ascent", pick2: "Haven", decider: "Sunset" };
}

test("proxies public League Hub matches without credentials", async () => {
  const outputDir = await mkdtemp(path.join(tmpdir(), "gaming-oasis-proxy-"));
  const matchId = "20fc8747-34cd-4254-8497-1b3293e6bfbd";
  let requestedUrl = "";
  const writer = await startJsonWriter({
    port: 0,
    outputDir,
    fetchImpl: async (url, options) => {
      requestedUrl = String(url);
      assert.deepEqual(options?.headers, { Accept: "application/json" });
      return new Response(JSON.stringify({ match: { id: matchId } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  try {
    const response = await fetch(`${writer.url}/api/public/matches/${matchId}`, {
      headers: { Origin: "http://localhost:3000" },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "http://localhost:3000");
    assert.match(requestedUrl, new RegExp(`${matchId}$`));
    assert.deepEqual(await response.json(), { match: { id: matchId } });
  } finally {
    await writer.close();
  }
});

test("proxies Hub logo previews without changing their exported URL", async () => {
  const outputDir = await mkdtemp(path.join(tmpdir(), "gaming-oasis-logo-proxy-"));
  const teamId = "ee1aeb5a-6366-4dfb-b39a-c76e4b9451dc";
  const imageBytes = new Uint8Array([137, 80, 78, 71]);
  let requestedUrl = "";
  const writer = await startJsonWriter({
    port: 0,
    outputDir,
    fetchImpl: async (url, options) => {
      requestedUrl = String(url);
      assert.deepEqual(options?.headers, { Accept: "image/*" });
      return new Response(imageBytes, { status: 200, headers: { "Content-Type": "image/png" } });
    },
  });

  try {
    const response = await fetch(`${writer.url}/api/public/logos/teams/${teamId}`, {
      headers: { Origin: "http://localhost:3000" },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.equal(response.headers.get("access-control-allow-origin"), "http://localhost:3000");
    assert.match(requestedUrl, new RegExp(`/api/public/logos/teams/${teamId}$`));
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), imageBytes);
  } finally {
    await writer.close();
  }
});

test("serves Google Drive map artwork through the local writer", async () => {
  const outputDir = await mkdtemp(path.join(tmpdir(), "gaming-oasis-map-artwork-proxy-"));
  const artworkId = "11SdWSDE3TrGNrFlXRZmE3UjvLIVrTVHi";
  const imageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  let requestCount = 0;
  let requestedUrl = "";
  const writer = await startJsonWriter({
    port: 0,
    outputDir,
    fetchImpl: async (url, options) => {
      requestCount += 1;
      requestedUrl = String(url);
      assert.deepEqual(options?.headers, { Accept: "image/*" });
      return new Response(imageBytes, { status: 200, headers: { "Content-Type": "image/png" } });
    },
  });

  try {
    const first = await fetch(`${writer.url}/api/public/map-artwork/${artworkId}`, {
      headers: { Origin: "http://localhost:3000" },
    });
    const second = await fetch(`${writer.url}/api/public/map-artwork/${artworkId}`, {
      headers: { Origin: "http://localhost:3000" },
    });
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(first.headers.get("content-type"), "image/png");
    assert.equal(first.headers.get("access-control-allow-origin"), "http://localhost:3000");
    assert.match(requestedUrl, new RegExp(`drive\\.google\\.com/thumbnail\\?id=${artworkId}&sz=w1000$`));
    assert.deepEqual(new Uint8Array(await first.arrayBuffer()), imageBytes);
    assert.deepEqual(new Uint8Array(await second.arrayBuffer()), imageBytes);
    assert.equal(requestCount, 1);
  } finally {
    await writer.close();
  }
});

test("continuously writes the complete JSON package to disk", async () => {
  const outputDir = await mkdtemp(path.join(tmpdir(), "gaming-oasis-json-"));
  const writer = await startJsonWriter({ port: 0, outputDir });
  const files = [...JSON_FILENAMES].map((filename) => ({ filename, data: [{ value: "first" }] }));
  try {
    const first = await fetch(`${writer.url}/api/live-json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files }),
    });
    assert.equal(first.status, 200);

    files[0].data[0].value = "latest";
    const second = await fetch(`${writer.url}/api/live-json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files }),
    });
    assert.equal(second.status, 200);

    assert.deepEqual((await readdir(outputDir)).sort(), [...JSON_FILENAMES].sort());
    const saved = JSON.parse(await readFile(path.join(outputDir, files[0].filename), "utf8"));
    assert.equal(saved[0].value, "latest");
  } finally {
    await writer.close();
  }
});

test("writes editable VALORANT map artwork beside the unchanged six-file package", async () => {
  const outputDir = await mkdtemp(path.join(tmpdir(), "gaming-oasis-map-artwork-"));
  const writer = await startJsonWriter({ port: 0, outputDir });
  const files = [...JSON_FILENAMES].map((filename) => ({ filename, data: [{ value: filename }] }));
  const valorantMapData = {
    maps: [{ name: "Ascent", nextMap: "next.png", pickCard: "pick.png", banCard: "ban.png" }],
  };

  try {
    const response = await fetch(`${writer.url}/api/live-json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files, valorantMapData }),
    });
    assert.equal(response.status, 200);
    assert.equal(JSON_FILENAMES.size, 6);
    assert.deepEqual(JSON.parse(await readFile(path.join(outputDir, VALORANT_MAP_DATA_FILENAME), "utf8")), valorantMapData);
    assert.deepEqual((await readdir(outputDir)).sort(), [...JSON_FILENAMES, VALORANT_MAP_DATA_FILENAME].sort());
  } finally {
    await writer.close();
  }
});

test("ships the editable VALORANT map artwork defaults in JSONs", async () => {
  const shipped = JSON.parse(await readFile(new URL("../JSONs/VALORANT%20MAP%20DATA.json", import.meta.url), "utf8"));
  assert.deepEqual(shipped, { maps: VALORANT_MAP_ARTWORK });
});

test("serves the latest non-exported VALORANT overlay state without changing the six JSON files", async () => {
  const outputDir = await mkdtemp(path.join(tmpdir(), "gaming-oasis-overlay-"));
  const writer = await startJsonWriter({ port: 0, outputDir });
  const files = [...JSON_FILENAMES].map((filename) => ({ filename, data: [{ value: filename }] }));
  const valorant = {
    version: 1,
    updatedAt: new Date().toISOString(),
    header: "SEL Season 5",
    leaguePrimary: "#644EB5",
    leagueSecondary: "#FCC500",
    sponsorWidgetEnabled: true,
    sponsors: [
      { id: "sponsor1", name: "Gaming Oasis", logo: "sponsor.png" },
    ],
    mapWidget: { visible: true, maps: [
      { mapNumber: 1, name: "ASCENT", background: "ascent.jpg", status: "result", scoreOne: "13", scoreTwo: "8", picker: "" },
      { mapNumber: 2, name: "HAVEN", background: "haven.jpg", status: "current", scoreOne: "", scoreTwo: "", picker: "two" },
      { mapNumber: 3, name: "SUNSET", background: "sunset.jpg", status: "decider", scoreOne: "", scoreTwo: "", picker: "" },
    ] },
    teamOne: { name: "Team A", standing: "1-1", logo: "one.png", color: "#F47C20", logoBackground: "#FFFFFF", seriesScore: "1" },
    teamTwo: { name: "Team B", standing: "2-0", logo: "two.png", color: "#1D4E89", logoBackground: "#000000", seriesScore: "0" },
  };

  try {
    const before = await fetch(`${writer.url}/api/overlays/valorant`);
    assert.equal(before.status, 204);
    const update = await fetch(`${writer.url}/api/live-json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files, overlays: { valorant } }),
    });
    assert.equal(update.status, 200);

    const response = await fetch(`${writer.url}/api/overlays/valorant`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), valorant);
    assert.deepEqual((await readdir(outputDir)).sort(), [...JSON_FILENAMES].sort());
  } finally {
    await writer.close();
  }
});

test("serves the latest non-exported Rocket League overlay state without changing the six JSON files", async () => {
  const outputDir = await mkdtemp(path.join(tmpdir(), "gaming-oasis-rl-overlay-"));
  const writer = await startJsonWriter({ port: 0, outputDir });
  const files = [...JSON_FILENAMES].map((filename) => ({ filename, data: [{ value: filename }] }));
  const rocketLeague = {
    version: 1,
    updatedAt: new Date().toISOString(),
    skin: "nel",
    header: "NEL Finals",
    bestOf: "Bo5",
    flipSides: false,
    playerCardEnabled: true,
    sponsorWidgetEnabled: true,
    sponsors: [{ id: "oasis", name: "Gaming Oasis", logo: "oasis.png" }],
    roundNumber: 2,
    winsNeeded: 3,
    leaguePrimary: "#1A75FD",
    leagueSecondary: "#FCC500",
    teamOne: { name: "Alpha", standing: "2-0", logo: "a.png", color: "#111111", logoBackground: "#FFFFFF", seriesScore: "1" },
    teamTwo: { name: "Beta", standing: "1-1", logo: "b.png", color: "#222222", logoBackground: "#000000", seriesScore: "0" },
    connection: { connected: false, lastEventAt: null },
    game: {
      hasGame: false,
      hasWinner: false,
      isOT: false,
      isReplay: false,
      timeSeconds: 0,
      target: "",
      scoreOne: 0,
      scoreTwo: 0,
      targetPlayer: null,
    },
  };

  try {
    const before = await fetch(`${writer.url}/api/overlays/rocket-league`);
    assert.equal(before.status, 204);
    const update = await fetch(`${writer.url}/api/live-json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files, overlays: { rocketLeague } }),
    });
    assert.equal(update.status, 200);

    const response = await fetch(`${writer.url}/api/overlays/rocket-league`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), rocketLeague);
    assert.deepEqual((await readdir(outputDir)).sort(), [...JSON_FILENAMES].sort());
  } finally {
    await writer.close();
  }
});
