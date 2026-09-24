"use client";

import { useRef, useState } from "react";
import { rand, type CoinSpec } from "@/components/jar/vessel-engine";
import { Vessel } from "@/components/jar/vessel";
import { T_TOKENS } from "@/lib/tokens";

const SEED: CoinSpec[] = Array.from({ length: 16 }, (_, i) => {
  const id = `demo-${i}`;
  return { id, token: T_TOKENS[Math.floor(rand(id, 1) * 3)].id, r: 14 + Math.floor(rand(id, 2) * 6) };
});
const MAX_TAPS = 30;

/** Landing toy: an example jar. Every tap drops another coin in (with sound once the page has been touched). */
export function LandingJar() {
  const n = useRef(0);
  const [hint, setHint] = useState(true);
  return (
    <div className="relative mx-auto w-full max-w-[250px] sm:max-w-[300px] lg:max-w-[380px]">
      <div
        aria-hidden
        className="pointer-events-none absolute top-[4%] left-1/2 aspect-square w-[160%] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,oklch(0.72_0.13_62/0.24),oklch(0.6_0.1_55/0.07)_60%,transparent)]"
      />
      <Vessel
        coins={SEED}
        label="Example tip jar filled with T-Token coins. Tap to drop a coin."
        onTapDrop={() => {
          setHint(false);
          if (n.current >= MAX_TAPS) return null;
          const id = `tap-${n.current++}`;
          return { id, token: T_TOKENS[Math.floor(rand(id, 4) * 3)].id, r: 15 + Math.floor(rand(id, 5) * 5) };
        }}
      />
      <p className={`relative mt-3 text-center text-xs text-muted-foreground transition-opacity duration-500 ${hint ? "opacity-100" : "opacity-0"}`}>
        Tap the jar
      </p>
    </div>
  );
}
