"use client";

import { useEffect, useId, useMemo, useRef } from "react";
import * as sfx from "@/lib/fx/audio";
import { HAPTIC, haptic } from "@/lib/fx/haptics";
import { cn } from "@/lib/utils";
import { useVessel } from "./vessel-context";
import { VesselEngine, type CoinSpec } from "./vessel-engine";
import { BODY, CX, JAR_BODY_PATH, NECK, RIM, VB_H, VB_W } from "./vessel-geometry";

/**
 * The glass jar. SVG glass (back + front) sandwiches a canvas where coins fall, roll and stack.
 * Tap it: coins jump (tip/jar pages) or a new coin drops in (`onTapDrop`, landing toy).
 */
export function Vessel({
  coins,
  className,
  label,
  onTapDrop,
}: {
  coins: CoinSpec[];
  className?: string;
  label: string;
  /** Landing page toy: tapping drops this coin instead of shaking. */
  onTapDrop?: () => CoinSpec | null;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<VesselEngine | null>(null);
  const ctx = useVessel();
  const register = ctx?.register;
  const uid = useId().replace(/:/g, "");

  useEffect(() => {
    const el = wrap.current;
    const cv = canvas.current;
    if (!el || !cv) return;
    const e = new VesselEngine(cv);
    engine.current = e;
    e.onImpact(({ speed, size, locked }) => {
      sfx.clink(speed / 1500, locked ? 0.8 : size);
    });
    const ro = new ResizeObserver(([entry]) => e.resize(entry.contentRect.width, window.devicePixelRatio));
    ro.observe(el);
    e.resize(el.clientWidth, window.devicePixelRatio);
    register?.({ el, engine: e });
    // Dev-only hook for the headless checks (frame counter proves the loop parks).
    if (process.env.NODE_ENV === "development") (el as HTMLDivElement & { __engine?: VesselEngine }).__engine = e;
    return () => {
      ro.disconnect();
      register?.(null);
      e.destroy();
      engine.current = null;
    };
  }, [register]);

  const all = useMemo(() => [...coins, ...(ctx?.lockCoins ?? []), ...(ctx?.sessionCoins ?? [])], [coins, ctx?.lockCoins, ctx?.sessionCoins]);

  useEffect(() => {
    const e = engine.current;
    if (!e) return;
    e.setCoins(all, { instant: false });
  }, [all]);

  function tap() {
    const e = engine.current;
    if (!e) return;
    sfx.unlock();
    haptic(HAPTIC.tick);
    const spec = onTapDrop?.();
    if (spec) void e.drop(spec, { vy: 300 });
    else e.shake(0.7);
  }

  const g = (n: string) => `${uid}-${n}`;

  return (
    <div
      ref={wrap}
      role="img"
      aria-label={label}
      onPointerDown={tap}
      className={cn("relative aspect-[300/340] w-full cursor-pointer touch-manipulation select-none", className)}
    >
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="absolute inset-0 size-full overflow-visible" aria-hidden>
        <defs>
          <linearGradient id={g("glass")} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="oklch(0.92 0.03 190)" stopOpacity="0.16" />
            <stop offset="0.18" stopColor="oklch(0.95 0.02 190)" stopOpacity="0.04" />
            <stop offset="0.82" stopColor="oklch(0.95 0.02 190)" stopOpacity="0.03" />
            <stop offset="1" stopColor="oklch(0.92 0.03 190)" stopOpacity="0.13" />
          </linearGradient>
          <radialGradient id={g("floor")} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#000" stopOpacity="0.55" />
            <stop offset="1" stopColor="#000" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={g("bounce")} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="var(--brand)" stopOpacity="0.22" />
            <stop offset="1" stopColor="var(--brand)" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* Contact shadow + warm light bouncing off the table. */}
        <ellipse cx={CX} cy={BODY.bottom + 6} rx={BODY.half + 26} ry="16" fill={`url(#${g("floor")})`} />
        <ellipse cx={CX} cy={BODY.bottom + 4} rx={BODY.half - 10} ry="9" fill={`url(#${g("bounce")})`} />
        {/* Back glass. */}
        <path d={`${JAR_BODY_PATH} Z`} fill={`url(#${g("glass")})`} />
        <path
          d={`M ${CX - BODY.half + 16} ${BODY.bottom - 10} Q ${CX} ${BODY.bottom - 2} ${CX + BODY.half - 16} ${BODY.bottom - 10}`}
          stroke="white"
          strokeOpacity="0.07"
          strokeWidth="10"
          fill="none"
          strokeLinecap="round"
        />
      </svg>

      <canvas ref={canvas} className="absolute inset-0 size-full" />

      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden>
        <defs>
          <linearGradient id={g("streak")} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="white" stopOpacity="0.34" />
            <stop offset="0.55" stopColor="white" stopOpacity="0.12" />
            <stop offset="1" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={g("rim")} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="white" stopOpacity="0.2" />
            <stop offset="1" stopColor="white" stopOpacity="0.03" />
          </linearGradient>
          <linearGradient id={g("edge")} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="white" stopOpacity="0.5" />
            <stop offset="0.5" stopColor="white" stopOpacity="0.14" />
            <stop offset="1" stopColor="white" stopOpacity="0.4" />
          </linearGradient>
        </defs>
        {/* Outline. */}
        <path d={JAR_BODY_PATH} fill="none" stroke={`url(#${g("edge")})`} strokeWidth="1.6" />
        <path d={JAR_BODY_PATH} fill="none" stroke="white" strokeOpacity="0.05" strokeWidth="7" />
        {/* Vertical highlights (cylinder reflections). */}
        <rect x={CX - BODY.half + 14} y={BODY.top + 8} width="13" height="150" rx="6.5" fill={`url(#${g("streak")})`} />
        <rect x={CX - BODY.half + 33} y={BODY.top + 18} width="4" height="96" rx="2" fill={`url(#${g("streak")})`} opacity="0.7" />
        <rect x={CX + BODY.half - 17} y={BODY.top + 20} width="5" height="120" rx="2.5" fill={`url(#${g("streak")})`} opacity="0.45" />
        {/* Shoulder glint. */}
        <path
          d={`M ${CX - NECK.half - 4} ${NECK.bottom + 18} Q ${CX - BODY.half + 20} ${NECK.bottom + 30} ${CX - BODY.half + 12} ${BODY.top - 4}`}
          stroke="white"
          strokeOpacity="0.3"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
        {/* Bottom glass thickness. */}
        <path
          d={`M ${CX - BODY.half + 22} ${BODY.bottom - 5} Q ${CX} ${BODY.bottom + 1} ${CX + BODY.half - 22} ${BODY.bottom - 5}`}
          stroke="white"
          strokeOpacity="0.22"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
        {/* Rim lip. */}
        <rect x={CX - RIM.half} y={RIM.top} width={RIM.half * 2} height={RIM.bottom - RIM.top} rx="7" fill={`url(#${g("rim")})`} stroke="white" strokeOpacity="0.4" strokeWidth="1.2" />
        <path d={`M ${CX - RIM.half + 8} ${RIM.top + 4} L ${CX + RIM.half - 8} ${RIM.top + 4}`} stroke="white" strokeOpacity="0.55" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </div>
  );
}
