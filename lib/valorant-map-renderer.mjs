import { coverCrop, MAP_ASSET_KEYS, MAP_ASSET_SIZES } from "./valorant-map-library.mjs";

let fontReady;
async function loadMapFont() {
  if (!fontReady) {
    fontReady = (async () => {
      const face = await new FontFace("MapOxanium", "url(/league-of-legends-overlay/oxanium-variable.ttf)", { weight: "800" }).load();
      document.fonts.add(face);
    })().catch((error) => { fontReady = undefined; throw error; });
  }
  await fontReady;
}

function fitText(ctx, name, size, width) {
  ctx.font = `800 ${size}px MapOxanium`;
  const measured = ctx.measureText(name).width;
  if (measured > width) ctx.font = `800 ${size * width / measured}px MapOxanium`;
}

export async function renderMapArtwork(name, source, focal = { x: 0.5, y: 0.5 }) {
  await loadMapFont();
  const bitmap = await createImageBitmap(source);
  if (bitmap.width < 437 || bitmap.height < 93 || bitmap.width * bitmap.height > 40_000_000) {
    bitmap.close();
    throw new Error("Use a map image at least 437 × 93 and no larger than 40 megapixels");
  }
  try {
    const output = {};
    const title = name.toUpperCase();
    for (const key of MAP_ASSET_KEYS) {
      const canvas = document.createElement("canvas");
      [canvas.width, canvas.height] = MAP_ASSET_SIZES[key];
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Map image rendering is unavailable in this browser");
      const width = key === "nextMap" ? 617 : canvas.width;
      const crop = coverCrop(bitmap.width, bitmap.height, width, canvas.height, focal);
      ctx.filter = key === "banCard" ? "grayscale(1)" : "none";
      ctx.drawImage(bitmap, ...crop, 0, 0, width, canvas.height);
      ctx.filter = "none";
      if (key === "nextMap") {
        ctx.save();
        // next game val.psd: centered, clockwise Oxanium ExtraBold, 50 pt
        // scaled by 3.45454558, white at 100% opacity in Overlay blend mode.
        ctx.translate(251.6292196052782, 540);
        ctx.rotate(Math.PI / 2);
        fitText(ctx, title, 172.7272790280872, 960);
        ctx.globalCompositeOperation = "overlay";
        ctx.fillStyle = "#FFFFFF";
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(title, 0, 0);
        ctx.restore();
      }
      output[key] = await new Promise((resolve, reject) => canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error(`Could not generate ${key}`));
      }, "image/png"));
    }
    return output;
  } finally {
    bitmap.close();
  }
}

export async function blobBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Could not read map image"));
    reader.readAsDataURL(blob);
  });
}
