"use client";

import { cn } from "@/lib/utils";

type Option<T extends string> = { value: T; label: string; color?: string; count?: number };

/** Gruppo di pulsanti a scelta singola usato come filtro. */
export function FilterChips<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Option<T>[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-all active:scale-[0.97]",
            value === o.value
              ? "border-primary bg-primary text-primary-foreground shadow-sm"
              : "bg-background text-muted-foreground hover:border-foreground/20 hover:text-foreground",
          )}
        >
          {o.color && <span className="size-2 rounded-full" style={{ backgroundColor: o.color }} />}
          {o.label}
          {o.count !== undefined && (
            <span
              className={cn(
                "rounded-full px-1.5 text-[10px] tabular-nums",
                value === o.value ? "bg-primary-foreground/15" : "bg-muted",
              )}
            >
              {o.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
