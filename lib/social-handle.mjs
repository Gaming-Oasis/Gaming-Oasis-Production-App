export function formatSocialHandle(value) {
  const handle = String(value ?? "").trim().replace(/^@+/, "");
  return handle ? `@${handle}` : "";
}
