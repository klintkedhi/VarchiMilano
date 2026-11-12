"use client";

import {
  Cctv,
  ChevronDown,
  Clock,
  Database,
  ExternalLink,
  Info,
  Layers,
  RefreshCw,
  Route,
  Ruler,
  ShieldAlert,
  Signpost,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import { AttraversamentiTable } from "@/components/attraversamenti-table";
import { type Estremo, PercorsoPanel } from "@/components/percorso-panel";
import MilanoMap from "@/components/map/map-loader";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VarchiTable } from "@/components/varchi-table";
import { ESITO, STATO_VARCO, ZONE, tipoStrada } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { LatLng, PuntoPercorso, RispostaPercorso } from "@/types/routing";
import type {
  Attraversamento,
  DatasetMeta,
  EsitoAttraversamento,
  LayerVisibility,
  Selection,
  Varco,
  ZoneId,
  ZonesGeoJSON,
} from "@/types/zones";

type MapExplorerProps = {
  zones: ZonesGeoJSON;
  varchi: Varco[];
  attraversamenti: Attraversamento[];
  meta: DatasetMeta;
};

type Tab = "percorso" | "varchi" | "strade" | "info";

const ZONE_IDS: ZoneId[] = ["area-b", "area-c"];

export function MapExplorer({ zones, varchi, attraversamenti, meta }: MapExplorerProps) {
  const [visibility, setVisibility] = useState<LayerVisibility>({
    zone: { "area-b": true, "area-c": true },
    varchi: { "area-b": true, "area-c": true },
    esiti: { "senza-varco": true, "varco-non-attivo": true, coperta: false, "solo-uscita": false },
  });
  const [selection, setSelection] = useState<Selection>(null);
  const [tab, setTab] = useState<Tab>("percorso");
  const [punti, setPunti] = useState<Record<Estremo, PuntoPercorso | null>>({ from: null, to: null });
  const [picking, setPicking] = useState<Estremo | null>(null);
  const [risultato, setRisultatoState] = useState<RispostaPercorso | null>(null);
  const [opzione, setOpzione] = useState(0);
  const setRisultato = (r: RispostaPercorso | null) => {
    setRisultatoState(r);
    // se in auto non si arriva, mostra subito la prima opzione di parcheggio
    setOpzione(r?.stato === "impossibile" && r.parcheggi.length > 0 ? 1 : 0);
  };

  const setPunto = (which: Estremo, p: PuntoPercorso | null) => {
    setPunti((s) => ({ ...s, [which]: p }));
    setRisultato(null);
  };
  const onMapPick = (p: LatLng) => {
    if (!picking) return;
    setPunto(picking, { ...p, label: `Punto sulla mappa (${p.lat.toFixed(5)}, ${p.lng.toFixed(5)})` });
    // dopo la partenza passa direttamente alla scelta dell'arrivo
    setPicking(picking === "from" && !punti.to ? "to" : null);
  };

  const selectFromMap = (s: Selection) => {
    if (picking) return;
    setSelection(s);
    if (s) setTab(s.kind === "varco" ? "varchi" : "strade");
  };

  // porta in vista la riga selezionata nella tabella
  useEffect(() => {
    if (!selection) return;
    document
      .querySelector(`[data-row-id="${selection.kind}-${selection.id}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selection, tab]);

  const selectedVarco = selection?.kind === "varco" ? varchi.find((v) => v.id === selection.id) : undefined;
  const selectedAttr =
    selection?.kind === "attraversamento" ? attraversamenti.find((a) => a.id === selection.id) : undefined;

  const varchiB = varchi.filter((v) => v.zona === "area-b");
  const senzaVarco = attraversamenti.filter((a) => a.esito === "senza-varco" && a.via).length;

  return (
    <div className="flex h-dvh flex-col gap-3 bg-background p-2 sm:p-3">
      <header className="flex items-center gap-3 px-1">
        <div className="bg-brand flex size-9 shrink-0 items-center justify-center rounded-xl text-white shadow-float">
          <Cctv className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-semibold tracking-tight">
            Varchi <span className="bg-brand bg-clip-text text-transparent">Area B &amp; Area C</span>
            <span className="text-muted-foreground"> · Milano</span>
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            Open data Comune di Milano · aggiornato il{" "}
            {new Date(meta.aggiornatoIl).toLocaleDateString("it-IT", { dateStyle: "long" })}
          </p>
        </div>
        <dl className="hidden items-stretch gap-2 md:flex">
          <Stat
            label="Varchi Area B"
            value={varchiB.length}
            detail={`${varchiB.filter((v) => v.attivo).length} attivi`}
            color={ZONE["area-b"].colore}
          />
          <Stat label="Varchi Area C" value={varchi.length - varchiB.length} color={ZONE["area-c"].colore} />
          <Stat label="Strade senza varco" value={senzaVarco} color={ESITO["senza-varco"].colore} alert />
        </dl>
        <ThemeToggle />
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <main className="relative isolate h-[50dvh] shrink-0 overflow-hidden rounded-2xl border shadow-float lg:h-auto lg:flex-1">
          <MilanoMap
            zones={zones}
            varchi={varchi}
            attraversamenti={attraversamenti}
            visibility={visibility}
            selection={selection}
            onSelect={selectFromMap}
            percorso={{ ...punti, risultato, opzione }}
            picking={picking !== null}
            onMapPick={onMapPick}
          />
          <LayerPanel visibility={visibility} onChange={setVisibility} />
          {picking && (
            <div className="glass animate-in fade-in-0 slide-in-from-bottom-2 absolute bottom-4 left-1/2 z-[1000] flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-xs font-medium whitespace-nowrap">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-sky-500 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-sky-500" />
              </span>
              Clicca sulla mappa per scegliere {picking === "from" ? "la partenza" : "l'arrivo"}
              <button
                type="button"
                onClick={() => setPicking(null)}
                className="-mr-1 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Annulla"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}
        </main>

        <aside className="flex min-h-0 flex-1 flex-col gap-3 lg:w-[520px] lg:flex-none">
          {(selectedVarco || selectedAttr) && (
            <SelectionCard
              key={`${selection?.kind}-${selection?.id}`}
              varco={selectedVarco}
              attraversamento={selectedAttr}
              onClose={() => setSelection(null)}
            />
          )}

          <div className="flex min-h-0 flex-1 flex-col rounded-2xl border bg-card p-3 shadow-float">
            <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="flex min-h-0 flex-1 flex-col gap-3">
              <TabsList className="h-10! w-full rounded-xl p-1">
                <TabsTrigger value="percorso" className="rounded-lg">
                  <Route /> Percorso
                </TabsTrigger>
                <TabsTrigger value="varchi" className="rounded-lg">
                  <Cctv /> Varchi
                  <span className="rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground tabular-nums">
                    {varchi.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="strade" className="rounded-lg">
                  <Signpost /> <span className="hidden sm:inline">Confine</span> B
                </TabsTrigger>
                <TabsTrigger value="info" className="rounded-lg">
                  <Info /> <span className="hidden sm:inline">Info</span>
                </TabsTrigger>
              </TabsList>
              <TabsContent value="percorso" className="flex min-h-0 flex-1 flex-col">
                <PercorsoPanel
                  from={punti.from}
                  to={punti.to}
                  onChange={setPunto}
                  onSwap={() => {
                    setPunti((s) => ({ from: s.to, to: s.from }));
                    setRisultato(null);
                  }}
                  picking={picking}
                  onPick={setPicking}
                  risultato={risultato}
                  onRisultato={setRisultato}
                  opzione={opzione}
                  onOpzione={setOpzione}
                  onFocusVarco={(id) => setSelection({ kind: "varco", id })}
                />
              </TabsContent>
              <TabsContent value="varchi" className="flex min-h-0 flex-1 flex-col">
                <VarchiTable varchi={varchi} selection={selection} onSelect={setSelection} />
              </TabsContent>
              <TabsContent value="strade" className="flex min-h-0 flex-1 flex-col">
                <AttraversamentiTable attraversamenti={attraversamenti} selection={selection} onSelect={setSelection} />
              </TabsContent>
              <TabsContent value="info" className="scrollbar-thin min-h-0 overflow-auto text-sm">
                <InfoPanel meta={meta} />
              </TabsContent>
            </Tabs>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  detail,
  color,
  alert,
}: {
  label: string;
  value: number;
  detail?: string;
  color: string;
  alert?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border bg-card py-1.5 pr-3.5 pl-2 shadow-float">
      <span
        className="flex size-7 items-center justify-center rounded-lg"
        style={{ backgroundColor: `color-mix(in oklch, ${color} 14%, transparent)`, color }}
      >
        {alert ? <ShieldAlert className="size-4" /> : <Cctv className="size-4" />}
      </span>
      <div>
        <dt className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
        <dd className="text-base leading-tight font-semibold tabular-nums" style={alert ? { color } : undefined}>
          {value}
          {detail && <span className="ml-1 text-xs font-normal text-muted-foreground">{detail}</span>}
        </dd>
      </div>
    </div>
  );
}

function LayerPanel({
  visibility,
  onChange,
}: {
  visibility: LayerVisibility;
  onChange: (fn: (v: LayerVisibility) => LayerVisibility) => void;
}) {
  // null = comportamento predefinito: aperto su desktop, chiuso su mobile
  const [open, setOpen] = useState<boolean | null>(null);
  const toggle = () => setOpen((o) => !(o ?? window.matchMedia("(min-width: 1024px)").matches));

  const row = (label: string, color: string, checked: boolean, set: (c: boolean) => void, ring = false) => (
    <label
      key={label}
      className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-1.5 py-1 text-xs transition-colors hover:bg-muted/70"
    >
      <span className="flex items-center gap-2">
        <span
          className="size-2.5 rounded-full"
          style={
            ring
              ? { border: `2px solid ${color}` }
              : { backgroundColor: color, boxShadow: `0 0 0 3px color-mix(in oklch, ${color} 20%, transparent)` }
          }
        />
        {label}
      </span>
      <Switch size="sm" checked={checked} onCheckedChange={set} />
    </label>
  );

  return (
    <div className="glass absolute top-3 right-3 z-[1000] w-60 overflow-hidden rounded-2xl">
      <button type="button" onClick={toggle} className="flex w-full items-center gap-2 px-3 py-2.5 text-sm font-medium">
        <Layers className="size-4 text-muted-foreground" />
        Livelli
        <ChevronDown
          className={cn(
            "ml-auto size-4 text-muted-foreground transition-transform",
            open === null ? "lg:rotate-180" : open && "rotate-180",
          )}
        />
      </button>
      <div
        className={cn(
          "flex-col gap-0.5 border-t px-1.5 pt-1.5 pb-2.5",
          open === null ? "hidden lg:flex" : open ? "flex" : "hidden",
        )}
      >
        <SectionLabel>Zone</SectionLabel>
        {ZONE_IDS.map((z) =>
          row(`Perimetro ${ZONE[z].nome}`, ZONE[z].colore, visibility.zone[z], (c) =>
            onChange((v) => ({ ...v, zone: { ...v.zone, [z]: c } })), true),
        )}
        {ZONE_IDS.map((z) =>
          row(`Varchi ${ZONE[z].nome}`, ZONE[z].colore, visibility.varchi[z], (c) =>
            onChange((v) => ({ ...v, varchi: { ...v.varchi, [z]: c } }))),
        )}
        <SectionLabel>Strade sul confine di Area B</SectionLabel>
        {(Object.keys(ESITO) as EsitoAttraversamento[]).map((e) =>
          row(ESITO[e].label, ESITO[e].colore, visibility.esiti[e], (c) =>
            onChange((v) => ({ ...v, esiti: { ...v.esiti, [e]: c } }))),
        )}
        <SectionLabel>Stato varco</SectionLabel>
        <div className="flex flex-wrap gap-x-3 gap-y-1 px-1.5 text-[11px] text-muted-foreground">
          {Object.values(STATO_VARCO).map((s) => (
            <span key={s.label} className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ backgroundColor: s.colore }} />
              {s.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 mb-0.5 px-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase first:mt-0">
      {children}
    </p>
  );
}

function SelectionCard({
  varco,
  attraversamento,
  onClose,
}: {
  varco?: Varco;
  attraversamento?: Attraversamento;
  onClose: () => void;
}) {
  const point = varco ?? attraversamento!;
  const streetView = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${point.lat},${point.lng}`;
  const osm = `https://www.openstreetmap.org/?mlat=${point.lat}&mlon=${point.lng}#map=19/${point.lat}/${point.lng}`;
  const color = varco ? ZONE[varco.zona].colore : ESITO[attraversamento!.esito].colore;
  const Icon = varco ? Cctv : Signpost;

  return (
    <div className="animate-in fade-in-0 slide-in-from-top-2 shrink-0 overflow-hidden rounded-2xl border bg-card shadow-float duration-300">
      <div
        className="flex items-start gap-3 p-3"
        style={{ background: `linear-gradient(135deg, color-mix(in oklch, ${color} 13%, transparent), transparent 70%)` }}
      >
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
          style={{ backgroundColor: color }}
        >
          <Icon className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold tracking-wider uppercase" style={{ color }}>
            {varco ? `${ZONE[varco.zona].nome} · varco ${varco.codice}` : ESITO[attraversamento!.esito].label}
          </p>
          <h2 className="truncate text-sm font-semibold">
            {varco ? varco.nome : (attraversamento!.via ?? "Strada senza nome")}
          </h2>
        </div>
        <Button variant="ghost" size="icon-sm" className="rounded-full" onClick={onClose} aria-label="Chiudi">
          <X />
        </Button>
      </div>
      <dl className="grid grid-cols-2 gap-px border-t bg-border text-xs">
        {varco ? (
          <>
            <Field k="Via" v={varco.via ?? "—"} />
            <Field k="Civico" v={varco.civico ?? "—"} />
            <Field k="Incrocio" v={varco.incrocio ? `${varco.incrocio.via} (${varco.incrocio.distanza} m)` : "—"} />
            <Field k="Quartiere" v={varco.quartiere ?? "—"} />
            <Field k="Stato" v={STATO_VARCO[varco.stato].label} dot={STATO_VARCO[varco.stato].colore} />
            {varco.autorizzazione && <Field k="Atto" v={varco.autorizzazione} />}
          </>
        ) : (
          <>
            <Field k="Tipo" v={tipoStrada(attraversamento!.tipoStrada)} />
            <Field k="Senso" v={attraversamento!.direzione} />
            <Field
              k="Varco vicino"
              v={
                attraversamento!.varcoVicino
                  ? `${attraversamento!.varcoVicino.nome} · ${attraversamento!.varcoVicino.distanza} m · ${STATO_VARCO[attraversamento!.varcoVicino.stato].label}`
                  : "—"
              }
              dot={attraversamento!.varcoVicino ? STATO_VARCO[attraversamento!.varcoVicino.stato].colore : undefined}
            />
          </>
        )}
        <Field k="Coordinate" v={`${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`} mono />
      </dl>
      <div className="flex gap-2 border-t p-2">
        <LinkButton href={streetView}>Street View</LinkButton>
        <LinkButton href={osm}>OpenStreetMap</LinkButton>
      </div>
    </div>
  );
}

function LinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
    >
      {children} <ExternalLink className="size-3 text-muted-foreground" />
    </a>
  );
}

function Field({ k, v, dot, mono }: { k: string; v: string; dot?: string; mono?: boolean }) {
  return (
    <div className="min-w-0 bg-card px-3 py-2 last:odd:col-span-2">
      <dt className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{k}</dt>
      <dd className={cn("mt-0.5 flex items-center gap-1.5", mono && "font-mono text-[11px]")}>
        {dot && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} />}
        <span className="min-w-0 break-words">{v}</span>
      </dd>
    </div>
  );
}

