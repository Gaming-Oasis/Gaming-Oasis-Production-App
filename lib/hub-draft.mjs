import { createLeagueDraftState, leagueDraftSteps, leagueFirstPickSide, calculateLeagueCurrentGame } from "./league-of-legends.mjs";

const ROLES = ["top", "jungle", "mid", "bot", "support"];
const TEAM_KEYS = ["team1", "team2"];
const record = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v) => typeof v === "string" ? v.trim() : "";
const requireValue = (ok, message) => { if (!ok) throw new Error(message); };
const list = (v, name) => { requireValue(Array.isArray(v), `Invalid Hub ${name}`); return v; };

export function hubIdentity(payload) {
  const game = payload?.event?.gameTitle;
  const team1Id = text(payload?.match?.team1?.teamId);
  const team2Id = text(payload?.match?.team2?.teamId);
  return ["League of Legends", "VALORANT"].includes(game) && team1Id && team2Id && team1Id !== team2Id
    ? { game, team1Id, team2Id } : null;
}

export function emptyHubSource() { return { mode: "manual", matchId: "", collection: null }; }

export function hubEligibility(match, game) {
  if (!match?.syncedId || match.id.trim() !== match.syncedId) return "Sync Match 1 in Team Info first.";
  if (!match.hubIdentity) return "Sync Match 1 again to load its game and team IDs.";
  if (match.hubIdentity.game !== game) return `Match 1 is not a ${game} match.`;
  return "";
}

/** An operator reset discards imports but keeps Live off for the selected match. */
export function resetHubSource(match, key) {
  return { ...emptyHubSource(), matchId: hubEligibility(match, key === "valorant" ? "VALORANT" : "League of Legends") ? "" : match.syncedId };
}

