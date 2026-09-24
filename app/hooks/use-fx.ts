"use client";

import { useSyncExternalStore } from "react";
import { isMuted, subscribeMuted } from "@/lib/fx/audio";

/** Sound on/off, persisted in localStorage (lib/fx/audio). Server snapshot: sound on. */
export function useMuted(): boolean {
  return useSyncExternalStore(subscribeMuted, isMuted, () => false);
}

const RM_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeRM(fn: () => void) {
  const mq = window.matchMedia(RM_QUERY);
  mq.addEventListener("change", fn);
  return () => mq.removeEventListener("change", fn);
}

/** True when the user asked for reduced motion. Big motion (flights, confetti, pours) is skipped; feedback stays. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeRM, () => window.matchMedia(RM_QUERY).matches, () => false);
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia(RM_QUERY).matches;
}
