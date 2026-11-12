import type { StatoVarco, ZoneId } from "@/types/zones";

export type LatLng = { lat: number; lng: number };

export type PuntoPercorso = LatLng & { label: string };

export type RichiestaPercorso = {
  from: LatLng;
  to: LatLng;
  /** Zone i cui varchi vanno evitati. */
  zone: ZoneId[];
  /** Considera anche i varchi in pre-esercizio / da programmare. */
  includiPreEsercizio: boolean;
};

export type VarcoSulPercorso = {
  id: string;
  zona: ZoneId;
  nome: string;
  via: string | null;
  stato: StatoVarco;
  lat: number;
  lng: number;
};

export type Manovra = { istruzione: string; km: number; via: string | null };

export type PercorsoCalcolato = {
  /** [lat, lng] pronti per Leaflet. */
  coordinate: [number, number][];
  km: number;
  minuti: number;
  manovre: Manovra[];
  /** Varchi attraversati in ingresso dalla zona. */
  varchiAttraversati: VarcoSulPercorso[];
};

/** Opzione secondaria: si parcheggia fuori dalla zona e si prosegue a piedi. */
export type OpzioneParcheggio = {
  /** Zona in cui non si entra con l'auto. */
  zona: ZoneId;
  /** Dove lasciare l'auto (via e coordinate). */
  parcheggio: LatLng & { via: string | null };
  guida: PercorsoCalcolato;
  piedi: { coordinate: [number, number][]; km: number; minuti: number };
  varchiEvitati: VarcoSulPercorso[];
  minutiTotali: number;
};

type Base = { messaggio: string; parcheggi: OpzioneParcheggio[] };

export type RispostaPercorso =
  | (Base & { stato: "senza-varchi"; percorso: PercorsoCalcolato })
  | (Base & {
      stato: "alternativo";
      percorso: PercorsoCalcolato;
      normale: PercorsoCalcolato;
      varchiEvitati: VarcoSulPercorso[];
    })
  | (Base & { stato: "impossibile"; normale: PercorsoCalcolato; varchiEvitati: VarcoSulPercorso[] })
  | { stato: "errore"; messaggio: string };

export type RisultatoGeocoding = LatLng & { label: string };
