import { MAP_API, MAP_ASSET_KEYS, mapNameKey } from "./valorant-map-library.mjs";

const generation = "4d86d0097a9a8d840c0b02324d922773f7079fcac88dedae30ab2ad483e21fde";
export const PLACEHOLDER_FILENAMES = MAP_ASSET_KEYS.map((key) => `${generation}-${key}.png`);
export const VALORANT_PLACEHOLDER = {
  name: "Placeholder",
  nextMap: `${MAP_API}/assets/${generation}-nextMap.png`,
  pickCard: `${MAP_API}/assets/${generation}-pickCard.png`,
  banCard: `${MAP_API}/assets/${generation}-banCard.png`,
};

const legacy = {
  nextMap: "https://drive.google.com/uc?export=view&id=1SwFGRHOcTuy4eNhdZgoWPk2vRMb-_Xsw",
  pickCard: "https://drive.google.com/uc?export=view&id=1bMnszxe7Gul-UHWoyxmFnJW45Ubx_gDs",
  banCard: "https://drive.google.com/uc?export=view&id=144YTLCUdiGBHlH7DsrZBVC_t_4R9CoFd",
};

export function migrateValorantPlaceholder(map) {
  if (mapNameKey(map.name) !== "placeholder") return map;
  return { ...map, ...Object.fromEntries(MAP_ASSET_KEYS.map((key) => [key,
    map[key] === legacy[key] ? VALORANT_PLACEHOLDER[key] : map[key],
  ])) };
}