function InfoPanel({ meta }: { meta: DatasetMeta }) {
  return (
    <div className="flex flex-col gap-2.5">
      <InfoSection icon={Database} title="Fonti">
        <ul className="flex flex-col gap-1">
          {Object.entries(meta.fonti).map(([k, url]) => (
            <li key={k}>
              {url.startsWith("http") ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
                >
                  {url.replace("https://dati.comune.milano.it/dataset/", "")}
                  <ExternalLink className="size-3 text-muted-foreground" />
                </a>
              ) : (
                url
              )}
            </li>
          ))}
        </ul>
      </InfoSection>
      <InfoSection icon={Ruler} title="Altezza dei varchi">
        Gli open data indicano solo nome e coordinate del varco. Via, civico e incrocio più vicino sono ricavati da
        OpenStreetMap (Nominatim / Overpass) e possono essere approssimativi: verifica con Street View.
      </InfoSection>
      <InfoSection icon={ShieldAlert} title="Strade senza varco">
        Lo script individua ogni strada percorribile (OSM) che attraversa il perimetro ufficiale di Area B. Un
        attraversamento è considerato coperto se c&apos;è un varco entro {meta.parametri.COVER_RADIUS_M} m dal confine,
        oppure sulla stessa strada (entro {meta.parametri.SAME_ROAD_TOLERANCE_M} m dalla carreggiata) a meno di{" "}
        {meta.parametri.SAME_ROAD_MAX_M} m. I sensi unici in uscita non richiedono varco; autostrade e tangenziali
        sono escluse perché Area B non vi si applica. È una stima automatica: strade private, passi carrai o tratti
        mappati male in OSM possono generare falsi positivi.
      </InfoSection>
      <InfoSection icon={Clock} title="Orari">
        Area B e Area C sono attive nei giorni feriali dalle 7:30 alle 19:30: fuori orario i varchi non sanzionano.
      </InfoSection>
      <InfoSection icon={RefreshCw} title="Aggiornare i dati">
        <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">npm run data:update</code>{" "}
        riscarica gli open data e rigenera i file in{" "}
        <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">src/data/generated</code>.
      </InfoSection>
    </div>
  );
}

function InfoSection({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex gap-3 rounded-xl border bg-background/50 p-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 text-[13px] leading-relaxed text-muted-foreground">
        <h2 className="mb-0.5 text-sm font-medium text-foreground">{title}</h2>
        {children}
      </div>
    </section>
  );
}
