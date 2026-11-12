"use client";

import "leaflet/dist/leaflet.css";

import { useEffect, useMemo } from "react";
import {
  AttributionControl,
  CircleMarker,
  GeoJSON,
  MapContainer,
  Polyline,
  TileLayer,
  Tooltip,
  ZoomControl,
  useMap,
  useMapEvents,
} from "react-leaflet";

import { useIsDark } from "@/components/theme-toggle";

import { ESITO, STATO_VARCO, ZONE, altezzaVarco, tipoStrada } from "@/lib/labels";
import type { LatLng, PuntoPercorso, RispostaPercorso } from "@/types/routing";
import type {
  Attraversamento,
  LayerVisibility,
  Selection,
  Varco,
  ZonesGeoJSON,
} from "@/types/zones";

const MILANO_CENTER: [number, number] = [45.4642, 9.19];

type MilanoMapProps = {
  zones: ZonesGeoJSON;
  varchi: Varco[];
  attraversamenti: Attraversamento[];
  visibility: LayerVisibility;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  percorso: {
    from: PuntoPercorso | null;
    to: PuntoPercorso | null;
    risultato: RispostaPercorso | null;
    /** 0 = percorso principale, 1+ = opzione di parcheggio */
    opzione: number;
  };
  picking: boolean;
  onMapPick: (p: LatLng) => void;
};

function PickHandler({ active, onPick }: { active: boolean; onPick: (p: LatLng) => void }) {
  const map = useMapEvents({
    click: (e) => {
      if (active) onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  useEffect(() => {
    map.getContainer().style.cursor = active ? "crosshair" : "";
  }, [map, active]);
  return null;
}

function FitRoute({ coords }: { coords: [number, number][] | null }) {
  const map = useMap();
  useEffect(() => {
    if (coords && coords.length > 1) map.fitBounds(coords, { padding: [40, 40] });
  }, [map, coords]);
  return null;
}

function FlyToSelection({ target }: { target: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 17), { duration: 0.8 });
  }, [map, target]);
  return null;
}

