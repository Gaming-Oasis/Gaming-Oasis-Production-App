import { readBoundedJson } from "./bounded-json.mjs";
import { bracketEventPath, bracketStagePath, normalizeBracketSnapshot, isBracketSource } from "./bracket.mjs";

export const BRACKET_WRITER_ORIGIN = "http://127.0.0.1:4877";

/** Bound successful and failed responses alike; manual loads also have a timeout. */
export async function readBracketResource(path, signal, fetchImpl = fetch) {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 10_000);
  const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  try {
    const response = await fetchImpl(`${BRACKET_WRITER_ORIGIN}${path}`, { signal: combined, cache: "no-store", headers: { Accept: "application/json" } });
    const body = await readBoundedJson(response, { maximumBytes: 2_000_000, abort: () => controller.abort(), message: "Hub bracket response is too large." });
    if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : `League Hub request failed (${response.status}).`);
    return body;
  } catch (error) {
    if (timedOut) throw new Error("The local writer did not respond before the timeout.");
    if (error instanceof TypeError && !combined.aborted) throw new Error("Cannot reach the local writer. Check that Production OS is running.");
    throw error;
  } finally { clearTimeout(timeout); }
}

export async function loadBracketEvent(source, signal, fetchImpl = fetch) {
  const detail = await readBracketResource(bracketEventPath(source), signal, fetchImpl);
  if (detail?.league?.slug !== source.leagueSlug || detail?.season?.slug !== source.seasonSlug || detail?.event?.slug !== source.eventSlug || !Array.isArray(detail.stages)) {
    throw new Error("The Hub returned invalid event information.");
  }
  return { source, name: String(detail.event.name || "Event"), stages: detail.stages.filter(stage => stage
    && ["single_elimination", "double_elimination"].includes(stage.type) && isBracketSource({ ...source, stageId: stage.id }))
    .map(stage => ({ id: stage.id, name: String(stage.name || "Stage"), type: stage.type })) };
}

export async function loadBracketSnapshot(source, signal, fetchImpl = fetch) {
  const [detail, workspace] = await Promise.all([
    readBracketResource(bracketEventPath(source), signal, fetchImpl),
    readBracketResource(bracketStagePath(source), signal, fetchImpl),
  ]);
  return normalizeBracketSnapshot(detail, workspace, source);
}

/** League and event details are read on Load; live refreshes request only the stage. */
export async function refreshBracketSnapshot(snapshot, signal, fetchImpl = fetch) {
  const { source, league, event } = snapshot;
  const detail = { league: { ...league, slug: source.leagueSlug }, season: { slug: source.seasonSlug }, event: { ...event, slug: source.eventSlug } };
  return normalizeBracketSnapshot(detail, await readBracketResource(bracketStagePath(source), signal, fetchImpl), source);
}
