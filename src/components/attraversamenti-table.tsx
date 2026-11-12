"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { FilterChips } from "@/components/filter-chips";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ESITO, STATO_VARCO, tipoStrada } from "@/lib/labels";
import type { Attraversamento, EsitoAttraversamento, Selection } from "@/types/zones";

type Props = {
  attraversamenti: Attraversamento[];
  selection: Selection;
  onSelect: (selection: Selection) => void;
};

const ORDINE: EsitoAttraversamento[] = ["senza-varco", "varco-non-attivo", "coperta", "solo-uscita"];

export function AttraversamentiTable({ attraversamenti, selection, onSelect }: Props) {
  const [esito, setEsito] = useState<EsitoAttraversamento | "tutti">("senza-varco");
  const [soloConNome, setSoloConNome] = useState(true);
  const [query, setQuery] = useState("");

  const conteggi = useMemo(() => {
    const c = Object.fromEntries(ORDINE.map((e) => [e, 0])) as Record<EsitoAttraversamento, number>;
    for (const a of attraversamenti) if (!soloConNome || a.via) c[a.esito]++;
    return c;
  }, [attraversamenti, soloConNome]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return attraversamenti
      .filter(
        (a) =>
          (esito === "tutti" || a.esito === esito) &&
          (!soloConNome || a.via) &&
          (!q || (a.via ?? "").toLowerCase().includes(q)),
      )
      .sort(
        (a, b) =>
          ORDINE.indexOf(a.esito) - ORDINE.indexOf(b.esito) ||
          (a.via ?? "~").localeCompare(b.via ?? "~", "it"),
      );
  }, [attraversamenti, esito, soloConNome, query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca strada…" className="h-9 rounded-xl pl-9" />
      </div>
      <FilterChips
        value={esito}
        onChange={setEsito}
        options={[
          ...ORDINE.map((e) => ({ value: e, label: ESITO[e].label, color: ESITO[e].colore, count: conteggi[e] })),
          { value: "tutti" as const, label: "Tutti" },
        ]}
      />
      <label className="flex cursor-pointer items-center gap-2.5 text-xs text-muted-foreground">
        <Switch size="sm" checked={soloConNome} onCheckedChange={setSoloConNome} />
        Nascondi strade senza nome (accessi privati, rampe, strade di servizio)
      </label>
      {esito !== "tutti" && (
        <p
          className="rounded-lg border-l-2 bg-muted/60 px-3 py-2 text-xs text-muted-foreground"
          style={{ borderLeftColor: ESITO[esito].colore }}
        >
          {ESITO[esito].descrizione}
        </p>
      )}

      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto rounded-xl border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card [&_th]:text-[11px] [&_th]:font-semibold [&_th]:tracking-wide [&_th]:text-muted-foreground [&_th]:uppercase">
            <TableRow>
              <TableHead>Strada</TableHead>
              <TableHead>Senso</TableHead>
              <TableHead>Varco più vicino</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((a) => {
              const sel = selection?.kind === "attraversamento" && selection.id === a.id;
              return (
                <TableRow
                  key={a.id}
                  data-row-id={`attraversamento-${a.id}`}
                  data-state={sel ? "selected" : undefined}
                  onClick={() => onSelect({ kind: "attraversamento", id: a.id })}
                  className="cursor-pointer transition-colors data-[state=selected]:bg-accent"
                >
                  <TableCell className="align-top whitespace-normal">
                    <div className="flex items-center gap-1.5 font-medium">
                      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: ESITO[a.esito].colore }} />
                      {a.via ?? <span className="text-muted-foreground italic">senza nome</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">{tipoStrada(a.tipoStrada)}</div>
                  </TableCell>
                  <TableCell className="align-top text-xs whitespace-normal">{a.direzione}</TableCell>
                  <TableCell className="align-top text-xs whitespace-normal">
                    {a.varcoVicino ? (
                      <>
                        {a.varcoVicino.nome}{" "}
                        <span className="text-muted-foreground">({a.varcoVicino.distanza} m)</span>
                        <div className="text-muted-foreground">{STATO_VARCO[a.varcoVicino.stato].label}</div>
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
