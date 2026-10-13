export function resolveScoreboardHeader(override, eventName) {
  const header = String(override ?? "").trim() || String(eventName ?? "").trim();
  return header.replace(/Rocket League/gi, "RL").replace(/League of Legends/gi, "LoL");
}
