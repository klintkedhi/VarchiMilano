"use client";

import { ArrowDownUp, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilterChips } from "@/components/filter-chips";
import { STATO_VARCO, ZONE } from "@/lib/labels";
import type { Selection, StatoVarco, Varco, ZoneId } from "@/types/zones";

type SortKey = "codice" | "via" | "stato";

type Props = {
  varchi: Varco[];
  selection: Selection;
  onSelect: (selection: Selection) => void;
};

function SortHead({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <TableHead>
      <button type="button" onClick={onClick} className="inline-flex items-center gap-1 hover:text-foreground">
        {children}
        <ArrowDownUp className={active ? "size-3" : "size-3 opacity-30"} />
      </button>
    </TableHead>
  );
}

export function VarchiTable({ varchi, selection, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [zona, setZona] = useState<ZoneId | "tutte">("tutte");
  const [stato, setStato] = useState<StatoVarco | "tutti">("tutti");
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "codice", asc: true });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = varchi.filter(
      (v) =>
        (zona === "tutte" || v.zona === zona) &&
        (stato === "tutti" || v.stato === stato) &&
        (!q ||
          [v.nome, v.via, v.civico, v.incrocio?.via, v.quartiere, String(v.codice)]
            .filter(Boolean)
            .some((s) => s!.toLowerCase().includes(q))),
    );
    const value = (v: Varco) =>
      sort.key === "codice" ? `${v.zona}${String(v.codice).padStart(4, "0")}` : sort.key === "via" ? (v.via ?? "") : v.stato;
    return filtered.sort((a, b) => value(a).localeCompare(value(b), "it") * (sort.asc ? 1 : -1));
  }, [varchi, query, zona, stato, sort]);

  const sortBy = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, asc: !s.asc } : { key, asc: true }));
  const head = (k: SortKey, label: string) => (
    <SortHead active={sort.key === k} onClick={() => sortBy(k)}>
      {label}
    </SortHead>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca via, varco, incrocio, quartiere…"
          className="h-9 rounded-xl pl-9"
        />
      </div>
      <FilterChips
        value={zona}
        onChange={setZona}
        options={[
          { value: "tutte", label: "Tutte le zone" },
          { value: "area-b", label: "Area B", color: ZONE["area-b"].colore },
          { value: "area-c", label: "Area C", color: ZONE["area-c"].colore },
        ]}
      />
      <FilterChips
        value={stato}
        onChange={setStato}
        options={[
          { value: "tutti", label: "Tutti gli stati" },
          ...(Object.keys(STATO_VARCO) as StatoVarco[]).map((s) => ({
            value: s,
            label: STATO_VARCO[s].label,
            color: STATO_VARCO[s].colore,
          })),
        ]}
      />
      <p className="text-xs text-muted-foreground">
        <span className="font-semibold text-foreground tabular-nums">{rows.length}</span> varchi
      </p>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto rounded-xl border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card [&_th]:text-[11px] [&_th]:font-semibold [&_th]:tracking-wide [&_th]:text-muted-foreground [&_th]:uppercase">
            <TableRow>
              {head("codice", "Varco")}
              {head("via", "Via")}
              <TableHead>Altezza</TableHead>
              {head("stato", "Stato")}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((v) => {
              const sel = selection?.kind === "varco" && selection.id === v.id;
              return (
                <TableRow
                  key={v.id}
                  data-row-id={`varco-${v.id}`}
                  data-state={sel ? "selected" : undefined}
                  onClick={() => onSelect({ kind: "varco", id: v.id })}
                  className="cursor-pointer transition-colors data-[state=selected]:bg-accent"
                >
                  <TableCell className="align-top">
                    <div className="flex items-center gap-1.5">
                      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: ZONE[v.zona].colore }} />
                      <span className="text-xs text-muted-foreground">
                        {v.zona === "area-b" ? "B" : "C"}
                        {v.codice}
                      </span>
                    </div>
                    <div className="font-medium whitespace-normal">{v.nome}</div>
                  </TableCell>
                  <TableCell className="align-top whitespace-normal">
                    {v.via ?? "—"}
                    {v.quartiere && <div className="text-xs text-muted-foreground">{v.quartiere}</div>}
                  </TableCell>
                  <TableCell className="align-top text-xs whitespace-normal">
                    {v.civico && <div>civ. {v.civico}</div>}
                    {v.incrocio && (
                      <div className="text-muted-foreground">
                        incr. {v.incrocio.via} ({v.incrocio.distanza} m)
                      </div>
                    )}
                    {!v.civico && !v.incrocio && "—"}
                  </TableCell>
                  <TableCell className="align-top">
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <span className="size-2 rounded-full" style={{ backgroundColor: STATO_VARCO[v.stato].colore }} />
                      {STATO_VARCO[v.stato].label}
                    </span>
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
