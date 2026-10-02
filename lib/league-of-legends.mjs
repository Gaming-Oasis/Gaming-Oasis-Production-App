import { normalizeLeagueScoreboard } from "./league-scoreboard.mjs";
import { resolveScoreboardHeader } from "./scoreboard-header.mjs";

const text = (value) => typeof value === "string" ? value.trim() : "";
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const boolean = (value) => value === true || value === 1 || String(value).toLowerCase() === "true";

export const LEAGUE_TEAM_BLUE = "ORDER";
export const LEAGUE_TEAM_RED = "CHAOS";
export const LEAGUE_GAME_COUNT = 5;
export const LEAGUE_ROLES = ["Top", "Jungle", "Mid", "Bottom", "Support"];

export function buildLeagueScoreFields(league) {
  return Object.fromEntries(Array.from({ length: LEAGUE_GAME_COUNT }, (_, index) => {
    const winner = index < leagueGameLimit(league.bestOf)
      ? league.confirmedGames?.find((game) => game.gameNumber === index + 1)?.winner : null;
    return [`lolscore${index + 1}`, winner === "team1" ? "1 - 0" : winner === "team2" ? "0 - 1" : ""];
  }));
}

export function normalizeLeaguePickOrder(value) {
  return Array.isArray(value) && value.length === 5 && new Set(value).size === 5
    && value.every((slot) => Number.isInteger(slot) && slot >= 0 && slot < 5)
    ? [...value] : [0, 1, 2, 3, 4];
}

/** Move a chronological pick into a role without changing tournament draft order. */
export function assignLeaguePickRole(draftValue, side, role, pick) {
  const draft = normalizeLeagueDraft(draftValue);
  if (!["blue", "red"].includes(side) || !Number.isInteger(role) || role < 0 || role > 4
    || !Number.isInteger(pick) || pick < 0 || pick > 4) return draft;
  const key = `${side}PickOrder`;
  const order = [...draft[key]];
  const previousRole = order.indexOf(pick);
  [order[role], order[previousRole]] = [order[previousRole], order[role]];
  return { ...draft, [key]: order };
}

export const LEAGUE_DRAFT_STEPS = [
  ["ban", LEAGUE_TEAM_BLUE, 0, "Opening bans"],
  ["ban", LEAGUE_TEAM_RED, 0, "Opening bans"],
  ["ban", LEAGUE_TEAM_BLUE, 1, "Opening bans"],
  ["ban", LEAGUE_TEAM_RED, 1, "Opening bans"],
  ["ban", LEAGUE_TEAM_BLUE, 2, "Opening bans"],
  ["ban", LEAGUE_TEAM_RED, 2, "Opening bans"],
  ["pick", LEAGUE_TEAM_BLUE, 0, "Opening picks"],
  ["pick", LEAGUE_TEAM_RED, 0, "Opening picks"],
  ["pick", LEAGUE_TEAM_RED, 1, "Opening picks"],
  ["pick", LEAGUE_TEAM_BLUE, 1, "Opening picks"],
  ["pick", LEAGUE_TEAM_BLUE, 2, "Opening picks"],
  ["pick", LEAGUE_TEAM_RED, 2, "Opening picks"],
  ["ban", LEAGUE_TEAM_RED, 3, "Final bans"],
  ["ban", LEAGUE_TEAM_BLUE, 3, "Final bans"],
  ["ban", LEAGUE_TEAM_RED, 4, "Final bans"],
  ["ban", LEAGUE_TEAM_BLUE, 4, "Final bans"],
  ["pick", LEAGUE_TEAM_RED, 3, "Final picks"],
  ["pick", LEAGUE_TEAM_BLUE, 3, "Final picks"],
  ["pick", LEAGUE_TEAM_BLUE, 4, "Final picks"],
  ["pick", LEAGUE_TEAM_RED, 4, "Final picks"],
].map(([action, side, slot, phase], index) => ({ index, action, side, slot, phase }));

/** Online draft: record the simultaneous ban phase first, then 1-2-2-2-2-1 picks. */
export const LEAGUE_STANDARD_DRAFT_STEPS = [
  ...Array.from({ length: 5 }, (_, slot) => [
    { action: "ban", side: LEAGUE_TEAM_BLUE, slot, phase: "Bans" },
    { action: "ban", side: LEAGUE_TEAM_RED, slot, phase: "Bans" },
  ]).flat(),
  ...[
    [LEAGUE_TEAM_BLUE, 0], [LEAGUE_TEAM_RED, 0], [LEAGUE_TEAM_RED, 1],
    [LEAGUE_TEAM_BLUE, 1], [LEAGUE_TEAM_BLUE, 2], [LEAGUE_TEAM_RED, 2],
    [LEAGUE_TEAM_RED, 3], [LEAGUE_TEAM_BLUE, 3], [LEAGUE_TEAM_BLUE, 4], [LEAGUE_TEAM_RED, 4],
  ].map(([side, slot]) => ({ action: "pick", side, slot, phase: "Picks" })),
].map((step, index) => ({ ...step, index }));

