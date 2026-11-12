import type { Attraversamento, DatasetMeta, Varco, ZonesGeoJSON } from "@/types/zones";

import attraversamentiJson from "./generated/attraversamenti.json";
import metaJson from "./generated/meta.json";
import varchiJson from "./generated/varchi.json";
import zonesJson from "./generated/zones.json";

// I JSON sono generati da `npm run data:update` (scripts/update-data.mjs).
export const zones = zonesJson as ZonesGeoJSON;
export const varchi = varchiJson as Varco[];
export const attraversamenti = attraversamentiJson as Attraversamento[];
export const meta = metaJson as DatasetMeta;
