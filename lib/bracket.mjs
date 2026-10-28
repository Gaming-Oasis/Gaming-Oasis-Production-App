import { shortTeamName } from "./team-name.mjs";

const HUB_ORIGIN = "https://hub.gamingoasis.gg";
const SLUG = /^[a-z0-9][a-z0-9_-]{0,159}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECTIONS = ["winners", "losers", "finals", "third_place"];
const record = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const text = (value, maximum = 240) => typeof value === "string" ? value.trim().slice(0, maximum) : "";
const number = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;
const sourceKey = (source) => JSON.stringify([source?.leagueSlug, source?.seasonSlug, source?.eventSlug, source?.stageId]);
const color = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value ?? "") ? value : fallback;
const logo = (value) => {
  try { const url = new URL(value); return url.protocol === "https:" ? url.href : ""; } catch { return ""; }
};

export function isBracketSource(value, stageRequired = true) {
  return Boolean(value && ["leagueSlug", "seasonSlug", "eventSlug"].every(key => SLUG.test(value[key] ?? ""))
    && (!stageRequired || UUID.test(value.stageId ?? "")));
}

export function parseBracketEventUrl(value) {
  let url;
  try { url = new URL(String(value).trim()); } catch { throw new Error("Paste a public League Hub event link."); }
  const match = url.pathname.match(/^\/portal\/([^/]+)\/seasons\/([^/]+)\/events\/([^/]+)\/?$/);
  if (url.origin !== HUB_ORIGIN || url.username || url.password || !match) throw new Error("Use a public event link from hub.gamingoasis.gg.");
  const source = { leagueSlug: match[1], seasonSlug: match[2], eventSlug: match[3], stageId: "" };
  if (!isBracketSource(source, false)) throw new Error("The Hub event link is invalid.");
  return source;
}

export function bracketEventPath(source) {
  if (!isBracketSource(source, false)) throw new Error("Invalid Hub event identity.");
  return `/api/portal/leagues/${source.leagueSlug}/seasons/${source.seasonSlug}/events/${source.eventSlug}`;
}

/** The public event page that parseBracketEventUrl accepts. */
export function bracketEventUrl(source) {
  return `${HUB_ORIGIN}${bracketEventPath(source).replace("/api/portal/leagues/", "/portal/")}`;
}

export function bracketStagePath(source) {
  if (!isBracketSource(source)) throw new Error("Select a published elimination stage.");
  return `${bracketEventPath(source)}/stages/${source.stageId}`;
}

/** Only these two fixed-host resources are available through the local proxy. */
export function parseBracketProxyPath(path) {
  const match = String(path).match(/^\/api\/portal\/leagues\/([^/]+)\/seasons\/([^/]+)\/events\/([^/]+)(?:\/stages\/([^/]+))?$/);
  if (!match) return null;
  const source = { leagueSlug: match[1], seasonSlug: match[2], eventSlug: match[3], stageId: match[4] || "" };
  return isBracketSource(source, Boolean(source.stageId)) ? source : null;
}

export function bracketSourceFromMatch(detail) {
  const source = { leagueSlug: detail?.league?.slug, seasonSlug: detail?.season?.slug, eventSlug: detail?.event?.slug, stageId: detail?.stage?.id };
  if (!isBracketSource(source)) throw new Error("Match 1 has no public event and stage information.");
  return source;
}

export function emptyBracketState(background = "transparent") {
  return { snapshot: null, section: "winners", view: "focus", roundStart: 0, page: 0, background: background === "solid" ? "solid" : "transparent", hold: false, autoRotate: false };
}

function sectionFor(match, round) {
  const label = `${round.roundLabel ?? ""} ${match.roundLabel ?? ""}`.toLowerCase();
  if (/third place|3rd place/.test(label)) return "third_place";
  if (match.bracket === "grand_finals" || /grand final|final.*reset/.test(label)) return "finals";
  if (match.bracket === "losers" || /losers/.test(label) || round.round < 0) return "losers";
  return "winners";
}

