import { fearlessChampionSet } from "./league-of-legends.mjs";
import { isLeagueScoreboard } from "./league-scoreboard.mjs";

export const LEAGUE_STALE_AFTER_MS = 10_000;
export const FEARLESS_PAGE_SIZE = 20;
export const FEARLESS_PAGE_MS = 15_000;

const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const finite = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const strings = (value, length) => Array.isArray(value) && value.length === length && value.every((entry) => typeof entry === "string");
const team = (value) => object(value) && ["name", "standing", "logo", "color", "logoBackground", "seriesScore"].every((key) => typeof value[key] === "string");
const pickOrder = (value) => value === undefined || (Array.isArray(value) && value.length === 5 && new Set(value).size === 5 && value.every((n) => Number.isInteger(n) && n >= 0 && n < 5));

/** Only accept complete renderable frames; optional additions support older writers. */
export function isLeagueOverlayData(value) {
  if (!object(value) || value.version !== 1) return false;
  if (value.scoreboard !== undefined && !isLeagueScoreboard(value.scoreboard)) return false;
  if (value.blueTeamKey !== undefined && !["team1", "team2"].includes(value.blueTeamKey)) return false;
  if (!["assetVersion", "header", "leaguePrimary", "leagueSecondary"].every((key) => typeof value[key] === "string")) return false;
  if (!["Bo1", "Bo3", "Bo5"].includes(value.bestOf) || !["standard", "online", "fearless"].includes(value.draftMode) || !finite(value.currentGame)) return false;
  if (value.leagueLogo !== undefined && typeof value.leagueLogo !== "string") return false;
  if (!team(value.blueTeam) || !team(value.redTeam)) return false;
  if (typeof value.sponsorWidgetEnabled !== "boolean" || typeof value.vsScreenEnabled !== "boolean") return false;
  if (!Array.isArray(value.sponsors) || !value.sponsors.every((sponsor) => object(sponsor) && ["id", "name", "logo"].every((key) => typeof sponsor[key] === "string"))) return false;
  const draft = value.draft;
  if (!object(draft) || !["bluePicks", "redPicks", "blueBans", "redBans"].every((key) => strings(draft[key], 5))) return false;
  if (draft.firstPickSide !== undefined && !["ORDER", "CHAOS"].includes(draft.firstPickSide)) return false;
  if (!finite(draft.timer) || !Number.isInteger(draft.currentStep) || draft.currentStep < 0 || draft.currentStep > 20) return false;
  if (!pickOrder(draft.bluePickOrder) || !pickOrder(draft.redPickOrder)) return false;
  if (!Array.isArray(value.confirmedGames) || !value.confirmedGames.every((game) => object(game) && finite(game.gameNumber) && strings(game.bluePicks, 5) && strings(game.redPicks, 5))) return false;
  const live = value.live;
  if (!object(live) || !object(live.connection) || typeof live.connection.connected !== "boolean" || typeof live.connection.stale !== "boolean") return false;
  if (!object(live.game) || !finite(live.game.gameTime) || !Array.isArray(live.players)) return false;
  if (!live.players.every((player) => object(player) && ["ORDER", "CHAOS"].includes(player.team) && finite(player.kills))) return false;
  return object(live.objectives) && ["ORDER", "CHAOS"].every((side) => object(live.objectives[side]) && (live.objectives[side].grubs === undefined || (Number.isInteger(live.objectives[side].grubs) && live.objectives[side].grubs >= 0)) && (live.objectives[side].elementalDragons === undefined || finite(live.objectives[side].elementalDragons)) && (live.objectives[side].dragonSoul == null || ["air", "cloud", "earth", "mountain", "fire", "infernal", "water", "ocean", "hextech", "chemtech"].includes(live.objectives[side].dragonSoul)) && ["towers", "dragons", "barons"].every((key) => finite(live.objectives[side][key])));
}

export function leagueLiveStatsAvailable(live, receivedAt, now = Date.now()) {
  if (!receivedAt || now - receivedAt >= LEAGUE_STALE_AFTER_MS || live?.connection?.stale || !live?.players?.length) return false;
  if (live.connection.connected) return true;
  const lastEventAt = Date.parse(live.connection.lastEventAt ?? "");
  return Number.isFinite(lastEventAt) && now - lastEventAt < LEAGUE_STALE_AFTER_MS;
}

export function leagueFearlessChampions(data) {
  if (data?.draftMode !== "fearless") return [];
  return [...fearlessChampionSet(
    [...(data.confirmedGames ?? [])].sort((a, b) => a.gameNumber - b.gameNumber),
    data.bestOf, data.currentGame,
  )];
}

export function leagueFearlessPage(champions, elapsedMs) {
  const pageCount = Math.max(1, Math.ceil(champions.length / FEARLESS_PAGE_SIZE));
  const page = Math.floor(Math.max(0, elapsedMs) / FEARLESS_PAGE_MS) % pageCount;
  return { page, pageCount, champions: champions.slice(page * FEARLESS_PAGE_SIZE, (page + 1) * FEARLESS_PAGE_SIZE) };
}