/** Whitelist the public data we consume. Never persist rosters, capabilities, or private audit fields. */
export function normalizeHubCollection(payload, match) {
  const identity = hubIdentity(payload);
  const expected = match.hubIdentity;
  requireValue(identity && expected && identity.game === expected.game && identity.team1Id === expected.team1Id && identity.team2Id === expected.team2Id,
    "League Hub teams or game do not match synced Match 1. Sync Match 1 again.");
  requireValue(payload.match.id === match.syncedId, "League Hub returned a different match.");
  const draft = payload.draft;
  requireValue(record(draft) && typeof draft.required === "boolean", "League Hub draft data is unavailable.");
  requireValue(Number.isSafeInteger(draft.collectionRevision) && draft.collectionRevision >= 0, "Invalid Hub collection revision");
  const bestOf = payload.match.bestOf;
  requireValue((identity.game === "VALORANT" ? [3, 5] : [1, 3, 5]).includes(bestOf), "This Hub draft format is not supported.");
  const keyFor = (id, optional = false) => {
    if (optional && (id == null || id === "")) return null;
    const key = id === identity.team1Id ? "team1" : id === identity.team2Id ? "team2" : null;
    requireValue(key, "A Hub draft decision belongs to a different team.");
    return key;
  };
  const session = (value) => {
    if (value == null) return null;
    requireValue(record(value) && record(value.snapshot) && record(value.state), "Invalid Hub draft session");
    const { snapshot, state } = value;
    requireValue(new Set([snapshot.team1Id, snapshot.team2Id]).size === 2
      && [snapshot.team1Id, snapshot.team2Id].every((id) => [identity.team1Id, identity.team2Id].includes(id)) && snapshot.bestOf === bestOf,
      "Hub session teams or format do not match Match 1.");
    const kind = snapshot.profile?.kind ?? (snapshot.profile?.scope === "series" ? "maps" : "");
    requireValue(identity.game === "VALORANT" ? ["maps", "agents"].includes(kind) : kind === "champions", "Unsupported Hub draft profile");
    requireValue((kind === "agents" ? [1] : [1, 2]).includes(snapshot.profile.version), "Unsupported Hub draft profile version");
    requireValue(kind === "maps" || (Number.isInteger(snapshot.gameIndex) && snapshot.gameIndex >= 1 && snapshot.gameIndex <= bestOf), "Invalid Hub game index");
    const items = new Map(list(snapshot.items, "catalog").map((item) => {
      requireValue(record(item) && text(item.id) && text(item.name), "Invalid Hub catalog item");
      return [item.id, item.name];
    }));
    requireValue(items.size === snapshot.items.length, "Duplicate Hub catalog IDs");
    const name = (id) => { requireValue(items.has(id), "A Hub selection is missing from its catalog."); return items.get(id); };
    const roles = { A: keyFor(state.roles?.A, true), B: keyFor(state.roles?.B, true) };
    requireValue(!roles.A || roles.B && roles.A !== roles.B, "Invalid Hub draft team order");
    const history = list(value.history, "decision history");
    const bans = history.filter((action) => action.type === "ban").map((action) => ({ team: keyFor(action.teamId), name: name(action.itemId) }));
    const blueTeam = keyFor(state.league?.sides?.blue, true);
    const redTeam = keyFor(state.league?.sides?.red, true);
    requireValue(!blueTeam || redTeam && redTeam !== blueTeam, "Invalid Hub Blue/Red assignment");
    const mode = snapshot.profile?.availability === "fearless" ? "fearless" : "standard";
    const picks = { team1: [], team2: [] };
    const selections = [];
    const firstPickSide = leagueFirstPickSide(blueTeam, roles.A);
    if (kind === "champions") {
      requireValue(["standard", "fearless"].includes(snapshot.profile?.availability), "Unsupported Hub League rules");
      const steps = leagueDraftSteps(mode, firstPickSide);
      const decisions = history.filter((action) => ["pick", "ban"].includes(action.type));
      requireValue(decisions.length <= 20 && (!decisions.length || blueTeam && roles.A), "Incomplete Hub side/order setup");
      decisions.forEach((action, index) => {
        const team = keyFor(action.teamId);
        const side = team === blueTeam ? "ORDER" : "CHAOS";
        requireValue(steps[index].side === side && steps[index].action === action.type, "Unsupported Hub champion decision order");
        const champion = name(action.itemId);
        selections.push(champion);
        if (action.type === "pick") picks[team].push(champion);
      });
    }
    const maps = kind === "maps" ? list(state.maps, "maps").map((map) => {
      requireValue(Number.isInteger(map.mapNumber) && map.mapNumber >= 1 && map.mapNumber <= bestOf, "Invalid Hub map number");
      requireValue(map.startingSide == null || ["attack", "defense"].includes(map.startingSide), "Invalid Hub starting side");
      const choosingTeam = keyFor(map.sideChoiceByTeamId, true);
      requireValue(!map.startingSide || choosingTeam, "Missing Hub side-choice team");
      return { number: map.mapNumber, name: name(map.itemId), picker: keyFor(map.pickedByTeamId, true), decider: map.decider === true,
        choosingTeam, side: map.startingSide ?? "" };
    }).sort((a, b) => a.number - b.number) : [];
    requireValue(new Set(maps.map((map) => map.number)).size === maps.length, "Duplicate Hub map numbers");
    if (kind === "maps") {
      requireValue(bans.length <= (bestOf === 5 ? 2 : 4) && bans.every((ban, index) => ban.team === roles[index % 2 ? "B" : "A"]), "Unsupported Hub map ban order");
      requireValue(maps.every((map) => map.decider ? map.number === bestOf && !map.picker : map.number < bestOf && map.picker === roles[map.number % 2 ? "A" : "B"]), "Unsupported Hub map pick order");
      const selected = [...bans.map((ban) => ban.name), ...maps.map((map) => map.name)];
      requireValue(new Set(selected).size === selected.length, "Duplicate Hub map selections");
    }
    const assignment = kind === "champions" ? state.league : state.agents;
    const confirmed = (assignment?.finalConfirmedTeamIds ?? []).filter((id) => [identity.team1Id, identity.team2Id].includes(id));
    // Frozen version-1 League drafts predate player/role assignments.
    const hasAssignments = kind === "champions" ? snapshot.profile.version === 2 : kind === "agents";
    const revealed = hasAssignments && new Set(confirmed).size === 2 && (kind === "champions" || value.status === "complete");
    const players = new Map((value.assignmentPlayers ?? []).map((player) => [player.id, text(player.name)]));
    const lineups = { team1: [], team2: [] };
    const pickOrders = { team1: [0, 1, 2, 3, 4], team2: [0, 1, 2, 3, 4] };
    if (revealed) TEAM_KEYS.forEach((team) => {
      const teamId = identity[`${team}Id`];
      const rows = list(assignment.assignments?.[teamId], "revealed lineup");
      requireValue(rows.length === 5, "A revealed Hub lineup must contain five players.");
      const ordered = [...rows].sort((a, b) => kind === "champions" ? ROLES.indexOf(a.role) - ROLES.indexOf(b.role) : a.slot - b.slot);
      ordered.forEach((row, index) => {
        requireValue(kind === "champions" ? row.role === ROLES[index] : row.slot === index + 1, "Invalid Hub lineup order");
        const item = name(kind === "champions" ? row.championId : row.agentId);
        lineups[team].push({ position: kind === "champions" ? ["Top", "Jungle", "Mid", "Bot/ADC", "Support"][index] : `Slot ${index + 1}`,
          item, player: row.missingPlayer ? "Missing player (approved)" : players.get(row.playerId) || "Player unavailable" });
        if (kind === "champions") {
          const pick = picks[team].indexOf(item);
          requireValue(pick >= 0, "A revealed champion was not picked by that team.");
          pickOrders[team][index] = pick;
        }
      });
      if (kind === "champions") requireValue(new Set(pickOrders[team]).size === 5, "Duplicate Hub champion assignments");
    });
    const stepType = value.currentStep?.type ?? "";
    const labels = { selection: "Waiting for sides and pick order", choose_role: "Waiting for Team A/B", set_priority: "Waiting for priority team",
      confirm_setup: "Waiting for setup confirmation", confirm_draft: "Waiting for both teams to confirm", report_agents: "Waiting for score and agent report",
      champion_pick: "Champion pick", pick: "Map pick", ban: "Ban", side: "Starting side", decider: "Decider selection" };
    return { id: text(value.id), gameIndex: kind === "maps" ? null : snapshot.gameIndex, kind, bestOf, mode, phase: text(value.status),
      progress: value.status === "complete" ? "Complete" : labels[stepType] || "Waiting for draft", activeSelection: ["champion_pick", "ban"].includes(stepType),
      blueTeam, firstPickTeam: roles.A, roles, selections, picks, pickOrders, bans, maps, revealed, lineups,
      confirmedTeams: [...new Set(confirmed.map((id) => keyFor(id)))],
      priorPicks: mode === "fearless" ? [...new Set(list(snapshot.priorGames ?? [], "prior games").filter((game) => {
        requireValue(record(game) && (game.gameIndex == null || Number.isInteger(game.gameIndex) && game.gameIndex >= 1), "Invalid Hub prior game");
        return game.gameIndex == null || game.gameIndex < snapshot.gameIndex;
      })
        .flatMap((game) => list(game.pickedItemIds, "prior picks").map(name)))] : [] };
  };
  const compatibility = session(draft.session);
  const sessions = list(draft.gameSessions ?? [], "game sessions").map(session);
  requireValue(sessions.every((s) => s && s.kind !== "maps"), "Invalid Hub game-session collection");
  requireValue(new Set(sessions.map((s) => s.gameIndex)).size === sessions.length, "Duplicate Hub game sessions");
  if (compatibility?.kind === "champions" && !sessions.some((s) => s.gameIndex === compatibility.gameIndex)) sessions.push(compatibility);
  const active = session(draft.currentSession);
  if (active && active.kind !== "maps" && !sessions.some((s) => s.gameIndex === active.gameIndex)) sessions.push(active);
  const games = list(payload.games ?? [], "results").map((game) => {
    requireValue([game.team1Score, game.team2Score].every((n) => Number.isInteger(n) && n >= 0), "Invalid Hub reference score");
    return { team1: game.team1Score, team2: game.team2Score };
  });
  requireValue(draft.currentGameIndex == null || Number.isInteger(draft.currentGameIndex) && draft.currentGameIndex >= 1 && draft.currentGameIndex <= bestOf, "Invalid Hub current game");
  return { matchId: match.syncedId, identity, revision: draft.collectionRevision, required: draft.required, bestOf,
    currentGameIndex: draft.currentGameIndex ?? null, games,
    veto: draft.required && compatibility?.kind === "maps" ? compatibility : null,
    sessions: draft.required ? sessions.sort((a, b) => a.gameIndex - b.gameIndex) : [] };
}

