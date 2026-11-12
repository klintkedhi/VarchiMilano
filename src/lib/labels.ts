import type { EsitoAttraversamento, StatoVarco, ZoneId } from "@/types/zones";

export const ZONE: Record<ZoneId, { nome: string; colore: string }> = {
  "area-b": { nome: "Area B", colore: "#2563eb" },
  "area-c": { nome: "Area C", colore: "#9333ea" },
};

export const STATO_VARCO: Record<StatoVarco, { label: string; colore: string }> = {
  "ATTIVI E SANZIONANTI": { label: "Attivo", colore: "#16a34a" },
  "IN PRE-ESERCIZIO": { label: "Pre-esercizio", colore: "#d97706" },
  "DA PROGRAMMARE PRE-ESERCIZIO": { label: "Da programmare", colore: "#6b7280" },
};

export const ESITO: Record<EsitoAttraversamento, { label: string; descrizione: string; colore: string }> = {
  "senza-varco": {
    label: "Senza varco",
    descrizione: "Nessuna telecamera di Area B vicino al punto in cui la strada attraversa il confine.",
    colore: "#dc2626",
  },
  "varco-non-attivo": {
    label: "Varco non attivo",
    descrizione: "C'è un varco, ma è in pre-esercizio o ancora da programmare.",
    colore: "#d97706",
  },
  coperta: {
    label: "Coperta",
    descrizione: "Ingresso controllato da un varco attivo.",
    colore: "#16a34a",
  },
  "solo-uscita": {
    label: "Solo uscita",
    descrizione: "Senso unico in uscita da Area B: non serve un varco.",
    colore: "#64748b",
  },
};

const TIPO_STRADA: Record<string, string> = {
  motorway: "Autostrada",
  motorway_link: "Svincolo autostradale",
  trunk: "Superstrada",
  trunk_link: "Svincolo superstrada",
  primary: "Principale",
  primary_link: "Raccordo principale",
  secondary: "Secondaria",
  secondary_link: "Raccordo secondario",
  tertiary: "Terziaria",
  tertiary_link: "Raccordo terziario",
  unclassified: "Locale",
  residential: "Residenziale",
  living_street: "Zona residenziale",
  service: "Di servizio",
};

export const tipoStrada = (t: string) => TIPO_STRADA[t] ?? t;

/** "civ. 12 · incrocio Via Rossi (40 m)" */
export function altezzaVarco(v: { civico: string | null; incrocio: { via: string; distanza: number } | null }) {
  const parts: string[] = [];
  if (v.civico) parts.push(`civ. ${v.civico}`);
  if (v.incrocio) parts.push(`incrocio ${v.incrocio.via} (${v.incrocio.distanza} m)`);
  return parts.join(" · ") || "—";
}
