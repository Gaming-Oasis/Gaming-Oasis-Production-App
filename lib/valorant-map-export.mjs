import { generatedMapFilename } from "./valorant-map-library.mjs";

export async function prepareMapExport(files, fetchImpl = fetch) {
  const sources = new Map();
  const replace = (value) => {
    if (typeof value === "string") {
      const filename = generatedMapFilename(value);
      if (!filename) return value;
      const exportedName = `map-${filename}`;
      sources.set(exportedName, value);
      return exportedName;
    }
    if (Array.isArray(value)) return value.map(replace);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, replace(entry)]));
    return value;
  };
  const result = files.map((file) => ({ ...file, data: replace(file.data) }));
  for (const [filename, url] of sources) {
    const response = await fetchImpl(url);
    if (!response.ok) throw new Error(`Could not include ${filename}. Reconnect the local writer and retry export`);
    result.push({ filename, bytes: new Uint8Array(await response.arrayBuffer()) });
  }
  return result;
}