// The legacy "standard" key remains tournament format for saved-draft compatibility.
export function leagueDraftSteps(mode, firstPickSide = LEAGUE_TEAM_BLUE) {
  const steps = mode === "online" ? LEAGUE_STANDARD_DRAFT_STEPS : LEAGUE_DRAFT_STEPS;
  return firstPickSide === LEAGUE_TEAM_RED
    ? steps.map((step) => ({ ...step, side: step.side === LEAGUE_TEAM_BLUE ? LEAGUE_TEAM_RED : LEAGUE_TEAM_BLUE }))
    : steps;
}
export const DEFAULT_LEAGUE_CHAMPIONS = [
  "Aatrox", "Ahri", "Akali", "Akshan", "Alistar", "Ambessa", "Amumu", "Anivia", "Annie", "Aphelios",
  "Ashe", "Aurelion Sol", "Aurora", "Azir", "Bard", "Bel'Veth", "Blitzcrank", "Brand", "Braum", "Briar",
  "Caitlyn", "Camille", "Cassiopeia", "Cho'Gath", "Corki", "Darius", "Diana", "Dr. Mundo", "Draven", "Ekko",
  "Elise", "Evelynn", "Ezreal", "Fiddlesticks", "Fiora", "Fizz", "Galio", "Gangplank", "Garen", "Gnar",
  "Gragas", "Graves", "Gwen", "Hecarim", "Heimerdinger", "Hwei", "Illaoi", "Irelia", "Ivern", "Janna",
  "Jarvan IV", "Jax", "Jayce", "Jhin", "Jinx", "K'Sante", "Kai'Sa", "Kalista", "Karma", "Karthus",
  "Kassadin", "Katarina", "Kayle", "Kayn", "Kennen", "Kha'Zix", "Kindred", "Kled", "Kog'Maw", "LeBlanc",
  "Lee Sin", "Leona", "Lillia", "Lissandra", "Lucian", "Lulu", "Lux", "Malphite", "Malzahar", "Maokai",
  "Master Yi", "Mel", "Milio", "Miss Fortune", "Mordekaiser", "Morgana", "Naafiri", "Nami", "Nasus", "Nautilus",
  "Neeko", "Nidalee", "Nilah", "Nocturne", "Nunu & Willump", "Olaf", "Orianna", "Ornn", "Pantheon", "Poppy",
  "Pyke", "Qiyana", "Quinn", "Rakan", "Rammus", "Rek'Sai", "Rell", "Renata Glasc", "Renekton", "Rengar",
  "Riven", "Rumble", "Ryze", "Samira", "Sejuani", "Senna", "Seraphine", "Sett", "Shaco", "Shen",
  "Shyvana", "Singed", "Sion", "Sivir", "Skarner", "Smolder", "Sona", "Soraka", "Swain", "Sylas",
  "Syndra", "Tahm Kench", "Taliyah", "Talon", "Taric", "Teemo", "Thresh", "Tristana", "Trundle", "Tryndamere",
  "Twisted Fate", "Twitch", "Udyr", "Urgot", "Varus", "Vayne", "Veigar", "Vel'Koz", "Vex", "Vi",
  "Viego", "Viktor", "Vladimir", "Volibear", "Warwick", "Wukong", "Xayah", "Xerath", "Xin Zhao", "Yasuo",
  "Yone", "Yorick", "Yunara", "Yuumi", "Zac", "Zed", "Zeri", "Ziggs", "Zilean", "Zoe", "Zyra",
].map((name) => ({ id: name.replace(/[^A-Za-z0-9]/g, ""), name }));

const SPECIAL_ASSET_IDS = {
  "Aurelion Sol": "AurelionSol", "Bel'Veth": "Belveth", "Cho'Gath": "Chogath", "Dr. Mundo": "DrMundo",
  "Jarvan IV": "JarvanIV", "K'Sante": "KSante", "Kai'Sa": "Kaisa", "Kha'Zix": "Khazix", "Kog'Maw": "KogMaw",
  "LeBlanc": "Leblanc", "Lee Sin": "LeeSin", "Master Yi": "MasterYi", "Miss Fortune": "MissFortune",
  "Nunu & Willump": "Nunu", "Rek'Sai": "RekSai", "Renata Glasc": "Renata", "Tahm Kench": "TahmKench",
  "Twisted Fate": "TwistedFate", "Vel'Koz": "Velkoz", "Wukong": "MonkeyKing", "Xin Zhao": "XinZhao",
};

export function leagueChampionAssetId(name) {
  return SPECIAL_ASSET_IDS[name] || text(name).replace(/[^A-Za-z0-9]/g, "");
}

export function createLeagueDraftState(timerSeconds = 30) {
  return {
    currentStep: 0,
    firstPickSide: LEAGUE_TEAM_BLUE,
    selections: Array(LEAGUE_DRAFT_STEPS.length).fill(""),
    timerSeconds: Math.max(5, Math.min(120, number(timerSeconds, 30))),
    timeRemaining: Math.max(5, Math.min(120, number(timerSeconds, 30))),
    timerRunning: false,
    bluePickOrder: [0, 1, 2, 3, 4],
    redPickOrder: [0, 1, 2, 3, 4],
  };
}

