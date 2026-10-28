import { bracketSections, layoutBracket } from "./bracket.mjs";

export const BRACKET_ROTATION_MS = 10_000;

/** Scores and refreshes do not restart a page's time on air. */
export function bracketFramingKey(state) {
  const source = state.snapshot?.source;
  if (!source) return "";
  const layout = layoutBracket(state);
  return JSON.stringify([source.leagueSlug, source.seasonSlug, source.eventSlug, source.stageId,
    layout.section, layout.overview ? "overview" : "focus", layout.start, layout.page, state.autoRotate === true]);
}

/** Reuse the published layout, adding later windows only for otherwise unseen matches. */
export function bracketRotationFrames(state) {
  const frames = [], covered = new Set();
  for (const section of bracketSections(state.snapshot)) {
    const initial = layoutBracket({ ...state, section: section.id, roundStart: 0, page: 0 });
    for (let roundStart = 0; roundStart < initial.rounds.length; roundStart++) {
      const base = { section: section.id, view: state.view, roundStart, page: 0 };
      const first = layoutBracket({ ...state, ...base });
      for (let page = 0; page < first.pageCount; page++) {
        const frame = { ...base, page };
        const layout = layoutBracket({ ...state, ...frame });
        if (!layout.cards.some(card => !covered.has(card.match.id))) continue;
        frames.push(frame);
        for (const card of layout.cards) covered.add(card.match.id);
      }
      if (initial.overview) break;
    }
  }
  return frames;
}

export function nextBracketFrame(state) {
  const frames = bracketRotationFrames(state);
  if (!frames.length) return state;
  const key = bracketFramingKey(state);
  const index = frames.findIndex(frame => bracketFramingKey({ ...state, ...frame }) === key);
  let next = frames[(index + 1) % frames.length];
  if (index < 0) {
    const sections = bracketSections(state.snapshot).map(section => section.id);
    const layout = layoutBracket(state), sectionIndex = sections.indexOf(layout.section);
    next = frames.find(frame => sections.indexOf(frame.section) > sectionIndex
      || frame.section === layout.section && (frame.roundStart > layout.start || frame.roundStart === layout.start && frame.page > layout.page)) ?? frames[0];
  }
  const result = { ...state, ...next };
  return bracketFramingKey(result) === key ? state : result;
}

/** Wait for a successful six-file publication before starting each ten-second dwell. */
export function startBracketRotation({ read, advance, schedule = setTimeout, cancel = clearTimeout, now = () => performance.now() }) {
  let active = true, timer = null, currentKey = "", shownAt = null;
  function tick() {
    if (!active) return;
    const { enabled, value, publishedKey } = read();
    const key = bracketFramingKey(value);
    if (!enabled || !value.autoRotate || !key || publishedKey !== key) {
      currentKey = key; shownAt = null;
    } else if (key !== currentKey || shownAt === null) {
      currentKey = key; shownAt = now();
    } else if (now() - shownAt >= BRACKET_ROTATION_MS) {
      shownAt = null;
      advance(key);
    }
    if (active) timer = schedule(tick, 250);
  }
  tick();
  return { stop() { active = false; if (timer !== null) cancel(timer); } };
}
