"use client";

import { AnimatePresence, motion } from "motion/react";
import { forwardRef, useRef, useState } from "react";
import { useReducedMotion } from "@/hooks/use-fx";
import * as sfx from "@/lib/fx/audio";
import { HAPTIC, haptic } from "@/lib/fx/haptics";
import { cn } from "@/lib/utils";

type Spark = { id: number; x: number; y: number; dx: number; dy: number; s: number };

/**
 * The hardware key. A thick keycap on a darker base: it travels down on press (the base shadow shrinks), charges
 * with light while held, and springs back with a spark burst on release. Submits the form like a normal button.
 */
export const TipButton = forwardRef<
  HTMLButtonElement,
  { disabled?: boolean; busy?: boolean; locked?: boolean; children: React.ReactNode; labelKey: string }
>(function TipButton({ disabled, busy, locked, children, labelKey }, ref) {
  const [pressed, setPressed] = useState(false);
  const [sparks, setSparks] = useState<Spark[]>([]);
  const seq = useRef(0);
  const [origin, setOrigin] = useState({ x: 0.5, y: 0.5 });
  const reduced = useReducedMotion();
  const live = !disabled && !busy;

  function down(x: number, y: number) {
    if (!live) return;
    setOrigin({ x, y });
    setPressed(true);
    sfx.unlock();
    sfx.press();
    haptic(HAPTIC.press);
  }

  function up(burst: boolean) {
    if (!pressed) return;
    setPressed(false);
    sfx.release();
    if (!burst || reduced) return;
    const base = seq.current;
    seq.current += 12;
    const next = Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2 + Math.random() * 0.4;
      const d = 34 + Math.random() * 38;
      return { id: base + i, x: origin.x, y: origin.y, dx: Math.cos(a) * d, dy: Math.sin(a) * d * 0.7, s: 3 + Math.random() * 3 };
    });
    setSparks((s) => [...s, ...next]);
    setTimeout(() => setSparks((s) => s.filter((p) => p.id >= base + 12)), 700);
  }

  return (
    <div className="relative">
      <button
        ref={ref}
        type="submit"
        disabled={disabled}
        aria-busy={busy || undefined}
        data-pressed={pressed || undefined}
        data-busy={busy || undefined}
        data-locked={locked || undefined}
        onPointerDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          down((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
        }}
        onPointerUp={() => up(true)}
        onPointerLeave={() => up(false)}
        onPointerCancel={() => up(false)}
        onKeyDown={(e) => {
          if ((e.key === " " || e.key === "Enter") && !e.repeat) down(0.5, 0.5);
        }}
        onKeyUp={(e) => {
          if (e.key === " " || e.key === "Enter") up(true);
        }}
        style={{ ["--cx" as string]: `${origin.x * 100}%`, ["--cy" as string]: `${origin.y * 100}%` }}
        className={cn(
          "tip-key group relative isolate block h-[4.25rem] w-full touch-manipulation rounded-[1.25rem] outline-none select-none",
          "focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4 focus-visible:ring-offset-background",
          "disabled:cursor-not-allowed",
        )}
      >
        <span className="tip-key-face absolute inset-0 overflow-hidden rounded-[1.25rem]">
          <span className="tip-key-charge absolute inset-0" />
          {busy ? <span className="tip-key-shimmer absolute inset-y-0 -left-1/2 w-1/2" /> : null}
        </span>
        <span className="relative flex h-full items-center justify-center gap-2.5 px-5 text-[17px] font-semibold tracking-[-0.01em]">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={labelKey}
              className="flex items-center gap-2.5 whitespace-nowrap"
              initial={{ y: 14, opacity: 0, filter: "blur(4px)" }}
              animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
              exit={{ y: -14, opacity: 0, filter: "blur(4px)" }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
            >
              {children}
            </motion.span>
          </AnimatePresence>
        </span>
      </button>
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {sparks.map((p) => (
          <motion.span
            key={p.id}
            className="absolute rounded-full bg-brand shadow-[0_0_8px_var(--brand)]"
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: p.s, height: p.s, marginLeft: -p.s / 2, marginTop: -p.s / 2 }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: p.dx, y: p.dy, opacity: 0, scale: 0.3 }}
            transition={{ duration: 0.6, ease: [0.2, 0.8, 0.3, 1] }}
          />
        ))}
      </div>
    </div>
  );
});