export function normalizeLeagueDraft(value, timerSeconds = 30) {
  const initial = createLeagueDraftState(timerSeconds);
  const selections = initial.selections.map((_, index) => text(value?.selections?.[index]));
  const firstEmpty = selections.findIndex((selection) => !selection);
  const currentStep = Math.max(0, Math.min(LEAGUE_DRAFT_STEPS.length, firstEmpty === -1 ? LEAGUE_DRAFT_STEPS.length : firstEmpty));
  return {
    ...initial,
    ...value,
    firstPickSide: value?.firstPickSide === LEAGUE_TEAM_RED ? LEAGUE_TEAM_RED : LEAGUE_TEAM_BLUE,
    currentStep,
    selections,
    bluePickOrder: normalizeLeaguePickOrder(value?.bluePickOrder),
    redPickOrder: normalizeLeaguePickOrder(value?.redPickOrder),
    timerSeconds: Math.max(5, Math.min(120, number(value?.timerSeconds, timerSeconds))),
    timeRemaining: Math.max(0, Math.min(120, number(value?.timeRemaining, timerSeconds))),
    timerRunning: false, // Retired timer; ignore running state in older saved drafts.
  };
}

export function draftSlots(draft, mode) {
  const slots = {
    bluePicks: Array(5).fill(""), redPicks: Array(5).fill(""),
    blueBans: Array(5).fill(""), redBans: Array(5).fill(""),
  };
  leagueDraftSteps(mode, draft?.firstPickSide).forEach((step) => {
    const champion = text(draft?.selections?.[step.index]);
    const side = step.side === LEAGUE_TEAM_BLUE ? "blue" : "red";
    const key = `${side}${step.action === "pick" ? "Picks" : "Bans"}`;
    slots[key][step.slot] = champion;
  });
  return slots;
}

export function fearlessChampionSet(games, bestOf, currentGame = Infinity) {
  return new Set((games ?? []).filter((game) => bestOf === undefined || (
    game?.gameNumber >= 1 && game.gameNumber <= leagueGameLimit(bestOf) && game.gameNumber < currentGame
  )).flatMap((game) => [
    ...(game?.bluePicks ?? []),
    ...(game?.redPicks ?? []),
  ]).map(text).filter(Boolean));
}

/** Refuse to advance fearless history with missing or repeated champions. */
export function leagueFearlessResultError(league) {
  if (league.draftMode !== "fearless") return "";
  const slots = draftSlots(league.draft, league.draftMode);
  const used = new Set();
  for (let index = 0; index < leagueGameLimit(league.bestOf); index += 1) {
    const result = league.results?.[index];
    if (!result?.winner) continue;
    const gameNumber = index + 1;
    const existing = league.confirmedGames?.find((game) => game.gameNumber === gameNumber);
    const hasPicks = (game) => [...(game?.bluePicks ?? []), ...(game?.redPicks ?? [])].some(Boolean);
    const source = hasPicks(result) ? result
      : gameNumber === league.currentGame && hasPicks(slots) ? slots : existing;
    const picks = [...(source?.bluePicks ?? []), ...(source?.redPicks ?? [])].map(text);
    if (picks.length !== 10 || picks.some((pick) => !pick)) {
      return `Game ${gameNumber}: record all ten champion picks before saving a fearless result.`;
    }
    const normalized = picks.map((pick) => pick.toLowerCase());
    if (new Set(normalized).size !== 10 || normalized.some((pick) => used.has(pick))) {
      return `Game ${gameNumber}: a champion is repeated in this game or an earlier game. Correct the picks before saving.`;
    }
    normalized.forEach((pick) => used.add(pick));
  }
  return "";
}

export function lockLeagueDraftSelection(draftValue, champion, unavailable = new Set(), mode) {
  const draft = normalizeLeagueDraft(draftValue, draftValue?.timerSeconds);
  const selected = text(champion);
  if (!selected || draft.currentStep >= LEAGUE_DRAFT_STEPS.length) return { changed: false, reason: "Select a champion", draft };
  const normalized = selected.toLowerCase();
  const steps = leagueDraftSteps(mode, draft.firstPickSide);
  const current = steps[draft.currentStep];
  if (draft.selections.some((value, index) => text(value).toLowerCase() === normalized
    && !(mode === "online" && current.action === "ban" && steps[index].action === "ban" && steps[index].side !== current.side))) return { changed: false, reason: "Champion already used in this draft", draft };
  if ([...unavailable].some((value) => text(value).toLowerCase() === normalized)) return { changed: false, reason: "Champion is unavailable under fearless rules", draft };
  const selections = [...draft.selections];
  selections[draft.currentStep] = selected;
  const currentStep = draft.currentStep + 1;
  return {
    changed: true,
    draft: {
      ...draft,
      selections,
      currentStep,
      timeRemaining: draft.timerSeconds,
      timerRunning: currentStep < LEAGUE_DRAFT_STEPS.length && draft.timerRunning,
    },
  };
}

export function undoLeagueDraftSelection(draftValue) {
  const draft = normalizeLeagueDraft(draftValue, draftValue?.timerSeconds);
  if (draft.currentStep <= 0) return draft;
  const currentStep = draft.currentStep - 1;
  const selections = [...draft.selections];
  selections[currentStep] = "";
  return { ...draft, currentStep, selections, timeRemaining: draft.timerSeconds, timerRunning: false };
}

export function calculateLeagueSeries(games) {
  return (games ?? []).reduce((score, game) => {
    if (game?.winner === "team1") score.teamOne += 1;
    if (game?.winner === "team2") score.teamTwo += 1;
    return score;
  }, { teamOne: 0, teamTwo: 0 });
}

export function leagueGameLimit(bestOf) {
  if (bestOf === "Bo1") return 1;
  if (bestOf === "Bo5") return 5;
  return 3;
}

