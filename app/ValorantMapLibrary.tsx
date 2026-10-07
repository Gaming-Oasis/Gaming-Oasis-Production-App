"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VALORANT_MAP_ARTWORK } from "../lib/valorant.mjs";
import { artworkMatches, hasArtworkOverride, MAP_API, MAP_ASSET_KEYS, MAP_TEMPLATE_VERSION, mapNameKey, mapSyncDue } from "../lib/valorant-map-library.mjs";
import { blobBase64, renderMapArtwork } from "../lib/valorant-map-renderer.mjs";

export type MapArtwork = { name: string; nextMap: string; pickCard: string; banCard: string };
type Entry = { id: string; name: string; sourceHash: string; focal: { x: number; y: number }; override: boolean; templateVersion: number; customSourceHash: string; artwork: MapArtwork };
type CatalogMap = { id: string; name: string; sourceUrl: string };
type Library = { maps: Entry[]; lastSync: number };
type Options = {
  enabled: boolean;
  maps: MapArtwork[];
  ownsWriter: () => boolean;
  mutate: (route: string, body: unknown) => Promise<unknown>;
  apply: (before: MapArtwork | undefined, artwork: MapArtwork, activate?: boolean) => void;
};

async function getJson(url: string) {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Map writer is unavailable");
  return data;
}

async function readSource(url: string) {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error("Source image unavailable");
  const blob = await response.blob();
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return { blob, hash: Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, "0")).join(""), stale: response.headers.get("X-Map-Source-Stale") === "true" };
}