/** Keep only public fields used by the graphic; transport timestamps never enter state. */
export function normalizeBracketSnapshot(detail, workspace, source) {
  if (!isBracketSource(source) || detail?.league?.slug !== source.leagueSlug || detail?.season?.slug !== source.seasonSlug
    || detail?.event?.slug !== source.eventSlug || workspace?.stage?.id !== source.stageId) throw new Error("The Hub returned a different event or stage.");
  if (!["single_elimination", "double_elimination"].includes(workspace.stage.type)) throw new Error("Choose a single- or double-elimination stage.");
  if (!Array.isArray(workspace.rounds) || workspace.rounds.length > 256) throw new Error("The Hub returned invalid bracket rounds.");
  const catalog = new Map();
  let count = 0;
  for (const round of workspace.rounds) {
    if (!round || !Array.isArray(round.matches)) throw new Error("The Hub returned invalid bracket matches.");
    for (const match of round.matches) {
      if (!match || !text(match.id, 120) || catalog.has(match.id) || ++count > 1024) throw new Error("The Hub returned invalid or duplicate bracket matches.");
      catalog.set(match.id, match);
    }
  }
  const participant = (value, match, slot) => {
    const input = record(value);
    const feederId = text(match[`team${slot}PrereqMatchId`], 120);
    const feeder = catalog.get(feederId);
    const outcome = match[`team${slot}PrereqOutcome`] === "loser" ? "loser" : "winner";
    const teamId = text(input.teamId, 120);
    const deadFeeder = outcome === "loser" && feeder?.isBye === true;
    const feederLabel = feeder ? `${outcome === "loser" ? "Loser" : "Winner"} of M${feeder.matchNumber ?? feeder.id}` : "";
    return {
      teamId, name: teamId ? shortTeamName(text(input.name), text(detail.event.gameTitle)) || "Team awaiting name"
        : deadFeeder || match.isBye ? "Bye" : feederLabel || text(input.name) || "TBD",
      logo: teamId ? logo(input.logo) : "", seed: teamId ? number(input.seed) : null,
      score: number(input.score), result: ["win", "loss", "tie"].includes(input.result) ? input.result : "",
      feederId, feederOutcome: feederId ? outcome : "",
    };
  };
  const rounds = [];
  for (const [index, round] of workspace.rounds.entries()) {
    const groups = new Map();
    for (const match of round.matches) {
      const section = sectionFor(match, round);
      if (!groups.has(section)) groups.set(section, []);
      groups.get(section).push({
        id: text(match.id, 120), matchNumber: number(match.matchNumber),
        sortOrder: Number.isFinite(match.sortOrder) ? match.sortOrder : index,
        bestOf: number(match.bestOf), isBye: match.isBye === true,
        outcome: ["played", "forfeit", "dnf"].includes(match.matchOutcome) ? match.matchOutcome : "",
        team1: participant(match.team1, match, 1), team2: participant(match.team2, match, 2),
      });
    }
    for (const [section, matches] of groups) {
      matches.sort((a, b) => a.sortOrder - b.sortOrder || (a.matchNumber ?? Infinity) - (b.matchNumber ?? Infinity) || a.id.localeCompare(b.id));
      rounds.push({ key: `${section}:${index}`, section, label: text(round.roundLabel) || `Round ${index + 1}`, matches });
    }
  }
  const snapshot = {
    version: 1, source: { ...source },
    league: { name: text(detail.league.name), logo: logo(detail.league.logo), primaryColor: color(detail.league.primaryColor, "#F6AC18"), secondaryColor: color(detail.league.secondaryColor, "#47213F") },
    event: { name: text(detail.event.name), gameTitle: text(detail.event.gameTitle) },
    stage: { id: source.stageId, name: text(workspace.stage.name), type: workspace.stage.type, formatSummary: text(workspace.stage.formatSummary) },
    advancement: text(workspace.advancement?.label), rounds,
  };
  if (!isBracketSnapshot(snapshot)) throw new Error("The Hub returned invalid bracket data.");
  return snapshot;
}