export function calculateLeagueCurrentGame(games, bestOf = "Bo3") {
  const gameLimit = leagueGameLimit(bestOf);
  const saved = (games ?? []).filter((game) => (
    Number.isInteger(game?.gameNumber)
    && game.gameNumber >= 1
    && game.gameNumber <= gameLimit
    && ["team1", "team2"].includes(game.winner)
  ));
  const score = calculateLeagueSeries(saved);
  const winsNeeded = Math.ceil(gameLimit / 2);
  const seriesComplete = score.teamOne >= winsNeeded || score.teamTwo >= winsNeeded;
  if (seriesComplete) return Math.max(1, ...saved.map((game) => game.gameNumber));
  const savedNumbers = new Set(saved.map((game) => game.gameNumber));
  for (let gameNumber = 1; gameNumber <= gameLimit; gameNumber += 1) {
    if (!savedNumbers.has(gameNumber)) return gameNumber;
  }
  return gameLimit;
}

/** Preserve an operator choice until the current game or its saved previous winner changes. */
export function resolveLeagueFirstSelection(league, games = league.confirmedGames, bestOf = league.bestOf) {
  const currentGame = calculateLeagueCurrentGame(games, bestOf);
  const previousWinner = (records) => (records ?? []).find((game) => game.gameNumber === currentGame - 1)?.winner;
  const winner = previousWinner(games);
  if (currentGame === league.currentGame && winner === previousWinner(league.confirmedGames)
    && ["team1", "team2"].includes(league.firstSelectionTeam)) return league.firstSelectionTeam;
  return winner === "team1" ? "team2" : winner === "team2" ? "team1" : "";
}

export const LEAGUE_CHAMPION_STAT_KEYS = [
  "abilityHaste", "abilityPower", "armor", "armorPenetrationFlat", "armorPenetrationPercent",
  "attackDamage", "attackRange", "attackSpeed", "bonusArmorPenetrationPercent",
  "bonusMagicPenetrationPercent", "cooldownReduction", "critChance", "critDamage", "currentHealth",
  "healthRegenRate", "lifeSteal", "magicLethality", "magicPenetrationFlat", "magicPenetrationPercent",
  "magicResist", "maxHealth", "moveSpeed", "physicalLethality", "resourceMax", "resourceRegenRate",
  "resourceValue", "spellVamp", "tenacity",
];

function normalizeRune(rune) {
  if (!rune || typeof rune !== "object") return null;
  return {
    id: number(rune.id),
    displayName: text(rune.displayName),
    rawDescription: text(rune.rawDescription),
    rawDisplayName: text(rune.rawDisplayName),
  };
}

function normalizeRunes(runes) {
  const value = runes && typeof runes === "object" ? runes : {};
  return {
    keystone: normalizeRune(value.keystone),
    primaryRuneTree: normalizeRune(value.primaryRuneTree),
    secondaryRuneTree: normalizeRune(value.secondaryRuneTree),
    generalRunes: Array.isArray(value.generalRunes) ? value.generalRunes.map(normalizeRune).filter(Boolean) : [],
    statRunes: Array.isArray(value.statRunes) ? value.statRunes.map(normalizeRune).filter(Boolean) : [],
  };
}

function summonerSpellId(spell) {
  const rawDisplayName = text(spell?.rawDisplayName);
  return rawDisplayName.match(/SummonerSpell_(Summoner[A-Za-z0-9]+)(?:_|$)/)?.[1] || text(spell?.id);
}

function normalizeSummonerSpell(spell) {
  if (!spell || typeof spell !== "object") return null;
  return {
    id: summonerSpellId(spell),
    displayName: text(spell.displayName),
    rawDescription: text(spell.rawDescription),
    rawDisplayName: text(spell.rawDisplayName),
  };
}

function normalizeItem(item) {
  return {
    id: number(item?.itemID ?? item?.id),
    name: text(item?.displayName ?? item?.name),
    canUse: boolean(item?.canUse),
    consumable: boolean(item?.consumable),
    count: Math.max(1, number(item?.count, 1)),
    price: number(item?.price),
    rawDescription: text(item?.rawDescription),
    rawDisplayName: text(item?.rawDisplayName),
    slot: number(item?.slot, -1),
  };
}

function normalizePlayer(player) {
  const scores = player?.scores && typeof player.scores === "object" ? player.scores : {};
  const riotId = text(player?.riotId) || text(player?.summonerName);
  const riotIdGameName = text(player?.riotIdGameName) || riotId.split("#")[0];
  return {
    riotId,
    riotIdGameName,
    riotIdTagLine: text(player?.riotIdTagLine) || riotId.split("#")[1] || "",
    summonerName: text(player?.summonerName),
    displayName: riotIdGameName || "Player",
    champion: text(player?.championName),
    championAssetId: leagueChampionAssetId(text(player?.championName)),
    rawChampionName: text(player?.rawChampionName),
    team: player?.team === LEAGUE_TEAM_RED ? LEAGUE_TEAM_RED : LEAGUE_TEAM_BLUE,
    position: text(player?.position),
    level: number(player?.level),
    isBot: boolean(player?.isBot),
    isDead: boolean(player?.isDead),
    respawnTimer: Math.max(0, number(player?.respawnTimer)),
    skinId: number(player?.skinID ?? player?.skinId),
    kills: number(scores.kills),
    deaths: number(scores.deaths),
    assists: number(scores.assists),
    creepScore: number(scores.creepScore),
    wardScore: number(scores.wardScore),
    items: Array.isArray(player?.items) ? player.items.slice(0, 7).map(normalizeItem) : [],
    runes: normalizeRunes(player?.runes),
    summonerSpells: [player?.summonerSpells?.summonerSpellOne, player?.summonerSpells?.summonerSpellTwo]
      .map(normalizeSummonerSpell)
      .filter(Boolean),
  };
}

