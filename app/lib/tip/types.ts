import type { Connection, Keypair, PublicKey } from "@solana/web3.js";
import type { BuiltTransaction } from "@/lib/solana/tx";
import type { PayAssetId, TTokenId } from "@/lib/tokens";

export type { BuiltTransaction } from "@/lib/solana/tx";

export type BuildTipParams = {
  /** Fan wallet: signs and pays (swap input + fees + rent for the creator ATA / escrow if needed). */
  payer: PublicKey;
  /** Creator wallet: owner of the destination T-Token account, or the lock recipient. */
  creator: PublicKey;
  token: TTokenId;
  /** What the fan pays with. SOL is priced with a live USDC->SOL Jupiter quote. */
  payWith: PayAssetId;
  /** Tip size in USD. Min $1 unlocked, $5 locked (lib/tokens.ts). */
  usdAmount: number;
  /** Lock duration in seconds (use lockSecondsFor() from lib/lock.ts), or null for an unlocked tip. Max 5 years. */
  lockSeconds: number | null;
};

export type TxDeps = {
  /** Defaults to a Connection on NEXT_PUBLIC_RPC_URL. Server callers pass serverConnection(). */
  connection?: Connection;
};

export type BuiltTip = BuiltTransaction & {
  /**
   * Ephemeral escrow base keypair(s) for a locked tip, ALREADY applied as partial signatures. In-memory only:
   * never persist, log or send them anywhere. Re-apply with `tx.sign(ephemeralSigners)` if a wallet rewrites the message.
   */
  ephemeralSigners: Keypair[];
  /** Shrink-ladder step that fit in 1232 bytes, and the Jupiter route. */
  attempt: string;
  route: string;
  /** Input base units (USDC 6 dec / lamports). */
  inputAmount: bigint;
  /** Quoted T-Token out (net of the Token-2022 fee) and the slippage-protected minimum, raw 9-dec units. */
  expectedOut: bigint;
  minOut: bigint;
  lock: null | {
    escrow: string;
    /** Unix seconds (chain clock) when the tip unlocks. */
    cliffTime: number;
    lockSeconds: number;
    /** cliffUnlockAmount: what the escrow holds for the creator, raw units. */
    amountRaw: bigint;
  };
};

export type LockStatus = "locked" | "claimable" | "claimed";

export type LockedTip = {
  /** Jupiter Lock escrow account. */
  escrow: string;
  token: TTokenId;
  /** Amount still in the escrow for the creator, UI units. */
  amount: number;
  totalRaw: string;
  claimedRaw: string;
  /** Unix seconds (chain clock) when the cliff unlocks. */
  unlockAt: number;
  /** Fan wallet that created (and paid the deposit for) the escrow. */
  from: string;
  /** Creator wallet (escrow recipient). */
  recipient: string;
  /** locked: before the cliff; claimable: unlocked, not fully claimed; claimed: fully claimed (fan can reclaim the deposit). */
  status: LockStatus;
  claimable: boolean;
  /** Lamports held by the escrow + escrow token account: the fan's refundable deposit. */
  depositLamports: number;
};

export type LockList = {
  locks: LockedTip[];
  /** Chain clock (unix seconds) when the list was read. Use it to gate Claim, not Date.now(). */
  chainTime: number;
};

export type ListLocksParams = { creator: PublicKey };
export type ListDepositsParams = { sender: PublicKey };

export type BuildClaimParams = {
  /** Creator wallet (lock recipient), signs the claim. */
  recipient: PublicKey;
  escrow: PublicKey;
};

export type BuildCloseParams = {
  /** Fan wallet that created the escrow; signs and receives the rent. */
  sender: PublicKey;
  escrow: PublicKey;
};
