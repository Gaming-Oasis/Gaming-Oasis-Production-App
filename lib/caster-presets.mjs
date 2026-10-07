/**
 * Local caster presets for the production operator. Presets live in browser
 * storage on this workstation only — they never enter the production draft,
 * the JSON output package, or any remote service.
 */

export const CASTER_PRESET_LIMIT = 30;
export const CASTER_PRESET_NAME_LIMIT = 40;
export const CASTER_PRESET_SOCIAL_LIMIT = 40;

/** @typedef {{ name: string, social: string }} CasterPreset */

function normalizePresetName(value) {
  return String(value ?? "").trim().slice(0, CASTER_PRESET_NAME_LIMIT);
}

function normalizePresetSocial(value) {
  return String(value ?? "").trim().slice(0, CASTER_PRESET_SOCIAL_LIMIT);
}

/**
 * Validate stored preset data: keep entries with a usable name, drop
 * case-insensitive duplicates, and cap the list.
 * @param {unknown} value
 * @returns {CasterPreset[]}
 */
export function normalizeCasterPresets(value) {
  const list = Array.isArray(value) ? value : [];
  const seen = new Set();
  /** @type {CasterPreset[]} */
  const presets = [];
  for (const entry of list) {
    const source = entry && typeof entry === "object" ? entry : {};
    const name = normalizePresetName(source.name);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    presets.push({ name, social: normalizePresetSocial(source.social) });
    if (presets.length >= CASTER_PRESET_LIMIT) break;
  }
  return presets;
}

/**
 * Find a preset by caster name (case-insensitive).
 * @param {CasterPreset[]} presets
 * @param {string} name
 * @returns {CasterPreset | undefined}
 */
export function findCasterPreset(presets, name) {
  const key = normalizePresetName(name).toLowerCase();
  if (!key) return undefined;
  return (Array.isArray(presets) ? presets : []).find((preset) => preset.name.toLowerCase() === key);
}

/**
 * Create a preset, or update the existing one with the same caster name
 * (case-insensitive). `status` is "created" or "updated" on success,
 * "empty-name" when the name is blank, and "limit" when a new preset would
 * exceed CASTER_PRESET_LIMIT (updates to existing entries still succeed).
 * @param {CasterPreset[]} presets
 * @param {{ name: string, social: string }} entry
 * @returns {{ status: "created" | "updated", presets: CasterPreset[], preset: CasterPreset } | { status: "empty-name" } | { status: "limit" }}
 */
export function upsertCasterPreset(presets, entry) {
  const name = normalizePresetName(entry?.name);
  if (!name) return { status: "empty-name" };
  const preset = { name, social: normalizePresetSocial(entry?.social) };
  const list = normalizeCasterPresets(presets);
  const index = list.findIndex((candidate) => candidate.name.toLowerCase() === name.toLowerCase());
  if (index >= 0) {
    list[index] = preset;
    return { status: "updated", presets: list, preset };
  }
  if (list.length >= CASTER_PRESET_LIMIT) return { status: "limit" };
  list.push(preset);
  return { status: "created", presets: list, preset };
}

/**
 * Remove the preset with the given caster name (case-insensitive).
 * @param {CasterPreset[]} presets
 * @param {string} name
 * @returns {CasterPreset[]}
 */
export function removeCasterPreset(presets, name) {
  const key = normalizePresetName(name).toLowerCase();
  return (Array.isArray(presets) ? presets : []).filter((preset) => preset.name.toLowerCase() !== key);
}

/**
 * Read presets from local storage. Never throws; `error` reports whether
 * stored data existed but was unreadable or malformed.
 * @param {{ getItem: (key: string) => string | null } | null} storage
 * @param {string} key
 * @returns {{ presets: CasterPreset[], error: boolean }}
 */
export function loadCasterPresets(storage, key) {
  if (!storage) return { presets: [], error: false };
  try {
    const raw = storage.getItem(key);
    if (!raw) return { presets: [], error: false };
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { presets: [], error: true };
    return { presets: normalizeCasterPresets(parsed), error: false };
  } catch {
    return { presets: [], error: true };
  }
}

/**
 * Persist presets to local storage. Returns false when storage is
 * unavailable or rejects the write.
 * @param {{ setItem: (key: string, value: string) => void } | null} storage
 * @param {string} key
 * @param {CasterPreset[]} presets
 * @returns {boolean}
 */
export function saveCasterPresets(storage, key, presets) {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(normalizeCasterPresets(presets)));
    return true;
  } catch {
    return false;
  }
}