function normalizeAbility(ability) {
  if (!ability || typeof ability !== "object") return null;
  return {
    abilityLevel: number(ability.abilityLevel),
    displayName: text(ability.displayName),
    id: text(ability.id),
    rawDescription: text(ability.rawDescription),
    rawDisplayName: text(ability.rawDisplayName),
  };
}

function normalizeActivePlayer(activePlayer) {
  if (!activePlayer || typeof activePlayer !== "object") return null;
  const abilities = {};
  Object.entries(activePlayer.abilities ?? {}).forEach(([slot, ability]) => {
    const normalized = normalizeAbility(ability);
    if (normalized) abilities[slot] = normalized;
  });
  const championStats = {};
  LEAGUE_CHAMPION_STAT_KEYS.forEach((key) => { championStats[key] = number(activePlayer.championStats?.[key]); });
  championStats.resourceType = text(activePlayer.championStats?.resourceType);
  const riotId = text(activePlayer.riotId) || text(activePlayer.summonerName);
  return {
    riotId,
    riotIdGameName: text(activePlayer.riotIdGameName) || riotId.split("#")[0],
    riotIdTagLine: text(activePlayer.riotIdTagLine) || riotId.split("#")[1] || "",
    summonerName: text(activePlayer.summonerName),
    level: number(activePlayer.level),
    currentGold: Math.max(0, number(activePlayer.currentGold)),
    abilities,
    championStats,
    fullRunes: normalizeRunes(activePlayer.fullRunes),
  };
}

function teamForEvent(event, playerTeams) {
  const direct = text(event?.Team || event?.team || event?.WinningTeam || event?.winningTeam || event?.AcingTeam || event?.acingTeam).toUpperCase();
  if ([LEAGUE_TEAM_BLUE, "BLUE", "100"].includes(direct)) return LEAGUE_TEAM_BLUE;
  if ([LEAGUE_TEAM_RED, "RED", "200"].includes(direct)) return LEAGUE_TEAM_RED;
  const actor = text(event?.KillerName || event?.killerName || event?.Recipient || event?.recipient || event?.Acer || event?.acer);
  // Minion last hits still credit the attacking team, not the destroyed tower's side.
  const turret = text(event?.TurretKilled || event?.turretKilled);
  if (/^Turret_T(?:Chaos|2)_/i.test(turret)) return LEAGUE_TEAM_BLUE;
  if (/^Turret_T(?:Order|1)_/i.test(turret)) return LEAGUE_TEAM_RED;
  if (/^Minion_T100/i.test(actor)) return LEAGUE_TEAM_BLUE;
  if (/^Minion_T200/i.test(actor)) return LEAGUE_TEAM_RED;
  return playerTeams.get(actor) || null;
}

