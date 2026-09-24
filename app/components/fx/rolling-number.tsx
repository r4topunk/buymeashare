"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const DIGITS = "0123456789";

/**
 * Odometer text: each digit is a column of 0-9 that rolls to its value with a springy overshoot.
 * Columns are keyed from the right, so "$9" -> "$10" rolls the units and slides a new tens column in.
 * Screen readers get the plain text.
 */
export function RollingNumber({ text, className }: { text: string; className?: string }) {
  const chars = [...text];
  return (
    <span className={cn("relative inline-flex overflow-hidden leading-none tabular-nums", className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden className="inline-flex">
        {chars.map((ch, i) => {
          const key = chars.length - i;
          return DIGITS.includes(ch) ? <DigitColumn key={`d${key}`} digit={Number(ch)} /> : <span key={`c${key}-${ch}`} className="rn-char inline-block">{ch}</span>;
        })}
      </span>
    </span>
  );
}

function DigitColumn({ digit }: { digit: number }) {
  return (
    <span className="relative inline-block h-[1em] overflow-hidden">
      <span className="invisible">0</span>
      <span
        className="rn-roll absolute inset-x-0 top-0 flex flex-col items-center"
        style={{ transform: `translateY(-${digit * 10}%)` }}
      >
        {[...DIGITS].map((d) => (
          <span key={d} className="block h-[1em] leading-none">
            {d}
          </span>
        ))}
      </span>
    </span>
  );
}

/** Number that counts from its previous value to the new one (ease-out). Jumps when reduced motion is on. */
export function CountUp({
  value,
  format,
  duration = 1100,
  from,
  className,
}: {
  value: number;
  format: (n: number) => string;
  duration?: number;
  /** Starting value on first render (e.g. 0 for a jar that fills on load). Defaults to `value`. */
  from?: number;
  className?: string;
}) {
  const [shown, setShown] = useState(from ?? value);
  const cur = useRef(from ?? value);
  useEffect(() => {
    const start = cur.current;
    if (start === value) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const t0 = performance.now();
    const tickFn = (now: number) => {
      const t = reduced ? 1 : Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      const v = start + (value - start) * eased;
      cur.current = v;
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(tickFn);
    };
    raf = requestAnimationFrame(tickFn);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return (
    <span className={cn("tabular-nums", className)}>
      <span className="sr-only">{format(value)}</span>
      <span aria-hidden>{format(shown)}</span>
    </span>
  );
}