export function useValorantMapLibrary(options: Options) {
  const [library, setLibrary] = useState<Library>({ maps: [], lastSync: 0 });
  const [status, setStatus] = useState("Maps sync on launch and daily while the tool is open.");
  const [busy, setBusy] = useState(false);
  const [resetRevision, setResetRevision] = useState(0);
  const latest = useRef(options);
  const busyRef = useRef(false);
  const attemptedAt = useRef(0);
  const attemptedRename = useRef("");
  const mounted = useRef(true);
  useEffect(() => { latest.current = options; });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const load = useCallback(async (activate = false) => {
    const data: Library = await getJson(`${MAP_API}/library`);
    if (mounted.current) setLibrary(data);
    if (latest.current.enabled && latest.current.ownsWriter()) {
      for (const entry of data.maps) {
        const current = latest.current.maps.find((map) => mapNameKey(map.name) === mapNameKey(entry.name) || artworkMatches(map, entry.artwork));
        if (current && mapNameKey(current.name) !== mapNameKey(entry.name)) continue;
        if (!hasArtworkOverride(current, entry, VALORANT_MAP_ARTWORK)) latest.current.apply(current, entry.artwork, activate);
      }
    }
    return data;
  }, []);

  const generate = useCallback(async (id: string, name: string, source: { blob: Blob; hash: string }, focal: { x: number; y: number }, override: boolean, customSource = false) => {
    const blobs = await renderMapArtwork(name, source.blob, focal) as Record<string, Blob>;
    const images = Object.fromEntries(await Promise.all(MAP_ASSET_KEYS.map(async (key) => [key, await blobBase64(blobs[key])])));
    if (!latest.current.ownsWriter()) throw new Error("This browser no longer controls the writer");
    const entry = await latest.current.mutate("save", {
      id, name, sourceHash: source.hash, focal, override, templateVersion: MAP_TEMPLATE_VERSION, images,
      ...(customSource ? { customSource: await blobBase64(source.blob) } : {}),
    }) as Entry;
    return entry;
  }, []);

  const sync = useCallback(async (manual = false) => {
    if (busyRef.current || !latest.current.enabled || !latest.current.ownsWriter()) return;
    busyRef.current = true;
    attemptedAt.current = Date.now();
    setBusy(true);
    setStatus("Checking the full map library…");
    let added = 0;
    let updated = 0;
    const errors: string[] = [];
    try {
      const previous = await load(manual);
      const catalog: { maps: CatalogMap[]; stale: boolean } = await getJson(`${MAP_API}/catalog?refresh=1`);
      if (catalog.stale) errors.push("Provider offline; using the saved map catalog");
      // New maps are generated first, including Summit on the initial migration.
      const maps = [...catalog.maps].sort((a, b) => Number(latest.current.maps.some((m) => mapNameKey(m.name) === mapNameKey(a.name))) - Number(latest.current.maps.some((m) => mapNameKey(m.name) === mapNameKey(b.name))));
      for (const map of maps) {
        if (!mounted.current || !latest.current.ownsWriter()) throw new Error("Map sync stopped because writer ownership changed");
        const existing = previous.maps.find((entry) => entry.id === map.id);
        const current = latest.current.maps.find((entry) => mapNameKey(entry.name) === mapNameKey(map.name) || (existing && artworkMatches(entry, existing.artwork)));
        if (hasArtworkOverride(current, existing, VALORANT_MAP_ARTWORK)) continue;
        if (existing?.override && existing.templateVersion === MAP_TEMPLATE_VERSION && current?.name === existing.name) continue;
        if (!current && latest.current.maps.length >= 32) { errors.push(`${map.name}: map limit reached`); continue; }
        setStatus(`Syncing ${map.name}…`);
        try {
          const source = await readSource(existing?.customSourceHash ? `${MAP_API}/custom/${existing.customSourceHash}` : `${MAP_API}/source/${map.id}?refresh=1`);
          if (source.stale) errors.push(`${map.name}: using saved source image`);
          const name = current?.name || map.name;
          if (existing && existing.sourceHash === source.hash && existing.templateVersion === MAP_TEMPLATE_VERSION && existing.name === name) continue;
          const entry = await generate(map.id, name, source, existing?.focal ?? { x: 0.5, y: 0.5 }, existing?.override ?? false);
          if (!mounted.current || !latest.current.ownsWriter()) throw new Error("Writer ownership changed");
          latest.current.apply(current, entry.artwork, manual);
          if (current) updated += 1; else added += 1;
        } catch (error) { errors.push(`${map.name}: ${(error as Error).message}`); }
      }
      if (!errors.length) await latest.current.mutate("complete", {});
      await load();
      setStatus(`${added} added, ${updated} updated.${errors.length ? ` ${errors.join("; ")}. Retry with Sync maps.` : " Full map library is up to date."}`);
    } catch (error) {
      if (mounted.current) setStatus(`Map sync failed: ${(error as Error).message}. Existing artwork is retained.`);
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [generate, load]);

  const resetDefaults = useCallback(async (applyDefaults: (maps: MapArtwork[]) => void) => {
    if (busyRef.current || !latest.current.enabled || !latest.current.ownsWriter()) return;
    busyRef.current = true;
    setBusy(true);
    setStatus("Resetting map sources and focal points…");
    try {
      const catalog: { maps: CatalogMap[] } = await getJson(`${MAP_API}/catalog`);
      const defaults: MapArtwork[] = [
        ...VALORANT_MAP_ARTWORK.filter((map) => mapNameKey(map.name) === "placeholder"),
        ...catalog.maps.map((map) => VALORANT_MAP_ARTWORK.find((item) => mapNameKey(item.name) === mapNameKey(map.name))
          ?? { name: map.name, nextMap: "", pickCard: "", banCard: "" }),
      ].map((map) => ({ ...map }));
      const cleared = await latest.current.mutate("reset", {}) as Library;
      setLibrary(cleared);
      setResetRevision((revision) => revision + 1);
      latest.current = { ...latest.current, maps: defaults };
      applyDefaults(defaults);
    } catch (error) {
      setStatus(`Map reset failed: ${(error as Error).message}. Retry Reset to Default.`);
      return;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
    await sync(true);
  }, [sync]);

  useEffect(() => {
    if (!options.enabled) return;
    let active = true;
    // Launch always runs the pull sync so artwork is current before a show;
    // in-session checks still respect the daily interval and bounded retry.
    const check = async (launch = false) => {
      if (busyRef.current || !latest.current.ownsWriter()) return;
      try {
        const data = await load();
        const outdated = data.maps.some((entry) => !entry.id.startsWith("custom-") && entry.templateVersion !== MAP_TEMPLATE_VERSION);
        if (active && (launch || mapSyncDue(outdated ? 0 : data.lastSync, attemptedAt.current))) await sync();
      } catch { if (active) setStatus("Map writer offline. Existing artwork is retained; reconnect or select Sync maps."); }
    };
    void check(true);
    const timer = window.setInterval(check, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [options.enabled, load, sync]);

  const edit = useCallback(async (map: MapArtwork, file: File | null, focal: { x: number; y: number }, reset = false) => {
    if (busyRef.current || !latest.current.ownsWriter()) return;
    busyRef.current = true;
    setBusy(true);
    setStatus(`Generating ${map.name}…`);
    try {
      const data = await load();
      const entry = data.maps.find((item) => mapNameKey(item.name) === mapNameKey(map.name) || artworkMatches(map, item.artwork));
      const catalog: { maps: CatalogMap[] } = await getJson(`${MAP_API}/catalog`);
      const provider = catalog.maps.find((item) => item.id === entry?.id || mapNameKey(item.name) === mapNameKey(map.name));
      const id = entry?.id || provider?.id || `custom-${crypto.randomUUID()}`;
      let source;
      if (file) {
        if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 6_000_000) throw new Error("Choose a PNG or JPG up to 6 MB");
        const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
        source = { blob: file, hash: Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, "0")).join("") };
      } else if (!reset && entry?.customSourceHash) source = await readSource(`${MAP_API}/custom/${entry.customSourceHash}`);
      else if (provider) source = await readSource(`${MAP_API}/source/${provider.id}`);
      else throw new Error("Upload a source image for this custom map");
      const generated = await generate(id, map.name, source, reset ? { x: 0.5, y: 0.5 } : focal, !reset, Boolean(file));
      if (latest.current.ownsWriter()) latest.current.apply(map, generated.artwork, true);
      await load();
      setStatus(`${map.name}: all three images generated and saved.`);
    } catch (error) { setStatus(`${map.name}: ${(error as Error).message}. Existing artwork is retained.`); }
    finally { busyRef.current = false; setBusy(false); }
  }, [generate, load]);

  // Name edits keep the same map identity and refresh all baked-in labels.
  useEffect(() => {
    if (!options.enabled || busy) return;
    const renamed = options.maps.find((map) => library.maps.some((entry) => artworkMatches(map, entry.artwork) && map.name !== entry.name));
    if (!renamed) return;
    const entry = library.maps.find((item) => artworkMatches(renamed, item.artwork))!;
    const identity = `${entry.id}:${entry.sourceHash}:${renamed.name}`;
    if (attemptedRename.current === identity) return;
    const timer = window.setTimeout(() => {
      attemptedRename.current = identity;
      void edit(renamed, null, entry.focal, !entry.override);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [options.enabled, options.maps, busy, library.maps, edit]);

  return { library, status, busy, sync, edit, resetDefaults, resetRevision };
}

type Controller = ReturnType<typeof useValorantMapLibrary>;
function MapRow({ map, entry, controller }: { map: MapArtwork; entry?: Entry; controller: Controller }) {
  const [file, setFile] = useState<File | null>(null);
  const [x, setX] = useState(entry?.focal.x ?? 0.5);
  const [y, setY] = useState(entry?.focal.y ?? 0.5);
  const input = useRef<HTMLInputElement>(null);
  const generated = entry && artworkMatches(map, entry.artwork);
  return <div className="map-library-row">
    <div><strong>{map.name}</strong><small>{generated ? entry.override ? "Source / crop override" : "Automatic artwork" : "Existing artwork / override"}</small></div>
    {generated ? <div className="map-library-previews">
      <a href={map.nextMap} target="_blank" rel="noreferrer"><img src={map.nextMap} alt={`${map.name} next map`} /><span>Next map · 1920 × 1080</span></a>
      <a href={map.pickCard} target="_blank" rel="noreferrer"><img src={map.pickCard} alt={`${map.name} pick card and widget`} /><span>Pick / widget · 437 × 93</span></a>
      <a href={map.banCard} target="_blank" rel="noreferrer"><img src={map.banCard} alt={`${map.name} ban card`} /><span>Ban · 437 × 93</span></a>
    </div> : <p>Sync maps or upload a source image to generate all three graphics.</p>}
    <details><summary>Edit source and crop</summary>
      <div className="map-library-editor">
        <label>Source image (PNG / JPG, up to 6 MB)<input ref={input} type="file" accept="image/png,image/jpeg" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
        <label>Horizontal focal point<input aria-label={`${map.name} horizontal focal point`} type="range" min="0" max="1" step="0.01" value={x} onChange={(event) => setX(Number(event.target.value))} /></label>
        <label>Vertical focal point<input aria-label={`${map.name} vertical focal point`} type="range" min="0" max="1" step="0.01" value={y} onChange={(event) => setY(Number(event.target.value))} /></label>
        <button className="button secondary" type="button" disabled={controller.busy} onClick={async () => { await controller.edit(map, file, { x, y }); setFile(null); if (input.current) input.current.value = ""; }}>Generate artwork</button>
        {entry && !entry.id.startsWith("custom-") && <button className="button secondary" type="button" disabled={controller.busy} onClick={async () => { await controller.edit(map, null, { x: 0.5, y: 0.5 }, true); setX(0.5); setY(0.5); }}>Use automatic source</button>}
      </div>
    </details>
  </div>;
}

export function ValorantMapLibrary({ maps, controller }: { maps: MapArtwork[]; controller: Controller }) {
  return <div className="map-library">
    <div className="card-title-row">
      <div><p role="status">{controller.status}</p><small>Last synced: {controller.library.lastSync ? new Date(controller.library.lastSync).toLocaleString() : "Not yet"} · Automatic checks on launch and every 24 hours</small></div>
      <button className="button primary" type="button" disabled={controller.busy} onClick={() => void controller.sync(true)}>{controller.busy ? "Syncing maps…" : "Sync maps"}</button>
    </div>
    {maps.filter((map) => mapNameKey(map.name) !== "placeholder").map((map) => {
      const entry = controller.library.maps.find((item) => mapNameKey(item.name) === mapNameKey(map.name) || artworkMatches(map, item.artwork));
      return <MapRow key={`${controller.resetRevision}:${map.name}:${entry?.sourceHash || ""}:${entry?.focal.x ?? 0.5}:${entry?.focal.y ?? 0.5}`} map={map} entry={entry} controller={controller} />;
    })}
  </div>;
}
