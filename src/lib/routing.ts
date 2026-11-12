import "server-only";

import * as turf from "@turf/turf";
import type { Feature, LineString, MultiPolygon, Polygon, Position } from "geojson";

import { varchi, zones } from "@/data/zones";
import type {
  LatLng,
  Manovra,
  OpzioneParcheggio,
  PercorsoCalcolato,
  RichiestaPercorso,
  RispostaPercorso,
  VarcoSulPercorso,
} from "@/types/routing";
import type { Varco, ZoneId } from "@/types/zones";

const VALHALLA_URL = process.env.VALHALLA_URL ?? "https://valhalla1.openstreetmap.de/route";
const USER_AGENT = "mappa-area-milano/0.1 (open data viewer, uso non commerciale)";

/** Limite del server pubblico Valhalla (errore 157). */
const MAX_EXCLUDE = 50;
/** Tentativi massimi di ricalcolo escludendo i varchi incontrati. */
const MAX_ITERAZIONI = 10;
const MAX_ITERAZIONI_PARCHEGGIO = 6;
/** Un varco è "sul percorso" se dista al massimo questo dalla linea del percorso. */
const GATE_ON_ROUTE_M = 20;
/** Finestra lungo il percorso, attorno al varco, in cui cercare l'ingresso nella zona. */
const ENTRY_WINDOW_M = 400;

/** Parcheggi: punti del perimetro entro questa distanza (in linea d'aria) dall'arrivo. */
const PARCHEGGIO_MAX_M = 2500;
/** Distanza minima tra due punti di parcheggio candidati, per avere alternative diverse. */
const PARCHEGGIO_SEPARAZIONE_M = 300;
const PARCHEGGIO_CANDIDATI = 4;
const PARCHEGGIO_OPZIONI = 2;

const zonePolygons = Object.fromEntries(
  zones.features.map((f) => [f.properties.id, f as Feature<Polygon | MultiPolygon>]),
) as Record<ZoneId, Feature<Polygon | MultiPolygon>>;

class NessunPercorsoError extends Error {}

// ---------------------------------------------------------------------------
// Valhalla
// ---------------------------------------------------------------------------

/** Decodifica una polyline Valhalla (precisione 6) in coordinate [lng, lat]. */
function decodePolyline6(str: string): [number, number][] {
  const coords: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < str.length) {
    for (const axis of [0, 1]) {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        byte = str.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += delta;
      else lng += delta;
    }
    coords.push([lng / 1e6, lat / 1e6]);
  }
  return coords;
}

type ValhallaManeuver = { instruction: string; length: number; time: number; street_names?: string[] };
type ValhallaLeg = { shape: string; maneuvers: ValhallaManeuver[] };
type ValhallaResponse = {
  trip?: { summary: { length: number; time: number }; legs: ValhallaLeg[] };
  error_code?: number;
  error?: string;
};

type Tragitto = Awaited<ReturnType<typeof valhallaRoute>>;

