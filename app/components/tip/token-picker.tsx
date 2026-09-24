"use client";

import { motion } from "motion/react";
import { useRef } from "react";
import { Coin } from "@/components/fx/coin";
import * as sfx from "@/lib/fx/audio";
import { HAPTIC, haptic } from "@/lib/fx/haptics";
import { T_TOKENS, type TTokenId } from "@/lib/tokens";
import { cn } from "@/lib/utils";

/** Three coins to pick from. The chosen one lifts and flips; a wooden "tok" confirms it. */
export function TokenPicker({
  value,
  onChange,
  hints,
  disabled,
}: {
  value: TTokenId;
  onChange: (v: TTokenId) => void;
  hints: Record<TTokenId, string>;
  disabled?: boolean;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function choose(id: TTokenId, i: number) {
    if (id === value) return;
    sfx.select(i);
    haptic(HAPTIC.tick);
    onChange(id);
  }

  return (
    <div
      role="radiogroup"
      aria-label="Token"
      className="grid grid-cols-3 gap-2"
      onKeyDown={(e) => {
        const i = T_TOKENS.findIndex((t) => t.id === value);
        const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
        if (!d || disabled) return;
        e.preventDefault();
        const n = (i + d + T_TOKENS.length) % T_TOKENS.length;
        choose(T_TOKENS[n].id, n);
        refs.current[n]?.focus();
      }}
    >
      {T_TOKENS.map((t, i) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            disabled={disabled}
            onClick={() => choose(t.id, i)}
            className={cn(
              "group relative flex flex-col items-center gap-1.5 rounded-2xl px-1 pt-3 pb-2.5 outline-none transition-[transform,color] duration-200 focus-visible:ring-2 focus-visible:ring-brand/70 active:scale-[0.97] disabled:opacity-60",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active ? (
              <motion.span
                layoutId="token-picker-thumb"
                aria-hidden
                className="absolute inset-0 rounded-2xl border border-white/12 bg-white/[0.06] shadow-[0_1px_0_rgba(255,255,255,0.07)_inset,0_10px_24px_-12px_rgba(0,0,0,0.8)]"
                transition={{ type: "spring", stiffness: 480, damping: 34 }}
              />
            ) : (
              <span aria-hidden className="absolute inset-0 rounded-2xl border border-transparent transition-colors group-hover:border-white/6" />
            )}
            <motion.span
              className="relative"
              animate={active ? { rotateY: 360, y: -3, scale: 1.08 } : { rotateY: 0, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
              style={{ transformPerspective: 400 }}
            >
              <Coin token={t.id} size={40} dim={!active} />
            </motion.span>
            <span className="relative text-[13px] font-semibold tracking-tight">{t.symbol}</span>
            <span className="relative text-[11px] tabular-nums text-muted-foreground">{hints[t.id]}</span>
          </button>
        );
      })}
    </div>
  );
}
