import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";

/** Zone a traffico limitato gestite dal Comune di Milano. */
export type ZoneId = "area-b" | "area-c";

export type ZonesGeoJSON = FeatureCollection<Polygon | MultiPolygon, { id: ZoneId }>;

export type StatoVarco =
  | "ATTIVI E SANZIONANTI"
  | "IN PRE-ESERCIZIO"
  | "DA PROGRAMMARE PRE-ESERCIZIO";

/** Varco elettronico (telecamera) di accesso ad Area B o Area C. */
export type Varco = {
  id: string;
  zona: ZoneId;
  codice: number;
  nome: string;
  stato: StatoVarco;
  attivo: boolean;
  autorizzazione: string | null;
  lat: number;
  lng: number;
  /** Via su cui si trova il varco (OSM / Nominatim). */
  via: string | null;
  /** Civico più vicino, se disponibile. */
  civico: string | null;
  quartiere: string | null;
  /** Incrocio più vicino e distanza in metri. */
  incrocio: { via: string; distanza: number } | null;
};

export type EsitoAttraversamento = "senza-varco" | "varco-non-attivo" | "coperta" | "solo-uscita";

type VarcoRef = { id: string; nome: string; stato: StatoVarco };

/** Punto in cui una strada attraversa il confine di Area B. */
export type Attraversamento = {
  id: string;
  via: string | null;
  tipoStrada: string;
  direzione: "doppio senso" | "solo ingresso" | "solo uscita" | "carreggiate separate";
  esito: EsitoAttraversamento;
  lat: number;
  lng: number;
  varcoVicino: (VarcoRef & { distanza: number }) | null;
  varcoCopertura: VarcoRef | null;
  osmWayIds: number[];
};

export type DatasetMeta = {
  aggiornatoIl: string;
  fonti: Record<string, string>;
  parametri: Record<string, number>;
};

export type Selection = { kind: "varco" | "attraversamento"; id: string } | null;

export type LayerVisibility = {
  zone: Record<ZoneId, boolean>;
  varchi: Record<ZoneId, boolean>;
  esiti: Record<EsitoAttraversamento, boolean>;
};
