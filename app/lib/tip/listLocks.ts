import "@/lib/solana/buffer";
import { PublicKey, type Connection } from "@solana/web3.js";
import { defaultConnection } from "@/lib/solana/client";
import {
  ESCROW_DISCRIMINATOR_B58,
  ESCROW_LAYOUT,
  LOCKER_PROGRAM_ID,
  decodeEscrow,
  escrowTokenAccount,
  escrowTotal,
  unlockedAmount,
} from "@/lib/solana/lock";
import { chainNow } from "@/lib/solana/tx";
import { TOKEN_2022_PROGRAM, tokenByMint } from "@/lib/tokens";
import { TipError } from "./errors";
import type { ListDepositsParams, ListLocksParams, LockList, LockedTip } from "./types";

export const LOCKS_RPC_HINT =
  "Reading locked tips needs an RPC that serves getProgramAccounts. Set RPC_URL to a keyed RPC (Helius, Triton, QuickNode).";

/**
 * getProgramAccounts on Jupiter Lock, filtered server-side by size (296 B), the VestingEscrow discriminator and
 * one pubkey field (recipient @ 8 or creator @ 72, offsets from the IDL; see ESCROW_LAYOUT).
 * Public RPCs may reject or rate-limit this: it is rethrown as TipError RPC_UNSUPPORTED with a clear hint.
 */
async function fetchEscrows(conn: Connection, offset: number, wallet: PublicKey) {
  try {
    return await conn.getProgramAccounts(LOCKER_PROGRAM_ID, {
      commitment: "confirmed",
      filters: [
        { dataSize: ESCROW_LAYOUT.size },
        { memcmp: { offset: 0, bytes: ESCROW_DISCRIMINATOR_B58 } },
        { memcmp: { offset, bytes: wallet.toBase58() } },
      ],
    });
  } catch (e) {
    throw new TipError("RPC_UNSUPPORTED", `${LOCKS_RPC_HINT} (${e instanceof Error ? e.message : String(e)})`);
  }
}

async function readEscrows(conn: Connection, offset: number, wallet: PublicKey): Promise<LockList> {
  const [accounts, now] = await Promise.all([fetchEscrows(conn, offset, wallet), chainNow(conn)]);
  const decoded = accounts.flatMap(({ pubkey, account }) => {
    try {
      const state = decodeEscrow(account.data);
      const token = tokenByMint(state.tokenMint.toBase58());
      // Only Tessera T-Tokens (Token-2022) and never-cancelled escrows are tips from this app.
      if (!token || state.tokenProgramFlag !== 1 || state.cancelledAt !== BigInt(0)) return [];
      return [{ pubkey, lamports: account.lamports, state, token }];
    } catch {
      return [];
    }
  });

  // Escrow token account rent is part of the fan's deposit.
  const atas = decoded.map((d) => escrowTokenAccount(d.pubkey, d.state.tokenMint, TOKEN_2022_PROGRAM));
  const ataLamports: number[] = [];
  for (let i = 0; i < atas.length; i += 100) {
    const infos = await conn.getMultipleAccountsInfo(atas.slice(i, i + 100), "confirmed");
    ataLamports.push(...infos.map((x) => x?.lamports ?? 0));
  }

  const locks: LockedTip[] = decoded.map(({ pubkey, lamports, state, token }, i) => {
    const total = escrowTotal(state);
    const remaining = total - state.totalClaimedAmount;
    const unlocked = unlockedAmount(state, now);
    const status: LockedTip["status"] =
      remaining <= BigInt(0) ? "claimed" : unlocked > state.totalClaimedAmount ? "claimable" : "locked";
    return {
      escrow: pubkey.toBase58(),
      token: token.id,
      amount: Number(remaining > BigInt(0) ? remaining : BigInt(0)) / 10 ** token.decimals,
      totalRaw: total.toString(),
      claimedRaw: state.totalClaimedAmount.toString(),
      unlockAt: Number(state.cliffTime),
      from: state.creator.toBase58(),
      recipient: state.recipient.toBase58(),
      status,
      claimable: status === "claimable",
      depositLamports: lamports + ataLamports[i],
    };
  });
  locks.sort((a, b) => a.unlockAt - b.unlockAt);
  return { locks, chainTime: Number(now) };
}

/** Locked tips for a creator (escrow recipient) that still hold tokens: status "locked" or "claimable". */
export async function listLocks(params: ListLocksParams, deps: { connection?: Connection } = {}): Promise<LockList> {
  const list = await readEscrows(deps.connection ?? defaultConnection(), ESCROW_LAYOUT.recipient, params.creator);
  return { ...list, locks: list.locks.filter((l) => l.status !== "claimed") };
}

/** Every open escrow a fan created (any status). "claimed" ones can be closed to reclaim the deposit. */
export async function listDeposits(params: ListDepositsParams, deps: { connection?: Connection } = {}): Promise<LockList> {
  return readEscrows(deps.connection ?? defaultConnection(), ESCROW_LAYOUT.creator, params.sender);
}
