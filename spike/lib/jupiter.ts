// Minimal Jupiter Swap API v1 client (quote + swap-instructions).
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { JUP_API, USDC_MINT, WSOL_MINT } from "./config.js";

export type Quote = {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: { swapInfo: { label: string; ammKey: string } }[];
  [k: string]: unknown;
};

export type QuoteOptions = {
  slippageBps?: number;
  maxAccounts?: number;
  onlyDirectRoutes?: boolean;
};

type RawIx = {
  programId: string;
  accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
  data: string;
};

export type SwapInstructions = {
  setupInstructions: TransactionInstruction[];
  swapInstruction: TransactionInstruction;
  cleanupInstruction?: TransactionInstruction;
  otherInstructions: TransactionInstruction[];
  addressLookupTableAddresses: PublicKey[];
  jupComputeUnitLimit?: number;
};

async function jupFetch(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${JUP_API}${path}`, init);
  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Jupiter ${path} -> HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  if (!res.ok || body.error) {
    const code = body.errorCode ? ` [${body.errorCode}]` : "";
    throw new Error(`Jupiter ${path.split("?")[0]} -> HTTP ${res.status}${code}: ${body.error ?? text.slice(0, 300)}`);
  }
  return body;
}

export async function getQuote(
  inputMint: PublicKey,
  outputMint: PublicKey,
  amount: bigint,
  opts: QuoteOptions = {},
): Promise<Quote> {
  const q = new URLSearchParams({
    inputMint: inputMint.toBase58(),
    outputMint: outputMint.toBase58(),
    amount: amount.toString(),
    slippageBps: String(opts.slippageBps ?? 50),
    swapMode: "ExactIn", // ExactOut returns NO_ROUTES_FOUND for T-Tokens (verified 2026-09-23)
  });
  if (opts.maxAccounts) q.set("maxAccounts", String(opts.maxAccounts));
  if (opts.onlyDirectRoutes) q.set("onlyDirectRoutes", "true");
  return jupFetch(`/quote?${q}`);
}

function toIx(raw: RawIx): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(raw.programId),
    keys: raw.accounts.map((a) => ({
      pubkey: new PublicKey(a.pubkey),
      isSigner: a.isSigner,
      isWritable: a.isWritable,
    })),
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
    // We add our own compute-budget instructions, so Jupiter's are ignored.
    dynamicComputeUnitLimit: false,
  };
  if (params.destinationTokenAccount) {
    body.destinationTokenAccount = params.destinationTokenAccount.toBase58();
  }
  const r = await jupFetch("/swap-instructions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    setupInstructions: (r.setupInstructions ?? []).map(toIx),
    swapInstruction: toIx(r.swapInstruction),
    cleanupInstruction: r.cleanupInstruction ? toIx(r.cleanupInstruction) : undefined,
    otherInstructions: (r.otherInstructions ?? []).map(toIx),
    addressLookupTableAddresses: (r.addressLookupTableAddresses ?? []).map((a: string) => new PublicKey(a)),
    jupComputeUnitLimit: r.computeUnitLimit,
  };
}

/** Converts a USD amount into input base units (USDC: 6 decimals; SOL: priced via a USDC->SOL quote). */
export async function usdToInputAmount(input: "SOL" | "USDC", usd: number): Promise<{ mint: PublicKey; amount: bigint }> {
  const usdcUnits = BigInt(Math.round(usd * 1e6));
  if (input === "USDC") return { mint: USDC_MINT, amount: usdcUnits };
  const q = await getQuote(USDC_MINT, WSOL_MINT, usdcUnits, { slippageBps: 50 });
  return { mint: WSOL_MINT, amount: BigInt(q.outAmount) };
}

/** Quote variants tried in order until the resulting transaction fits in 1232 bytes. */
export const SHRINK_LADDER: { label: string; opts: QuoteOptions }[] = [
  { label: "default", opts: {} },
  { label: "maxAccounts=40", opts: { maxAccounts: 40 } },
  { label: "maxAccounts=30", opts: { maxAccounts: 30 } },
  { label: "maxAccounts=20", opts: { maxAccounts: 20 } },
  { label: "onlyDirectRoutes", opts: { onlyDirectRoutes: true } },
];

export function routeLabel(q: Quote): string {
  return q.routePlan.map((r) => r.swapInfo.label).join(" -> ");
}
