export const bracketSource = { leagueSlug: "sel", seasonSlug: "fall-2026", eventSlug: "rocket-league", stageId: "11111111-1111-4111-8111-111111111111" };

export function bracketFixture(size = 32, cutoff = 4) {
  const source = { ...bracketSource };
  const detail = { league: { slug: source.leagueSlug, name: "Southeastern Esports League", primaryColor: "#007BF4", secondaryColor: "#FCC500" },
    season: { slug: source.seasonSlug }, event: { slug: source.eventSlug, name: "2026 Fall SEL Rocket League", gameTitle: "Rocket League" },
    stages: [{ id: source.stageId, name: "Last Chance Qualifier", type: "single_elimination" }] };
  const stage = { ...detail.stages[0], formatSummary: `Single elimination · ${size} teams · Cutoff Top ${cutoff} · Best of 5` };
  const rounds = [];
  let nextNumber = 1;
  let previous = [];
  for (let count = size / 2, index = 0; count >= cutoff; count /= 2, index++) {
    const matches = Array.from({ length: count }, (_, position) => {
      const id = `match-${nextNumber}`;
      const match = { id, matchNumber: nextNumber++, sortOrder: index, round: index + 1, bracket: "winners", bestOf: 5,
        team1: index === 0 ? { teamId: `team-${position * 2 + 1}`, name: `#${position * 2 + 1} University ${position + 1} Rocket League A - Varsity`, seed: position * 2 + 1, score: 3, result: "win" } : { teamId: null, score: null },
        team2: index === 0 ? { teamId: `team-${position * 2 + 2}`, name: `#${position * 2 + 2} University ${position + 1} Rocket League B - Academy`, seed: position * 2 + 2, score: 0, result: "loss" } : { teamId: null, score: null },
        team1PrereqMatchId: previous[position * 2]?.id, team1PrereqOutcome: "winner", team2PrereqMatchId: previous[position * 2 + 1]?.id, team2PrereqOutcome: "winner" };
      return match;
    });
    rounds.push({ round: index + 1, roundLabel: `Round of ${count * 2}`, matches }); previous = matches;
  }
  return { source, detail, workspace: { stage, rounds, advancement: { label: "Advance to Playoffs" } } };
}

export function doubleBracketFixture() {
  const fixture = bracketFixture(8, 1);
  fixture.workspace.stage.type = "double_elimination";
  fixture.detail.stages[0].type = "double_elimination";
  fixture.workspace.stage.formatSummary = "Double elimination · 8 teams · GF reset · Best of 3";
  fixture.workspace.advancement = undefined;
  const match = (id, bracket, one, two, outcome1 = "winner", outcome2 = "winner") => ({ id, matchNumber: Number(id.slice(1)), bracket, bestOf: 3,
    team1: { teamId: null, score: null }, team2: { teamId: null, score: null },
    team1PrereqMatchId: one, team2PrereqMatchId: two, team1PrereqOutcome: outcome1, team2PrereqOutcome: outcome2 });
  fixture.workspace.rounds.push(
    { round: -1, roundLabel: "Losers Round 1", matches: [match("l8", "losers", "match-1", "match-2", "loser", "loser"), match("l9", "losers", "match-3", "match-4", "loser", "loser")] },
    { round: -2, roundLabel: "Losers Final", matches: [match("l10", "losers", "l8", "l9")] },
    { round: 4, roundLabel: "Grand Final", matches: [match("f11", "grand_finals", "match-7", "l10")] },
    { round: 5, roundLabel: "Grand Final Reset", matches: [match("f12", "grand_finals", "f11", "f11", "winner", "loser")] },
    { round: 6, roundLabel: "Third Place Match", matches: [match("p13", "winners", "match-5", "match-6", "loser", "loser")] },
  );
  return fixture;
}
