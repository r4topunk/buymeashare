import { z } from "zod";

const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";
const DEFAULT_JUPITER_API = "https://lite-api.jup.ag";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_RPC_URL: z.url().default(DEFAULT_RPC),
  NEXT_PUBLIC_SITE_URL: z.url().optional(),
  /** Jupiter API origin used by the tx builder (browser + Blink route). Swap API lives under /swap/v1. */
  NEXT_PUBLIC_JUPITER_API_URL: z.url().default(DEFAULT_JUPITER_API),
  /**
   * Demo only: when set, the lock unit picker gets a "Demo" option that locks for exactly this many seconds
   * (e.g. 120 for the demo video). Unset in production.
   */
  NEXT_PUBLIC_DEMO_LOCK_SECONDS: z.coerce.number().int().positive().optional(),
});

// NEXT_PUBLIC_* must be referenced literally so Next.js can inline them in client bundles.
export const publicEnv = publicEnvSchema.parse({
  NEXT_PUBLIC_RPC_URL: process.env.NEXT_PUBLIC_RPC_URL || undefined,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || undefined,
  NEXT_PUBLIC_JUPITER_API_URL: process.env.NEXT_PUBLIC_JUPITER_API_URL || undefined,
  NEXT_PUBLIC_DEMO_LOCK_SECONDS: process.env.NEXT_PUBLIC_DEMO_LOCK_SECONDS || undefined,
});

const serverEnvSchema = z.object({
  /**
   * Optional private RPC for server-side reads (jar, OG image, locked tips, Blink tx build). Falls back to
   * NEXT_PUBLIC_RPC_URL. Locked tips need getProgramAccounts, which a keyed RPC (Helius, Triton) serves reliably.
   */
  RPC_URL: z.url().optional(),
  TESSERA_API_URL: z.url().default("https://rest-api.tessera.pe/v1/public"),
  /** Jupiter price API origin (server). Defaults to NEXT_PUBLIC_JUPITER_API_URL. */
  JUPITER_API_URL: z.url(),
  VERCEL_URL: z.string().optional(),
  VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
});

/** Server-only values. Safe to import on the client (fields just resolve to defaults), but only meaningful on the server. */
export function serverEnv() {
  return serverEnvSchema.parse({
    RPC_URL: process.env.RPC_URL || undefined,
    TESSERA_API_URL: process.env.TESSERA_API_URL || undefined,
    JUPITER_API_URL: process.env.JUPITER_API_URL || publicEnv.NEXT_PUBLIC_JUPITER_API_URL,
    VERCEL_URL: process.env.VERCEL_URL || undefined,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL || undefined,
  });
}

export function serverRpcUrl(): string {
  return serverEnv().RPC_URL ?? publicEnv.NEXT_PUBLIC_RPC_URL;
}

/** Absolute site origin for metadata/OG. Order: NEXT_PUBLIC_SITE_URL, Vercel production URL, VERCEL_URL, localhost. */
export function siteUrl(): string {
  if (publicEnv.NEXT_PUBLIC_SITE_URL) return publicEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const env = serverEnv();
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL ?? env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}