export function selectHubSession(collection, gameNumber) {
  return collection?.sessions.find((session) => session.gameIndex === gameNumber) ?? null;
}

/** Preserve the five-slot legacy result shape even when a Standard draft is incomplete. */
export function hubLeagueResultMetadata(collection, gameNumber) {
  const session = selectHubSession(collection, gameNumber);
  if (!session?.blueTeam || session.kind !== "champions") return null;
  const blue = session.blueTeam;
  const pad = (picks) => Array.from({ length: 5 }, (_, index) => picks[index] || "");
  return { bluePicks: pad(session.picks[blue]), redPicks: pad(session.picks[blue === "team1" ? "team2" : "team1"]),
    blueTeam: blue, firstPickTeam: session.firstPickTeam || undefined };
}

/** Validate the normalized public projection on reload before reconciling Match 1. */
export function hydrateHubSource(value) {
  if (!record(value)) return emptyHubSource();
  if (value.collection === null && text(value.matchId)) return { mode: value.mode === "live" ? "live" : "manual", matchId: value.matchId, collection: null };
  if (!record(value.collection)) return emptyHubSource();
  const c = value.collection;
  try {
    const team = (key) => TEAM_KEYS.includes(key);
    const optionalTeam = (key) => key === null || team(key);
    const strings = (rows) => Array.isArray(rows) && rows.every((row) => typeof row === "string");
    const gameIndex = (index) => Number.isInteger(index) && index >= 1 && index <= c.bestOf;
    requireValue(text(c.matchId) && c.matchId === value.matchId && Number.isSafeInteger(c.revision) && c.revision >= 0, "Invalid saved Hub source");
    requireValue(record(c.identity) && ["VALORANT", "League of Legends"].includes(c.identity.game) && text(c.identity.team1Id) && text(c.identity.team2Id)
      && c.identity.team1Id !== c.identity.team2Id && (c.identity.game === "VALORANT" ? [3, 5] : [1, 3, 5]).includes(c.bestOf), "Invalid saved Hub identity");
    requireValue(typeof c.required === "boolean" && (c.currentGameIndex === null || gameIndex(c.currentGameIndex))
      && list(c.games, "saved scores").every((g) => record(g) && [g.team1, g.team2].every((n) => Number.isInteger(n) && n >= 0)), "Invalid saved Hub collection");
    const sessions = list(c.sessions, "saved sessions");
    requireValue(sessions.every((s) => record(s) && gameIndex(s.gameIndex) && s.kind === (c.identity.game === "VALORANT" ? "agents" : "champions"))
      && new Set(sessions.map((s) => s.gameIndex)).size === sessions.length
      && (c.veto === null || c.identity.game === "VALORANT" && record(c.veto) && c.veto.kind === "maps" && c.veto.gameIndex === null), "Invalid saved Hub sessions");
    for (const s of [...sessions, ...(c.veto ? [c.veto] : [])]) {
      requireValue(["id", "phase", "progress"].every((key) => typeof s[key] === "string") && s.bestOf === c.bestOf && ["standard", "fearless"].includes(s.mode)
        && ["revealed", "activeSelection"].every((key) => typeof s[key] === "boolean") && optionalTeam(s.blueTeam) && optionalTeam(s.firstPickTeam)
        && strings(s.selections) && s.selections.length <= 20 && strings(s.priorPicks)
        && list(s.maps, "saved maps").every((m) => record(m) && gameIndex(m.number) && text(m.name) && optionalTeam(m.picker)
          && typeof m.decider === "boolean" && optionalTeam(m.choosingTeam) && ["", "attack", "defense"].includes(m.side))
        && list(s.bans, "saved bans").every((b) => record(b) && team(b.team) && text(b.name))
        && list(s.confirmedTeams, "saved confirmations").every(team)
        && record(s.roles) && record(s.pickOrders) && record(s.picks) && record(s.lineups)
        && [s.roles.A, s.roles.B].every(optionalTeam)
        && TEAM_KEYS.every((key) => strings(s.picks[key]) && s.picks[key].length <= 5
          && Array.isArray(s.pickOrders[key]) && s.pickOrders[key].length === 5 && new Set(s.pickOrders[key]).size === 5
          && s.pickOrders[key].every((n) => Number.isInteger(n) && n >= 0 && n < 5)
          && Array.isArray(s.lineups[key]) && s.lineups[key].length === (s.revealed ? 5 : 0)
          && s.lineups[key].every((row) => record(row) && ["position", "item", "player"].every((field) => typeof row[field] === "string"))), "Invalid saved Hub session");
    }
    return { mode: value.mode === "live" ? "live" : "manual", matchId: c.matchId, collection: c };
  } catch { return emptyHubSource(); }
}

