export function buildOverlaySponsors(sponsors) {
  return (Array.isArray(sponsors) ? sponsors : [])
    .filter((sponsor) => sponsor?.enabled && (String(sponsor.name || "").trim() || String(sponsor.logo || "").trim()))
    .map((sponsor, index) => ({
      id: String(sponsor.id || `sponsor${index + 1}`).trim(),
      name: String(sponsor.name || "").trim(),
      logo: String(sponsor.logo || "").trim(),
    }));
}