export default function MilanoMap({
  zones,
  varchi,
  attraversamenti,
  visibility,
  selection,
  onSelect,
  percorso,
  picking,
  onMapPick,
}: MilanoMapProps) {
  const r = percorso.risultato;
  const parcheggio = r && r.stato !== "errore" && percorso.opzione > 0 ? r.parcheggi[percorso.opzione - 1] : null;
  const principale = !parcheggio;
  const consigliato = parcheggio
    ? parcheggio.guida
    : r && (r.stato === "senza-varchi" || r.stato === "alternativo")
      ? r.percorso
      : null;
  const normale = principale && r && (r.stato === "alternativo" || r.stato === "impossibile") ? r.normale : null;
  const varchiCritici = new Set(normale?.varchiAttraversati.map((v) => v.id) ?? []);
  // memo: la mappa si ricentra solo quando cambia il percorso mostrato
  const fitCoords = useMemo(
    () =>
      consigliato
        ? [...consigliato.coordinate, ...(parcheggio?.piedi.coordinate ?? [])]
        : (normale?.coordinate ?? null),
    [consigliato, parcheggio, normale],
  );

  const dark = useIsDark();
  // contorno dei marker: si stacca dallo sfondo in entrambi i temi
  const ink = dark ? "#f8fafc" : "#0f172a";
  const halo = dark ? "#0f172a" : "#ffffff";

  const isSelected = (kind: "varco" | "attraversamento", id: string) =>
    selection?.kind === kind && selection.id === id;

  const target =
    selection?.kind === "varco"
      ? varchi.find((v) => v.id === selection.id)
      : selection?.kind === "attraversamento"
        ? attraversamenti.find((a) => a.id === selection.id)
        : undefined;

  return (
    <MapContainer
      center={MILANO_CENTER}
      zoom={12}
      className="size-full"
      scrollWheelZoom
      preferCanvas
      zoomControl={false}
      attributionControl={false}
    >
      {/* tile OSM standard; tono e tema scuro sono applicati via CSS (.map-tiles in globals.css) */}
      <TileLayer
        className="map-tiles"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · Dati: Comune di Milano'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <ZoomControl position="bottomright" />
      <AttributionControl position="bottomleft" prefix={false} />

      {zones.features
        .filter((f) => visibility.zone[f.properties.id])
        .map((f) => (
          <GeoJSON
            key={f.properties.id}
            data={f}
            interactive={false}
            style={{
              color: ZONE[f.properties.id].colore,
              weight: 2.5,
              opacity: 0.9,
              fillOpacity: f.properties.id === "area-c" ? (dark ? 0.14 : 0.1) : dark ? 0.07 : 0.05,
            }}
          />
        ))}

      {attraversamenti
        .filter((a) => visibility.esiti[a.esito])
        .map((a) => {
          const sel = isSelected("attraversamento", a.id);
          return (
            <CircleMarker
              key={`${a.id}-${sel}`}
              center={[a.lat, a.lng]}
              radius={sel ? 11 : a.esito === "senza-varco" ? 7 : 5}
              pathOptions={{
                color: sel ? ink : halo,
                weight: sel ? 3 : 1.5,
                fillColor: ESITO[a.esito].colore,
                fillOpacity: 0.95,
              }}
              eventHandlers={{ click: () => onSelect({ kind: "attraversamento", id: a.id }) }}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                <strong>{a.via ?? "Strada senza nome"}</strong>
                <br />
                {ESITO[a.esito].label} · {tipoStrada(a.tipoStrada)} · {a.direzione}
                {a.varcoVicino && (
                  <>
                    <br />
                    Varco più vicino: {a.varcoVicino.nome} ({a.varcoVicino.distanza} m)
                  </>
                )}
              </Tooltip>
            </CircleMarker>
          );
        })}

      {normale && (
        <Polyline
          key={`n-${dark}`}
          positions={normale.coordinate}
          pathOptions={{
            color: r?.stato === "impossibile" ? "#dc2626" : "#64748b",
            weight: 5,
            opacity: 0.7,
            dashArray: r?.stato === "impossibile" ? undefined : "8 8",
          }}
        />
      )}
      {consigliato && (
        <>
          {/* alone sotto la linea per farla risaltare sulla mappa */}
          <Polyline positions={consigliato.coordinate} pathOptions={{ color: halo, weight: 10, opacity: 0.85 }} />
          <Polyline positions={consigliato.coordinate} pathOptions={{ color: "#16a34a", weight: 6, opacity: 1 }} />
        </>
      )}
      {parcheggio && (
        <>
          <Polyline
            positions={parcheggio.piedi.coordinate}
            pathOptions={{ color: "#0ea5e9", weight: 4, opacity: 0.95, dashArray: "2 8", lineCap: "round" }}
          />
          <CircleMarker
            key={`p-${parcheggio.parcheggio.lat}-${parcheggio.parcheggio.lng}`}
            center={[parcheggio.parcheggio.lat, parcheggio.parcheggio.lng]}
            radius={10}
            pathOptions={{ color: halo, weight: 3, fillColor: "#0284c7", fillOpacity: 1 }}
          >
            <Tooltip permanent direction="center" className="route-pin">
              P
            </Tooltip>
          </CircleMarker>
        </>
      )}

      {varchi
        .filter((v) => visibility.varchi[v.zona] || varchiCritici.has(v.id))
        .map((v) => {
          const sel = isSelected("varco", v.id);
          const critico = varchiCritici.has(v.id);
          return (
            <CircleMarker
              key={`${v.id}-${sel}-${critico}`}
              center={[v.lat, v.lng]}
              radius={sel ? 10 : critico ? 9 : 6}
              pathOptions={{
                color: sel ? ink : critico ? "#dc2626" : ZONE[v.zona].colore,
                weight: sel || critico ? 3 : 2,
                fillColor: STATO_VARCO[v.stato].colore,
                fillOpacity: 1,
              }}
              eventHandlers={{ click: () => onSelect({ kind: "varco", id: v.id }) }}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                <strong>
                  {ZONE[v.zona].nome} · {v.nome}
                </strong>
                <br />
                {v.via ?? "—"} · {altezzaVarco(v)}
                <br />
                Stato: {STATO_VARCO[v.stato].label}
              </Tooltip>
            </CircleMarker>
          );
        })}

      {(["from", "to"] as const).map((k) => {
        const p = percorso[k];
        if (!p) return null;
        return (
          <CircleMarker
            key={`${k}-${p.lat}-${p.lng}`}
            center={[p.lat, p.lng]}
            radius={10}
            pathOptions={{ color: "#ffffff", weight: 3, fillColor: k === "from" ? "#2563eb" : "#e11d48", fillOpacity: 1 }}
          >
            <Tooltip permanent direction="center" className="route-pin">
              {k === "from" ? "A" : "B"}
            </Tooltip>
          </CircleMarker>
        );
      })}

      <FlyToSelection target={target ?? null} />
      <FitRoute coords={fitCoords} />
      <PickHandler active={picking} onPick={onMapPick} />
    </MapContainer>
  );
}
