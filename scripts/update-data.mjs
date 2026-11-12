#!/usr/bin/env node
/**
 * Scarica gli open data del Comune di Milano (varchi Area B / Area C e perimetri),
 * li arricchisce con OpenStreetMap e genera i JSON usati dall'app in src/data/generated.
 *
 *   npm run data:update            -> usa la cache per geocoding/Overpass se presente
 *   npm run data:update -- --fresh -> ignora la cache
 *
 * Fonti:
 *  - ds959  Varchi Area B                       (dati.comune.milano.it)
 *  - ds82   Varchi Area C                       (dati.comune.milano.it)
 *  - ds51   Aree pedonali e ZTL (perimetri B/C) (dati.comune.milano.it)
 *  - OpenStreetMap via Overpass API (rete stradale) e Nominatim (civici)
 */
import fs from "node:fs/promises";
import path from "node:path";
import * as turf from "@turf/turf";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "src/data/generated");
const CACHE_DIR = path.join(ROOT, "scripts/.cache");
const FRESH = process.argv.includes("--fresh");

const SOURCES = {
  varchiB:
    "https://dati.comune.milano.it/dataset/cebfe28e-a50e-4b81-9d14-7b0d37170f0d/resource/c3439df3-673d-45e7-b151-c6d8d70ba0e4/download/areab_varchi.geojson",
  varchiC:
    "https://dati.comune.milano.it/dataset/4cad1605-8225-4ecd-9b82-868b3af453e5/resource/fa8fcc31-1722-4a50-a0ae-ce7b9c0d0361/download/ingressi_areac_varchi.geojson",
  aree: "https://dati.comune.milano.it/dataset/d7d9179a-8228-427f-9c86-1e30154be4fe/resource/d788b26b-31b4-4e57-992d-276a1280c8c2/download/disciplina_aree.geojson",
};

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const NOMINATIM = "https://nominatim.openstreetmap.org/reverse";
const USER_AGENT = "mappa-area-milano/0.1 (open data viewer, uso non commerciale)";

/** Strade percorribili dai veicoli considerate per gli attraversamenti del confine. */
const DRIVABLE =
  "^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|service)$";

/** Un varco "copre" un attraversamento se è entro questa distanza dal punto di confine… */
const COVER_RADIUS_M = 120;
/** …oppure se sta sulla stessa strada (entro 25 m dalla sua linea) e a meno di 500 m dal confine. */
const SAME_ROAD_TOLERANCE_M = 25;
const SAME_ROAD_MAX_M = 500;

// ---------------------------------------------------------------------------
// utilità
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url, init = {}, { retries = 6, label = url } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { "User-Agent": USER_AGENT, ...init.headers },
        signal: AbortSignal.timeout(180_000),
      });
      if (res.ok) return res;
      if (res.status < 500 && res.status !== 429) throw new Error(`HTTP ${res.status}`);
      throw new Error(`HTTP ${res.status} (ritentabile)`);
    } catch (err) {
      if (attempt >= retries) throw new Error(`${label}: ${err.message}`);
      const wait = 5_000 * attempt;
      console.warn(`  ! ${label}: ${err.message} — nuovo tentativo tra ${wait / 1000}s`);
      await sleep(wait);
    }
  }
}

async function readCache(name) {
  if (FRESH) return null;
  try {
    return JSON.parse(await fs.readFile(path.join(CACHE_DIR, name), "utf8"));
  } catch {
    return null;
  }
}

async function writeJson(file, data, pretty = false) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, pretty ? 2 : 0) + "\n");
}