export function normalizeLeagueLiveFeed({ playerlist = [], gamestats = {}, eventdata = {} } = {}, previous = null, now = new Date()) {
  const input = arguments[0] ?? {};
  const allGameData = input.allgamedata && typeof input.allgamedata === "object" ? input.allgamedata : {};
  const livePlayerlist = Array.isArray(allGameData.allPlayers) ? allGameData.allPlayers : playerlist;
  const liveGamestats = allGameData.gameData && typeof allGameData.gameData === "object" ? allGameData.gameData : gamestats;
  const liveEventdata = allGameData.events && typeof allGameData.events === "object" ? allGameData.events : eventdata;
  const players = Array.isArray(livePlayerlist) ? livePlayerlist.map(normalizePlayer) : [];
  const activePlayer = normalizeActivePlayer(allGameData.activePlayer ?? input.activeplayer ?? null);
  const playerTeams = new Map();
  players.forEach((player) => {
    playerTeams.set(player.riotId, player.team);
    playerTeams.set(player.displayName, player.team);
    if (player.summonerName) playerTeams.set(player.summonerName, player.team);
  });
  // Riot returns the complete event list. Reusing old IDs across games or replay
  // seeks must not carry old objectives and GameEnd into the current snapshot.
  const hasEventSnapshot = Array.isArray(liveEventdata?.Events);
  const clockRewound = number(liveGamestats?.gameTime) < number(previous?.game?.gameTime);
  const seen = new Map((hasEventSnapshot || clockRewound ? [] : previous?.events ?? []).map((event) => [event.id, event]));
  const rawEvents = Array.isArray(liveEventdata?.Events) ? liveEventdata.Events : [];
  rawEvents.forEach((event, index) => {
    const id = String(event?.EventID ?? event?.eventId ?? `${text(event?.EventName)}-${number(event?.EventTime)}-${index}`);
    seen.set(id, {
      id,
      name: text(event?.EventName || event?.eventName),
      time: number(event?.EventTime ?? event?.eventTime),
      team: teamForEvent(event, playerTeams),
      killerName: text(event?.KillerName ?? event?.killerName),
      victimName: text(event?.VictimName ?? event?.victimName),
      recipient: text(event?.Recipient ?? event?.recipient),
      assisters: Array.isArray(event?.Assisters ?? event?.assisters) ? (event.Assisters ?? event.assisters).map(text).filter(Boolean) : [],
      dragonType: text(event?.DragonType ?? event?.dragonType),
      stolen: boolean(event?.Stolen ?? event?.stolen),
      turretKilled: text(event?.TurretKilled ?? event?.turretKilled),
      inhibKilled: text(event?.InhibKilled ?? event?.inhibKilled),
      inhibRespawned: text(event?.InhibRespawned ?? event?.inhibRespawned),
      killStreak: number(event?.KillStreak ?? event?.killStreak),
      acer: text(event?.Acer ?? event?.acer),
      acingTeam: text(event?.AcingTeam ?? event?.acingTeam),
      result: text(event?.Result ?? event?.result),
      winningTeam: text(event?.WinningTeam ?? event?.winningTeam),
    });
  });
  const events = [...seen.values()].sort((a, b) => a.time - b.time);
  const objectives = {
    [LEAGUE_TEAM_BLUE]: { dragons: 0, elementalDragons: 0, dragonSoul: null, barons: 0, heralds: 0, grubs: 0, towers: 0 },
    [LEAGUE_TEAM_RED]: { dragons: 0, elementalDragons: 0, dragonSoul: null, barons: 0, heralds: 0, grubs: 0, towers: 0 },
  };
  events.forEach((event) => {
    if (!event.team || !objectives[event.team]) return;
    const name = event.name.toLowerCase();
    if (name === "hordekill") objectives[event.team].grubs += 1;
    if (name.includes("dragon") && name.includes("kill")) {
      const counts = objectives[event.team];
      counts.dragons += 1;
      const element = event.dragonType.toLowerCase();
      if (["air", "cloud", "earth", "mountain", "fire", "infernal", "water", "ocean", "hextech", "chemtech"].includes(element)) {
        counts.elementalDragons += 1;
        if (counts.elementalDragons === 4 && !Object.values(objectives).some((side) => side.dragonSoul)) counts.dragonSoul = element;
      }
    }
    if (name.includes("baron") && name.includes("kill")) objectives[event.team].barons += 1;
    if ((name.includes("herald") || name.includes("rift herald")) && name.includes("kill")) objectives[event.team].heralds += 1;
    if (name.includes("turret") && (name.includes("kill") || name.includes("destroy"))) objectives[event.team].towers += 1;
  });
  const endEvent = [...events].reverse().find((event) => event.name.toLowerCase() === "gameend");
  let winnerTeam = endEvent ? teamForEvent(endEvent, playerTeams) : null;
  if (!winnerTeam && endEvent && activePlayer) {
    const activeTeam = playerTeams.get(activePlayer.riotId) || playerTeams.get(activePlayer.riotIdGameName);
    if (activeTeam && endEvent.result.toLowerCase() === "win") winnerTeam = activeTeam;
    if (activeTeam && endEvent.result.toLowerCase() === "lose") winnerTeam = activeTeam === LEAGUE_TEAM_BLUE ? LEAGUE_TEAM_RED : LEAGUE_TEAM_BLUE;
  }
  return {
    connection: { connected: true, lastEventAt: now.toISOString(), stale: false },
    game: {
      active: players.length > 0,
      finished: Boolean(endEvent),
      gameTime: Math.max(0, number(liveGamestats?.gameTime)),
      gameMode: text(liveGamestats?.gameMode),
      mapName: text(liveGamestats?.mapName),
      mapNumber: number(liveGamestats?.mapNumber),
      mapTerrain: text(liveGamestats?.mapTerrain),
      winnerTeam,
    },
    activePlayer,
    players,
    events: events.slice(-500),
    objectives,
  };
}

export function createEmptyLeagueLiveFeed() {
  return {
    connection: { connected: false, lastEventAt: null, stale: false },
    game: { active: false, finished: false, gameTime: 0, gameMode: "", mapName: "", mapNumber: 0, mapTerrain: "", winnerTeam: null },
    activePlayer: null, players: [], events: [],
    objectives: {
      [LEAGUE_TEAM_BLUE]: { dragons: 0, elementalDragons: 0, dragonSoul: null, barons: 0, heralds: 0, grubs: 0, towers: 0 },
      [LEAGUE_TEAM_RED]: { dragons: 0, elementalDragons: 0, dragonSoul: null, barons: 0, heralds: 0, grubs: 0, towers: 0 },
    },
  };
}

function debugRune(id, displayName, rawName = displayName.replace(/[^A-Za-z0-9]/g, "")) {
  return { id, displayName, rawDescription: `perk_tooltip_${rawName}`, rawDisplayName: `perk_displayname_${rawName}` };
}

function debugRunes(index, full = false) {
  const keystones = [debugRune(8021, "Fleet Footwork"), debugRune(8010, "Conqueror"), debugRune(8214, "Summon Aery"), debugRune(8008, "Lethal Tempo"), debugRune(8439, "Aftershock")];
  const value = {
    keystone: keystones[index % keystones.length],
    primaryRuneTree: debugRune(index % 2 ? 8000 : 8200, index % 2 ? "Precision" : "Sorcery"),
    secondaryRuneTree: debugRune(index % 2 ? 8300 : 8400, index % 2 ? "Inspiration" : "Resolve"),
  };
  if (!full) return value;
  return {
    ...value,
    generalRunes: [value.keystone, debugRune(9111, "Triumph"), debugRune(9104, "Legend: Alacrity"), debugRune(8014, "Coup de Grace"), debugRune(8304, "Magical Footwear"), debugRune(8347, "Cosmic Insight")],
    statRunes: [debugRune(5005, "Attack Speed"), debugRune(5008, "Adaptive Force"), debugRune(5001, "Health Scaling")],
  };
}

