import { resolveScoreboardHeader } from "./scoreboard-header.mjs";
import { buildOverlaySponsors } from "./overlay-sponsors.mjs";

export const VALORANT_GAME_COUNT = 5;
export const VALORANT_OVERLAY_DEFAULTS = {
  teamOneColor: "#644EB5",
  teamTwoColor: "#FCC500",
  leaguePrimary: "#644EB5",
  leagueSecondary: "#FCC500",
  logoBackground: "#FFFFFF",
};

export const VALORANT_MAPS = [
  { name: "Abyss", nextMap: "https://drive.google.com/uc?export=view&id=1Ti1L6nQh7o_AyePSO_RZOG0BBCsebHh1", pickCard: "https://drive.google.com/uc?export=view&id=1TZs7g0XQSHkPVBWWUPMKS4iFfiGgcOOo", banCard: "https://drive.google.com/uc?export=view&id=1dN8ciDB1m6fSgBnghkcvNDuaQ7LOdm2G" },
  { name: "Ascent", nextMap: "https://drive.google.com/uc?export=view&id=1uIxtH9KXuAd8ZEv8ibMR1LbiWFwrs-8A", pickCard: "https://drive.google.com/uc?export=view&id=1OPbVx7RmhWL6i0ybArZjwSl8LyTbIUkD", banCard: "https://drive.google.com/uc?export=view&id=12qoZocfHPIo9mAXfJvjTxKxhA_6vqBwv" },
  { name: "Bind", nextMap: "https://drive.google.com/uc?export=view&id=1-1jwB_WQ7dg0QpvMo0bASMJbpggkGgwS", pickCard: "https://drive.google.com/uc?export=view&id=1LaAAD4t5j4KGtygHC5IRxZMfHmZaFCHE", banCard: "https://drive.google.com/uc?export=view&id=1I9CWqTxT-7eBtiM3RTAgYTf-KvpJIChr" },
  { name: "Breeze", nextMap: "https://drive.google.com/uc?export=view&id=10dgkO8pwdNFRr5rNE8vXolBtTMWq_uwJ", pickCard: "https://drive.google.com/uc?export=view&id=18O9yAGTYIosSSYM8FvyfnU9LrSbOtjUw", banCard: "https://drive.google.com/uc?export=view&id=1chMUn35DzpWRsYPfsd_kCnuExbUungfq" },
  { name: "Fracture", nextMap: "https://drive.google.com/uc?export=view&id=1dHl6En9cSJlTzJZhN05nQIvKdXOqBCTg", pickCard: "https://drive.google.com/uc?export=view&id=1OWgqTU92vdtVZSTQz-FL2nonJYLMOIm6", banCard: "https://drive.google.com/uc?export=view&id=11SdWSDE3TrGNrFlXRZmE3UjvLIVrTVHi" },
  { name: "Haven", nextMap: "https://drive.google.com/uc?export=view&id=1iHiWR_CRAOpgMmIYD2xckwFMFSUKLeV1", pickCard: "https://drive.google.com/uc?export=view&id=1CCUde2pjSPkl_T9D83T32XBE9sEBT--C", banCard: "https://drive.google.com/uc?export=view&id=1URNE1Skup9qNvLWk2s8JXSl1Ft2eqSfi" },
  { name: "Ice Box", nextMap: "https://drive.google.com/uc?export=view&id=1vfVFHe4lObLtbq5YWg3YNmxVkMBlmLm-", pickCard: "https://drive.google.com/uc?export=view&id=1cgvTaUfgZXGNsV37pvipO5qzWvsIlFff", banCard: "https://drive.google.com/uc?export=view&id=1U2NNVhitt-3t1fJoKJLuCOgq6Ufmi1mM" },
  { name: "Lotus", nextMap: "https://drive.google.com/uc?export=view&id=1RwekxHWMP5dx-IWLqJBN90XSZ1VFB2k6", pickCard: "https://drive.google.com/uc?export=view&id=1yFKRo3V2frZcjrDtz6Z__IY7arMQ3D9I", banCard: "https://drive.google.com/uc?export=view&id=19A0BLV7yfuIrLVn_ou3HG-G5p2z0DaXg" },
  { name: "Pearl", nextMap: "https://drive.google.com/uc?export=view&id=1mSzaxXHQvKitOShT2FyjW8I-SCHD7rz7", pickCard: "https://drive.google.com/uc?export=view&id=1H6kzRROVioVq656EU25JaQOTUFfgpr1f", banCard: "https://drive.google.com/uc?export=view&id=1nLpE1it5tr2ASPodqV-qUwWhHq4l8-jG" },
  { name: "Split", nextMap: "https://drive.google.com/uc?export=view&id=1pF7CZCBGlHgxJE3yep_fXbruN0j8W8rJ", pickCard: "https://drive.google.com/uc?export=view&id=1kckgwEzy2AtZbA1jW9DK5MIC05YaFldf", banCard: "https://drive.google.com/uc?export=view&id=1caenjTynRhUqne1GAPQAWlJ9nsMcQtZO" },
  { name: "Sunset", nextMap: "https://drive.google.com/uc?export=view&id=13WtbDnUxe0kTl8XNfmzhA14RqdOnNAi5", pickCard: "https://drive.google.com/uc?export=view&id=13oEXeQLxTky5DlKVrM_Y2VEib4XkosqK", banCard: "https://drive.google.com/uc?export=view&id=1P31K4hDw0ptJxu_pJfVgZsOfq7gzXw37" },
  { name: "Corrode", nextMap: "https://drive.google.com/uc?export=view&id=13fubA3eU8hOFBCnQP5hTerms_ih0WH8v", pickCard: "https://drive.google.com/uc?export=view&id=1lvAqhmR9mAIooKRF7RVFqP8sbN2l2uPe", banCard: "https://drive.google.com/uc?export=view&id=1NGTXTelJyWOF3a_gy9OxtuEiT62c3XE1" },
];

