import { PublicKey } from "@solana/web3.js";
import { z } from "zod";
import { PAY_ASSET_IDS, T_TOKEN_IDS } from "@/lib/tokens";

export function isValidWallet(value: string): boolean {
  try {
    return new PublicKey(value).toBase58() === value;
  } catch {
    return false;
  }
}

/** A base58 Solana address (32 bytes). Does not require on-curve: any valid public key can receive tips. */
export const walletSchema = z
  .string()
  .trim()
  .min(32)
  .max(44)
  .refine(isValidWallet, { message: "Not a valid Solana address" });

// Strip control chars and angle brackets; names are display-only and UNVERIFIED.
const displayName = z
  .string()
  .transform((s) => s.replace(/[\u0000-\u001f\u007f<>]/g, "").trim())
  .pipe(z.string().min(1).max(40));

const xHandle = z
  .string()
  .transform((s) => s.trim().replace(/^@/, ""))
  .pipe(z.string().regex(/^[A-Za-z0-9_]{1,15}$/));

function firstValue(v: unknown): unknown {
  return Array.isArray(v) ? v[0] : v;
}

/** Query params of /tip/<wallet>?name=&x=. Invalid values are dropped, never fatal. */
export const tipQuerySchema = z.object({
  name: z.preprocess(firstValue, displayName.optional()).catch(undefined),
  x: z.preprocess(firstValue, xHandle.optional()).catch(undefined),
  token: z.preprocess(firstValue, z.enum(T_TOKEN_IDS).optional()).catch(undefined),
});
export type TipQuery = z.infer<typeof tipQuerySchema>;

export const tokenIdSchema = z.enum(T_TOKEN_IDS);
export const payAssetSchema = z.enum(PAY_ASSET_IDS);

/** Build the canonical tip link path. */
export function tipPath(wallet: string, opts: { name?: string; x?: string } = {}): string {
  const qs = new URLSearchParams();
  if (opts.name) qs.set("name", opts.name);
  if (opts.x) qs.set("x", opts.x.replace(/^@/, ""));
  const q = qs.toString();
  return `/tip/${wallet}${q ? `?${q}` : ""}`;
}