export function projectHubGame(game, key) {
  const collection = game.hubDraft?.collection;
  if (game.hubDraft?.mode !== "live" || !collection) return game;
  const next = { ...game, bestOf: `Bo${collection.bestOf}` };
  if (key === "leagueOfLegends") {
    const currentGame = calculateLeagueCurrentGame(game.confirmedGames, next.bestOf);
    const session = selectHubSession(collection, currentGame);
    const blueTeam = session?.blueTeam ?? "team1";
    const draft = createLeagueDraftState(game.draft.timerSeconds, leagueFirstPickSide(blueTeam, session?.firstPickTeam));
    if (session) {
      draft.selections = Array.from({ length: 20 }, (_, i) => session.selections[i] || "");
      draft.currentStep = session.selections.length;
      if (session.revealed) {
        draft.bluePickOrder = session.pickOrders[blueTeam];
        draft.redPickOrder = session.pickOrders[blueTeam === "team1" ? "team2" : "team1"];
      }
    }
    Object.assign(next, { currentGame, draftMode: session?.mode ?? game.draftMode, sideControl: "draft", blueTeam,
      firstPickTeam: session?.firstPickTeam ?? "", draft,
      hubPresentation: { gameNumber: currentGame, progress: session?.progress ?? "Waiting for Hub draft", activeSelection: session?.activeSelection ?? false,
        rolesRevealed: session?.revealed ?? false, sidesReady: Boolean(session?.blueTeam), fearlessChampions: session?.priorPicks ?? [] } });
  } else {
    // A format correction/reset must not leave old imports in the inactive format.
    next.bo3 = Object.fromEntries(Object.keys(game.bo3).map((key) => [key, ""]));
    next.bo5 = Object.fromEntries(Object.keys(game.bo5).map((key) => [key, ""]));
    const veto = collection.veto;
    const isBo5 = collection.bestOf === 5;
    const target = isBo5 ? "bo5" : "bo3";
    const fields = next[target];
    const banSwap = veto?.roles.A === "team2";
    (veto?.bans ?? []).forEach((ban, i) => { fields[`ban${i + 1}`] = ban.name; });
    (veto?.maps ?? []).forEach((map) => {
      fields[map.decider ? "decider" : `pick${map.number}`] = map.name;
      // Legacy side fields describe the fixed A/B chooser. Convert the public owner's choice to that perspective.
      const chooserRole = (isBo5 ? ["B", "A", "B", "A", "B"] : ["B", "A", "A"])[map.number - 1];
      const legacyChooser = veto.roles[chooserRole];
      fields[`side${map.number}`] = !map.side ? "" : legacyChooser === map.choosingTeam ? map.side : map.side === "attack" ? "defense" : "attack";
    });
    Object.assign(next, { banSwap, [target]: fields });
  }
  return JSON.stringify(next) === JSON.stringify(game) ? game : next;
}