export const VALORANT_MAP_ARTWORK = [
  {
    name: "Placeholder",
    nextMap: "https://drive.google.com/uc?export=view&id=1SwFGRHOcTuy4eNhdZgoWPk2vRMb-_Xsw",
    pickCard: "https://drive.google.com/uc?export=view&id=1bMnszxe7Gul-UHWoyxmFnJW45Ubx_gDs",
    banCard: "https://drive.google.com/uc?export=view&id=144YTLCUdiGBHlH7DsrZBVC_t_4R9CoFd",
  },
  ...VALORANT_MAPS,
];

export function createValorantGames() {
  return Array.from({ length: VALORANT_GAME_COUNT }, () => ({ home: "", away: "" }));
}

export function formatValorantScore(game) {
  const home = String(game?.home ?? "").trim();
  const away = String(game?.away ?? "").trim();
  return `${home || "X"} - ${away || "X"}`;
}

export function calculateValorantSeries(games) {
  let completedGames = 0;
  let homeWins = 0;
  let awayWins = 0;
  games.slice(0, VALORANT_GAME_COUNT).forEach((game) => {
    const home = String(game?.home ?? "").trim();
    const away = String(game?.away ?? "").trim();
    if (!home || !away) return;
    completedGames += 1;
    const homeScore = Number.parseInt(home, 10) || 0;
    const awayScore = Number.parseInt(away, 10) || 0;
    if (homeScore > awayScore) homeWins += 1;
    if (awayScore > homeScore) awayWins += 1;
  });
  return { roundNumber: completedGames === 0 ? 1 : completedGames + 1, homeWins, awayWins, completedGames };
}

