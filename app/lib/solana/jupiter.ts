// Minimal Jupiter Swap API v1 client (quote + swap-instructions). Ported from ../spike/lib/jupiter.ts.
// Isomorphic: runs in the browser (lite-api sends `access-control-allow-origin: *`) and on the server (Blink route).
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import { PAY_ASSETS } from "@/lib/tokens";
import { Buffer } from "./buffer";

const swapApi = () => `${publicEnv.NEXT_PUBLIC_JUPITER_API_URL.replace(/\/$/, "")}/swap/v1`;

const quoteSchema = z
  .object({
    inputMint: z.string(),
    outputMint: z.string(),
    inAmount: z.string().regex(/^\d+$/),
    outAmount: z.string().regex(/^\d+$/),
    otherAmountThreshold: z.string().regex(/^\d+$/),
    slippageBps: z.number(),
    priceImpactPct: z.string().optional(),
    routePlan: z.array(z.object({ swapInfo: z.object({ label: z.string().optional(), ammKey: z.string() }).loose() }).loose()),
  })
  .loose();
export type Quote = z.infer<typeof quoteSchema>;

export type QuoteOptions = { slippageBps?: number; maxAccounts?: number; onlyDirectRoutes?: boolean };

const rawIxSchema = z.object({
  programId: z.string(),
  accounts: z.array(z.object({ pubkey: z.string(), isSigner: z.boolean(), isWritable: z.boolean() })),
  data: z.string(),
});
const swapInstructionsSchema = z
  .object({
    setupInstructions: z.array(rawIxSchema).nullish(),
    swapInstruction: rawIxSchema,
    cleanupInstruction: rawIxSchema.nullish(),
    otherInstructions: z.array(rawIxSchema).nullish(),
    addressLookupTableAddresses: z.array(z.string()).nullish(),
  })
  .loose();

export type SwapInstructions = {
  setupInstructions: TransactionInstruction[];
  swapInstruction: TransactionInstruction;
  cleanupInstruction?: TransactionInstruction;
  otherInstructions: TransactionInstruction[];
  addressLookupTableAddresses: PublicKey[];
};

async function jupFetch(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${swapApi()}${path}`, { ...init, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const text = await res.text();
  let body: { error?: string; errorCode?: string } & Record<string, unknown>;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Jupiter ${path.split("?")[0]} -> HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  if (!res.ok || body.error) {
    const code = body.errorCode ? ` [${body.errorCode}]` : "";
    throw new Error(`Jupiter ${path.split("?")[0]} -> HTTP ${res.status}${code}: ${body.error ?? text.slice(0, 200)}`);
  }
  return body;
}

export async function getQuote(inputMint: PublicKey, outputMint: PublicKey, amount: bigint, opts: QuoteOptions = {}): Promise<Quote> {
  const q = new URLSearchParams({
    inputMint: inputMint.toBase58(),
    outputMint: outputMint.toBase58(),
    amount: amount.toString(),
    slippageBps: String(opts.slippageBps ?? 50),
    swapMode: "ExactIn", // ExactOut returns NO_ROUTES_FOUND for T-Tokens (verified 2026-09-23)
  });
  if (opts.maxAccounts) q.set("maxAccounts", String(opts.maxAccounts));
  if (opts.onlyDirectRoutes) q.set("onlyDirectRoutes", "true");
  return quoteSchema.parse(await jupFetch(`/quote?${q}`));
}

function toIx(raw: z.infer<typeof rawIxSchema>): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(raw.programId),
    keys: raw.accounts.map((a) => ({ pubkey: new PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })),
    data: Buffer.from(raw.data, "base64"),
  });
}

export async function getSwapInstructions(params: {
  quote: Quote;
  user: PublicKey;
  destinationTokenAccount?: PublicKey;
}): Promise<SwapInstructions> {
  const body: Record<string, unknown> = {
    quoteResponse: params.quote,
    userPublicKey: params.user.toBase58(),
    wrapAndUnwrapSol: true,
    // We add our own compute-budget instructions, so Jupiter's are not used.
    dynamicComputeUnitLimit: false,
  };
  if (params.destinationTokenAccount) body.destinationTokenAccount = params.destinationTokenAccount.toBase58();
  const r = swapInstructionsSchema.parse(
    await jupFetch("/swap-instructions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return {
    setupInstructions: (r.setupInstructions ?? []).map(toIx),
    swapInstruction: toIx(r.swapInstruction),
    cleanupInstruction: r.cleanupInstruction ? toIx(r.cleanupInstruction) : undefined,
    otherInstructions: (r.otherInstructions ?? []).map(toIx),
    addressLookupTableAddresses: (r.addressLookupTableAddresses ?? []).map((a) => new PublicKey(a)),
  };
}

/** USD -> input base units. USDC: 6 decimals, 1:1. SOL: priced with a live USDC->SOL Jupiter quote. */
export async function usdToInputAmount(payWith: "SOL" | "USDC", usd: number): Promise<{ mint: PublicKey; amount: bigint }> {
  const usdcUnits = BigInt(Math.round(usd * 1e6));
  const usdc = new PublicKey(PAY_ASSETS.USDC.mint);
  if (payWith === "USDC") return { mint: usdc, amount: usdcUnits };
  const sol = new PublicKey(PAY_ASSETS.SOL.mint);
  const q = await getQuote(usdc, sol, usdcUnits, { slippageBps: 50 });
  return { mint: sol, amount: BigInt(q.outAmount) };
}

/** Quote variants tried in order until the transaction fits in 1232 bytes (SOL + lock needs maxAccounts ~30). */
export const SHRINK_LADDER: { label: string; opts: QuoteOptions }[] = [
  { label: "default", opts: {} },
  { label: "maxAccounts=40", opts: { maxAccounts: 40 } },
  { label: "maxAccounts=30", opts: { maxAccounts: 30 } },
  { label: "maxAccounts=20", opts: { maxAccounts: 20 } },
  { label: "onlyDirectRoutes", opts: { onlyDirectRoutes: true } },
];

export function routeLabel(q: Quote): string {
  return q.routePlan.map((r) => r.swapInfo.label ?? "?").join(" -> ");
}
