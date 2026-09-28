import { shortTeamName } from "./team-name.mjs";

const BY_GROUP_HEADERS = ["group", "group seed", "team id", "name"];
const OVERALL_HEADERS = ["seed", "team id", "name"];

function parseCsv(text) {
  const source = String(text ?? "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += character;
      }
      continue;
    }
    if (character === '"') {
      quoted = true;
      continue;
    }
    if (character === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (character === "\n" || character === "\r") {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += character;
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((entry) => entry.some((value) => value.trim()));
}

function headerIndex(header, name) {
  return header.findIndex((value) => value.trim().toLowerCase() === name);
}

function positiveInteger(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  const number = Number.parseInt(text, 10);
  return number > 0 ? number : null;
}

function teamIdentity(teamId, name, seed, index) {
  const id = teamId.trim();
  if (id) return id;
  return `name:${seed}:${name}:${index}`;
}

export function parseSeedingCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { error: "The seeding file is empty" };
  const header = rows[0];
  const byGroup = BY_GROUP_HEADERS.every((name) => headerIndex(header, name) >= 0);
  const overall = OVERALL_HEADERS.every((name) => headerIndex(header, name) >= 0);
  if (byGroup || !overall) {
    return { error: "Import the overall seed list (Seed, Team ID, Name). Groups are assigned on export." };
  }

  const columns = {
    seed: headerIndex(header, "seed"),
    teamId: headerIndex(header, "team id"),
    name: headerIndex(header, "name"),
  };
  const teams = [];
  let skipped = 0;

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    const name = String(row[columns.name] ?? "").trim();
    const teamId = String(row[columns.teamId] ?? "").trim();
    if (!name) {
      skipped += 1;
      continue;
    }
    const seed = positiveInteger(row[columns.seed]);
    if (!seed) {
      skipped += 1;
      continue;
    }
    teams.push({
      id: teamIdentity(teamId, name, seed, index),
      teamId,
      name,
      seed,
      group: null,
    });
  }

  if (!teams.length) return { error: "No teams were found in that seeding file" };
  return { format: "overall", teams, skipped };
}

export function emptyPoolValues(pools, rows) {
  const values = {};
  for (let pool = 1; pool <= pools; pool += 1) {
    for (let row = 1; row <= rows; row += 1) values[`P${pool}${row}`] = "";
  }
  return values;
}

export const DRAW_HATS = {
  RLT1: [
    { hat: 1, from: 1, to: 4 },
    { hat: 2, from: 5, to: 8 },
    { hat: 3, from: 9, to: 12 },
    { hat: 4, from: 13, to: 16 },
  ],
  RLT2: [
    { hat: 1, from: 17, to: 28 },
    { hat: 2, from: 29, to: 40 },
    { hat: 3, from: 41, to: 52 },
    { hat: 4, from: 53, to: 64 },
  ],
  VALT1: [
    { hat: 1, from: 1, to: 4 },
    { hat: 2, from: 5, to: 8 },
  ],
  VALT2: [
    { hat: 1, from: 9, to: 14 },
    { hat: 2, from: 15, to: 20 },
    { hat: 3, from: 21, to: 26 },
    { hat: 4, from: 27, to: 32 },
  ],
};

export function applyTierSeedOffset(division, teams) {
  const offset = (DRAW_HATS[division]?.[0]?.from ?? 1) - 1;
  if (!offset) return teams;
  return teams.map((team) => {
    const seed = team.seed + offset;
    if (team.teamId) return { ...team, seed };
    return {
      ...team,
      seed,
      id: team.id.startsWith("name:") ? team.id.replace(/^name:\d+:/, `name:${seed}:`) : team.id,
    };
  });
}

function hatIndex(division, seed) {
  const hats = DRAW_HATS[division] ?? [];
  const index = hats.findIndex((hat) => seed >= hat.from && seed <= hat.to);
  return index === -1 ? hats.length : index;
}

export function seedHatLabel(division, seed) {
  const hat = (DRAW_HATS[division] ?? []).find((entry) => seed >= entry.from && seed <= entry.to);
  return hat ? `Hat ${hat.hat} · ${seed}` : `Seed ${seed}`;
}

export function sortSeedTeams(division, teams) {
  return [...teams].sort((left, right) => hatIndex(division, left.seed) - hatIndex(division, right.seed)
    || left.seed - right.seed
    || left.name.localeCompare(right.name));
}

export function groupSeedTeamsByHat(division, teams) {
  const hats = DRAW_HATS[division] ?? [];
  const groups = hats.map((hat) => ({
    label: `Hat ${hat.hat}`,
    range: `${hat.from}-${hat.to}`,
    teams: [],
  }));
  const outside = [];
  for (const team of sortSeedTeams(division, teams)) {
    const group = groups.find((entry) => {
      const [from, to] = entry.range.split("-").map((value) => Number(value));
      return team.seed >= from && team.seed <= to;
    });
    if (group) group.teams.push(team);
    else outside.push(team);
  }
  const visible = groups.filter((group) => group.teams.length);
  if (outside.length) visible.push({ label: "Outside the hats", range: "", teams: outside });
  return visible;
}

export function drawOrderNote(division) {
  const count = String(division).startsWith("VAL") ? 4 : 8;
  if (division === "RLT1" || division === "VALT1") {
    return `Draw Pool A, then Pool B, alternating until each pool has ${count} teams.`;
  }
  return `Draw Pool A, then Pool B, then Pool C, and so on, until each pool has ${count} teams.`;
}

export function filterSeedTeams(teams, query) {
  const text = String(query ?? "").trim().toLowerCase();
  if (!text) return [...teams];
  return teams.filter((team) => team.name.toLowerCase().includes(text) || String(team.seed) === text);
}

export function placedSeedTeamIds(teams, values, slots = {}) {
  const placedIds = new Set();
  for (const [key, id] of Object.entries(slots ?? {})) {
    const team = teams.find((entry) => entry.id === id);
    if (team && String(values?.[key] ?? "").trim() === team.name.trim()) placedIds.add(team.id);
  }
  return placedIds;
}

export function unplacedSeedTeams(teams, values, slots = {}) {
  const placedIds = placedSeedTeamIds(teams, values, slots);
  return [...teams]
    .filter((team) => !placedIds.has(team.id))
    .sort((left, right) => left.seed - right.seed || left.name.localeCompare(right.name));
}

export function shortDrawNames(values, game) {
  return Object.fromEntries(
    Object.entries(values ?? {}).map(([key, name]) => [key, shortTeamName(name, game)]),
  );
}

export function buildByGroupExport(pools, rows, values, teams, slots) {
  const exported = [];
  for (let pool = 1; pool <= pools; pool += 1) {
    for (let row = 1; row <= rows; row += 1) {
      const key = `P${pool}${row}`;
      const name = String(values?.[key] ?? "").trim();
      if (!name) continue;
      const team = teams.find((entry) => entry.id === slots?.[key] && entry.name.trim() === name);
      exported.push({
        group: `Group ${pool}`,
        groupSeed: String(row),
        teamId: team?.teamId ?? "",
        name,
      });
    }
  }
  return exported;
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function serializeByGroupCsv(rows) {
  const lines = ["Group,Group Seed,Team ID,Name"];
  for (const row of rows) {
    lines.push([row.group, row.groupSeed, row.teamId, row.name].map(csvCell).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}