export function getValorantCurrentMap(valorant, roundNumber) {
  const maps = valorant.bestOf === "Bo5"
    ? [valorant.bo5.pick1, valorant.bo5.pick2, valorant.bo5.pick3, valorant.bo5.pick4, valorant.bo5.decider]
    : valorant.bestOf === "Bo3"
      ? [valorant.bo3.pick1, valorant.bo3.pick2, valorant.bo3.decider]
      : [""];
  const number = Math.min(Math.max(Number(roundNumber) || 1, 1), maps.length);
  return { number, name: maps[number - 1] || "" };
}

export function getValorantCurrentSides(valorant, roundNumber) {
  const isBo5 = valorant.bestOf === "Bo5";
  const sides = isBo5
    ? [valorant.bo5.side1, valorant.bo5.side2, valorant.bo5.side3, valorant.bo5.side4, valorant.bo5.side5]
    : valorant.bestOf === "Bo3"
      ? [valorant.bo3.side1, valorant.bo3.side2, valorant.bo3.side3]
      : [valorant.bo3.side1];
  const choosingTeams = isBo5 ? ["B", "A", "B", "A", "B"] : ["B", "A", "A"];
  const mapIndex = Math.min(Math.max((Number(roundNumber) || 1) - 1, 0), sides.length - 1);
  const selectedSide = sides[mapIndex];
  if (selectedSide !== "attack" && selectedSide !== "defense") return { one: "", two: "" };

  const opposingSide = selectedSide === "attack" ? "defense" : "attack";
  const choosingTeamIsHome = valorant.banSwap ? choosingTeams[mapIndex] === "B" : choosingTeams[mapIndex] === "A";
  const homeSide = choosingTeamIsHome ? selectedSide : opposingSide;
  const awaySide = choosingTeamIsHome ? opposingSide : selectedSide;
  return valorant.flipSides ? { one: awaySide, two: homeSide } : { one: homeSide, two: awaySide };
}

function mapData(name, maps = VALORANT_MAPS) {
  const normalized = String(name ?? "").replace(/\s+/g, "").toLowerCase();
  return maps.find((map) => map.name.replace(/\s+/g, "").toLowerCase() === normalized);
}

function sideText(value) {
  if (value === "attack") return "ATK";
  if (value === "defense") return "DEF";
  return "TBD";
}

function winnerLogo(game, home, away) {
  const homeScore = String(game?.home ?? "").trim();
  const awayScore = String(game?.away ?? "").trim();
  if (!homeScore || !awayScore) return "";
  const first = Number.parseInt(homeScore, 10) || 0;
  const second = Number.parseInt(awayScore, 10) || 0;
  if (first > second) return home.logo || "";
  if (second > first) return away.logo || "";
  return "";
}