export function acceptHubCollection(game, key, collection) {
  const old = game.hubDraft?.collection;
  if (game.hubDraft?.mode !== "live" || game.hubDraft.matchId !== collection.matchId) return game;
  if (old?.matchId === collection.matchId && old.revision > collection.revision) return game;
  if (JSON.stringify(old) === JSON.stringify(collection)) return projectHubGame(game, key);
  return projectHubGame({ ...game, hubDraft: { ...game.hubDraft, collection } }, key);
}

/** Drop data bound to the old match without touching manually published results. */
export function clearHubGame(game, key) {
  if (!game.hubDraft?.matchId) return game;
  if (key === "leagueOfLegends") {
    // Imported history belongs to the old match; operator-entered winners remain untouched.
    const clearPicks = (rows) => rows?.length ? rows.map((row) => ({ ...row,
      bluePicks: Array(5).fill(""), redPicks: Array(5).fill(""), blueTeam: undefined, firstPickTeam: undefined,
    })) : rows;
    return { ...game, hubDraft: emptyHubSource(), hubPresentation: undefined,
      confirmedGames: clearPicks(game.confirmedGames), results: clearPicks(game.results),
      draft: createLeagueDraftState(game.draft.timerSeconds), firstPickTeam: "" };
  }
  return { ...game, hubDraft: emptyHubSource(), banSwap: false,
    bo3: Object.fromEntries(Object.keys(game.bo3).map((key) => [key, ""])), bo5: Object.fromEntries(Object.keys(game.bo5).map((key) => [key, ""])) };
}

export function setHubMode(game, key, mode, matchId) {
  if (mode === "manual") return { ...game, hubDraft: { ...game.hubDraft, mode },
    ...(key === "leagueOfLegends" ? { hubPresentation: undefined } : {}) };
  const hubDraft = game.hubDraft?.matchId === matchId ? { ...game.hubDraft, mode } : { mode, matchId, collection: null };
  return projectHubGame({ ...game, hubDraft }, key);
}

/** Start Live for a newly available Match 1; preserve an operator's Off choice for that match. */
export function reconcileHubMatch(game, key, match) {
  const reason = hubEligibility(match, key === "valorant" ? "VALORANT" : "League of Legends");
  const source = game.hubDraft;
  const changed = source.matchId && (source.matchId !== match.syncedId || reason
    || source.collection && JSON.stringify(source.collection.identity) !== JSON.stringify(match.hubIdentity));
  const next = changed ? clearHubGame(game, key) : game;
  if (reason) return next;
  if (!next.hubDraft.matchId) return setHubMode(next, key, "live", match.syncedId);
  return projectHubGame(next, key);
}
