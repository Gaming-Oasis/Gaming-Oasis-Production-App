export const MAP_TEMPLATE_VERSION = 3;
export const MAP_SYNC_INTERVAL = 24 * 60 * 60 * 1000;
export const MAP_ASSET_KEYS = ["nextMap", "pickCard", "banCard"];
export const MAP_ASSET_SIZES = { nextMap: [1920, 1080], pickCard: [437, 93], banCard: [437, 93] };
export const MAP_API = "http://127.0.0.1:4877/api/valorant-maps";
export const mapNameKey = (name) => String(name ?? "").replace(/\s+/g, "").toLowerCase();

export function standardMapCatalog(payload) {
  if (!Array.isArray(payload?.data)) throw new Error("Invalid VALORANT map catalog");
  const ids = new Set();
  const names = new Set();
  const maps = [];
  for (const map of payload.data) {
    // The provider marks bomb-site maps explicitly; other modes have no sites.
    if (!/^A\/B(?:\/C)? Sites$/.test(map?.tacticalDescription ?? "")) continue;
    const id = String(map.uuid ?? "").toLowerCase();
    const name = String(map.displayName ?? "").trim();
    if (!/^[a-f0-9-]{36}$/.test(id) || !name || name.length > 80
      || map.splash !== `https://media.valorant-api.com/maps/${id}/splash.png`
      || ids.has(id) || names.has(mapNameKey(name))) continue;
    ids.add(id);
    names.add(mapNameKey(name));
    maps.push({ id, name, sourceUrl: map.splash });
  }
  if (!maps.length || maps.length > 64) throw new Error("No valid standard VALORANT maps in catalog");
  return maps.sort((a, b) => a.name.localeCompare(b.name));
}

export function generatedMapFilename(value) {
  const match = String(value ?? "").match(/^http:\/\/(?:127\.0\.0\.1|localhost):\d+\/api\/valorant-maps\/assets\/([a-f0-9]{64}-(?:nextMap|pickCard|banCard)\.png)$/);
  return match?.[1] ?? "";
}

export function mapUsesGeneratedArtwork(map) {
  return Boolean(generatedMapFilename(map?.pickCard));
}

export function artworkMatches(a, b) {
  return Boolean(a && b && MAP_ASSET_KEYS.every((key) => a[key] === b[key]));
}

export function hasArtworkOverride(map, saved, defaults) {
  if (!map) return false;
  if (artworkMatches(map, saved?.artwork)) return false;
  if (artworkMatches(map, saved?.previousArtwork)) return false;
  // Generated URLs can survive a restored draft even when the local library
  // needs rebuilding (for example after moving to another workstation).
  if (MAP_ASSET_KEYS.every((key) => generatedMapFilename(map[key]))) return false;
  if (MAP_ASSET_KEYS.every((key) => !map[key])) return false;
  return !defaults.some((entry) => mapNameKey(entry.name) === mapNameKey(map.name) && artworkMatches(map, entry));
}

// Merge only against the snapshot that was rendered, so an operator edit made
// during a sync cannot be overwritten by a late response.
export function mergeMapArtwork(current, before, artwork) {
  const index = current.findIndex((map) => mapNameKey(map.name) === mapNameKey(artwork.name));
  if (before) {
    if (index < 0 || !artworkMatches(current[index], before)) return current;
    if (artworkMatches(current[index], artwork)) return current;
    return current.map((map, i) => i === index ? { ...artwork, name: map.name } : map);
  }
  if (index >= 0 || current.length >= 32) return current;
  return [...current, artwork];
}

export function coverCrop(width, height, targetWidth, targetHeight, focal = { x: 0.5, y: 0.5 }) {
  const scale = Math.max(targetWidth / width, targetHeight / height);
  const sw = targetWidth / scale;
  const sh = targetHeight / scale;
  return [(width - sw) * focal.x, (height - sh) * focal.y, sw, sh];
}

export function mapSyncDue(lastSync, lastAttempt, now = Date.now()) {
  return now - lastSync >= MAP_SYNC_INTERVAL && now - lastAttempt >= 60 * 60 * 1000;
}
