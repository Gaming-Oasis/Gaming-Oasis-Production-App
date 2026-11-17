const LOCAL_APP_PORT = "3000";
const LOCAL_WRITER_ORIGIN = "http://127.0.0.1:4877";
const SPONSOR_LOGO_PROXY = `${LOCAL_WRITER_ORIGIN}/api/sponsor-logos`;
const LOCAL_LOGO_PROXY = `${LOCAL_WRITER_ORIGIN}/api/local-logos`;
const DRIVE_FILE_ID = /^[A-Za-z0-9_-]{10,128}$/;
const HUB_LOGO_PATH = /^\/api\/public\/logos\/(teams|leagues)\/[0-9a-f-]{36}$/i;

/**
 * A logo on this workstation: `C:\Logos\team.png`, `"C:\Logos\team.png"` (Copy as path),
 * `file:///C:/Logos/team.png`, or a `\\server\share\team.png` network path.
 * Returns the path with forward slashes so vMix title image fields can open it, or "".
 */
export function localLogoPath(value) {
  let text = String(value ?? "").trim();
  if (text.length >= 2 && text.startsWith("\"") && text.endsWith("\"")) text = text.slice(1, -1).trim();
  if (/^file:/i.test(text)) {
    let url;
    let pathname;
    try {
      url = new URL(text);
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return "";
    }
    const host = url.hostname.toLowerCase();
    text = host && host !== "localhost" ? `//${url.hostname}${pathname}` : pathname.replace(/^\/(?=[A-Za-z]:)/, "");
  }
  const normalized = text.replaceAll("\\", "/");
  if (/^[A-Za-z]:\/[^/]/.test(normalized) || /^\/\/[^/]+\/[^/]+\/[^/]/.test(normalized)) return normalized;
  return "";
}

/** Local paths are stored in their vMix-ready form; every other logo reference is only trimmed. */
export function normalizeLogoReference(value) {
  return localLogoPath(value) || String(value ?? "").trim();
}

/**
 * League Hub team and league logos come from the local writer's cached Hub proxy.
 * Workstation file paths are served by the writer's local logo route.
 */
export function hubLogoSrc(value) {
  const localPath = localLogoPath(value);
  if (localPath) return `${LOCAL_LOGO_PROXY}?path=${encodeURIComponent(localPath)}`;
  try {
    const url = new URL(value);
    if (url.origin === "https://hub.gamingoasis.gg" && HUB_LOGO_PATH.test(url.pathname)) return `${LOCAL_WRITER_ORIGIN}${url.pathname}`;
  } catch {
    // Relative and manually entered logo URLs remain unchanged.
  }
  return value;
}

export function googleDriveFileId(value) {
  let url;
  try {
    url = new URL(String(value ?? "").trim());
  } catch {
    return "";
  }
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "drive.google.com") return "";
  const queryId = url.searchParams.get("id") ?? "";
  if (DRIVE_FILE_ID.test(queryId) && (url.pathname === "/uc" || url.pathname === "/thumbnail" || url.pathname === "/open")) {
    return queryId;
  }
  const fileMatch = url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]{10,128})(?:\/|$)/);
  return fileMatch && DRIVE_FILE_ID.test(fileMatch[1]) ? fileMatch[1] : "";
}

// vMix loads the overlay from either localhost or 127.0.0.1 and will not
// paint a cross-origin logo. App assets stay on the overlay origin. Every
// other logo is fetched by the local writer and served from loopback.
export function sponsorLogoSrc(logo) {
  const trimmed = String(logo ?? "").trim();
  if (!trimmed) return "";
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return trimmed;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return trimmed;
  const driveId = googleDriveFileId(trimmed);
  if (driveId) return `http://127.0.0.1:4877/api/public/map-artwork/${encodeURIComponent(driveId)}`;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") {
    if (url.port === LOCAL_APP_PORT) return `${url.pathname}${url.search}`;
    url.hostname = "127.0.0.1";
    return url.toString();
  }
  return `${SPONSOR_LOGO_PROXY}?src=${encodeURIComponent(url.toString())}`;
}