export function buildValorantFields(valorant, home, away, mapArtwork = VALORANT_MAP_ARTWORK, options = {}) {
  const output = {};
  const series = calculateValorantSeries(valorant.games);
  const displayOne = valorant.flipSides ? away : home;
  const displayTwo = valorant.flipSides ? home : away;
  const banTeamA = valorant.banSwap ? away : home;
  const banTeamB = valorant.banSwap ? home : away;

  Object.assign(output, {
    valname1: String(displayOne.name || "").toUpperCase(),
    valname2: String(displayTwo.name || "").toUpperCase(),
    vallogo1: displayOne.logo || "",
    vallogo2: displayTwo.logo || "",
    valcolor1: displayOne.color || "",
    valcolor2: displayTwo.color || "",
    valcolor1a: displayOne.color || "",
    valcolor2a: displayTwo.color || "",
    valstanding1: displayOne.standing || "",
    valstanding2: displayTwo.standing || "",
    vallogobg1: displayOne.logoBackground || "#FFFFFF",
    vallogobg2: displayTwo.logoBackground || "#FFFFFF",
    valbanteamaname: String(banTeamA.name || "").toUpperCase(),
    valbanteamastanding: banTeamA.standing || "",
    valbanteamalogo: banTeamA.logo || "",
    valbanteamacolor: banTeamA.color || "",
    valbanteambname: String(banTeamB.name || "").toUpperCase(),
    valbanteambstanding: banTeamB.standing || "",
    valbanteamblogo: banTeamB.logo || "",
    valbanteambcolor: banTeamB.color || "",
    valorantroundnumber: String(series.roundNumber),
    valseriesscore1: String(valorant.flipSides ? series.awayWins : series.homeWins),
    valseriesscore2: String(valorant.flipSides ? series.homeWins : series.awayWins),
    valheader: resolveScoreboardHeader(valorant.scoreboardHeader, options.eventName),
    "valformat#": valorant.bestOf,
  });

  valorant.games.forEach((game, index) => { output[`valscore${index + 1}`] = formatValorantScore(game); });

  const bo3MapNames = [valorant.bo3.ban1, valorant.bo3.ban2, valorant.bo3.pick1, valorant.bo3.pick2, valorant.bo3.ban3, valorant.bo3.ban4, valorant.bo3.decider];
  const bo3Types = ["ban", "ban", "pick", "pick", "ban", "ban", "pick"];
  bo3MapNames.forEach((name, index) => {
    const map = mapData(name, mapArtwork);
    output[`valbo3maptext${index + 1}`] = String(map?.name || name || "").toUpperCase();
    output[`valbo3mapimage${index + 1}`] = bo3Types[index] === "ban" ? map?.banCard || "" : map?.pickCard || "";
  });
  [valorant.bo3.side1, valorant.bo3.side2, valorant.bo3.side3].forEach((side, index) => { output[`valbo3s${index + 1}text`] = sideText(side); });

  const bo5MapNames = [valorant.bo5.ban1, valorant.bo5.ban2, valorant.bo5.pick1, valorant.bo5.pick2, valorant.bo5.pick3, valorant.bo5.pick4, valorant.bo5.decider];
  const bo5Types = ["ban", "ban", "pick", "pick", "pick", "pick", "pick"];
  bo5MapNames.forEach((name, index) => {
    const map = mapData(name, mapArtwork);
    output[`valbo5maptext${index + 1}`] = String(map?.name || name || "").toUpperCase();
    output[`valbo5mapimage${index + 1}`] = bo5Types[index] === "ban" ? map?.banCard || "" : map?.pickCard || "";
  });
  [valorant.bo5.side1, valorant.bo5.side2, valorant.bo5.side3, valorant.bo5.side4, valorant.bo5.side5].forEach((side, index) => { output[`valbo5s${index + 1}text`] = sideText(side); });

  const bo3LogoAssignments = [banTeamA, banTeamB, banTeamA, banTeamB, banTeamB, banTeamA, banTeamA, banTeamB, banTeamA];
  ["b1", "b2", "p1", "s1", "p2", "s2", "b3", "b4", "s3"].forEach((key, index) => { output[`valbo3${key}logo`] = bo3LogoAssignments[index].logo || ""; });
  const bo5LogoAssignments = [banTeamA, banTeamB, banTeamA, banTeamB, banTeamB, banTeamA, banTeamA, banTeamB, banTeamB, banTeamA, banTeamB];
  ["b1", "b2", "p1", "s1", "p2", "s2", "p3", "s3", "p4", "s4", "s5"].forEach((key, index) => { output[`valbo5${key}logo`] = bo5LogoAssignments[index].logo || ""; });

  const bo3SeriesMaps = [valorant.bo3.pick1, valorant.bo3.pick2, valorant.bo3.decider];
  const bo3PickTeams = [banTeamA, banTeamB, null];
  bo3SeriesMaps.forEach((name, index) => {
    output[`valbo3map${index + 1}name`] = String(name || "").toUpperCase();
    output[`valbo3map${index + 1}teamlogo`] = bo3PickTeams[index]?.logo || "";
    output[`valbo3map${index + 1}winnerlogo`] = winnerLogo(valorant.games[index], home, away);
    output[`valbo3nextmap${index + 1}`] = `Map ${index + 1} - ${String(name || "").toUpperCase()}`;
  });
  const bo3CurrentMap = bo3SeriesMaps[Math.min(Math.max(series.roundNumber - 1, 0), 2)];
  output.valbo3nextmapi = mapData(bo3CurrentMap, mapArtwork)?.nextMap || "";

  const bo5SeriesMaps = [valorant.bo5.pick1, valorant.bo5.pick2, valorant.bo5.pick3, valorant.bo5.pick4, valorant.bo5.decider];
  const bo5PickTeams = [banTeamA, banTeamB, banTeamA, banTeamB, null];
  bo5SeriesMaps.forEach((name, index) => {
    output[`valbo5map${index + 1}name`] = String(name || "").toUpperCase();
    output[`valbo5map${index + 1}teamlogo`] = bo5PickTeams[index]?.logo || "";
    output[`valbo5map${index + 1}winnerlogo`] = winnerLogo(valorant.games[index], home, away);
    output[`valbo5nextmap${index + 1}`] = `Map ${index + 1} - ${String(name || "").toUpperCase()}`;
    output[`valbo5widgetlogo${index + 1}`] = output[`valbo5map${index + 1}winnerlogo`] || output[`valbo5map${index + 1}teamlogo`];
    output[`valbo5widgetmap${index + 1}`] = index + 1 < series.roundNumber
      ? `${String(name || "").toUpperCase()}: ${formatValorantScore(valorant.games[index])}`
      : index + 1 === series.roundNumber ? `CURRENT: ${String(name || "").toUpperCase()}` : `${index === 4 ? "DECIDER" : "NEXT"}: ${String(name || "").toUpperCase()}`;
  });
  const bo5CurrentMap = bo5SeriesMaps[Math.min(Math.max(series.roundNumber - 1, 0), 4)];
  output.valbo5nextmapi = mapData(bo5CurrentMap, mapArtwork)?.nextMap || "";

  const activeMaps = valorant.bestOf === "Bo5" ? bo5SeriesMaps : bo3SeriesMaps;
  const activePickTeams = valorant.bestOf === "Bo5" ? bo5PickTeams : bo3PickTeams;
  const widgetStartIndex = valorant.bestOf !== "Bo5" || series.roundNumber <= 2
    ? 0
    : series.roundNumber === 3 ? 1 : 2;
  for (let index = 0; index < 3; index += 1) {
    const mapIndex = widgetStartIndex + index;
    const name = activeMaps[mapIndex] || "";
    const completed = mapIndex + 1 < series.roundNumber;
    output[`valwidgetlogo${index + 1}`] = completed ? winnerLogo(valorant.games[mapIndex], home, away) : activePickTeams[mapIndex]?.logo || "";
    output[`valwidgetmap${index + 1}`] = completed
      ? `${String(name).toUpperCase()}: ${formatValorantScore(valorant.games[mapIndex])}`
      : mapIndex + 1 === series.roundNumber ? `CURRENT: ${String(name).toUpperCase()}` : `${mapIndex === activeMaps.length - 1 ? "DECIDER" : "NEXT"}: ${String(name).toUpperCase()}`;
  }

  return output;
}

