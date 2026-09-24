"use client";

import { MinusIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { RollingNumber } from "@/components/fx/rolling-number";
import * as sfx from "@/lib/fx/audio";
import { HAPTIC, haptic } from "@/lib/fx/haptics";
import { cn } from "@/lib/utils";

const LADDER = [1, 2, 3, 4, 5, 7, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 250, 500, 1000];

/**
 * Big odometer amount with -/+ detents and presets. The number itself is a real <input> (tap it to type);
 * while it isn't focused the digits roll instead.
 */
export function AmountDial({
  value,
  onChange,
  minUsd,
  presets,
  invalid,
  disabled,
}: {
  value: string;
  onChange: (text: string) => void;
  minUsd: number;
  presets: number[];
  invalid: boolean;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const n = Number(value);
  const current = Number.isFinite(n) ? n : 0;

  function set(v: number) {
    const idx = LADDER.findIndex((x) => x >= v);
    sfx.tick(Math.min(1, (idx < 0 ? LADDER.length : idx) / LADDER.length));
    haptic(HAPTIC.tick);
    onChange(String(v));
  }

  function step(dir: 1 | -1) {
    if (dir > 0) set(LADDER.find((x) => x > current) ?? current + 100);
    else set(Math.max(minUsd, [...LADDER].reverse().find((x) => x < current) ?? minUsd));
  }

  const shown = value.trim() === "" ? "0" : value;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <StepButton label="Decrease amount" onClick={() => step(-1)} disabled={disabled || current <= minUsd}>
          <MinusIcon />
        </StepButton>
        <div className={cn("relative min-w-0 flex-1 text-center font-display text-[76px] leading-none sm:text-[88px]", invalid ? "text-muted-foreground" : "text-foreground")}>
          <div aria-hidden className={cn("flex h-[1.05em] items-center justify-center transition-opacity", focused && "opacity-0")}>
            <span className="mr-[0.04em] self-start pt-[0.12em] text-[0.46em] text-muted-foreground">$</span>
            <RollingNumber text={shown} />
          </div>
          <label htmlFor="tip-amount" className="sr-only">
            Amount (USD)
          </label>
          <input
            id="tip-amount"
            inputMode="decimal"
            type="number"
            min={minUsd}
            step="0.5"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            onFocus={(e) => {
              setFocused(true);
              e.currentTarget.select();
            }}
            onBlur={() => setFocused(false)}
            aria-invalid={invalid}
            className={cn(
              "no-spin absolute inset-0 w-full bg-transparent text-center font-display leading-none caret-brand outline-none",
              focused ? "text-inherit" : "text-transparent",
            )}
          />
        </div>
        <StepButton label="Increase amount" onClick={() => step(1)} disabled={disabled}>
          <PlusIcon />
        </StepButton>
      </div>
      <div className="flex justify-center gap-1.5" role="group" aria-label="Quick amounts">
        {presets.map((p) => {
          const active = current === p;
          return (
            <button
              key={p}
              type="button"
              disabled={disabled}
              onClick={() => set(p)}
              aria-pressed={active}
              className={cn(
                "h-9 min-w-12 rounded-full border px-3 text-[13px] font-medium tabular-nums outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-brand/70 active:scale-95",
                active
                  ? "border-brand/50 bg-brand/15 text-foreground shadow-[0_0_0_3px_color-mix(in_oklch,var(--brand)_12%,transparent)]"
                  : "border-border bg-white/[0.03] text-muted-foreground hover:border-white/20 hover:text-foreground",
              )}
            >
              ${p}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-12 shrink-0 place-items-center rounded-full border border-border bg-white/[0.04] text-foreground shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_6px_14px_-8px_rgba(0,0,0,0.8)] outline-none transition-all duration-150 hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-brand/70 active:scale-90 active:bg-white/[0.12] disabled:opacity-35 [&_svg]:size-5"
    >
      {children}
    </button>
  );
}
