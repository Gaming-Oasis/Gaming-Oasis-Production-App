import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { shortTeamName, TEAM_NAME_LIMIT } from "../lib/team-name.mjs";
import { calculateRocketLeagueSeries, formatRocketLeagueScore, proposeRocketLeagueLiveResult } from "../lib/rocket-league.mjs";
import { buildRocketLeagueOverlayState, resolveRocketLeagueLiveTeamColor, resolveRocketLeagueSideTeams } from "../lib/rocket-league-live.mjs";
import {
  applyStatsApiMessage,
  buildDebugMatchTeamStats,
  buildDirectorCamCommand,
  buildHideHudCommand,
  buildMatchTeamStats,
  buildSetMatchPausedCommand,
  buildShowHudCommand,
  createEmptyLiveFeed,
  goalSpeedToMph,
  mergeRocketLeagueOverlayLive,
  resolveBroadcastSetupAction,
} from "../lib/rocket-league-stats-api.mjs";
import { resolveScoreboardHeader } from "../lib/scoreboard-header.mjs";
import {
  IMAGE_PLATE_DARK,
  IMAGE_PLATE_LIGHT,
  OVERLAY_TEXT_DARK,
  OVERLAY_TEXT_LIGHT,
  PREFERRED_WHITE_MIN_CONTRAST,
  preferredImagePlate,
  resolveImagePlate,
  readableText,
} from "../lib/readable-text.mjs";
import { buildValorantFields, buildValorantOverlayState, calculateValorantSeries, formatValorantScore, getValorantCurrentMap, getValorantCurrentSides, VALORANT_MAP_ARTWORK } from "../lib/valorant.mjs";
import { JSON_FILENAMES, startJsonWriter, VALORANT_MAP_DATA_FILENAME } from "../scripts/json-writer.mjs";