function debugSpell(displayName, id) {
  return {
    displayName,
    rawDescription: `GeneratedTip_SummonerSpell_${id}_Description`,
    rawDisplayName: `GeneratedTip_SummonerSpell_${id}_DisplayName`,
  };
}

function debugItem(itemID, displayName, slot, price, { consumable = false, count = 1 } = {}) {
  return {
    canUse: true, consumable, count, displayName, itemID, price, slot,
    rawDescription: `game_item_description_${itemID}`, rawDisplayName: `game_item_displayname_${itemID}`,
  };
}

export function createLeagueDebugFeed(scenario = "live", now = new Date()) {
  const roles = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
  const champions = ["Gnar", "Vi", "Ahri", "Jinx", "Nautilus", "Renekton", "Sejuani", "Orianna", "Kai'Sa", "Rakan"];
  const itemPool = [
    [1055, "Doran's Blade", 0, 450], [6672, "Kraken Slayer", 1, 3100], [3006, "Berserker's Greaves", 2, 1100],
    [1038, "B. F. Sword", 3, 1300], [1042, "Dagger", 4, 250], [2003, "Health Potion", 5, 50, { consumable: true, count: 2 }],
    [3340, "Warding Totem (Trinket)", 6, 0],
  ];
  const allPlayers = champions.map((champion, index) => {
    const gameName = `Player ${index + 1}`;
    const riotId = `${gameName}#GO`;
    const secondarySpell = index % 5 === 1 ? ["Smite", "SummonerSmite"] : index % 5 === 4 ? ["Ignite", "SummonerDot"] : ["Teleport", "SummonerTeleport"];
    return {
      riotId, riotIdGameName: gameName, riotIdTagLine: "GO", summonerName: riotId,
      championName: champion, rawChampionName: `game_character_displayname_${leagueChampionAssetId(champion)}`,
      team: index < 5 ? LEAGUE_TEAM_BLUE : LEAGUE_TEAM_RED, position: roles[index % 5], level: 13 + (index % 3),
      isBot: false, isDead: index === 8, respawnTimer: index === 8 ? 18.4 : 0, skinID: index,
      scores: { kills: index % 4, deaths: (index + 1) % 4, assists: 3 + index, creepScore: 118 + index * 12, wardScore: 8.5 + index },
      items: itemPool.map(([itemID, name, slot, price, options]) => debugItem(itemID, name, slot, price, options)),
      runes: debugRunes(index),
      summonerSpells: { summonerSpellOne: debugSpell("Flash", "SummonerFlash"), summonerSpellTwo: debugSpell(secondarySpell[0], secondarySpell[1]) },
    };
  });
  const active = allPlayers[0];
  const ability = (slot, displayName, level) => ({ abilityLevel: level, displayName, id: `Gnar${slot}`, rawDescription: `GeneratedTip_Spell_Gnar${slot}_Description`, rawDisplayName: `GeneratedTip_Spell_Gnar${slot}_DisplayName` });
  const championStats = Object.fromEntries(LEAGUE_CHAMPION_STAT_KEYS.map((key, index) => [key, Number((25 + index * 4.75).toFixed(2))]));
  championStats.currentHealth = 1764; championStats.maxHealth = 2210; championStats.resourceMax = 100; championStats.resourceValue = 62; championStats.resourceType = "GNAR_FURY";
  const events = [
    { EventID: 0, EventName: "GameStart", EventTime: 0.03 },
    { EventID: 1, EventName: "MinionsSpawning", EventTime: 65 },
    { EventID: 2, EventName: "FirstBrick", EventTime: 760, KillerName: "Player 4#GO" },
    { EventID: 3, EventName: "TurretKilled", EventTime: 760, TurretKilled: "Turret_T2_L_03_A", KillerName: "Player 4#GO", Assisters: ["Player 3#GO"] },
    { EventID: 4, EventName: "InhibKilled", EventTime: 1320, InhibKilled: "Barracks_T2_R1", KillerName: "Player 1#GO", Assisters: ["Player 2#GO"] },
    { EventID: 5, EventName: "DragonKill", EventTime: 620, DragonType: "Earth", Stolen: "False", KillerName: "Player 2#GO", Assisters: ["Player 3#GO"] },
    { EventID: 6, EventName: "HeraldKill", EventTime: 850, Stolen: "True", KillerName: "Player 7#GO", Assisters: ["Player 8#GO"] },
    { EventID: 7, EventName: "BaronKill", EventTime: 1240, Stolen: "False", KillerName: "Player 2#GO", Assisters: ["Player 1#GO", "Player 3#GO"] },
    { EventID: 8, EventName: "ChampionKill", EventTime: 1410, VictimName: "Player 9#GO", KillerName: "Player 1#GO", Assisters: ["Player 2#GO"] },
    { EventID: 9, EventName: "Multikill", EventTime: 1414, KillerName: "Player 1#GO", KillStreak: 2 },
    { EventID: 10, EventName: "Ace", EventTime: 1420, Acer: "Player 1#GO", AcingTeam: LEAGUE_TEAM_BLUE },
    { EventID: 11, EventName: "InhibRespawned", EventTime: 1450, InhibRespawned: "Barracks_T2_R1" },
    { EventID: 12, EventName: "FirstBlood", EventTime: 310, KillerName: "Player 6#GO", VictimName: "Player 1#GO" },
    { EventID: 13, EventName: "DragonKill", EventTime: 1180, DragonType: "Elder", Stolen: "False", KillerName: "Player 7#GO", Assisters: ["Player 8#GO"] },
    { EventID: 14, EventName: "Multikill", EventTime: 1415, KillerName: "Player 1#GO", KillStreak: 3 },
    { EventID: 15, EventName: "Multikill", EventTime: 1416, KillerName: "Player 1#GO", KillStreak: 4 },
    { EventID: 16, EventName: "Multikill", EventTime: 1417, KillerName: "Player 1#GO", KillStreak: 5 },
  ];
  if (scenario === "finished") events.push({ EventID: 17, EventName: "GameEnd", EventTime: 1888, Result: "Win", WinningTeam: LEAGUE_TEAM_BLUE });
  const feed = normalizeLeagueLiveFeed({
    allgamedata: {
      activePlayer: {
        riotId: active.riotId, riotIdGameName: active.riotIdGameName, riotIdTagLine: active.riotIdTagLine, summonerName: active.summonerName,
        level: active.level, currentGold: 1432.5,
        abilities: { Passive: ability("Passive", "Rage Gene", 0), Q: ability("Q", "Boomerang Throw", 5), W: ability("W", "Hyper", 3), E: ability("E", "Hop", 1), R: ability("R", "GNAR!", 2) },
        championStats, fullRunes: debugRunes(0, true),
      },
      allPlayers,
      events: { Events: events },
      gameData: { gameMode: "CLASSIC", gameTime: scenario === "finished" ? 1888 : 1487, mapName: "Map11", mapNumber: 11, mapTerrain: "Default" },
    },
  }, null, now);
  if (scenario !== "stale") return feed;
  return {
    ...feed,
    connection: { connected: false, lastEventAt: new Date(now.getTime() - 11_000).toISOString(), stale: true },
  };
}

