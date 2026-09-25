/**
 * Demo flags for screenshots and the demo video (`?demoSuccess`, `?demoLocks`, `?demoJar`, `?demoDeposits`).
 * On in `next dev`, or in a build made with NEXT_PUBLIC_DEMO_FLAGS=1 (used to record the video from a production
 * build). Both are inlined at build time, so a normal production build drops every demo branch. Never set the flag
 * on Vercel.
 */
export const DEMO_FLAGS = process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_DEMO_FLAGS === "1";

/** What a simulated signature would do, shown by a recording wallet if one is present. */
export type DemoSignRequest = { title: string; rows: [label: string, value: string][] };

/**
 * Simulated wallet approval. A recording harness can define `window.__bmasDemoSign` to show its own approval popup
 * and resolve on "Approve"; otherwise the demo just waits `fallbackMs`.
 */
export async function demoSign(request: DemoSignRequest, fallbackMs: number): Promise<void> {
  const hook = typeof window === "undefined" ? undefined : (window as { __bmasDemoSign?: (r: DemoSignRequest) => Promise<void> }).__bmasDemoSign;
  if (hook) await hook(request);
  else await new Promise((r) => setTimeout(r, fallbackMs));
}
