"use client";

import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string> = { value: T; label: React.ReactNode; hint?: React.ReactNode };

/** Radio group styled as a segmented control. Better than a dropdown for 2-3 options on mobile. */
export function Segmented<T extends string>({
  name,
  value,
  options,
  onChange,
  className,
}: {
  name: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={name} className={cn("grid gap-1.5", className)} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex min-h-11 flex-col items-center justify-center rounded-lg border px-2 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:bg-muted",
            )}
          >
            <span>{o.label}</span>
            {o.hint ? <span className={cn("text-[11px] font-normal", active ? "text-background/70" : "text-muted-foreground")}>{o.hint}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
