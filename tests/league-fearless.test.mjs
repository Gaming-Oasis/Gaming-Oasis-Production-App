import assert from "node:assert/strict";
import test from "node:test";
import {
  createLeagueDraftState, draftSlots, fearlessChampionSet, leagueDraftSteps,
  leagueFearlessResultError, lockLeagueDraftSelection, normalizeLeagueDraft,
  undoLeagueDraftSelection, buildLeagueOverlayState,
  resolveLeagueFirstSelection,
} from "../lib/league-of-legends.mjs";
import { leagueFearlessChampions } from "../lib/league-overlay.mjs";

test("First Selection follows saved losers while preserving operator choices in the same game", () => {
  const initial = { bestOf: "Bo5", currentGame: 1, confirmedGames: [], firstSelectionTeam: "" };
  assert.equal(resolveLeagueFirstSelection(initial), "");
  const chosen = { ...initial, firstSelectionTeam: "team1" };
  assert.equal(resolveLeagueFirstSelection(JSON.parse(JSON.stringify(chosen))), "team1");
  // Staged results cannot change the holder before saving.
  assert.equal(resolveLeagueFirstSelection({ ...chosen, results: [{ winner: "team1" }] }), "team1");
  const firstSaved = [{ gameNumber: 1, winner: "team1" }];
  assert.equal(resolveLeagueFirstSelection(chosen, firstSaved), "team2");
  const gameTwo = { ...chosen, currentGame: 2, confirmedGames: firstSaved, firstSelectionTeam: "team2" };
  assert.equal(resolveLeagueFirstSelection({ ...gameTwo, blueTeam: "team2" }), "team2");
  assert.equal(resolveLeagueFirstSelection({ ...gameTwo, firstSelectionTeam: "team1" }), "team1");
  assert.equal(resolveLeagueFirstSelection({ ...gameTwo, draft: createLeagueDraftState() }), "team2");
  assert.equal(resolveLeagueFirstSelection(gameTwo, [{ gameNumber: 1, winner: "team2" }]), "team1");
  assert.equal(resolveLeagueFirstSelection(gameTwo, [...firstSaved, { gameNumber: 2, winner: "team2" }]), "team1");
  assert.equal(resolveLeagueFirstSelection(gameTwo, []), "");
  // Older saved workspaces acquire the correct default without a stored choice.
  assert.equal(resolveLeagueFirstSelection({ ...gameTwo, firstSelectionTeam: undefined }), "team2");
});

test("Full Fearless accumulates only picks across five games, regardless of first pick side", () => {
  const games = [];
  for (let gameNumber = 1; gameNumber <= 5; gameNumber += 1) {
    let draft = { ...createLeagueDraftState(), firstPickSide: gameNumber % 2 ? "CHAOS" : "ORDER" };
    const pool = fearlessChampionSet(games, "Bo5", gameNumber);
    assert.equal(pool.size, (gameNumber - 1) * 10);
    for (const step of leagueDraftSteps("fearless", draft.firstPickSide)) {
      for (const champion of pool) {
        assert.equal(lockLeagueDraftSelection(draft, champion, pool, "fearless").changed, false);
      }
      // The same ten bans are available again in every game.
      const champion = step.action === "ban" ? `Ban ${step.index}` : `Game ${gameNumber} pick ${step.index}`;
      const result = lockLeagueDraftSelection(draft, champion, pool, "fearless");
      assert.equal(result.changed, true);
      draft = result.draft;
    }
    const slots = draftSlots(draft, "fearless");
    assert.equal(slots[draft.firstPickSide === "CHAOS" ? "redPicks" : "bluePicks"][0], `Game ${gameNumber} pick 6`);
    assert.equal(slots[draft.firstPickSide === "CHAOS" ? "bluePicks" : "redPicks"][4], `Game ${gameNumber} pick 19`);
    draft = normalizeLeagueDraft(JSON.parse(JSON.stringify(draft)));
    assert.equal(undoLeagueDraftSelection(draft).firstPickSide, draft.firstPickSide);
    assert.equal(undoLeagueDraftSelection(draft).currentStep, 19);
    games.push({ gameNumber, winner: gameNumber % 2 ? "team1" : "team2", ...slots });
    const league = { bestOf: "Bo5", draftMode: "fearless", currentGame: gameNumber, draft, confirmedGames: games, results: games };
    assert.equal(leagueFearlessResultError(league), "");
    const overlay = buildLeagueOverlayState(league, {}, {});
    assert.equal(overlay.draft.firstPickSide, draft.firstPickSide);
    assert.deepEqual(overlay.draft.redPicks, slots.redPicks);
    assert.deepEqual(overlay.draft.bluePicks, slots.bluePicks);
  }
  assert.equal(fearlessChampionSet([]).size, 0);
});

test("operator and overlay pools exclude current, future and out-of-format games", () => {
  const games = [1, 2, 3, 4].map(gameNumber => ({ gameNumber, bluePicks: [`Blue ${gameNumber}`], redPicks: [`Red ${gameNumber}`] }));
  const pool = fearlessChampionSet(games, "Bo3", 2);
  assert.deepEqual([...pool], ["Blue 1", "Red 1"]);
  assert.deepEqual(leagueFearlessChampions({ draftMode: "fearless", bestOf: "Bo3", currentGame: 2, confirmedGames: games }), [...pool]);
  assert.equal(fearlessChampionSet(games, "Bo3", 5).size, 6);
});

test("fearless results require ten distinct picks and reject repeats from either team", () => {
  const picks = Array.from({ length: 10 }, (_, index) => `Champion ${index}`);
  const game = { winner: "team1", bluePicks: picks.slice(0, 5), redPicks: picks.slice(5) };
  const league = { bestOf: "Bo3", draftMode: "fearless", currentGame: 1, draft: createLeagueDraftState(), confirmedGames: [], results: [{ winner: "team1" }] };
  assert.match(leagueFearlessResultError(league), /all ten/);
  league.results = [game];
  assert.equal(leagueFearlessResultError(league), "");
  league.results = [game, { ...game, bluePicks: [...game.redPicks], redPicks: [...game.bluePicks] }];
  assert.match(leagueFearlessResultError(league), /Game 2:.*repeated/);
  league.results = [{ ...game, redPicks: [...game.bluePicks] }];
  assert.match(leagueFearlessResultError(league), /Game 1:.*repeated/);
  assert.equal(leagueFearlessResultError({ ...league, draftMode: "standard" }), "");
});

test("older drafts preserve blue-first order when reloaded", () => {
  assert.equal(normalizeLeagueDraft({ selections: [] }).firstPickSide, "ORDER");
  assert.equal(leagueDraftSteps("fearless", "CHAOS")[0].side, "CHAOS");
  assert.equal(leagueDraftSteps("fearless", "CHAOS")[19].side, "ORDER");
});
