const LOCAL_APP_PORT = "3000";
const SPONSOR_LOGO_PROXY = "http://127.0.0.1:4877/api/sponsor-logos";
const DRIVE_FILE_ID = /^[A-Za-z0-9_-]{10,128}$/;

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
