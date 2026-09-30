/** Shared light/dark text and image/logo plate contrast for Production OS + overlays. */

export const OVERLAY_TEXT_LIGHT = "#FFFFFF";
export const OVERLAY_TEXT_DARK = "#171717";
export const IMAGE_PLATE_LIGHT = "#FFFFFF";
/** Overlay navy plate — same token as scoreboard / player-card fills. Never pure black. */
export const IMAGE_PLATE_DARK = "#171717";
/** @deprecated Use IMAGE_PLATE_LIGHT */
export const LOGO_PLATE_LIGHT = IMAGE_PLATE_LIGHT;
/** @deprecated Use IMAGE_PLATE_DARK */
export const LOGO_PLATE_DARK = IMAGE_PLATE_DARK;

/**
 * Prefer white text whenever it clears this contrast vs the fill.
 * Kept below WCAG AA on purpose for broadcast fills — dark text only on clearly light colors.
 * Lower = more white.
 */
export const PREFERRED_WHITE_MIN_CONTRAST = 1.85;

/**
 * Average relative luminance above this → dark image/logo plate (overlay navy `#171717`).
 * High on purpose so white plates are the default unless artwork is clearly light.
 */
export const PREFERRED_LIGHT_IMAGE_PLATE_MAX_LUMINANCE = 0.55;
/** @deprecated Use PREFERRED_LIGHT_IMAGE_PLATE_MAX_LUMINANCE */
export const PREFERRED_LIGHT_LOGO_PLATE_MAX_LUMINANCE = PREFERRED_LIGHT_IMAGE_PLATE_MAX_LUMINANCE;

export function colorChannels(value, fallback = [26, 117, 253]) {
  const hex = String(value ?? "").trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return hex.split("").map((part) => Number.parseInt(`${part}${part}`, 16));
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  }
  const rgb = String(value ?? "").match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  return rgb ? rgb.slice(1).map(Number) : fallback;
}

export function relativeLuminance(color, fallbackChannels) {
  const linearChannels = colorChannels(color, fallbackChannels).map((value) => {
    const channel = Math.min(255, Math.max(0, value)) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linearChannels[0] + 0.7152 * linearChannels[1] + 0.0722 * linearChannels[2];
}

export function contrastRatio(foreground, background, fallbackChannels) {
  const light = Math.max(
    relativeLuminance(foreground, fallbackChannels),
    relativeLuminance(background, fallbackChannels),
  );
  const dark = Math.min(
    relativeLuminance(foreground, fallbackChannels),
    relativeLuminance(background, fallbackChannels),
  );
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Pick overlay text for a solid fill. Prefers white unless the fill is clearly light
 * and dark text has meaningfully better contrast.
 */
export function readableText(backgroundColor, fallbackChannels) {
  const background = relativeLuminance(backgroundColor, fallbackChannels);
  const dark = relativeLuminance(OVERLAY_TEXT_DARK, fallbackChannels);
  const whiteContrast = 1.05 / (background + 0.05);
  const darkContrast = (Math.max(background, dark) + 0.05) / (Math.min(background, dark) + 0.05);
  const whiteIsPreferred = whiteContrast >= PREFERRED_WHITE_MIN_CONTRAST;
  return whiteIsPreferred || whiteContrast >= darkContrast
    ? OVERLAY_TEXT_LIGHT
    : OVERLAY_TEXT_DARK;
}

/** VS corner wash composited over the selected logo plate, matching the CSS end stop. */
export function readableVsText(teamColor, logoBackground) {
  const plate = colorChannels(resolveImagePlate(logoBackground));
  const wash = colorChannels(teamColor);
  const blended = wash.map((channel, index) => Math.round(channel * 0.72 + plate[index] * 0.28));
  return readableText(`rgb(${blended.join(",")})`);
}

/**
 * Normalize any stored/passed plate to white or overlay navy (`#171717`) only.
 * Legacy pure black tokens map to navy. Unknown / empty / team-color values fall back to white.
 */
export function resolveImagePlate(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (
    normalized === "#000"
    || normalized === "#000000"
    || normalized === "BLACK"
    || normalized === "#171717"
    || normalized === "NAVY"
  ) {
    return IMAGE_PLATE_DARK;
  }
  if (normalized === "#FFF" || normalized === "#FFFFFF" || normalized === "WHITE") {
    return IMAGE_PLATE_LIGHT;
  }
  return IMAGE_PLATE_LIGHT;
}

/** @deprecated Use resolveImagePlate */
export function resolveLogoPlate(value) {
  return resolveImagePlate(value);
}

/**
 * Image/logo plate from average artwork luminance.
 * White unless the artwork is clearly light (needs the navy plate).
 */
export function preferredImagePlate(averageRelativeLuminance) {
  const luminance = Number(averageRelativeLuminance);
  if (!Number.isFinite(luminance)) return IMAGE_PLATE_LIGHT;
  return luminance > PREFERRED_LIGHT_IMAGE_PLATE_MAX_LUMINANCE
    ? IMAGE_PLATE_DARK
    : IMAGE_PLATE_LIGHT;
}

/** @deprecated Use preferredImagePlate */
export function preferredLogoPlate(averageRelativeLuminance) {
  return preferredImagePlate(averageRelativeLuminance);
}

/**
 * Average relative luminance of opaque pixels in an RGBA buffer (ImageData.data).
 * Returns null when there is no usable content.
 */
export function averageOpaqueLuminance(rgba, alphaFloor = 0.08) {
  if (!rgba || typeof rgba.length !== "number") return null;
  let luminanceTotal = 0;
  let alphaTotal = 0;
  for (let index = 0; index < rgba.length; index += 4) {
    const alpha = rgba[index + 3] / 255;
    if (alpha < alphaFloor) continue;
    const channels = [rgba[index], rgba[index + 1], rgba[index + 2]].map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    luminanceTotal += (0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]) * alpha;
    alphaTotal += alpha;
  }
  if (!alphaTotal) return null;
  return luminanceTotal / alphaTotal;
}

/** Detect white/navy plate for a logo or other keyed image from its pixel buffer. */
export function detectImagePlate(rgba) {
  const luminance = averageOpaqueLuminance(rgba);
  if (luminance == null) return IMAGE_PLATE_LIGHT;
  return preferredImagePlate(luminance);
}
