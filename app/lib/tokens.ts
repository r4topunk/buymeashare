import { PublicKey } from "@solana/web3.js";

export const TOKEN_2022_PROGRAM = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

/**
 * Tessera pre-IPO T-Tokens. All are Token-2022, 9 decimals, 20 bps transfer fee (no cap).
 * Copy rule: these are NOT shares/equity/stock. Say "T-OpenAI" or "OpenAI pre-IPO exposure (Tessera T-Token)".
 */
export const T_TOKENS = [
  {
    id: "openai",
    symbol: "T-OpenAI",
    company: "OpenAI",
    mint: "oPAiAikWTaFj9RYoRFD35ccfwhnMcB3ThgBZRHSkjTZ",
    decimals: 9,
    transferFeeBps: 20,
  },
  {
    id: "kalshi",
    symbol: "T-Kalshi",
    company: "Kalshi",
    mint: "TKLSidmLVt3cqGaaodG8tyRzoANfQwoh67AccjmubeZ",
    decimals: 9,
    transferFeeBps: 20,
  },
  {
    id: "spacex",
    symbol: "T-SpaceX",
    company: "SpaceX",
    mint: "TSPXcLV76s6V2zDiZQ18kBfcbnjaE2ZzNT3ga2Pd99v",
    decimals: 9,
    transferFeeBps: 20,
  },
] as const;

export type TToken = (typeof T_TOKENS)[number];
export type TTokenId = TToken["id"];
export const T_TOKEN_IDS = T_TOKENS.map((t) => t.id) as [TTokenId, ...TTokenId[]];
export const DEFAULT_TOKEN_ID: TTokenId = "openai";

export function tokenById(id: TTokenId): TToken {
  const t = T_TOKENS.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown token id ${id}`);
  return t;
}

export function tokenByMint(mint: string): TToken | undefined {
  return T_TOKENS.find((x) => x.mint === mint);
}

/** What the fan pays with. */
export const PAY_ASSETS = {
  USDC: { symbol: "USDC", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6 },
  SOL: { symbol: "SOL", mint: "So11111111111111111111111111111111111111112", decimals: 9 },
} as const;
export type PayAssetId = keyof typeof PAY_ASSETS;
export const PAY_ASSET_IDS = Object.keys(PAY_ASSETS) as [PayAssetId, ...PayAssetId[]];

export const MIN_TIP_USD = 1;
/** Locked tips carry a ~0.0051 SOL refundable escrow deposit, so they start higher. */
export const MIN_LOCKED_TIP_USD = 5;
export const DEFAULT_TIP_USD = 3;
/** Transfer fee as a fraction (0.002). Shown to fans as "includes 0.2% token transfer fee". */
export const TRANSFER_FEE_FRACTION = 20 / 10_000;

export function minTipUsd(locked: boolean): number {
  return locked ? MIN_LOCKED_TIP_USD : MIN_TIP_USD;
}
