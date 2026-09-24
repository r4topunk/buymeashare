"use client";

import { motion } from "motion/react";
import { useId, useRef } from "react";
import * as sfx from "@/lib/fx/audio";
import { HAPTIC, haptic } from "@/lib/fx/haptics";
import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string> = { value: T; label: React.ReactNode; hint?: React.ReactNode };

/**
 * Radio group styled as a segmented control with a sliding thumb. Better than a dropdown for 2-4 options on mobile.
 * Arrow keys move the selection; every change gives a soft detent tick.
 */
export function Segmented<T extends string>({
  name,
  value,
  options,
  onChange,
  className,
  disabled,
  size = "md",
}: {
  name: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (v: T) => void;
  className?: string;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const layoutId = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function choose(v: T, i: number) {
    if (v === value) return;
    sfx.tick(0.3 + (i / Math.max(1, options.length - 1)) * 0.5);
    haptic(HAPTIC.tick);
    onChange(v);
  }

  return (
    <div
      role="radiogroup"
      aria-label={name}
      aria-disabled={disabled || undefined}
      className={cn("grid gap-1 rounded-xl border border-border bg-black/25 p-1 shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)]", disabled && "opacity-60", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      onKeyDown={(e) => {
        if (disabled) return;
        const i = options.findIndex((o) => o.value === value);
        const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        const n = (i + d + options.length) % options.length;
        choose(options[n].value, n);
        refs.current[n]?.focus();
      }}
    >
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            disabled={disabled}
            onClick={() => choose(o.value, i)}
            className={cn(
              "relative flex flex-col items-center justify-center rounded-[0.6rem] px-2 font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/70",
              size === "sm" ? "min-h-9 text-[13px]" : "min-h-11 text-sm",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active ? (
              <motion.span
                layoutId={layoutId}
                aria-hidden
                className="absolute inset-0 rounded-[0.6rem] border border-white/10 bg-white/[0.09] shadow-[0_1px_0_rgba(255,255,255,0.08)_inset,0_4px_12px_-4px_rgba(0,0,0,0.6)]"
                transition={{ type: "spring", stiffness: 520, damping: 36 }}
              />
            ) : null}
            <span className="relative">{o.label}</span>
            {o.hint ? <span className="relative text-[11px] font-normal text-muted-foreground">{o.hint}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
