import type { TTokenId } from "@/lib/tokens";

export type JarHolding = {
  token: TTokenId;
  /** Token accounts (usually just the Token-2022 ATA). */
  accounts: string[];
  /** Raw base units as a decimal string (u64 safe). */
  raw: string;
  /** UI units (9 decimals). */
  amount: number;
};

export type JarTip = {
  signature: string;
  /** Unix seconds (null if the RPC did not report it). */
  blockTime: number | null;
  token: TTokenId;
  /** Net amount the creator's account received (after the 0.2% transfer fee), UI units. */
  amount: number;
  /** Fee payer of the tip transaction (the fan). */
  from: string;
  memoTags: Record<string, string>;
};

export type Jar = {
  wallet: string;
  holdings: JarHolding[];
  /** Tips tagged with TIP_MEMO, newest first (capped). */
  tips: JarTip[];
  /** Sum of `tips` per token, UI units. */
  received: Partial<Record<TTokenId, number>>;
  /** True when more tagged signatures existed than were parsed. */
  truncated: boolean;
  fetchedAt: number;
  /** Non-fatal read errors (e.g. RPC rate limits). */
  errors: string[];
};
