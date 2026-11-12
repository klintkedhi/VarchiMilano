"use client";

import { ArrowUpDown, Car, Footprints, Loader2, MapPin, Search, Sparkles, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { STATO_VARCO, ZONE } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type {
  OpzioneParcheggio,
  PercorsoCalcolato,
  PuntoPercorso,
  RispostaPercorso,
  RisultatoGeocoding,
} from "@/types/routing";
import type { ZoneId } from "@/types/zones";

export type Estremo = "from" | "to";

type Props = {
  from: PuntoPercorso | null;
  to: PuntoPercorso | null;
  onChange: (which: Estremo, p: PuntoPercorso | null) => void;
  onSwap: () => void;
  picking: Estremo | null;
  onPick: (which: Estremo | null) => void;
  risultato: RispostaPercorso | null;
  onRisultato: (r: RispostaPercorso | null) => void;
  opzione: number;
  onOpzione: (i: number) => void;
  onFocusVarco: (id: string) => void;
};

export function PercorsoPanel({
  from,
  to,
  onChange,
  onSwap,
  picking,
  onPick,
  risultato,
  onRisultato,
  opzione,
  onOpzione,
  onFocusVarco,
}: Props) {
  const [zone, setZone] = useState<Record<ZoneId, boolean>>({ "area-b": true, "area-c": true });
  const [includiPreEsercizio, setIncludiPreEsercizio] = useState(false);
  const [loading, setLoading] = useState(false);

  const calcola = async () => {
    if (!from || !to) return;
    setLoading(true);
    onRisultato(null);
    try {
      const res = await fetch("/api/percorso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to,
          zone: (Object.keys(zone) as ZoneId[]).filter((z) => zone[z]),
          includiPreEsercizio,
        }),
      });
      onRisultato((await res.json()) as RispostaPercorso);
    } catch {
      onRisultato({ stato: "errore", messaggio: "Errore di rete, riprova." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="scrollbar-thin -mx-1 flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-1 pb-1">
      <div className="relative flex gap-2 rounded-xl border bg-background/60 p-2">
        {/* linea tratteggiata che collega A e B */}
        <span className="pointer-events-none absolute top-[30px] bottom-[30px] left-[19px] border-l-2 border-dotted border-muted-foreground/40" />
        <div className="flex flex-1 flex-col gap-2">
          <AddressField label="Partenza" marker="A" value={from} onChange={(p) => onChange("from", p)} picking={picking === "from"} onPick={() => onPick(picking === "from" ? null : "from")} />
          <AddressField label="Arrivo" marker="B" value={to} onChange={(p) => onChange("to", p)} picking={picking === "to"} onPick={() => onPick(picking === "to" ? null : "to")} />
        </div>
        <Button
          variant="outline"
          size="icon-sm"
          className="self-center rounded-full transition-transform hover:rotate-180"
          onClick={onSwap}
          aria-label="Inverti partenza e arrivo"
        >
          <ArrowUpDown />
        </Button>
      </div>

      <fieldset className="flex flex-col gap-2 text-xs">
        <legend className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Varchi da evitare
        </legend>
        <div className="flex gap-2">
          {(Object.keys(ZONE) as ZoneId[]).map((z) => (
            <button
              key={z}
              type="button"
              aria-pressed={zone[z]}
              onClick={() => setZone((s) => ({ ...s, [z]: !s[z] }))}
              className={cn(
                "flex flex-1 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all active:scale-[0.98]",
                !zone[z] && "text-muted-foreground hover:bg-muted/60",
              )}
              style={
                zone[z]
                  ? {
                      borderColor: ZONE[z].colore,
                      backgroundColor: `color-mix(in oklch, ${ZONE[z].colore} 10%, transparent)`,
                    }
                  : undefined
              }
            >
              <span
                className="flex size-4 items-center justify-center rounded-full border-2 transition-colors"
                style={{ borderColor: ZONE[z].colore, backgroundColor: zone[z] ? ZONE[z].colore : "transparent" }}
              >
                {zone[z] && <span className="size-1.5 rounded-full bg-white" />}
              </span>
              {ZONE[z].nome}
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-2.5 text-muted-foreground">
          <Switch size="sm" checked={includiPreEsercizio} onCheckedChange={setIncludiPreEsercizio} />
          Considera anche i varchi in pre-esercizio / da programmare
        </label>
      </fieldset>

      <Button
        size="lg"
        className="h-10 rounded-xl text-sm shadow-float"
        onClick={calcola}
        disabled={!from || !to || loading || (!zone["area-b"] && !zone["area-c"])}
      >
        {loading ? <Loader2 className="animate-spin" /> : <Sparkles />}
        {loading ? "Calcolo in corso…" : "Calcola percorso"}
      </Button>
      {loading && (
        <p className="text-xs text-muted-foreground">
          Sto cercando anche dove parcheggiare fuori dalle zone: può richiedere 10–20 secondi.
        </p>
      )}

      {risultato && <Risultato r={risultato} opzione={opzione} onOpzione={onOpzione} onFocusVarco={onFocusVarco} />}

      <p className="mt-auto pt-1 text-[11px] leading-relaxed text-muted-foreground">
        Percorsi calcolati con Valhalla su dati OpenStreetMap. Conta solo il passaggio in <em>ingresso</em> da un varco
        (uscire dalla zona non fa scattare la telecamera). Area B e Area C sono attive nei giorni feriali dalle 7:30
        alle 19:30: fuori orario i varchi non sanzionano. Verifica sempre la segnaletica.
      </p>
    </div>
  );
}

function AddressField({
  label,
  marker,
  value,
  onChange,
  picking,
  onPick,
}: {
  label: string;
  marker: string;
  value: PuntoPercorso | null;
  onChange: (p: PuntoPercorso | null) => void;
  picking: boolean;
  onPick: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RisultatoGeocoding[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    if (query.trim().length < 3) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.errore);
      setResults(json);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Ricerca non disponibile.");
    } finally {
      setLoading(false);
    }
  };

  const markerBadge = (
    <span
      className="relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ring-4 ring-card"
      style={{ backgroundColor: marker === "A" ? "#2563eb" : "#e11d48" }}
    >
      {marker}
    </span>
  );

  if (value) {
    return (
      <div className="flex h-9 items-center gap-2 text-sm">
        {markerBadge}
        <span className="flex h-full min-w-0 flex-1 items-center truncate rounded-lg bg-muted/70 px-3 font-medium" title={value.label}>
          {value.label}
        </span>
        <Button variant="ghost" size="icon-xs" onClick={() => onChange(null)} aria-label={`Cambia ${label.toLowerCase()}`}>
          <X />
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        {markerBadge}
        <Input
          className="h-9 rounded-lg"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setResults(null);
          }}
          placeholder={`${label}: via, piazza, luogo…`}
          aria-label={label}
        />
        <Button type="submit" variant="ghost" size="icon" aria-label="Cerca indirizzo" disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : <Search />}
        </Button>
        <Button
          type="button"
          variant={picking ? "default" : "ghost"}
          size="icon"
          onClick={onPick}
          aria-label="Scegli sulla mappa"
          title="Scegli sulla mappa"
        >
          <MapPin />
        </Button>
      </form>
      {error && <p className="mt-1 pl-8 text-xs text-destructive">{error}</p>}
      {results && (
        <ul className="animate-in fade-in-0 zoom-in-95 absolute inset-x-8 top-full z-20 mt-1.5 overflow-hidden rounded-xl border bg-popover p-1 text-sm shadow-float">
          {results.length === 0 && <li className="px-3 py-2 text-muted-foreground">Nessun risultato nell&apos;area di Milano.</li>}
          {results.map((r) => (
            <li key={`${r.lat},${r.lng}`}>
              <button
                type="button"
                className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-muted"
                onClick={() => {
                  onChange(r);
                  setResults(null);
                  setQuery("");
                }}
              >
                <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const STILE_ESITO: Record<RispostaPercorso["stato"], { titolo: string; colore: string }> = {
  "senza-varchi": { titolo: "Nessun varco sul percorso", colore: "#16a34a" },
  alternativo: { titolo: "Percorso alternativo trovato", colore: "#16a34a" },
  impossibile: { titolo: "Non è possibile evitare i varchi", colore: "#dc2626" },
  errore: { titolo: "Errore", colore: "#dc2626" },
};

function Risultato({
  r,
  opzione,
  onOpzione,
  onFocusVarco,
}: {
  r: RispostaPercorso;
  opzione: number;
  onOpzione: (i: number) => void;
  onFocusVarco: (id: string) => void;
}) {
  const stile = STILE_ESITO[r.stato];
  if (r.stato === "errore") {
    return (
      <Card size="sm" className="animate-in fade-in-0 gap-1 rounded-xl py-3" style={{ borderLeft: `4px solid ${stile.colore}` }}>
        <CardHeader className="px-3">
          <CardTitle className="text-sm" style={{ color: stile.colore }}>
            {stile.titolo}
          </CardTitle>
          <p className="text-xs text-muted-foreground">{r.messaggio}</p>
        </CardHeader>
      </Card>
    );
  }

  const percorso = r.stato === "senza-varchi" || r.stato === "alternativo" ? r.percorso : null;
  const normale = r.stato === "alternativo" || r.stato === "impossibile" ? r.normale : null;
  const parcheggio = opzione > 0 ? r.parcheggi[opzione - 1] : null;
  const nVarchi = normale?.varchiAttraversati.length ?? 0;

  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-2 flex flex-col gap-2 duration-300">
      <p className="text-xs text-muted-foreground">{r.messaggio}</p>

      <OpzioneCard
        attiva={opzione === 0}
        onClick={() => onOpzione(0)}
        numero={1}
        titolo={stile.titolo}
        colore={stile.colore}
        dettaglio={
          percorso
            ? `In auto fino all'arrivo · ${percorso.km} km · ${percorso.minuti} min`
            : `Il percorso più rapido passa da ${nVarchi} varc${nVarchi === 1 ? "o" : "hi"}`
        }
      />
      {r.parcheggi.map((p, i) => (
        <OpzioneCard
          key={i}
          attiva={opzione === i + 1}
          onClick={() => onOpzione(i + 1)}
          numero={i + 2}
          titolo={`Parcheggia ${p.parcheggio.via ? `in ${p.parcheggio.via}` : "fuori dalla zona"}`}
          colore="#0284c7"
          dettaglio={`Auto ${p.guida.km} km · ${p.guida.minuti} min, poi ${formatKm(p.piedi.km)} a piedi · ${p.piedi.minuti} min — totale ${p.minutiTotali} min`}
        />
      ))}

      <Card size="sm" className="gap-2 rounded-xl py-3 shadow-none">
        <CardContent className="flex flex-col gap-3 px-3 text-xs">
          {parcheggio ? (
            <DettaglioParcheggio p={parcheggio} onFocusVarco={onFocusVarco} />
          ) : (
            <>
              {(percorso || normale) && (
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  {percorso && <Riepilogo titolo="Percorso consigliato" p={percorso} colore="#16a34a" />}
                  {normale && (
                    <Riepilogo
                      titolo="Percorso più rapido"
                      p={normale}
                      colore={r.stato === "impossibile" ? "#dc2626" : "#94a3b8"}
                    />
                  )}
                </div>
              )}
              {normale && nVarchi > 0 && (
                <VarchiList
                  titolo={
                    r.stato === "impossibile"
                      ? "Varchi sul percorso più rapido"
                      : "Varchi che il percorso più rapido attraversa"
                  }
                  varchi={normale.varchiAttraversati}
                  onFocusVarco={onFocusVarco}
                />
              )}
              {(r.stato === "alternativo" || r.stato === "impossibile") && r.varchiEvitati.length > 0 && (
                <VarchiList
                  titolo={`Varchi esclusi nel calcolo (${r.varchiEvitati.length})`}
                  varchi={r.varchiEvitati}
                  onFocusVarco={onFocusVarco}
                />
              )}
              {percorso && <Indicazioni p={percorso} />}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OpzioneCard({
  attiva,
  onClick,
  numero,
  titolo,
  colore,
  dettaglio,
}: {
  attiva: boolean;
  onClick: () => void;
  numero: number;
  titolo: string;
  colore: string;
  dettaglio: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={attiva}
      className={cn(
        "flex items-start gap-3 rounded-xl border p-3 text-left transition-all active:scale-[0.99]",
        attiva ? "shadow-float" : "hover:bg-muted/60",
      )}
      style={
        attiva
          ? {
              borderColor: colore,
              background: `linear-gradient(135deg, color-mix(in oklch, ${colore} 10%, transparent), transparent 75%)`,
            }
          : undefined
      }
    >
      <span
        className="flex size-7 shrink-0 items-center justify-center rounded-lg text-white"
        style={{ backgroundColor: colore, opacity: attiva ? 1 : 0.75 }}
      >
        {numero === 1 ? <Car className="size-4" /> : <Footprints className="size-4" />}
      </span>
      <span className="flex flex-col">
        <span className="text-sm font-medium" style={{ color: colore }}>
          {titolo}
        </span>
        <span className="text-xs text-muted-foreground">{dettaglio}</span>
      </span>
    </button>
  );
}

function DettaglioParcheggio({ p, onFocusVarco }: { p: OpzioneParcheggio; onFocusVarco: (id: string) => void }) {
  return (
    <>
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <Riepilogo titolo="In auto fino al parcheggio" p={p.guida} colore="#16a34a" />
        <div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="w-4 border-t-2 border-dotted" style={{ borderColor: "#0ea5e9" }} />A piedi
          </div>
          <div className="text-sm font-semibold tabular-nums">
            {formatKm(p.piedi.km)} · {p.piedi.minuti} min
          </div>
        </div>
      </div>
      <p className="text-muted-foreground">
        Lascia l&apos;auto{" "}
        {p.parcheggio.via ? (
          <>
            in <strong className="text-foreground">{p.parcheggio.via}</strong>
          </>
        ) : (
          "nel punto P"
        )}
        , fuori da {ZONE[p.zona].nome}, e prosegui a piedi fino all&apos;arrivo. Verifica sul posto la disponibilità
        di parcheggio e la segnaletica.
      </p>
      {p.varchiEvitati.length > 0 && (
        <VarchiList
          titolo={`Varchi esclusi nel calcolo (${p.varchiEvitati.length})`}
          varchi={p.varchiEvitati}
          onFocusVarco={onFocusVarco}
        />
      )}
      <Indicazioni p={p.guida} />
    </>
  );
}

function Indicazioni({ p }: { p: PercorsoCalcolato }) {
  return (
    <details>
      <summary className="cursor-pointer rounded-lg px-1 py-1 font-medium hover:bg-muted/60">
        Indicazioni in auto ({p.manovre.length})
      </summary>
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        {p.manovre.map((m, i) => (
          <li key={i}>
            {m.istruzione}
            {m.km > 0 && <span className="text-muted-foreground"> · {formatKm(m.km)}</span>}
          </li>
        ))}
      </ol>
    </details>
  );
}

const formatKm = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);

function Riepilogo({ titolo, p, colore }: { titolo: string; p: PercorsoCalcolato; colore: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span className="h-1 w-4 rounded" style={{ backgroundColor: colore }} />
        {titolo}
      </div>
      <div className="text-base font-semibold tracking-tight tabular-nums">
        {p.km} km · {p.minuti} min
      </div>
    </div>
  );
}

function VarchiList({
  titolo,
  varchi,
  onFocusVarco,
}: {
  titolo: string;
  varchi: { id: string; zona: ZoneId; nome: string; via: string | null; stato: keyof typeof STATO_VARCO }[];
  onFocusVarco: (id: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 font-medium">{titolo}</p>
      <ul className="flex flex-col gap-0.5">
        {varchi.map((v) => (
          <li key={v.id}>
            <button
              type="button"
              className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left hover:bg-muted"
              onClick={() => onFocusVarco(v.id)}
            >
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: ZONE[v.zona].colore }} />
              {ZONE[v.zona].nome} · {v.nome}
              {v.via && <span className="text-muted-foreground">({v.via})</span>}
              <span className="text-muted-foreground">· {STATO_VARCO[v.stato].label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