const round = (n, d = 6) => Math.round(n * 10 ** d) / 10 ** d;
const titleCase = (s) =>
  s.toLowerCase().replace(/(^|[\s'’\-/.(])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());

async function overpass(query, cacheName) {
  const cached = await readCache(cacheName);
  if (cached) return cached;
  let lastErr;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetchWithRetry(
        endpoint,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ data: query }),
        },
        { retries: 3, label: `Overpass ${new URL(endpoint).host}` },
      );
      const json = await res.json();
      await writeJson(path.join(CACHE_DIR, cacheName), json);
      return json;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// 1. open data Comune di Milano
// ---------------------------------------------------------------------------

async function loadComune() {
  console.log("→ Download open data Comune di Milano");
  const [varchiB, varchiC, aree] = await Promise.all(
    Object.entries(SOURCES).map(async ([key, url]) => {
      const res = await fetchWithRetry(url, {}, { label: key });
      return res.json();
    }),
  );
  console.log(
    `  varchi Area B: ${varchiB.features.length}, varchi Area C: ${varchiC.features.length}, aree: ${aree.features.length}`,
  );

  const pickZone = (tipo) => {
    const f = aree.features.find((x) => x.properties.tipo === tipo);
    if (!f) throw new Error(`Perimetro ${tipo} non trovato nel dataset ds51`);
    return turf.feature(f.geometry, { tipo });
  };

  return { varchiB, varchiC, areaB: pickZone("AREA_B"), areaC: pickZone("AREA_C") };
}

// ---------------------------------------------------------------------------
// 2. strade che attraversano il confine di Area B
// ---------------------------------------------------------------------------

function outerRings(multi) {
  return multi.geometry.type === "Polygon"
    ? [multi.geometry.coordinates[0]]
    : multi.geometry.coordinates.map((poly) => poly[0]);
}

async function findBoundaryCrossings(areaB, gatesB) {
  console.log("→ Overpass: strade lungo il confine di Area B");
  // Il perimetro viene spezzato in tratti da 40 vertici; per ognuno si interroga il
  // suo riquadro (leggermente allargato). Molto più leggero di un `around` su 2000 punti.
  const PAD = 0.0004; // ~40 m
  const statements = [];
  for (const ring of outerRings(areaB)) {
    for (let i = 0; i < ring.length - 1; i += 40) {
      const chunk = ring.slice(i, i + 41);
      const lats = chunk.map((c) => c[1]);
      const lngs = chunk.map((c) => c[0]);
      const bbox = [
        Math.min(...lats) - PAD,
        Math.min(...lngs) - PAD,
        Math.max(...lats) + PAD,
        Math.max(...lngs) + PAD,
      ].map((n) => round(n, 5));
      statements.push(`way["highway"~"${DRIVABLE}"](${bbox.join(",")});`);
    }
  }
  const query = `[out:json][timeout:240];(${statements.join("")});out tags geom;`;
  const data = await overpass(query, "overpass-confine-area-b.json");
  const ways = data.elements.filter((e) => e.type === "way" && e.geometry?.length > 1);
  console.log(`  ${ways.length} tratti stradali vicini al confine`);

  const boundaryLines = outerRings(areaB).map((ring) => turf.lineString(ring));
  const gatePoints = gatesB.map((g) => ({ gate: g, pt: turf.point([g.lng, g.lat]) }));

  const crossings = [];
  for (const way of ways) {
    const t = way.tags ?? {};
    if (["private", "no"].includes(t.access) || ["private", "no"].includes(t.motor_vehicle)) continue;
    if (["parking_aisle", "driveway", "drive-through"].includes(t.service)) continue;
    if (t.area === "yes") continue;
    // Area B non si applica ad autostrade e tangenziali: si entra solo dagli svincoli su strade urbane.
    if (t.highway === "motorway" || t.highway === "motorway_link") continue;

    const coords = way.geometry.map((p) => [p.lon, p.lat]);
    const inside = coords.map((c) => turf.booleanPointInPolygon(c, areaB));
    const line = turf.lineString(coords);

    const oneway =
      t.oneway === "yes" || t.oneway === "1" || t.junction === "roundabout" || t.highway === "motorway"
        ? 1
        : t.oneway === "-1"
          ? -1
          : 0;

    for (let i = 0; i < coords.length - 1; i++) {
      if (inside[i] === inside[i + 1]) continue;

      const segment = turf.lineString([coords[i], coords[i + 1]]);
      const hit = boundaryLines
        .map((b) => turf.lineIntersect(segment, b).features[0])
        .find(Boolean);
      const point = hit ? hit.geometry.coordinates : turf.midpoint(coords[i], coords[i + 1]).geometry.coordinates;

      // senso di marcia rispetto all'Area B
      const wayDirEnters = !inside[i] && inside[i + 1];
      let direzione = "doppio senso";
      if (oneway !== 0) {
        const enters = oneway === 1 ? wayDirEnters : !wayDirEnters;
        direzione = enters ? "solo ingresso" : "solo uscita";
      }

      // varco più vicino e copertura
      let nearest = null;
      let covering = null;
      for (const { gate, pt } of gatePoints) {
        const dCross = turf.distance(pt, point, { units: "meters" });
        if (!nearest || dCross < nearest.distanza) nearest = { gate, distanza: dCross };
        const onRoad =
          dCross <= SAME_ROAD_MAX_M &&
          turf.pointToLineDistance(pt, line, { units: "meters" }) <= SAME_ROAD_TOLERANCE_M;
        if (dCross <= COVER_RADIUS_M || onRoad) {
          // preferisci un varco attivo, poi il più vicino
          const better =
            !covering ||
            (gate.attivo && !covering.gate.attivo) ||
            (gate.attivo === covering.gate.attivo && dCross < covering.distanza);
          if (better) covering = { gate, distanza: dCross };
        }
      }

      let esito;
      if (direzione === "solo uscita") esito = "solo-uscita";
      else if (!covering) esito = "senza-varco";
      else if (!covering.gate.attivo) esito = "varco-non-attivo";
      else esito = "coperta";

      crossings.push({
        osmWayId: way.id,
        via: t.name ?? null,
        tipoStrada: t.highway,
        direzione,
        esito,
        lat: round(point[1]),
        lng: round(point[0]),
        varcoVicino: nearest
          ? { id: nearest.gate.id, nome: nearest.gate.nome, stato: nearest.gate.stato, distanza: Math.round(nearest.distanza) }
          : null,
        varcoCopertura: covering ? { id: covering.gate.id, nome: covering.gate.nome, stato: covering.gate.stato } : null,
      });
    }
  }

  // un'unica voce per strada se gli attraversamenti sono a meno di 60 m (es. carreggiate separate)
  const merged = [];
  const priority = { "senza-varco": 0, "varco-non-attivo": 1, coperta: 2, "solo-uscita": 3 };
  for (const c of crossings.sort((a, b) => priority[a.esito] - priority[b.esito])) {
    const dup = merged.find(
      (m) =>
        m.via === c.via &&
        m.tipoStrada === c.tipoStrada &&
        turf.distance([m.lng, m.lat], [c.lng, c.lat], { units: "meters" }) < 60,
    );
    if (dup) {
      dup.osmWayIds.push(c.osmWayId);
      if (c.direzione !== dup.direzione) dup.direzione = "carreggiate separate";
      continue;
    }
    const { osmWayId, ...rest } = c;
    merged.push({ id: `X${merged.length + 1}`, ...rest, osmWayIds: [osmWayId] });
  }

  const count = (e) => merged.filter((m) => m.esito === e).length;
  console.log(
    `  ${merged.length} attraversamenti: ${count("coperta")} coperti, ${count("senza-varco")} senza varco, ` +
      `${count("varco-non-attivo")} con varco non attivo, ${count("solo-uscita")} solo uscita`,
  );
  return merged;
}

// ---------------------------------------------------------------------------
// 3. "altezza" dei varchi: civico più vicino e incrocio più vicino
// ---------------------------------------------------------------------------

async function reverseGeocode(gates) {
  console.log("→ Nominatim: civico più vicino per ogni varco (1 richiesta/s)");
  const cacheFile = "nominatim.json";
  const cache = (await readCache(cacheFile)) ?? {};
  let done = 0;
  for (const g of gates) {
    const key = `${g.lat},${g.lng}`;
    if (!cache[key]) {
      const url = `${NOMINATIM}?format=jsonv2&addressdetails=1&zoom=18&lat=${g.lat}&lon=${g.lng}`;
      try {
        const res = await fetchWithRetry(url, { headers: { "Accept-Language": "it" } }, { retries: 3, label: `Nominatim ${g.id}` });
        const j = await res.json();
        cache[key] = { road: j.address?.road ?? null, house_number: j.address?.house_number ?? null, suburb: j.address?.suburb ?? j.address?.quarter ?? null };
      } catch (err) {
        console.warn(`  ! ${err.message}`);
      }
      await sleep(1100); // policy Nominatim: max 1 richiesta al secondo
      if (++done % 25 === 0) {
        console.log(`  ${done} varchi geocodificati…`);
        await writeJson(path.join(CACHE_DIR, cacheFile), cache);
      }
    }
    Object.assign(g, { _geo: cache[key] ?? {} });
  }
  await writeJson(path.join(CACHE_DIR, cacheFile), cache);
}

async function nearbyRoads(gates) {
  console.log("→ Overpass: strade attorno ai varchi");
  const statements = gates.map((g) => `way["highway"]["name"](around:120,${g.lat},${g.lng});`).join("");
  const data = await overpass(`[out:json][timeout:240];(${statements});out tags geom;`, "overpass-strade-varchi.json");
  return data.elements
    .filter((e) => e.type === "way" && e.geometry?.length > 1)
    // come incrocio valgono solo strade urbane carrabili (niente marciapiedi, piste, tangenziali)
    .filter((e) => new RegExp(DRIVABLE).test(e.tags.highway) && !e.tags.highway.startsWith("motorway") && e.tags.highway !== "service")
    .map((e) => ({ name: e.tags.name, line: turf.lineString(e.geometry.map((p) => [p.lon, p.lat])) }));
}

function locateGates(gates, roads) {
  for (const g of gates) {
    const pt = turf.point([g.lng, g.lat]);
    const byName = new Map();
    for (const r of roads) {
      const d = turf.pointToLineDistance(pt, r.line, { units: "meters" });
      if (d <= 120 && (!byName.has(r.name) || d < byName.get(r.name))) byName.set(r.name, d);
    }
    const sorted = [...byName.entries()].sort((a, b) => a[1] - b[1]);
    const via = g._geo.road ?? sorted[0]?.[0] ?? null;
    const incrocio = sorted.find(([name]) => name !== via);
    g.via = via;
    g.civico = g._geo.house_number ?? null;
    g.quartiere = g._geo.suburb ?? null;
    g.incrocio = incrocio ? { via: incrocio[0], distanza: Math.round(incrocio[1]) } : null;
    delete g._geo;
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const { varchiB, varchiC, areaB, areaC } = await loadComune();

  const gates = [
    ...varchiB.features.map((f) => {
      const [, codice, nome] = String(f.properties.nome).match(/^\s*(\d+)\s*-\s*(.+)$/) ?? [null, null, f.properties.nome];
      return {
        id: `B-${f.properties.id_amat}`,
        zona: "area-b",
        codice: codice ? Number(codice) : f.properties.id_amat,
        nome: titleCase(nome.trim()),
        stato: f.properties.stato,
        attivo: f.properties.stato === "ATTIVI E SANZIONANTI",
        autorizzazione: f.properties.autorizzaz ?? null,
        lat: round(f.geometry.coordinates[1]),
        lng: round(f.geometry.coordinates[0]),
      };
    }),
    ...varchiC.features.map((f) => ({
      id: `C-${f.properties.id_amat}`,
      zona: "area-c",
      codice: f.properties.id_amat,
      nome: titleCase(String(f.properties.label).trim()),
      stato: "ATTIVI E SANZIONANTI",
      attivo: true,
      autorizzazione: null,
      lat: round(f.geometry.coordinates[1]),
      lng: round(f.geometry.coordinates[0]),
    })),
  ].sort((a, b) => a.zona.localeCompare(b.zona) || a.codice - b.codice);

  const crossings = await findBoundaryCrossings(
    areaB,
    gates.filter((g) => g.zona === "area-b"),
  );

  await reverseGeocode(gates);
  locateGates(gates, await nearbyRoads(gates));

  const zones = turf.featureCollection([
    turf.feature(areaB.geometry, { id: "area-b" }),
    turf.feature(areaC.geometry, { id: "area-c" }),
  ]);

  await writeJson(path.join(OUT_DIR, "zones.json"), zones);
  await writeJson(path.join(OUT_DIR, "varchi.json"), gates, true);
  await writeJson(path.join(OUT_DIR, "attraversamenti.json"), crossings, true);
  await writeJson(
    path.join(OUT_DIR, "meta.json"),
    {
      aggiornatoIl: new Date().toISOString(),
      fonti: {
        varchiAreaB: "https://dati.comune.milano.it/dataset/ds959-varchi-areab",
        varchiAreaC: "https://dati.comune.milano.it/dataset/ds82_infogeo_varchi_elettronici_localizzazione_",
        perimetri: "https://dati.comune.milano.it/dataset/ds51_trafficotrasporti_aree_pedonali_ztl",
        stradeECivici: "© OpenStreetMap contributors (Overpass API, Nominatim)",
      },
      parametri: { COVER_RADIUS_M, SAME_ROAD_TOLERANCE_M, SAME_ROAD_MAX_M },
    },
    true,
  );
  console.log(`✓ Dati scritti in ${path.relative(ROOT, OUT_DIR)}`);
}

main().catch((err) => {
  console.error("✗", err);
  process.exit(1);
});
