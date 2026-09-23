import { z } from "zod";
import { T_TOKEN_IDS } from "@/lib/tokens";

export const tokenPriceSchema = z.object({
  /** Tessera mark price (USD per 1 T-Token). Primary "value" shown in jars. */
  tesseraMark: z.number().nullable(),
  /** Jupiter DEX price (USD per 1 T-Token). What a fan actually gets when swapping. */
  dex: z.number().nullable(),
  /** Value to display, picked by PRICE_SOURCE (lib/prices/source.ts), falling back to the other price. */
  usd: z.number().nullable(),
  /** Which price `usd` came from. */
  source: z.enum(["market", "tessera", "none"]),
});

/** Payload of GET /api/prices. Also validated on the client. */
export const priceSnapshotSchema = z.object({
  tokens: z.record(z.enum(T_TOKEN_IDS), tokenPriceSchema),
  solUsd: z.number().nullable(),
  fetchedAt: z.number(),
  errors: z.array(z.string()),
});
export type TokenPrice = z.infer<typeof tokenPriceSchema>;
export type PriceSnapshot = z.infer<typeof priceSnapshotSchema>;