const boundedText = (value, max = 240) => typeof value === "string" && value.length <= max;
function validParticipant(value) {
  return Boolean(value && ["teamId", "name", "logo", "feederId"].every(key => boundedText(value[key], key === "logo" ? 4096 : 240))
    && (value.seed === null || number(value.seed) !== null) && (value.score === null || number(value.score) !== null)
    && ["", "win", "loss", "tie"].includes(value.result) && ["", "winner", "loser"].includes(value.feederOutcome));
}

export function isBracketSnapshot(value) {
  if (!value || value.version !== 1 || !isBracketSource(value.source) || value.stage?.id !== value.source.stageId
    || !["single_elimination", "double_elimination"].includes(value.stage.type)
    || ![value.stage.name, value.stage.formatSummary, value.event?.name, value.event?.gameTitle, value.league?.name, value.advancement].every(v => boundedText(v))
    || !boundedText(value.league?.logo, 4096) || ![value.league.primaryColor, value.league.secondaryColor].every(v => /^#[0-9a-f]{6}$/i.test(v))
    || !Array.isArray(value.rounds) || value.rounds.length > 256) return false;
  const ids = new Set();
  return value.rounds.every(round => round && SECTIONS.includes(round.section) && boundedText(round.key) && boundedText(round.label)
    && Array.isArray(round.matches) && round.matches.every(match => {
      if (!match || !boundedText(match.id, 120) || !match.id || ids.has(match.id) || ids.size >= 1024) return false;
      ids.add(match.id);
      return (match.matchNumber === null || number(match.matchNumber) !== null) && Number.isFinite(match.sortOrder)
        && (match.bestOf === null || number(match.bestOf) !== null) && typeof match.isBye === "boolean"
        && ["", "played", "forfeit", "dnf"].includes(match.outcome) && validParticipant(match.team1) && validParticipant(match.team2);
    }));
}

export function hydrateBracketState(value) {
  const saved = record(value);
  return { snapshot: isBracketSnapshot(saved.snapshot) ? saved.snapshot : null,
    section: SECTIONS.includes(saved.section) ? saved.section : "winners", view: saved.view === "overview" ? "overview" : "focus",
    roundStart: number(saved.roundStart) ?? 0, page: number(saved.page) ?? 0,
    background: saved.background === "solid" ? "solid" : "transparent", hold: saved.hold === true, autoRotate: saved.autoRotate === true };
}

export function buildBracketOverlayState(state) {
  return { version: 1, ...hydrateBracketState(state) };
}

export function isBracketOverlayState(value) {
  return Boolean(value && value.version === 1 && (value.snapshot === null || isBracketSnapshot(value.snapshot))
    && SECTIONS.includes(value.section) && ["focus", "overview"].includes(value.view)
    && number(value.roundStart) !== null && number(value.page) !== null && ["transparent", "solid"].includes(value.background) && typeof value.hold === "boolean"
    && (value.autoRotate === undefined || typeof value.autoRotate === "boolean"));
}

export function acceptBracketSnapshot(state, snapshot, expectedSource) {
  if (state.hold || !isBracketSnapshot(snapshot) || sourceKey(snapshot.source) !== sourceKey(expectedSource)
    || sourceKey(state.snapshot?.source) !== sourceKey(expectedSource) || JSON.stringify(snapshot) === JSON.stringify(state.snapshot)) return state;
  return { ...state, snapshot };
}

export function bracketSections(snapshot) {
  return SECTIONS.filter(section => snapshot?.rounds.some(round => round.section === section)).map(id => ({ id,
    label: id === "winners" ? snapshot.stage.type === "single_elimination" ? "Main bracket" : "Winners bracket"
      : id === "losers" ? "Losers bracket" : id === "finals" ? "Grand finals / reset" : "Third place" }));
}

/** Feeder-based placement with bounded manual windows. No positional guesses create connectors. */
export function layoutBracket(state) {
  const snapshot = state.snapshot;
  const sections = bracketSections(snapshot);
  const section = sections.find(item => item.id === state.section) ?? sections[0];
  const rounds = snapshot?.rounds.filter(round => round.section === section?.id) ?? [];
  const canOverview = rounds.length <= 4 && rounds.every(round => round.matches.length <= 8);
  const overview = state.view === "overview" && canOverview;
  const start = overview ? 0 : Math.min(state.roundStart, Math.max(0, rounds.length - 1));
  const first = rounds[start]?.matches ?? [];
  const pageCount = overview ? 1 : Math.max(1, Math.ceil(first.length / 4));
  const page = overview ? 0 : Math.min(state.page, pageCount - 1);
  const selected = new Set();
  const columns = rounds.slice(start, start + 4).map((round, index) => {
    const matches = index === 0 ? overview ? round.matches : round.matches.slice(page * 4, page * 4 + 4)
      : overview || first.length <= 4 ? round.matches.slice(0, 8)
        : round.matches.filter(match => selected.has(match.team1.feederId) || selected.has(match.team2.feederId)).slice(0, 8);
    for (const match of matches) selected.add(match.id);
    return { ...round, matches };
  }).filter(column => column.matches.length);
  const maxRows = Math.max(1, ...columns.map(column => column.matches.length));
  const height = maxRows > 4 ? 76 : 132;
  const width = columns.length >= 4 ? 360 : 448;
  const gapX = columns.length <= 1 ? 0 : (1728 - width * columns.length) / (columns.length - 1);
  const cards = [];
  const byId = new Map();
  const headers = [];
  for (const [columnIndex, column] of columns.entries()) {
    const x = (columns.length === 1 ? (1920 - width) / 2 : 96) + columnIndex * (width + gapX);
    headers.push({ x, width, label: column.label });
    const count = column.matches.length;
    const gapY = count <= 1 ? 0 : (680 - count * height) / (count - 1);
    const entries = column.matches.map((match, index) => {
      const parents = [byId.get(match.team1.feederId), byId.get(match.team2.feederId)].filter(Boolean);
      const y = parents.length ? parents.reduce((sum, parent) => sum + parent.y + height / 2, 0) / parents.length - height / 2
        : count === 1 ? 624 - height / 2 : 284 + index * (height + gapY);
      return { match, x, y, width, height, column: columnIndex };
    });
    // Preserve match order and keep complete cards inside the safe area.
    for (let i = 0; i < entries.length; i++) entries[i].y = Math.max(284, entries[i].y, i ? entries[i - 1].y + height + 8 : 284);
    for (let i = entries.length - 1; i >= 0; i--) entries[i].y = Math.min(entries[i].y, i === entries.length - 1 ? 964 - height : entries[i + 1].y - height - 8);
    for (const entry of entries) { cards.push(entry); byId.set(entry.match.id, entry); }
  }
  const connectors = [];
  for (const card of cards) for (const participant of [card.match.team1, card.match.team2]) {
    const parent = byId.get(participant.feederId);
    if (!parent || parent.column >= card.column) continue;
    const x1 = parent.x + parent.width, y1 = parent.y + parent.height / 2;
    const x2 = card.x, y2 = card.y + card.height / 2;
    const mid = x2 - Math.min(gapX / 2, 80);
    connectors.push(`M${x1},${y1} H${mid} V${y2} H${x2}`);
  }
  // Advancement belongs under the stage's last published round: the finals when they exist, otherwise either bracket's end.
  const terminal = sections.some(item => item.id === "finals") ? ["finals"] : ["winners", "losers"];
  const last = columns.at(-1);
  const qualifier = terminal.includes(section?.id) && last?.key === rounds.at(-1)?.key && last.matches.length === 1
    ? byId.get(last.matches[0].id) ?? null : null;
  return { sections, section: section?.id ?? "winners", rounds, canOverview, overview, start, page, pageCount, cards, headers, connectors, qualifier,
    label: overview ? "Complete section" : `Section ${page + 1} of ${pageCount}` };
}