function overlayColor(value, fallback) {
  const normalized = String(value ?? "").trim();
  if (/^#[0-9a-f]{6}$/i.test(normalized) || /^#[0-9a-f]{3}$/i.test(normalized)) return normalized;
  if (/^rgb\(\s*(?:\d{1,3}\s*,\s*){2}\d{1,3}\s*\)$/i.test(normalized)) return normalized;
  return fallback;
}

function buildValorantMapWidget(valorant, home, away, mapArtwork) {
  const visible = valorant.mapWidgetEnabled !== false && (valorant.bestOf === "Bo3" || valorant.bestOf === "Bo5");
  if (!visible) return { visible: false, maps: [] };

  const isBo5 = valorant.bestOf === "Bo5";
  const format = isBo5 ? valorant.bo5 : valorant.bo3;
  const maps = isBo5
    ? [format.pick1, format.pick2, format.pick3, format.pick4, format.decider]
    : [format.pick1, format.pick2, format.decider];
  const teamA = valorant.banSwap ? away : home;
  const teamB = valorant.banSwap ? home : away;
  const pickers = isBo5 ? [teamA, teamB, teamA, teamB, null] : [teamA, teamB, null];
  const displayOne = valorant.flipSides ? away : home;
  const series = calculateValorantSeries(valorant.games);
  const startIndex = !isBo5 || series.roundNumber <= 2
    ? 0
    : series.roundNumber === 3 ? 1 : 2;

  return {
    visible: true,
    maps: Array.from({ length: 3 }, (_, slotIndex) => {
      const mapIndex = startIndex + slotIndex;
      const game = valorant.games[mapIndex] ?? {};
      const homeScore = String(game.home ?? "").trim();
      const awayScore = String(game.away ?? "").trim();
      const completed = Boolean(homeScore && awayScore);
      const decider = mapIndex === maps.length - 1;
      const picker = pickers[mapIndex];
      const artwork = mapData(maps[mapIndex], mapArtwork);
      const pickerPosition = picker ? (picker === displayOne ? "one" : "two") : "";
      const scoreOne = valorant.flipSides ? awayScore : homeScore;
      const scoreTwo = valorant.flipSides ? homeScore : awayScore;

      return {
        mapNumber: mapIndex + 1,
        name: String(maps[mapIndex] || "TBD").trim().toUpperCase(),
        background: String(artwork?.pickCard || "").trim(),
        status: completed
          ? "result"
          : decider ? "decider" : mapIndex + 1 === series.roundNumber ? "current" : "next",
        scoreOne: completed ? scoreOne : "",
        scoreTwo: completed ? scoreTwo : "",
        picker: completed || decider ? "" : pickerPosition,
      };
    }),
  };
}

export function buildValorantOverlayState(valorant, home, away, league = {}, sponsors = [], mapArtwork = VALORANT_MAP_ARTWORK, options = {}) {
  const savedValorant = { ...valorant, games: valorant.savedGames ?? valorant.games ?? [] };
  const fields = buildValorantFields(
    savedValorant,
    home,
    away,
    mapArtwork,
    { eventName: options.eventName ?? league.eventName },
  );

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    header: String(fields.valheader || "").trim(),
    leaguePrimary: overlayColor(league.primaryColor, VALORANT_OVERLAY_DEFAULTS.leaguePrimary),
    leagueSecondary: overlayColor(league.secondaryColor, VALORANT_OVERLAY_DEFAULTS.leagueSecondary),
    mapWidget: buildValorantMapWidget(savedValorant, home, away, mapArtwork),
    sponsorWidgetEnabled: savedValorant.sponsorWidgetEnabled !== false,
    sponsors: buildOverlaySponsors(sponsors),
    teamOne: {
      name: String(fields.valname1 || "").trim(),
      standing: String(fields.valstanding1 || "").trim(),
      logo: String(fields.vallogo1 || "").trim(),
      color: overlayColor(fields.valcolor1, VALORANT_OVERLAY_DEFAULTS.teamOneColor),
      logoBackground: overlayColor(fields.vallogobg1, VALORANT_OVERLAY_DEFAULTS.logoBackground),
      seriesScore: String(fields.valseriesscore1 || "0").trim(),
    },
    teamTwo: {
      name: String(fields.valname2 || "").trim(),
      standing: String(fields.valstanding2 || "").trim(),
      logo: String(fields.vallogo2 || "").trim(),
      color: overlayColor(fields.valcolor2, VALORANT_OVERLAY_DEFAULTS.teamTwoColor),
      logoBackground: overlayColor(fields.vallogobg2, VALORANT_OVERLAY_DEFAULTS.logoBackground),
      seriesScore: String(fields.valseriesscore2 || "0").trim(),
    },
  };
}