test("readableText and image plates favor white unless necessary", () => {
  assert.ok(PREFERRED_WHITE_MIN_CONTRAST < 2.5);
  assert.equal(IMAGE_PLATE_DARK, "#171717");
  assert.equal(readableText("#171717"), OVERLAY_TEXT_LIGHT);
  assert.equal(readableText("#1A75FD"), OVERLAY_TEXT_LIGHT);
  assert.equal(readableText("#F47C20"), OVERLAY_TEXT_LIGHT);
  assert.equal(readableText("#C4A35A"), OVERLAY_TEXT_LIGHT);
  assert.equal(readableText("#F5F5F5"), OVERLAY_TEXT_DARK);
  assert.equal(preferredImagePlate(0.2), IMAGE_PLATE_LIGHT);
  assert.equal(preferredImagePlate(0.4), IMAGE_PLATE_LIGHT);
  assert.equal(preferredImagePlate(0.6), IMAGE_PLATE_DARK);
  assert.equal(resolveImagePlate(""), IMAGE_PLATE_LIGHT);
  assert.equal(resolveImagePlate("#F47C20"), IMAGE_PLATE_LIGHT);
  assert.equal(resolveImagePlate("#000000"), IMAGE_PLATE_DARK);
  assert.equal(resolveImagePlate("#171717"), IMAGE_PLATE_DARK);
  assert.equal(resolveImagePlate("white"), IMAGE_PLATE_LIGHT);
});

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
  assert.match(css, /\.sponsorCard \{[\s\S]*background: #171717/);
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
  assert.match(page, /from \"\.\.\/\.\.\/\.\.\/lib\/readable-text\.mjs\"/);
  assert.match(page, /readableText/);
  assert.doesNotMatch(page, /PREFERRED_WHITE_MIN_CONTRAST = 2\.5/);
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
  assert.match(page, /from \"\.\.\/\.\.\/\.\.\/lib\/readable-text\.mjs\"/);
  assert.match(page, /resolveImagePlate\(leftTeam\.logoBackground\)/);
  assert.match(page, /resolveImagePlate\(logoBackground\)/);
  assert.match(page, /readableText\(SCORE_PANEL_NAVY\)/);
  assert.match(page, /--score-text/);
  assert.match(page, /scoreLabel/);
  assert.match(page, /SeriesPills/);
  assert.match(page, /function seriesPillColor\(teamColor: string\) \{\s*return readableText\(teamColor\);\s*\}/);
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
  assert.match(page, /leftTeam\.standing\.trim\(\)/);
  assert.match(page, /rightTeam\.standing\.trim\(\)/);
  assert.match(page, /teamStanding/);
  assert.match(css, /\.teamStanding \{[\s\S]*top: 8px;[\s\S]*right: 14px/);
  assert.match(css, /\.teamOneStanding \{[\s\S]*--team-one-text/);
  assert.match(css, /\.teamTwoStanding \{[\s\S]*--team-two-text/);
  assert.match(css, /\.score \{[\s\S]*top: 99px;[\s\S]*height: 135px/);
  assert.match(css, /\.pillFilled \{[\s\S]*background: var\(--pill-color\)/);
  assert.match(css, /\.scoreboardSlot \{[\s\S]*width: 1000px;[\s\S]*height: 156\.25px/);
  assert.match(page, /showLobbyVs = Boolean\(overlay && !live && lobbyScene === "vs"\)/);
  assert.match(page, /showLobbyStats = Boolean\(overlay && !live && lobbyScene === "stats"\)/);
  assert.match(page, /showInGame = Boolean\(overlay && live\)/);
  assert.match(page, /useScenePresence\(showLobbyVs\)/);
  assert.match(page, /useScenePresence\(showInGame\)/);
  assert.match(page, /sceneLayer/);
  assert.match(page, /SCENE_FADE_MS/);
  assert.match(css, /\.sceneLayerEntering \{[\s\S]*sceneFadeIn 280ms/);
  assert.match(css, /\.sceneLayerExiting \{[\s\S]*sceneFadeOut 280ms/);
  assert.match(page, /VsMatchupStage/);
  assert.match(page, /skipEnterAnimation/);
  assert.match(page, /from \"\.\.\/vs\/VsMatchupOverlay\"/);
  assert.match(page, /ariaLabel="Rocket League lobby versus screen"/);
  assert.doesNotMatch(page, /function LobbyVsScreen/);
  assert.doesNotMatch(css, /lobbyVs/);
  assert.match(css, /\.scoreboard \{[\s\S]*transform: scale\(0\.5208333333\);[\s\S]*transform-origin: 0 0/);
  assert.match(css, /Orbitron/);
  assert.match(page, /ActivePlayerCard/);
  assert.match(page, /ActivityFeed/);
  assert.match(page, /ReplayIndicatorHost/);
  assert.match(page, /ReplayScorerCardHost/);
  assert.match(page, /game\?\.isReplay/);
  assert.match(page, /showReplayScorer/);
  assert.match(page, /replayCard/);
  assert.match(css, /\.replayScorerCard \{[\s\S]*background: #171717/);
  assert.match(css, /\.replayScorerSlot \{[\s\S]*top: 75%;[\s\S]*left: 50%;[\s\S]*transform: translate\(-50%, -50%\)/);
  assert.match(css, /\.replayScorerCard \{[\s\S]*width: 100%;[\s\S]*height: 156px/);
  assert.match(css, /\.replayScorerStats/);
  assert.match(css, /\.replayScorerLogoFrame/);
  assert.match(page, /Goal Replay/);
  assert.match(page, /ballSpeedMph/);
  assert.match(page, /replayScorerLogo/);
  assert.doesNotMatch(page, /Replay \/ Goal/);
  assert.match(page, /formatClock/);
  assert.match(page, /active-background\.png/);
  assert.match(page, /active-border-fill\.png/);
  assert.match(page, /active-stat-labels\.png/);
  assert.match(page, /playerCardEnabled && targetPlayer/);
  assert.match(css, /\.secondaryFill \{[\s\S]*background: #171717/);
  assert.doesNotMatch(css, /\.secondaryFill \{[^}]*background-image/);
  assert.match(css, /\.activeBorder \{[\s\S]*--league-primary[\s\S]*active-border-mask\.png/);
  assert.match(page, /activeNamePlate[\s\S]*background: plateColor/);
  assert.match(page, /readableText\(plateColor\)/);
  assert.match(page, /color: nameTextColor/);
  assert.match(page, /activePlateColor/);
  assert.match(page, /resolveRocketLeagueLiveTeamColor/);
  assert.match(page, /resolveRocketLeagueSideTeams/);
  assert.match(css, /\.activeNamePlate \{[\s\S]*z-index: 5/);
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
  assert.match(css, /\.sponsorCard \{[\s\S]*background: #171717/);
  assert.match(css, /\.clockSlot \{[\s\S]*top: 146px;[\s\S]*left: 1562px;[\s\S]*width: 275px;[\s\S]*height: 95px/);
  assert.match(css, /\.clock \{[\s\S]*font-size: 60px/);
  assert.match(css, /\.clockValue \{[\s\S]*letter-spacing: 0\.04em;[\s\S]*padding-left: 0\.04em;[\s\S]*tabular-nums;[\s\S]*translateY\(-0\.03em\)/);
  assert.match(page, /clockValue/);
  assert.match(page, /showOvertime/);
  assert.match(page, /overtime-pill\.png/);
  assert.match(css, /\.overtimePill \{[\s\S]*bottom: calc\(100% \+ 8px\);[\s\S]*width: 179px;[\s\S]*height: 45px/);
  assert.doesNotMatch(css, /\.clockPlate/);
  assert.match(css, /@keyframes overtimePillEnter/);
  assert.match(css, /\.upperRightRail \{[\s\S]*top: 16px;[\s\S]*right: 16px;[\s\S]*width: 220px/);
  // Clock stays 60px in native scoreboard space; REPLAY is on the unscaled stage so it
  // uses 60px × (1000/1920) ≈ 31.25px — matching the clock’s on-screen size after scale.
  assert.match(css, /\.replayIndicator \{[\s\S]*position: absolute;[\s\S]*top: calc\(\s*\(146 \* 1000px \/ 1920\)\s*\+\s*\(95 \* 1000px \/ 1920\) \/ 2\s*-\s*\(0\.03 \* 60px \* 1000 \/ 1920\)\s*-\s*\(80px \* 1000 \/ 1920\) \/ 2\s*\);[\s\S]*right: 276px;[\s\S]*width: calc\(360px \* 1000 \/ 1920\);[\s\S]*height: calc\(80px \* 1000 \/ 1920\);[\s\S]*background: #171717/);
  assert.match(css, /\.replayLabel \{[\s\S]*font-size: calc\(60px \* 1000 \/ 1920\)/);
  assert.match(css, /\.activityToast \{[\s\S]*background: #171717/);
  assert.match(page, /ReplayIndicatorHost[\s\S]*ReplayScorerCardHost[\s\S]*upperRightRail[\s\S]*ActivityFeed/);
  assert.match(page, /primaryName\.trim\(\)/);
});

test("server-renders dedicated Rocket League and VALORANT VS overlay routes", async () => {
  const rlResponse = await render("/overlays/rocket-league/vs");
  const valResponse = await render("/overlays/valorant/vs");
  assert.equal(rlResponse.status, 200);
  assert.equal(valResponse.status, 200);
  assert.match(rlResponse.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.match(valResponse.headers.get("content-type") ?? "", /^text\/html\b/i);

  const rlPage = await readFile(new URL("../app/overlays/rocket-league/vs/page.tsx", import.meta.url), "utf8");
  const valPage = await readFile(new URL("../app/overlays/valorant/vs/page.tsx", import.meta.url), "utf8");
  const shared = await readFile(new URL("../app/overlays/vs/VsMatchupOverlay.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/overlays/vs/vs-overlay.module.css", import.meta.url), "utf8");

  assert.match(rlPage, /api\/overlays\/rocket-league/);
  assert.match(rlPage, /resolveRocketLeagueSideTeams/);
  assert.match(rlPage, /VsMatchupOverlay/);
  assert.match(rlPage, /winsNeeded/);
  assert.match(valPage, /api\/overlays\/valorant/);
  assert.match(valPage, /winsNeededFromBestOf/);
  assert.match(valPage, /VsMatchupOverlay/);
  assert.match(shared, /function LobbyVsScreen/);
  assert.match(shared, /export function VsMatchupStage/);
  assert.match(shared, /aria-label="Matchup versus screen"/);
  assert.match(shared, /resolveImagePlate\(leftTeam\.logoBackground\)/);
  assert.match(shared, /--lobby-vs-wash/);
  assert.match(shared, /VS_NAME_MAX_PX/);
  assert.match(shared, /seriesPillColor/);
  assert.match(css, /\.lobbyVsWedgeLeft \{[\s\S]*clip-path: polygon\(0 0, 0 100%, 100% 100%\)/);
  assert.match(css, /\.lobbyVsWedgeRight \{[\s\S]*clip-path: polygon\(0 0, 100% 0, 100% 100%\)/);
  assert.match(css, /\.lobbyVsBleedLogo \{[\s\S]*z-index: 2;[\s\S]*width: 75%/);
  assert.match(css, /\.lobbyVsWash \{[\s\S]*z-index: 1;/);
  assert.match(css, /\.lobbyVsWedgeLeft \.lobbyVsBleedLogo \{[\s\S]*left: 25%;[\s\S]*top: 50%/);
  assert.match(css, /\.lobbyVsWedgeRight \.lobbyVsBleedLogo \{[\s\S]*left: 75%;[\s\S]*top: 50%/);
  assert.match(css, /\.lobbyVsWash \{[\s\S]*linear-gradient\([\s\S]*--lobby-vs-wash/);
  assert.match(css, /\.lobbyVsWedgeRight \.lobbyVsWash \{[\s\S]*to top right/);
  assert.doesNotMatch(css, /\.lobbyVsWash \{[\s\S]*feTurbulence/);
  assert.match(css, /\.lobbyVsCornerLeft \{[\s\S]*bottom: 56px/);
  assert.match(css, /\.lobbyVsCornerRight \{[\s\S]*top: 56px/);
  assert.match(css, /\.lobbyVsSeam \{[\s\S]*background: #171717[\s\S]*rotate\(atan\(-1920 \/ 1080\)\)/);
  assert.match(css, /\.lobbyVsMark \{[\s\S]*background: #171717/);
  assert.match(css, /\.lobbyVsMark span \{[\s\S]*font-size: 64px/);
  assert.match(css, /@keyframes lobbyVsEnter/);
  assert.match(css, /\.sponsorCard \{[\s\S]*left: 50%;[\s\S]*transform: translateX\(-50%\)/);
  assert.match(css, /\.sponsorCard \{[\s\S]*background: #171717/);
  assert.doesNotMatch(css, /\.lobbyVsLogoFrame/);
  assert.doesNotMatch(shared, /lobbyVsLogoFrame/);
});

test("server-renders dedicated Rocket League post-match stats overlay route", async () => {
  const response = await render("/overlays/rocket-league/stats");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const page = await readFile(new URL("../app/overlays/rocket-league/stats/page.tsx", import.meta.url), "utf8");
  const component = await readFile(new URL("../app/overlays/rocket-league/stats/PostMatchTeamStats.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/overlays/rocket-league/stats/stats-overlay.module.css", import.meta.url), "utf8");
  const scoreboard = await readFile(new URL("../app/overlays/rocket-league/page.tsx", import.meta.url), "utf8");
  const operator = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /api\/overlays\/rocket-league/);
  assert.match(page, /PostMatchTeamStatsOverlay/);
  assert.match(page, /matchTeamStats/);
  assert.match(component, /PostMatchTeamStatsStage/);
  assert.match(component, /Ball Touches/);
  assert.match(component, /VICTORY/);
  assert.match(component, /AWAITING RESULT/);
  assert.match(component, /formatStatValue/);
  assert.match(css, /--league-primary/);
  assert.match(component, /--league-secondary/);
  assert.match(component, /styles\.resultBody/);
  assert.match(css, /post-match\/result-body-mask\.png/);
  assert.match(component, /styles\.boBoxAccent/);
  assert.match(css, /post-match\/series-box-mask\.png/);
  assert.match(css, /background-color: #171717/);
  assert.match(component, /styles\.overlayWhite/);
  assert.match(css, /--team-one/);
  assert.match(css, /--team-two/);
  assert.match(css, /post-match\/border-mask\.png/);
  assert.match(css, /post-match\/chrome\.png/);
  assert.match(css, /left: 892px/);
  assert.match(css, /left: 339px/);
  assert.match(css, /left: 277px/);
  assert.match(component, /window\.innerWidth \/ 1920/);
  assert.match(component, /window\.innerHeight \/ 1080/);
  assert.match(scoreboard, /lobbyScene === "stats"/);
  assert.match(scoreboard, /PostMatchTeamStatsStage/);
  assert.match(operator, /lobbyScene/);
  assert.match(operator, /overlays\/rocket-league\/stats/);
  assert.match(component, /StatsTeamSplitBackground/);
  assert.match(component, /StatsSceneDimLayer/);
  assert.match(css, /\.statsSceneDim \{[\s\S]*rgb\(23 23 23 \/ 0\.8\)/);
  assert.match(component, /statsSceneBackground === "team-split"/);
  assert.match(css, /\.statsSceneWedgeLeft \{[\s\S]*clip-path: polygon\(0 0, 0 100%, 100% 100%\)/);
  assert.match(css, /\.statsSceneWash \{[\s\S]*--stats-scene-wash/);
  assert.match(css, /\.statsSceneSeam \{[\s\S]*rotate\(atan\(-1920 \/ 1080\)\)/);
  assert.match(operator, /Stats scene: team background/);
  assert.match(operator, /statsSceneBackground/);
});

test("buildRocketLeagueOverlayState includes lobbyScene and merge publishes matchTeamStats", () => {
  const vs = buildRocketLeagueOverlayState(
    { bestOf: "Bo5", lobbyScene: "vs", statsSceneBackground: "transparent", games: [], savedGames: [] },
    { name: "Home", standing: "", logo: "", color: "#1A75FD", logoBackground: "#171717" },
    { name: "Away", standing: "", logo: "", color: "#F6AC18", logoBackground: "#171717" },
    { primaryColor: "#1A75FD", secondaryColor: "#FCC500" },
  );
  assert.equal(vs.lobbyScene, "vs");
  assert.equal(vs.statsSceneBackground, "transparent");

  const stats = buildRocketLeagueOverlayState(
    { bestOf: "Bo3", lobbyScene: "stats", statsSceneBackground: "team-split", games: [], savedGames: [] },
    { name: "Home", standing: "", logo: "", color: "#1A75FD", logoBackground: "#171717" },
    { name: "Away", standing: "", logo: "", color: "#F6AC18", logoBackground: "#171717" },
    { primaryColor: "#1A75FD", secondaryColor: "#FCC500" },
  );
  assert.equal(stats.lobbyScene, "stats");
  assert.equal(stats.statsSceneBackground, "team-split");

  const sample = buildMatchTeamStats([
    { Name: "A", TeamNum: 0, Goals: 2, Assists: 1, Shots: 5, Saves: 1, Demos: 1, Touches: 20, Score: 300 },
    { Name: "B", TeamNum: 0, Goals: 1, Assists: 0, Shots: 3, Saves: 2, Demos: 0, Touches: 14, Score: 200 },
    { Name: "C", TeamNum: 1, Goals: 1, Assists: 1, Shots: 4, Saves: 3, Demos: 2, Touches: 18, Score: 250 },
  ], 3, 1);
  assert.equal(sample.winnerTeam, 0);
  assert.equal(sample.teamOne.goals, 3);
  assert.equal(sample.teamOne.touches, 34);
  assert.equal(sample.teamTwo.demos, 2);

  const merged = mergeRocketLeagueOverlayLive(stats, {
    ...createEmptyLiveFeed(),
    matchTeamStats: sample,
    game: {
      hasGame: false,
      hasWinner: true,
      isOT: false,
      isReplay: false,
      timeSeconds: 0,
      target: "",
      scoreOne: 3,
      scoreTwo: 1,
      targetPlayer: null,
    },
  });
  assert.equal(merged.lobbyScene, "stats");
  assert.ok(merged.matchTeamStats);
  assert.equal(merged.matchTeamStats.teamOne.goals, 3);

  const debugBase = buildRocketLeagueOverlayState(
    {
      bestOf: "Bo5",
      lobbyScene: "stats",
      debugActivePlayerEnabled: true,
      debugLive: {
        connected: true,
        hasGame: false,
        hasWinner: true,
        isOT: false,
        isReplay: false,
        timeSeconds: 0,
        target: "debug",
        scoreOne: 2,
        scoreTwo: 1,
        targetPlayer: {
          id: "debug",
          name: "DEBUG",
          team: 0,
          goals: 1,
          shots: 2,
          saves: 1,
          assists: 0,
          boost: 50,
          isDead: false,
        },
        activities: [],
        replayCard: null,
      },
      games: [],
      savedGames: [],
    },
    { name: "Home", standing: "", logo: "", color: "#1A75FD", logoBackground: "#171717" },
    { name: "Away", standing: "", logo: "", color: "#F6AC18", logoBackground: "#171717" },
    { primaryColor: "#1A75FD", secondaryColor: "#FCC500" },
  );
  const debugMerged = mergeRocketLeagueOverlayLive(debugBase, createEmptyLiveFeed());
  assert.ok(debugMerged.matchTeamStats);
  assert.equal(debugMerged.matchTeamStats.scoreOne, 2);
  assert.equal(debugMerged.matchTeamStats.winnerTeam, 0);
  assert.deepEqual(debugMerged.matchTeamStats, buildDebugMatchTeamStats(debugBase.game));
});

test("snapshots matchTeamStats on winner rising edge and clears on countdown", () => {
  const now = Date.parse("2026-08-14T20:00:00.000Z");
  const live = applyStatsApiMessage(createEmptyLiveFeed(), {
    Event: "UpdateState",
    Data: {
      Players: [
        { Name: "Blue1", PrimaryId: "b1", TeamNum: 0, Goals: 2, Assists: 1, Shots: 6, Saves: 2, Demos: 1, Touches: 22, Score: 400 },
        { Name: "Orange1", PrimaryId: "o1", TeamNum: 1, Goals: 1, Assists: 0, Shots: 4, Saves: 3, Demos: 0, Touches: 19, Score: 280 },
      ],
      Game: {
        Teams: [
          { Name: "Blue", TeamNum: 0, Score: 2 },
          { Name: "Orange", TeamNum: 1, Score: 1 },
        ],
        TimeSeconds: 0,
        bOvertime: false,
        bReplay: true,
        bHasWinner: true,
        bHasTarget: false,
      },
    },
  }, now);
  assert.ok(live.matchTeamStats);
  assert.equal(live.matchTeamStats.winnerTeam, 0);
  assert.equal(live.matchTeamStats.teamOne.goals, 2);
  assert.equal(live.matchTeamStats.teamOne.demos, 1);
  assert.equal(live.matchTeamStats.teamTwo.touches, 19);

  const ended = applyStatsApiMessage(live, { Event: "MatchEnded", Data: {} }, now + 1000);
  assert.ok(ended.matchTeamStats);
  assert.equal(ended.matchTeamStats.teamOne.goals, 2);
  assert.equal(ended.players.length, 0);

  const lobby = applyStatsApiMessage(ended, { Event: "MatchCreated", Data: {} }, now + 2000);
  assert.ok(lobby.matchTeamStats);
  assert.equal(lobby.game.hasGame, false);

  const countdown = applyStatsApiMessage(lobby, { Event: "CountdownBegin", Data: {} }, now + 3000);
  assert.equal(countdown.matchTeamStats, null);
  assert.equal(countdown.game.hasGame, true);
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
  assert.equal(state.teamTwo.logoBackground, IMAGE_PLATE_DARK);
  assert.equal(state.teamOne.seriesScore, "1");
  assert.equal(state.teamTwo.seriesScore, "0");
  assert.equal(state.winsNeeded, 3);
  assert.equal(state.game.hasGame, false);
  assert.equal(state.game.scoreOne, 0);
  assert.equal(state.game.targetPlayer, null);
  assert.equal(state.connection.connected, false);
  assert.equal(state.debugLiveOverride, false);
  assert.deepEqual(state.activities, []);
  assert.equal(state.sponsorWidgetEnabled, true);
  assert.equal(state.broadcastSetupEnabled, true);
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

test("maps Rocket League live TeamNum colors through flipSides like scoreboard sides", () => {
  const teamOne = { name: "Home", standing: "", logo: "", color: "#111111", logoBackground: "#FFFFFF", seriesScore: "0" };
  const teamTwo = { name: "Away", standing: "", logo: "", color: "#ABCDEF", logoBackground: "#000000", seriesScore: "0" };

  const defaultSides = resolveRocketLeagueSideTeams(false, teamOne, teamTwo);
  assert.equal(defaultSides.left, teamOne);
  assert.equal(defaultSides.right, teamTwo);
  assert.equal(resolveRocketLeagueLiveTeamColor(0, false, teamOne, teamTwo), "#111111");
  assert.equal(resolveRocketLeagueLiveTeamColor(1, false, teamOne, teamTwo), "#ABCDEF");

  const flippedSides = resolveRocketLeagueSideTeams(true, teamOne, teamTwo);
  assert.equal(flippedSides.left, teamTwo);
  assert.equal(flippedSides.right, teamOne);
  // Blue (0) → Left after swap = Match 1 away / teamTwo; Orange (1) → Right = teamOne.
  assert.equal(resolveRocketLeagueLiveTeamColor(0, true, teamOne, teamTwo), "#ABCDEF");
  assert.equal(resolveRocketLeagueLiveTeamColor(1, true, teamOne, teamTwo), "#111111");
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
  assert.equal(on.debugLiveOverride, true);
  assert.deepEqual(on.activities, []);
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
        activities: [
          {
            id: "act-1",
            type: "Goal",
            primaryName: "CUSTOM",
            secondaryName: "",
            team: 1,
            createdAt: "2026-08-13T12:00:00.000Z",
          },
        ],
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
  assert.equal(custom.activities.length, 1);
  assert.equal(custom.activities[0].type, "Goal");
});

test("tracks MatchPaused and MatchUnpaused on the live feed", () => {
  const now = Date.parse("2026-08-13T18:00:00.000Z");
  const live = applyStatsApiMessage(createEmptyLiveFeed(), {
    Event: "UpdateState",
    Data: {
      Players: [{ Name: "A", PrimaryId: "Epic|1|0", Shortcut: 1, TeamNum: 0, Goals: 0, Shots: 0, Assists: 0, Saves: 0, Boost: 10 }],
      Game: {
        Teams: [
          { Name: "Blue", TeamNum: 0, Score: 1 },
          { Name: "Orange", TeamNum: 1, Score: 0 },
        ],
        TimeSeconds: 200,
        bOvertime: false,
        bReplay: false,
        bHasWinner: false,
        bHasTarget: false,
      },
    },
  }, now);
  assert.equal(live.matchPaused, false);

  const paused = applyStatsApiMessage(live, { Event: "MatchPaused", Data: {} }, now + 10);
  assert.equal(paused.matchPaused, true);

  const unpaused = applyStatsApiMessage(paused, { Event: "MatchUnpaused", Data: {} }, now + 20);
  assert.equal(unpaused.matchPaused, false);
});

test("builds Rocket League Stats API broadcast setup commands and rising-edge actions", () => {
  assert.deepEqual(buildHideHudCommand(), {
    Command: "SetHUDVisibility",
    Data: { bVisible: false },
  });
  assert.deepEqual(buildShowHudCommand(), {
    Command: "SetHUDVisibility",
    Data: { bVisible: true },
  });
  assert.deepEqual(buildDirectorCamCommand(), {
    Command: "ChangePOV",
    Data: { Perspective: "Camera_Director" },
  });
  assert.deepEqual(buildSetMatchPausedCommand(true), {
    Command: "SetMatchPaused",
    Data: { bPaused: true },
  });
  assert.deepEqual(buildSetMatchPausedCommand(false), {
    Command: "SetMatchPaused",
    Data: { bPaused: false },
  });

  // Lobby create → Director only (native UI stays until countdown).
  assert.deepEqual(resolveBroadcastSetupAction({
    enabled: true,
    eventName: "MatchCreated",
    previousHasGame: false,
    nextHasGame: false,
    cameraAppliedForMatch: false,
    hudHiddenForMatch: false,
  }), {
    action: "camera",
    cameraAppliedForMatch: true,
    hudHiddenForMatch: false,
    setupAppliedForMatch: false,
  });

  // Countdown start → full HUD hide + Director.
  assert.deepEqual(resolveBroadcastSetupAction({
    enabled: true,
    eventName: "CountdownBegin",
    previousHasGame: false,
    nextHasGame: true,
    cameraAppliedForMatch: true,
    hudHiddenForMatch: false,
  }), {
    action: "setup",
    cameraAppliedForMatch: true,
    hudHiddenForMatch: true,
    setupAppliedForMatch: true,
  });

  assert.deepEqual(resolveBroadcastSetupAction({
    enabled: true,
    eventName: "MatchInitialized",
    previousHasGame: false,
    nextHasGame: true,
    cameraAppliedForMatch: false,
    hudHiddenForMatch: false,
  }), {
    action: "setup",
    cameraAppliedForMatch: true,
    hudHiddenForMatch: true,
    setupAppliedForMatch: true,
  });

  assert.deepEqual(resolveBroadcastSetupAction({
    enabled: true,
    eventName: "UpdateState",
    previousHasGame: false,
    nextHasGame: true,
    cameraAppliedForMatch: false,
    hudHiddenForMatch: false,
  }), {
    action: "setup",
    cameraAppliedForMatch: true,
    hudHiddenForMatch: true,
    setupAppliedForMatch: true,
  });

  // Already hidden — later countdown / kickoff is a no-op.
  assert.deepEqual(resolveBroadcastSetupAction({
    enabled: true,
    eventName: "CountdownBegin",
    previousHasGame: true,
    nextHasGame: true,
    cameraAppliedForMatch: true,
    hudHiddenForMatch: true,
  }), {
    action: "none",
    cameraAppliedForMatch: true,
    hudHiddenForMatch: true,
    setupAppliedForMatch: true,
  });

  assert.deepEqual(resolveBroadcastSetupAction({
    enabled: true,
    eventName: "RoundStarted",
    previousHasGame: true,
    nextHasGame: true,
    cameraAppliedForMatch: true,
    hudHiddenForMatch: true,
  }), {
    action: "none",
    cameraAppliedForMatch: true,
    hudHiddenForMatch: true,
    setupAppliedForMatch: true,
  });

  // Missed countdown → RoundStarted still hides.
  assert.deepEqual(resolveBroadcastSetupAction({
    enabled: true,
    eventName: "RoundStarted",
    previousHasGame: true,
    nextHasGame: true,
    cameraAppliedForMatch: false,
    hudHiddenForMatch: false,
  }), {
    action: "setup",
    cameraAppliedForMatch: true,
    hudHiddenForMatch: true,
    setupAppliedForMatch: true,
  });

  assert.deepEqual(resolveBroadcastSetupAction({
    enabled: true,
    eventName: "UpdateState",
    previousHasGame: true,
    nextHasGame: true,
    cameraAppliedForMatch: true,
    hudHiddenForMatch: true,
  }), {
    action: "none",
    cameraAppliedForMatch: true,
    hudHiddenForMatch: true,
    setupAppliedForMatch: true,
  });

  assert.deepEqual(resolveBroadcastSetupAction({
    enabled: true,
    eventName: "MatchEnded",
    previousHasGame: true,
    nextHasGame: false,
    cameraAppliedForMatch: true,
    hudHiddenForMatch: true,
  }), {
    action: "restore",
    cameraAppliedForMatch: false,
    hudHiddenForMatch: false,
    setupAppliedForMatch: false,
  });

  assert.deepEqual(resolveBroadcastSetupAction({
    enabled: false,
    eventName: "MatchCreated",
    previousHasGame: false,
    nextHasGame: false,
    cameraAppliedForMatch: false,
    hudHiddenForMatch: false,
  }), {
    action: "none",
    cameraAppliedForMatch: false,
    hudHiddenForMatch: false,
    setupAppliedForMatch: false,
  });
});

test("maps Rocket League Game Data API UpdateState and StatfeedEvent into overlay live fields", () => {
  const now = Date.parse("2026-08-13T15:00:00.000Z");
  const updated = applyStatsApiMessage(createEmptyLiveFeed(), {
    Event: "UpdateState",
    // Live exporter stringifies Data — match production payloads.
    Data: JSON.stringify({
      Players: [
        {
          Name: "PlayerA",
          PrimaryId: "Epic|1|0",
          Shortcut: 1,
          TeamNum: 0,
          Goals: 1,
          Shots: 2,
          Assists: 0,
          Saves: 1,
          Boost: 45,
          bDemolished: false,
        },
      ],
      Game: {
        Teams: [
          { Name: "Blue", TeamNum: 0, Score: 2 },
          { Name: "Orange", TeamNum: 1, Score: 1 },
        ],
        TimeSeconds: 187,
        bOvertime: true,
        bReplay: false,
        bHasWinner: false,
        bHasTarget: true,
        Target: { Name: "PlayerA", Shortcut: 1, TeamNum: 0 },
      },
    }),
  }, now);

  assert.equal(updated.connection.connected, true);
  assert.equal(updated.game.hasGame, true);
  assert.equal(updated.game.isOT, true);
  assert.equal(updated.game.timeSeconds, 187);
  assert.equal(updated.game.scoreOne, 2);
  assert.equal(updated.game.scoreTwo, 1);
  assert.equal(updated.game.targetPlayer?.name, "PlayerA");
  assert.equal(updated.game.targetPlayer?.boost, 45);

  const withActivity = applyStatsApiMessage(updated, {
    Event: "StatfeedEvent",
    Data: JSON.stringify({
      EventName: "Demolish",
      Type: "Demolition",
      MainTarget: { Name: "PlayerA", Shortcut: 1, TeamNum: 0 },
      SecondaryTarget: { Name: "PlayerB", Shortcut: 2, TeamNum: 1 },
    }),
  }, now + 10);
  assert.equal(withActivity.activities[0].type, "Demolition");
  assert.equal(withActivity.activities[0].primaryName, "PlayerA");
  assert.equal(withActivity.activities[0].secondaryName, "PlayerB");

  const withWin = applyStatsApiMessage(updated, {
    Event: "StatfeedEvent",
    Data: JSON.stringify({
      EventName: "Win",
      Type: "Win",
      MainTarget: { Name: "PlayerA", Shortcut: 1, TeamNum: 0 },
    }),
  }, now + 20);
  assert.equal(withWin.activities.length, 0);

  const base = {
    version: 1,
    updatedAt: "2026-08-13T15:00:00.000Z",
    skin: "nel",
    header: "Test",
    bestOf: "Bo5",
    flipSides: false,
    playerCardEnabled: true,
    sponsorWidgetEnabled: false,
    sponsors: [],
    roundNumber: 1,
    winsNeeded: 3,
    leaguePrimary: "#1A75FD",
    leagueSecondary: "#FCC500",
    teamOne: { name: "A", standing: "", logo: "", color: "#111111", logoBackground: "#FFFFFF", seriesScore: "0" },
    teamTwo: { name: "B", standing: "", logo: "", color: "#222222", logoBackground: "#000000", seriesScore: "0" },
    debugLiveOverride: false,
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
    activities: [],
  };
  const merged = mergeRocketLeagueOverlayLive(base, withActivity, now + 10);
  assert.equal(merged.game.scoreOne, 2);
  assert.equal(merged.activities[0].type, "Demolition");
  assert.equal(merged.teamOne.color, "#111111");
  assert.equal(merged.teamTwo.name, "B");

  const debugBase = { ...base, debugLiveOverride: true, game: { ...base.game, hasGame: true, scoreOne: 9 }, activities: [], replayCard: null };
  const debugMerged = mergeRocketLeagueOverlayLive(debugBase, withActivity, now + 10);
  assert.equal(debugMerged.game.scoreOne, 9);
  assert.deepEqual(debugMerged.activities, []);
  assert.equal(debugMerged.leaguePrimary, "#1A75FD");
  assert.equal(debugMerged.replayCard, null);
});

test("converts GoalScored GoalSpeed UU/s to MPH for on-air display", () => {
  assert.equal(goalSpeedToMph(3890), 87);
  assert.equal(goalSpeedToMph(87.3), 87);
  assert.equal(goalSpeedToMph(0), 0);
  assert.equal(goalSpeedToMph(null), 0);
});

test("GoalScored locks the real scorer even when Statfeed or BallLastTouch differ", () => {
  const now = Date.parse("2026-08-13T18:00:00.000Z");
  const withPlayers = applyStatsApiMessage(createEmptyLiveFeed(), {
    Event: "UpdateState",
    Data: {
      Players: [
        {
          Name: "SCORER",
          PrimaryId: "Epic|scorer|0",
          Shortcut: 1,
          TeamNum: 0,
          Goals: 3,
          Shots: 4,
          Assists: 0,
          Saves: 1,
          Score: 600,
          Boost: 40,
          bDemolished: false,
        },
        {
          Name: "SPECTATED",
          PrimaryId: "Epic|spec|0",
          Shortcut: 2,
          TeamNum: 1,
          Goals: 1,
          Shots: 2,
          Assists: 0,
          Saves: 0,
          Score: 200,
          Boost: 80,
          bDemolished: false,
        },
        {
          Name: "TOUCHER",
          PrimaryId: "Epic|touch|0",
          Shortcut: 3,
          TeamNum: 0,
          Goals: 0,
          Shots: 1,
          Assists: 1,
          Saves: 0,
          Score: 100,
          Boost: 10,
          bDemolished: false,
        },
      ],
      Game: {
        Teams: [
          { Name: "Blue", TeamNum: 0, Score: 2 },
          { Name: "Orange", TeamNum: 1, Score: 1 },
        ],
        TimeSeconds: 90,
        bOvertime: false,
        bReplay: false,
        bHasWinner: false,
        bHasTarget: true,
        Target: { Name: "SPECTATED", Shortcut: 2, TeamNum: 1 },
      },
    },
  }, now);

  // Wrong prior Statfeed goal must not stick once GoalScored arrives.
  const wrongFeed = applyStatsApiMessage(withPlayers, {
    Event: "StatfeedEvent",
    Data: {
      EventName: "Goal",
      Type: "Goal",
      MainTarget: { Name: "SPECTATED", Shortcut: 2, TeamNum: 1 },
    },
  }, now + 10);
  assert.equal(wrongFeed.replayCard?.scorerName, "SPECTATED");
  // Goal Statfeed must not create an activity toast (GoalScored owns Goal/Assist toasts).
  assert.equal(wrongFeed.activities.length, 0);

  const scored = applyStatsApiMessage(wrongFeed, {
    Event: "GoalScored",
    Data: {
      GoalSpeed: 3890,
      Scorer: { Name: "SCORER", Shortcut: 1, TeamNum: 0, PrimaryId: "Epic|scorer|0" },
      Assister: { Name: "TOUCHER", Shortcut: 3, TeamNum: 0, PrimaryId: "Epic|touch|0" },
      BallLastTouch: {
        Player: { Name: "TOUCHER", Shortcut: 3, TeamNum: 0 },
        Speed: 2000,
      },
    },
  }, now + 20);
  assert.equal(scored.replayCard?.scorerName, "SCORER");
  assert.equal(scored.replayCard?.team, 0);
  assert.equal(scored.replayCard?.goals, 3);
  assert.equal(scored.activities.length, 2);
  assert.equal(scored.activities[0].type, "Assist");
  assert.equal(scored.activities[0].primaryName, "TOUCHER");
  assert.equal(scored.activities[1].type, "Goal");
  assert.equal(scored.activities[1].primaryName, "SCORER");

  // A late Goal Statfeed after GoalScored must not add a second Goal toast.
  const afterDuplicateFeed = applyStatsApiMessage(scored, {
    Event: "StatfeedEvent",
    Data: {
      EventName: "Goal",
      Type: "Goal",
      MainTarget: { Name: "SCORER", Shortcut: 1, TeamNum: 0 },
    },
  }, now + 30);
  assert.equal(afterDuplicateFeed.activities.length, 2);
  assert.equal(afterDuplicateFeed.activities.filter((entry) => entry.type === "Goal").length, 1);

  // Empty Scorer falls back to BallLastTouch.Player (not spectated target).
  const touchOnly = applyStatsApiMessage(withPlayers, {
    Event: "GoalScored",
    Data: {
      GoalSpeed: 1000,
      BallLastTouch: {
        Player: { Name: "TOUCHER", Shortcut: 3, TeamNum: 0 },
        Speed: 1000,
      },
    },
  }, now + 30);
  assert.equal(touchOnly.replayCard?.scorerName, "TOUCHER");

  const afterRound = applyStatsApiMessage(scored, {
    Event: "RoundStarted",
    Data: {},
  }, now + 40);
  assert.equal(afterRound.replayCard, null);
});

test("maps GoalScored into replayCard and holds it through replay UpdateState", () => {
  const now = Date.parse("2026-08-13T17:00:00.000Z");
  const withPlayers = applyStatsApiMessage(createEmptyLiveFeed(), {
    Event: "UpdateState",
    Data: {
      Players: [
        {
          Name: "SKYLIN3",
          PrimaryId: "Epic|sky|0",
          Shortcut: 3,
          TeamNum: 0,
          Goals: 2,
          Shots: 5,
          Assists: 1,
          Saves: 3,
          Score: 540,
          Boost: 60,
          bDemolished: false,
        },
        {
          Name: "ORANG3",
          PrimaryId: "Epic|ora|0",
          Shortcut: 7,
          TeamNum: 0,
          Goals: 0,
          Shots: 1,
          Assists: 2,
          Saves: 0,
          Score: 210,
          Boost: 20,
          bDemolished: false,
        },
      ],
      Game: {
        Teams: [
          { Name: "Blue", TeamNum: 0, Score: 1 },
          { Name: "Orange", TeamNum: 1, Score: 0 },
        ],
        TimeSeconds: 120,
        bOvertime: false,
        bReplay: false,
        bHasWinner: false,
        bHasTarget: false,
      },
    },
  }, now);

  const scored = applyStatsApiMessage(withPlayers, {
    Event: "GoalScored",
    Data: {
      GoalSpeed: 3890,
      Scorer: { Name: "SKYLIN3", Shortcut: 3, TeamNum: 0, PrimaryId: "Epic|sky|0" },
      Assister: { Name: "ORANG3", Shortcut: 7, TeamNum: 0 },
    },
  }, now + 50);
  assert.equal(scored.replayCard?.scorerName, "SKYLIN3");
  assert.equal(scored.replayCard?.assisterName, "ORANG3");
  assert.equal(scored.replayCard?.team, 0);
  assert.equal(scored.replayCard?.goals, 2);
  assert.equal(scored.replayCard?.assists, 1);
  assert.equal(scored.replayCard?.saves, 3);
  assert.equal(scored.replayCard?.shots, 5);
  assert.equal(scored.replayCard?.score, 540);
  assert.equal(scored.replayCard?.ballSpeedMph, 87);
  assert.equal(scored.activities.filter((entry) => entry.type === "Goal").length, 1);
  assert.equal(scored.activities.filter((entry) => entry.type === "Assist").length, 1);

  const inReplay = applyStatsApiMessage(scored, {
    Event: "UpdateState",
    Data: {
      Players: withPlayers.players,
      Game: {
        Teams: [
          { Name: "Blue", TeamNum: 0, Score: 2 },
          { Name: "Orange", TeamNum: 1, Score: 0 },
        ],
        TimeSeconds: 120,
        bOvertime: false,
        bReplay: true,
        bHasWinner: false,
        bHasTarget: false,
      },
    },
  }, now + 100);
  assert.equal(inReplay.game.isReplay, true);
  assert.equal(inReplay.replayCard?.scorerName, "SKYLIN3");
  assert.equal(inReplay.replayCard?.score, 540);
  assert.equal(inReplay.replayCard?.ballSpeedMph, 87);
  // Activity rail clears for the whole replay — Goal Replay owns that beat.
  assert.equal(inReplay.activities.length, 0);

  const duringReplayFeed = applyStatsApiMessage(inReplay, {
    Event: "StatfeedEvent",
    Data: {
      EventName: "Demolish",
      Type: "Demolition",
      MainTarget: { Name: "SKYLIN3", Shortcut: 3, TeamNum: 0 },
      SecondaryTarget: { Name: "ORANG3", Shortcut: 7, TeamNum: 1 },
    },
  }, now + 150);
  assert.equal(duringReplayFeed.activities.length, 0);

  const duringReplayGoal = applyStatsApiMessage(inReplay, {
    Event: "GoalScored",
    Data: {
      GoalSpeed: 3890,
      Scorer: { Name: "SKYLIN3", Shortcut: 3, TeamNum: 0 },
      Assister: { Name: "ORANG3", Shortcut: 7, TeamNum: 0 },
    },
  }, now + 160);
  assert.equal(duringReplayGoal.activities.length, 0);
  assert.equal(duringReplayGoal.replayCard?.scorerName, "SKYLIN3");

  const afterReplay = applyStatsApiMessage(inReplay, {
    Event: "UpdateState",
    Data: {
      Players: withPlayers.players,
      Game: {
        Teams: [
          { Name: "Blue", TeamNum: 0, Score: 2 },
          { Name: "Orange", TeamNum: 1, Score: 0 },
        ],
        TimeSeconds: 119,
        bOvertime: false,
        bReplay: false,
        bHasWinner: false,
        bHasTarget: false,
      },
    },
  }, now + 200);
  assert.equal(afterReplay.game.isReplay, false);
  assert.equal(afterReplay.replayCard?.scorerName, "SKYLIN3");
  assert.ok(afterReplay.replayClearAt > now + 200);

  const cleared = applyStatsApiMessage(afterReplay, {
    Event: "UpdateState",
    Data: {
      Players: withPlayers.players,
      Game: {
        Teams: [
          { Name: "Blue", TeamNum: 0, Score: 2 },
          { Name: "Orange", TeamNum: 1, Score: 0 },
        ],
        TimeSeconds: 118,
        bOvertime: false,
        bReplay: false,
        bHasWinner: false,
        bHasTarget: false,
      },
    },
  }, afterReplay.replayClearAt + 1);
  assert.equal(cleared.replayCard, null);

  // Late / duplicate GoalScored after replay must not re-fire Goal/Assist toasts.
  const duplicateGoal = applyStatsApiMessage(cleared, {
    Event: "GoalScored",
    Data: {
      GoalSpeed: 3890,
      Scorer: { Name: "SKYLIN3", Shortcut: 3, TeamNum: 0, PrimaryId: "Epic|sky|0" },
      Assister: { Name: "ORANG3", Shortcut: 7, TeamNum: 0 },
    },
  }, now + 250);
  assert.equal(duplicateGoal.activities.filter((entry) => entry.type === "Goal" || entry.type === "Assist").length, 0);
  assert.equal(duplicateGoal.replayCard, null);

  const afterKickoff = applyStatsApiMessage(duplicateGoal, {
    Event: "RoundStarted",
    Data: {},
  }, now + 300);
  const stillDeduped = applyStatsApiMessage(afterKickoff, {
    Event: "GoalScored",
    Data: {
      GoalSpeed: 3890,
      Scorer: { Name: "SKYLIN3", Shortcut: 3, TeamNum: 0, PrimaryId: "Epic|sky|0" },
      Assister: { Name: "ORANG3", Shortcut: 7, TeamNum: 0 },
    },
  }, now + 350);
  assert.equal(stillDeduped.activities.filter((entry) => entry.type === "Goal" || entry.type === "Assist").length, 0);

  const base = {
    version: 1,
    updatedAt: "2026-08-13T17:00:00.000Z",
    skin: "nel",
    header: "Test",
    bestOf: "Bo5",
    flipSides: false,
    playerCardEnabled: true,
    sponsorWidgetEnabled: false,
    sponsors: [],
    roundNumber: 1,
    winsNeeded: 3,
    leaguePrimary: "#1A75FD",
    leagueSecondary: "#FCC500",
    teamOne: { name: "A", standing: "", logo: "", color: "#111111", logoBackground: "#FFFFFF", seriesScore: "0" },
    teamTwo: { name: "B", standing: "", logo: "", color: "#222222", logoBackground: "#000000", seriesScore: "0" },
    debugLiveOverride: false,
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
    activities: [],
    replayCard: null,
  };
  const merged = mergeRocketLeagueOverlayLive(base, inReplay, now + 100);
  assert.equal(merged.replayCard?.scorerName, "SKYLIN3");
  assert.equal(merged.replayCard?.assisterName, "ORANG3");
  assert.equal(merged.game.isReplay, true);
});

test("debug Replay toggle synthesizes a sample replayCard from the target player", () => {
  const emptyGames = Array.from({ length: 7 }, () => ({ home: "", away: "" }));
  const team = { name: "Home", standing: "", logo: "", color: "#111111", logoBackground: "#FFFFFF" };
  const away = { name: "Away", standing: "", logo: "", color: "#ABCDEF", logoBackground: "#000000" };
  const state = buildRocketLeagueOverlayState(
    {
      scoreboardHeader: "",
      bestOf: "Bo5",
      playerCardEnabled: true,
      debugActivePlayerEnabled: true,
      debugActivePlayerScenario: "skyljn3",
      debugLive: {
        connected: true,
        hasGame: true,
        hasWinner: false,
        isOT: false,
        isReplay: true,
        timeSeconds: 100,
        target: "debug-skyljn3",
        scoreOne: 1,
        scoreTwo: 0,
        targetPlayer: {
          id: "debug-skyljn3",
          name: "SKYLIN3",
          team: 0,
          goals: 2,
          shots: 4,
          saves: 1,
          assists: 0,
          boost: 50,
          isDead: false,
        },
        activities: [],
        replayCard: null,
      },
      games: emptyGames,
      savedGames: emptyGames,
    },
    team,
    away,
  );
  assert.equal(state.game.isReplay, true);
  assert.equal(state.replayCard?.scorerName, "SKYLIN3");
  assert.equal(state.replayCard?.goals, 2);
  assert.equal(state.replayCard?.ballSpeedMph, 87);
  assert.ok(state.replayCard?.assisterName);
});

test("proposes finished live Rocket League games into Results and supports auto-accept", () => {
  const emptyGames = Array.from({ length: 7 }, () => ({ home: "", away: "" }));
  const base = {
    autoAcceptLiveResults: false,
    lastLiveResultProposalKey: "",
    games: emptyGames.map((game) => ({ ...game })),
    savedGames: emptyGames.map((game) => ({ ...game })),
  };

  const proposed = proposeRocketLeagueLiveResult(base, {
    id: "finish-1",
    scoreOne: 3,
    scoreTwo: 1,
  });
  assert.equal(proposed.changed, true);
  assert.equal(proposed.proposed, true);
  assert.equal(proposed.accepted, false);
  assert.equal(proposed.gameIndex, 0);
  assert.deepEqual(proposed.rocketLeague.games[0], { home: "3", away: "1" });
  assert.deepEqual(proposed.rocketLeague.savedGames[0], { home: "", away: "" });

  const again = proposeRocketLeagueLiveResult(proposed.rocketLeague, {
    id: "finish-1",
    scoreOne: 3,
    scoreTwo: 1,
  });
  assert.equal(again.changed, false);
  assert.equal(again.proposed, false);

  const auto = proposeRocketLeagueLiveResult({
    ...base,
    autoAcceptLiveResults: true,
  }, {
    id: "finish-2",
    scoreOne: 2,
    scoreTwo: 0,
  });
  assert.equal(auto.accepted, true);
  assert.deepEqual(auto.rocketLeague.games[0], { home: "2", away: "0" });
  assert.deepEqual(auto.rocketLeague.savedGames[0], { home: "2", away: "0" });

  const tied = proposeRocketLeagueLiveResult(base, { id: "finish-tie", scoreOne: 1, scoreTwo: 1 });
  assert.equal(tied.changed, false);

  const flipped = proposeRocketLeagueLiveResult({
    ...base,
    flipSides: true,
    autoAcceptLiveResults: true,
  }, {
    id: "finish-flipped",
    scoreOne: 4,
    scoreTwo: 2,
  });
  // Swap assignment: Blue (scoreOne) is away, Orange (scoreTwo) is home.
  assert.deepEqual(flipped.rocketLeague.games[0], { home: "2", away: "4" });
  assert.deepEqual(flipped.rocketLeague.savedGames[0], { home: "2", away: "4" });
});

test("stamps finishedGame on winner rising edge and keeps it after MatchEnded", () => {
  const now = Date.parse("2026-08-13T16:00:00.000Z");
  const live = applyStatsApiMessage(createEmptyLiveFeed(), {
    Event: "UpdateState",
    Data: {
      Players: [],
      Game: {
        Teams: [
          { Name: "Blue", TeamNum: 0, Score: 4 },
          { Name: "Orange", TeamNum: 1, Score: 2 },
        ],
        TimeSeconds: 0,
        bOvertime: false,
        bReplay: true,
        bHasWinner: true,
        bHasTarget: false,
      },
    },
  }, now);
  assert.equal(live.game.hasWinner, true);
  assert.equal(live.game.hasGame, false);
  assert.equal(live.postMatch, true);
  assert.ok(live.finishedGame);
  assert.equal(live.finishedGame.scoreOne, 4);
  assert.equal(live.finishedGame.scoreTwo, 2);

  // UpdateState on the next-match / podium screen must not bring the HUD back.
  const stillPost = applyStatsApiMessage(live, {
    Event: "UpdateState",
    Data: {
      Players: [],
      Game: {
        Teams: [
          { Name: "Blue", TeamNum: 0, Score: 4 },
          { Name: "Orange", TeamNum: 1, Score: 2 },
        ],
        TimeSeconds: 0,
        bOvertime: false,
        bReplay: false,
        bHasWinner: true,
        bHasTarget: false,
      },
    },
  }, now + 500);
  assert.equal(stillPost.game.hasGame, false);
  assert.equal(stillPost.postMatch, true);

  const ended = applyStatsApiMessage(live, { Event: "MatchEnded", Data: {} }, now + 1000);
  assert.equal(ended.game.hasGame, false);
  assert.equal(ended.postMatch, true);
  assert.equal(ended.finishedGame.scoreOne, 4);
  assert.equal(ended.finishedGame.id, live.finishedGame.id);

  const podium = applyStatsApiMessage(ended, { Event: "PodiumStart", Data: {} }, now + 1500);
  assert.equal(podium.game.hasGame, false);
  assert.equal(podium.postMatch, true);

  const nextMatch = applyStatsApiMessage(podium, { Event: "MatchCreated", Data: {} }, now + 2000);
  assert.equal(nextMatch.postMatch, false);
  assert.equal(nextMatch.preMatch, true);
  assert.equal(nextMatch.game.hasGame, false);

  // Between matches: UpdateState often already has a shell match (5:00, 0–0, no players).
  const between = applyStatsApiMessage(nextMatch, {
    Event: "UpdateState",
    Data: {
      MatchGuid: "next-match",
      Players: [],
      Game: {
        Teams: [
          { Name: "Blue", TeamNum: 0, Score: 0 },
          { Name: "Orange", TeamNum: 1, Score: 0 },
        ],
        TimeSeconds: 300,
        Ball: { Speed: 0, TeamNum: 255 },
        bOvertime: false,
        bReplay: false,
        bHasWinner: false,
        bHasTarget: false,
      },
    },
  }, now + 2200);
  assert.equal(between.game.hasGame, false);
  assert.equal(between.preMatch, true);
  assert.equal(between.postMatch, false);

  // Players can sit in lobby cars before countdown — stay on VS until 3-2-1.
  const lobbyRoster = applyStatsApiMessage(between, {
    Event: "UpdateState",
    Data: {
      MatchGuid: "next-match",
      Players: [
        {
          Name: "PlayerA",
          PrimaryId: "Epic|1|0",
          Shortcut: 1,
          TeamNum: 0,
          Goals: 0,
          Shots: 0,
          Assists: 0,
          Saves: 0,
          Boost: 33,
          bDemolished: false,
        },
      ],
      Game: {
        Teams: [
          { Name: "Blue", TeamNum: 0, Score: 0 },
          { Name: "Orange", TeamNum: 1, Score: 0 },
        ],
        TimeSeconds: 300,
        Ball: { Speed: 0, TeamNum: 255 },
        bOvertime: false,
        bReplay: false,
        bHasWinner: false,
        bHasTarget: false,
      },
    },
  }, now + 2300);
  assert.equal(lobbyRoster.game.hasGame, false);
  assert.equal(lobbyRoster.preMatch, true);

  // MatchInitialized is the first-countdown signal — dismiss VS before RoundStarted/kickoff.
  const initialized = applyStatsApiMessage(lobbyRoster, { Event: "MatchInitialized", Data: {} }, now + 2400);
  assert.equal(initialized.postMatch, false);
  assert.equal(initialized.preMatch, false);
  assert.equal(initialized.game.hasGame, true);

  // CountdownBegin also dismisses VS (per-round 3-2-1), including after a fresh lobby latch.
  const countdown = applyStatsApiMessage(lobbyRoster, { Event: "CountdownBegin", Data: {} }, now + 2500);
  assert.equal(countdown.postMatch, false);
  assert.equal(countdown.preMatch, false);
  assert.equal(countdown.game.hasGame, true);
  assert.equal(countdown.game.hasWinner, false);

  // Blank Players[] during countdown must not resurrect VS (would stick until RoundStarted).
  const blankDuringCountdown = applyStatsApiMessage(countdown, {
    Event: "UpdateState",
    Data: {
      MatchGuid: "next-match",
      Players: [],
      Game: {
        Teams: [
          { Name: "Blue", TeamNum: 0, Score: 0 },
          { Name: "Orange", TeamNum: 1, Score: 0 },
        ],
        TimeSeconds: 300,
        Ball: { Speed: 0, TeamNum: 255 },
        bOvertime: false,
        bReplay: false,
        bHasWinner: false,
        bHasTarget: false,
      },
    },
  }, now + 2600);
  assert.equal(blankDuringCountdown.preMatch, false);
  assert.equal(blankDuringCountdown.game.hasGame, true);

  // Idle MatchCreated shell (no countdown yet) still keeps VS.
  const idleShell = applyStatsApiMessage(countdown, { Event: "MatchCreated", Data: {} }, now + 2700);
  assert.equal(idleShell.preMatch, true);
  assert.equal(idleShell.game.hasGame, false);
  const idleUpdate = applyStatsApiMessage(idleShell, {
    Event: "UpdateState",
    Data: {
      MatchGuid: "shell",
      Players: [],
      Game: {
        Teams: [
          { Name: "Blue", TeamNum: 0, Score: 0 },
          { Name: "Orange", TeamNum: 1, Score: 0 },
        ],
        TimeSeconds: 300,
        Ball: { Speed: 0, TeamNum: 255 },
        bOvertime: false,
        bReplay: false,
        bHasWinner: false,
        bHasTarget: false,
      },
    },
  }, now + 2800);
  assert.equal(idleUpdate.preMatch, true);
  assert.equal(idleUpdate.game.hasGame, false);

  const base = {
    version: 1,
    updatedAt: "2026-08-13T16:00:00.000Z",
    skin: "nel",
    header: "Test",
    bestOf: "Bo3",
    flipSides: false,
    playerCardEnabled: true,
    sponsorWidgetEnabled: true,
    sponsors: [],
    roundNumber: 1,
    winsNeeded: 2,
    leaguePrimary: "#1A75FD",
    leagueSecondary: "#F8871E",
    teamOne: { name: "A", standing: "", logo: "", color: "#111111", logoBackground: "#FFFFFF", seriesScore: "0" },
    teamTwo: { name: "B", standing: "", logo: "", color: "#222222", logoBackground: "#000000", seriesScore: "0" },
    debugLiveOverride: false,
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
    activities: [],
  };
  const merged = mergeRocketLeagueOverlayLive(base, ended, now + 2000);
  assert.equal(merged.finishedGame.scoreOne, 4);
  assert.equal(merged.finishedGame.id, live.finishedGame.id);
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

  assert.match(page, /generalInfoEnabled:\s*true/);
  assert.match(page, /rocketLeagueEnabled:\s*true/);
  assert.match(page, /valorantEnabled:\s*true/);
  assert.match(page, /sponsorsEnabled:\s*true/);
  assert.match(page, /drawShowEnabled:\s*true/);
  assert.match(page, /Sidebar visibility/);
  assert.doesNotMatch(page, /Graphics defaults/);
  assert.doesNotMatch(page, /settings\.regionalLogo/);
  assert.match(page, /regionallogo: resolveRegionalLogo\(general\)/);
  assert.match(page, /Podcast indicator logo/);
  assert.match(page, /podcastIndicatorLogo/);
  assert.match(page, /return GAMING_OASIS_FAVICON_URL/);
  assert.match(page, /Hiding one does not change its data or JSON output/);
  assert.match(page, /generalInfoEnabled \? \[\{ key: "general" as Section, label: "General info" \}\]/);
  assert.match(page, /Show General Info in sidebar/);
  assert.match(page, /Show Rocket League in sidebar/);
  assert.match(page, /Show VALORANT in sidebar/);
  assert.match(page, /MATCH_LOOKUP_ENDPOINT/);
  assert.match(page, /displayLogoUrl\(resolved\.logo\)/);
  assert.match(page, /detectLogoBackground/);
  assert.match(css, /\.team-logo-preview img \{[^}]*background-color: inherit/);
  assert.match(css, /\.team-logo-preview \{[^}]*isolation: isolate/);
  assert.match(css, /\.team-logo-preview \{[^}]*width: 72px; height: 72px/);
  assert.match(page, /Logo background/);
  assert.match(page, /Auto ·/);
  assert.match(page, /detectImagePlate/);
  assert.match(page, /resolveImagePlate/);
  assert.match(page, /IMAGE_PLATE_LIGHT/);
  assert.match(page, /IMAGE_PLATE_DARK/);
  assert.match(page, /logoBackground: IMAGE_PLATE_LIGHT/);
  assert.match(page, />Navy</);
  assert.match(css, /\.logo-background-options i\.navy \{[^}]*background: #171717/);
  assert.doesNotMatch(css, /\.logo-background-options i\.black/);
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
  assert.match(page, /useState<"results" \| "pickBans" \| "mapPool" \| "overlay">/);
  assert.match(page, /useState<"results" \| "overlay" \| "admin" \| "debug">\("results"\)/);
  assert.match(page, /setValorantTab\("overlay"\)/);
  assert.match(page, /setRocketLeagueTab\("overlay"\)/);
  assert.match(page, /setRocketLeagueTab\("debug"\)/);
  assert.match(page, /setValorantTab\("mapPool"\)/);
  assert.match(page, /VALORANT MAP DATA\.json/);
  assert.match(page, />Map Pool</);
  assert.match(page, /function addValorantMap\(\)/);
  assert.match(page, /function removeValorantMap\(/);
  assert.match(page, /function resetValorantMapPool\(\)/);
  assert.match(page, /Reset to Default/);
  assert.match(page, /Add map/);
  assert.match(page, /notify\("VALORANT map pool reset to default"\)/);
  assert.match(page, /mapPoolNames/);
  assert.doesNotMatch(page, /VALORANT_MAPS\.map/);
  assert.doesNotMatch(page, />Map artwork</);
  assert.match(page, /buildRocketLeagueOverlayState/);
  assert.match(page, /overlays: \{ valorant: valorantOverlay, rocketLeague: rocketLeagueOverlay \}/);
  assert.match(page, /Scoreboard header override/);
  assert.match(page, /Leave blank to use General Info event name\./);
  assert.match(page, /resolveScoreboardHeader/);
  assert.match(page, /Event name \/ header not configured/);
  assert.match(page, /Auto-accept live results/);
  assert.match(page, /autoAcceptLiveResults/);
  assert.match(page, /proposeRocketLeagueLiveResult/);
  assert.match(page, /ROCKET_LEAGUE_LIVE_OVERLAY_ENDPOINT/);
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
  assert.match(page, /Rocket League Game Data API/);
  assert.match(page, /Auto broadcast camera/);
  assert.match(page, /aria-label="Enable Rocket League auto broadcast camera"/);
  assert.match(page, /broadcastSetupEnabled/);
  assert.match(page, /Admin control/);
  assert.match(page, /aria-label="Rocket League admin control"/);
  assert.match(page, /setRocketLeagueTab\("admin"\)/);
  assert.match(page, /Pause match/);
  assert.match(page, /Resume match/);
  assert.match(page, /aria-label="Pause Rocket League match"/);
  assert.match(page, /aria-label="Resume Rocket League match"/);
  assert.match(page, /\/api\/rocket-league\/match-paused/);
  assert.match(page, /Manual fallback: press <strong>9<\/strong>, then <strong>H<\/strong> twice while spectating\./);
  assert.match(page, /Fire sample activity/);
  assert.match(page, /createSampleDebugActivity/);
  assert.match(page, /aria-label="Debug has game"/);
  assert.match(page, /updateDebugLive\(\{ hasGame: event\.target\.checked \}\)/);
  assert.doesNotMatch(page, /aria-label="Debug lobby VS"/);
  assert.match(page, /ROCKET_LEAGUE_VS_OVERLAY_URL/);
  assert.match(page, /VALORANT_VS_OVERLAY_URL/);
  assert.match(page, /Copy VS link/);
  assert.match(page, /Open VS overlay/);
  assert.match(page, /VS matchup URL/);
  assert.match(page, /aria-label="Debug replay"/);
  assert.match(page, /updateDebugLive\(\{ isReplay:/);
  assert.match(page, /In-game team assignment/);
  assert.match(page, /Swap assignment/);
  assert.match(page, /Swap Rocket League left and right team assignment/);
  assert.match(page, /overlayLeftTeam/);
  assert.match(page, /overlayRightTeam/);
  assert.match(page, /In-game \{overlayLeftGameSide\}/);
  assert.match(page, /In-game \{overlayRightGameSide\}/);
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
  assert.equal((page.match(/Reset series/g) ?? []).length, 4);
  assert.match(page, /function resetRocketLeagueSeries\(\)/);
  assert.match(page, /games: createRocketLeagueGames\(\),\s*savedGames: createRocketLeagueGames\(\)/);
  assert.match(page, /notify\("Rocket League series results cleared"\)/);
  assert.match(page, /id="series-reset-modal-title"/);
  assert.match(page, /Reset Rocket League series\?/);
  assert.match(page, /function resetValorantSeries\(\)/);
  assert.match(page, /games: createValorantGames\(\),\s*savedGames: createValorantGames\(\)/);
  assert.match(page, /notify\("VALORANT series results cleared"\)/);
  assert.match(page, /id="valorant-series-reset-modal-title"/);
  assert.match(page, /Reset VALORANT series\?/);
  assert.match(page, /setValorantSeriesResetOpen\(true\)/);
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
  assert.equal(state.bestOf, "Bo5");
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
    enableRocketLeagueStatsApi: false,
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
    enableRocketLeagueStatsApi: false,
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
    enableRocketLeagueStatsApi: false,
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
  const writer = await startJsonWriter({ port: 0, outputDir, enableRocketLeagueStatsApi: false });
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

    const pause = await fetch(`${writer.url}/api/rocket-league/match-paused`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paused: true }),
    });
    assert.equal(pause.status, 503);
    const pauseBody = await pause.json();
    assert.match(String(pauseBody.error || ""), /Stats API/i);
  } finally {
    await writer.close();
  }
});

test("writes editable VALORANT map artwork beside the unchanged six-file package", async () => {
  const outputDir = await mkdtemp(path.join(tmpdir(), "gaming-oasis-map-artwork-"));
  const writer = await startJsonWriter({ port: 0, outputDir, enableRocketLeagueStatsApi: false });
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
  const writer = await startJsonWriter({ port: 0, outputDir, enableRocketLeagueStatsApi: false });
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
  const writer = await startJsonWriter({ port: 0, outputDir, enableRocketLeagueStatsApi: false });
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
    broadcastSetupEnabled: true,
    lobbyScene: "vs",
    statsSceneBackground: "transparent",
    sponsors: [{ id: "oasis", name: "Gaming Oasis", logo: "oasis.png" }],
    roundNumber: 2,
    winsNeeded: 3,
    leaguePrimary: "#1A75FD",
    leagueSecondary: "#FCC500",
    teamOne: { name: "Alpha", standing: "2-0", logo: "a.png", color: "#111111", logoBackground: "#FFFFFF", seriesScore: "1" },
    teamTwo: { name: "Beta", standing: "1-1", logo: "b.png", color: "#222222", logoBackground: "#000000", seriesScore: "0" },
    debugLiveOverride: false,
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
    activities: [],
    replayCard: null,
    finishedGame: null,
    matchTeamStats: null,
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