async function valhallaRoute(
  from: LatLng,
  to: LatLng,
  exclude: Varco[] = [],
  costing: "auto" | "pedestrian" = "auto",
) {
  const res = await fetch(VALHALLA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
    body: JSON.stringify({
      locations: [
        { lat: from.lat, lon: from.lng },
        { lat: to.lat, lon: to.lng },
      ],
      costing,
      units: "kilometers",
      language: "it-IT",
      exclude_locations: exclude.map((g) => ({ lat: g.lat, lon: g.lng })),
    }),
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  const json = (await res.json()) as ValhallaResponse;
  if (!res.ok || !json.trip) {
    // 442: nessun percorso; 170/171: punti non raggiungibili
    if ([170, 171, 441, 442].includes(json.error_code ?? -1)) throw new NessunPercorsoError(json.error);
    throw new Error(`Valhalla: ${json.error ?? `HTTP ${res.status}`}`);
  }

  const coordinates = json.trip.legs.flatMap((leg) => decodePolyline6(leg.shape));
  const maneuvers = json.trip.legs.flatMap((leg) => leg.maneuvers);
  const manovre: Manovra[] = maneuvers.map((m) => ({
    istruzione: m.instruction,
    km: m.length,
    via: m.street_names?.join(" / ") ?? null,
  }));
  return {
    linea: turf.lineString(coordinates),
    km: json.trip.summary.length,
    minuti: json.trip.summary.time / 60,
    manovre,
  };
}

const toLeaflet = (coords: Position[]) => coords.map(([lng, lat]) => [lat, lng] as [number, number]);

const toPercorso = (r: Tragitto, passati: VarcoSulPercorso[]): PercorsoCalcolato => ({
  coordinate: toLeaflet(r.linea.geometry.coordinates),
  km: Math.round(r.km * 10) / 10,
  minuti: Math.round(r.minuti),
  manovre: r.manovre,
  varchiAttraversati: passati,
});

const ref = (g: Varco): VarcoSulPercorso => ({
  id: g.id,
  zona: g.zona,
  nome: g.nome,
  via: g.via,
  stato: g.stato,
  lat: g.lat,
  lng: g.lng,
});

// ---------------------------------------------------------------------------
// varchi attraversati in ingresso
// ---------------------------------------------------------------------------

/**
 * Restituisce i varchi che il percorso attraversa ENTRANDO nella loro zona:
 * il varco deve stare sulla linea del percorso e, nei dintorni del varco,
 * il percorso deve passare da fuori a dentro il perimetro. Uscire non conta.
 */
function varchiInIngresso(linea: Feature<LineString>, candidati: Varco[]): VarcoSulPercorso[] {
  const [minX, minY, maxX, maxY] = turf.bbox(linea);
  const pad = 0.001;
  const lunghezza = turf.length(linea, { units: "meters" });
  const risultato: VarcoSulPercorso[] = [];

  for (const g of candidati) {
    if (g.lng < minX - pad || g.lng > maxX + pad || g.lat < minY - pad || g.lat > maxY + pad) continue;
    const pt = turf.point([g.lng, g.lat]);
    const vicino = turf.nearestPointOnLine(linea, pt, { units: "meters" });
    if ((vicino.properties.dist ?? Infinity) > GATE_ON_ROUTE_M) continue;

    const posizione = vicino.properties.location ?? 0;
    const da = Math.max(0, posizione - ENTRY_WINDOW_M);
    const a = Math.min(lunghezza, posizione + ENTRY_WINDOW_M);
    const tratto = turf.lineSliceAlong(linea, da, a, { units: "meters" }).geometry.coordinates;

    const poligono = zonePolygons[g.zona];
    let dentro = turf.booleanPointInPolygon(tratto[0], poligono);
    let entra = false;
    for (const c of tratto.slice(1)) {
      const ora = turf.booleanPointInPolygon(c, poligono);
      if (!dentro && ora) entra = true;
      dentro = ora;
    }
    if (entra) risultato.push(ref(g));
  }
  return risultato;
}

// ---------------------------------------------------------------------------
// percorso che evita i varchi (ricalcolo iterativo)
// ---------------------------------------------------------------------------

type EsitoEvita =
  | { ok: true; tragitto: Tragitto; percorso: PercorsoCalcolato; normale: PercorsoCalcolato; esclusi: Varco[] }
  | { ok: false; normale: PercorsoCalcolato | null; esclusi: Varco[] };

/**
 * Calcola il percorso più rapido; se entra in una zona passando da un varco,
 * ricalcola escludendo quei varchi finché il percorso è pulito.
 */
async function evitaVarchi(from: LatLng, to: LatLng, candidati: Varco[], maxIterazioni: number): Promise<EsitoEvita> {
  let normale: PercorsoCalcolato | null = null;
  const esclusi: Varco[] = [];

  for (let i = 0; i < maxIterazioni; i++) {
    let r: Tragitto;
    try {
      r = await valhallaRoute(from, to, esclusi);
    } catch (err) {
      if (err instanceof NessunPercorsoError) return { ok: false, normale, esclusi };
      throw err;
    }

    const passati = varchiInIngresso(r.linea, candidati);
    const percorso = toPercorso(r, passati);
    normale ??= percorso;
    if (passati.length === 0) return { ok: true, tragitto: r, percorso, normale, esclusi };

    const nuovi = passati
      .filter((p) => !esclusi.some((e) => e.id === p.id))
      .map((p) => varchi.find((g) => g.id === p.id)!);
    // Valhalla ha ignorato l'esclusione (varco agganciato a una strada laterale)
    // oppure abbiamo raggiunto il limite di esclusioni.
    if (nuovi.length === 0 || esclusi.length + nuovi.length > MAX_EXCLUDE) break;
    esclusi.push(...nuovi);
  }
  return { ok: false, normale, esclusi };
}

// ---------------------------------------------------------------------------
// opzioni "parcheggia fuori dalla zona e prosegui a piedi"
// ---------------------------------------------------------------------------

/** Punti appena fuori dal perimetro della zona, i più vicini all'arrivo e ben distanziati tra loro. */
function puntiDiParcheggio(zona: ZoneId, to: LatLng): LatLng[] {
  const poligono = zonePolygons[zona];
  const dest = turf.point([to.lng, to.lat]);
  const campioni: { coord: Position; dist: number }[] = [];

  for (const linea of turf.flatten(turf.polygonToLine(poligono)).features as Feature<LineString>[]) {
    const lunghezza = turf.length(linea, { units: "meters" });
    for (let m = 0; m < lunghezza; m += 40) {
      const coord = turf.along(linea, m, { units: "meters" }).geometry.coordinates;
      const dist = turf.distance(dest, coord, { units: "meters" });
      if (dist <= PARCHEGGIO_MAX_M) campioni.push({ coord, dist });
    }
  }
  campioni.sort((a, b) => a.dist - b.dist);

  const scelti: LatLng[] = [];
  for (const { coord } of campioni) {
    if (scelti.length >= PARCHEGGIO_CANDIDATI) break;
    if (scelti.some((s) => turf.distance([s.lng, s.lat], coord, { units: "meters" }) < PARCHEGGIO_SEPARAZIONE_M)) continue;
    // sposta il punto verso l'esterno (lontano dall'arrivo) finché è fuori dalla zona
    const direzione = turf.bearing(dest, coord);
    for (const offset of [25, 50, 80]) {
      const fuori = turf.destination(coord, offset, direzione, { units: "meters" }).geometry.coordinates;
      if (!turf.booleanPointInPolygon(fuori, poligono)) {
        scelti.push({ lat: fuori[1], lng: fuori[0] });
        break;
      }
    }
  }
  return scelti;
}

async function opzioniParcheggio(req: RichiestaPercorso, candidati: Varco[]): Promise<OpzioneParcheggio[]> {
  const inZona = (z: ZoneId, p: LatLng) => turf.booleanPointInPolygon([p.lng, p.lat], zonePolygons[z]);
  // zone da evitare in cui si deve entrare per arrivare (arrivo dentro, partenza fuori)
  const zoneDaNonEntrare = req.zone.filter((z) => inZona(z, req.to) && !inZona(z, req.from));
  if (zoneDaNonEntrare.length === 0) return [];

  const opzioni: OpzioneParcheggio[] = [];
  for (const zona of zoneDaNonEntrare) {
    for (const punto of puntiDiParcheggio(zona, req.to)) {
      const esito = await evitaVarchi(req.from, punto, candidati, MAX_ITERAZIONI_PARCHEGGIO);
      if (!esito.ok) continue;

      // fine reale del percorso in auto (Valhalla aggancia il punto alla strada più vicina)
      const fine = esito.tragitto.linea.geometry.coordinates.at(-1)!;
      const parcheggio = { lat: fine[1], lng: fine[0] };
      if (inZona(zona, parcheggio)) continue; // la strada agganciata è dentro la zona

      let piedi: Tragitto;
      try {
        piedi = await valhallaRoute(parcheggio, req.to, [], "pedestrian");
      } catch {
        continue;
      }
      const ultimaVia = [...esito.tragitto.manovre].reverse().find((m) => m.via)?.via ?? null;
      opzioni.push({
        zona,
        parcheggio: { ...parcheggio, via: ultimaVia },
        guida: esito.percorso,
        piedi: {
          coordinate: toLeaflet(piedi.linea.geometry.coordinates),
          km: Math.round(piedi.km * 100) / 100,
          minuti: Math.round(piedi.minuti),
        },
        varchiEvitati: esito.esclusi.map(ref),
        minutiTotali: Math.round(esito.tragitto.minuti + piedi.minuti),
      });
    }
  }

  // migliori per tempo totale, scartando parcheggi quasi coincidenti
  opzioni.sort((a, b) => a.minutiTotali - b.minutiTotali);
  const uniche: OpzioneParcheggio[] = [];
  for (const o of opzioni) {
    if (uniche.length >= PARCHEGGIO_OPZIONI) break;
    const doppione = uniche.some(
      (u) => turf.distance([u.parcheggio.lng, u.parcheggio.lat], [o.parcheggio.lng, o.parcheggio.lat], { units: "meters" }) < 150,
    );
    if (!doppione) uniche.push(o);
  }
  return uniche;
}

// ---------------------------------------------------------------------------
// API pubblica
// ---------------------------------------------------------------------------

export async function calcolaPercorso(req: RichiestaPercorso): Promise<RispostaPercorso> {
  const candidati = varchi.filter((g) => req.zone.includes(g.zona) && (g.attivo || req.includiPreEsercizio));

  const esito = await evitaVarchi(req.from, req.to, candidati, MAX_ITERAZIONI);
  if (!esito.normale) return { stato: "errore", messaggio: "Nessun percorso stradale tra i due punti." };

  // Se il percorso diretto è pulito fin dal primo tentativo non servono alternative.
  const diretto = esito.ok && esito.esclusi.length === 0;
  const parcheggi = diretto ? [] : await opzioniParcheggio(req, candidati);

  if (esito.ok && diretto) {
    return { stato: "senza-varchi", messaggio: "Il percorso più rapido non passa da nessun varco.", percorso: esito.percorso, parcheggi };
  }
  if (esito.ok) {
    const n = esito.esclusi.length;
    return {
      stato: "alternativo",
      messaggio: `Percorso alternativo che evita ${n} varc${n === 1 ? "o" : "hi"}.`,
      percorso: esito.percorso,
      normale: esito.normale,
      varchiEvitati: esito.esclusi.map(ref),
      parcheggi,
    };
  }
  return {
    stato: "impossibile",
    messaggio:
      parcheggi.length > 0
        ? "Con l'auto non si arriva a destinazione senza passare da un varco, ma puoi parcheggiare appena fuori dalla zona e proseguire a piedi."
        : "Non esiste un percorso che eviti tutti i varchi: ogni strada utile passa da una telecamera.",
    normale: esito.normale,
    varchiEvitati: esito.esclusi.map(ref),
    parcheggi,
  };
}