export function buildLeagueOverlayState(league, teamOne, teamTwo, leagueBrand = {}, sponsors = [], options = {}) {
  const gameLimit = leagueGameLimit(league.bestOf);
  const confirmedGames = (league.confirmedGames ?? []).filter((game) => game?.gameNumber >= 1 && game.gameNumber <= gameLimit);
  const score = calculateLeagueSeries(confirmedGames);
  const slots = draftSlots(league.draft, league.draftMode);
  const blueIsTeamOne = league.blueTeam !== "team2";
  const blueTeam = blueIsTeamOne ? teamOne : teamTwo;
  const redTeam = blueIsTeamOne ? teamTwo : teamOne;
  const team = (value, seriesScore) => ({
    name: text(value?.name) || "Team",
    standing: text(value?.standing), logo: text(value?.logo), color: text(value?.color) || "#F6AC18",
    logoBackground: text(value?.logoBackground) || "#FFFFFF", seriesScore: String(seriesScore),
  });
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    assetVersion: text(options.assetVersion) || "latest",
    header: resolveScoreboardHeader(league.scoreboardHeader, options.eventName),
    bestOf: league.bestOf,
    currentGame: calculateLeagueCurrentGame(confirmedGames, league.bestOf),
    draftMode: league.draftMode,
    // Kept for older payload consumers; the retired on-air player board stays disabled.
    playerBoardEnabled: false,
    sponsorWidgetEnabled: league.sponsorWidgetEnabled !== false,
    scoreboard: normalizeLeagueScoreboard(league.scoreboard),
    blueTeamKey: blueIsTeamOne ? "team1" : "team2",
    vsScreenEnabled: Boolean(league.vsScreenEnabled),
    debugLiveOverride: Boolean(league.debugLiveEnabled),
    debugLiveScenario: ["finished", "stale"].includes(league.debugLiveScenario) ? league.debugLiveScenario : "live",
    debugLive: league.debugLiveEnabled ? createLeagueDebugFeed(league.debugLiveScenario) : null,
    leaguePrimary: text(leagueBrand.primaryColor) || "#F6AC18",
    leagueSecondary: text(leagueBrand.secondaryColor) || "#47213F",
    leagueLogo: text(leagueBrand.logo) || "/gaming-oasis-favicon.png",
    teamOne: team(teamOne, score.teamOne),
    teamTwo: team(teamTwo, score.teamTwo),
    blueTeam: team(blueTeam, blueIsTeamOne ? score.teamOne : score.teamTwo),
    redTeam: team(redTeam, blueIsTeamOne ? score.teamTwo : score.teamOne),
    draft: {
      firstPickSide: league.draft.firstPickSide === LEAGUE_TEAM_RED ? LEAGUE_TEAM_RED : LEAGUE_TEAM_BLUE,
      ...slots, currentStep: league.draft.currentStep, timer: league.draft.timeRemaining, timerRunning: league.draft.timerRunning,
      bluePickOrder: normalizeLeaguePickOrder(league.draft.bluePickOrder),
      redPickOrder: normalizeLeaguePickOrder(league.draft.redPickOrder),
    },
    result: league.resultProposal,
    confirmedGames,
    playerOverrides: league.playerOverrides || {},
    sponsors: (sponsors ?? []).filter((sponsor) => sponsor?.enabled && (text(sponsor.name) || text(sponsor.logo)))
      .map((sponsor) => ({ id: text(sponsor.id), name: text(sponsor.name), logo: text(sponsor.logo) })),
  };
}
