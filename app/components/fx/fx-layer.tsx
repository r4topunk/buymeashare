"use client";

import { useEffect, useRef } from "react";
import { unlock } from "@/lib/fx/audio";

/**
 * Page-wide effects:
 * - unlocks audio on the first real gesture (no AudioContext before that),
 * - a soft ring where the mouse clicks (fine pointers only, skipped with reduced motion).
 * Rings are pooled DOM nodes animated by CSS; nothing runs between clicks.
 */
export function FxLayer() {
  const layer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const gesture = () => unlock();
    window.addEventListener("pointerdown", gesture, { capture: true, passive: true });
    window.addEventListener("keydown", gesture, { capture: true, passive: true });

    const fine = window.matchMedia("(pointer: fine)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pool: HTMLSpanElement[] = [];
    let next = 0;
    const ripple = (e: PointerEvent) => {
      if (!fine.matches || reduced.matches || e.button !== 0 || !layer.current) return;
      let el = pool[next];
      if (!el) {
        el = document.createElement("span");
        el.className = "fx-ripple";
        layer.current.appendChild(el);
        pool[next] = el;
      }
      next = (next + 1) % 6;
      el.style.left = `${e.clientX}px`;
      el.style.top = `${e.clientY}px`;
      el.classList.remove("fx-ripple-a", "fx-ripple-b");
      // Alternate two keyframe names so a reused node always restarts its animation.
      el.classList.add(el.dataset.alt === "a" ? "fx-ripple-b" : "fx-ripple-a");
      el.dataset.alt = el.dataset.alt === "a" ? "b" : "a";
    };
    window.addEventListener("pointerdown", ripple, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", gesture, { capture: true });
      window.removeEventListener("keydown", gesture, { capture: true });
      window.removeEventListener("pointerdown", ripple);
    };
  }, []);

  return <div ref={layer} aria-hidden className="pointer-events-none fixed inset-0 z-[70] overflow-hidden" />;
}

/** Living background: two slow warm glows and a static film grain. Pure CSS transforms, GPU-composited. */
export function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="ambient-glow ambient-glow-a absolute top-[-20vh] left-1/2 h-[80vh] w-[120vw] -translate-x-1/2 rounded-full" />
      <div className="ambient-glow ambient-glow-b absolute right-[-30vw] bottom-[-30vh] h-[70vh] w-[80vw] rounded-full" />
      <div className="ambient-grain absolute inset-0" />
    </div>
  );
}
