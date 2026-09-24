/** Vibration API haptics (Android Chrome). Silently does nothing elsewhere (iOS Safari has no vibrate). */
export function haptic(pattern: number | readonly number[]) {
  try {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    // Chrome logs an intervention error when vibrating before the first tap; skip until the page has been used.
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (ua && !ua.hasBeenActive) return;
    navigator.vibrate(pattern as number | number[]);
  } catch {
    /* not allowed (no user activation yet): ignore */
  }
}

export const HAPTIC = {
  tick: 6,
  press: 12,
  lock: [18, 40, 28],
  success: [10, 50, 16, 40, 30],
  error: [30, 60, 30],
} as const;
