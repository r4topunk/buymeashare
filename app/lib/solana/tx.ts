// Transaction assembly helpers. Ported from ../spike/lib/tx.ts.
import "./buffer";
import {
  ComputeBudgetProgram,
  PACKET_DATA_SIZE,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  type AddressLookupTableAccount,
  type Connection,
  type MessageV0,
} from "@solana/web3.js";
import { MEMO_PROGRAM_ID, TIP_MEMO } from "@/lib/tip/memo";
import { Buffer, readI64le } from "./buffer";

export const MAX_TX_BYTES = PACKET_DATA_SIZE; // 1232

/** Priority fee for every tx we build (micro-lamports per CU). 20k x 400k CU = 0.000008 SOL. */
export const CU_PRICE_MICRO_LAMPORTS = 20_000;

export function memoIx(text: string = TIP_MEMO): TransactionInstruction {
  // No signer accounts: keeps the memo at ~1 key + data bytes.
  return new TransactionInstruction({ programId: new PublicKey(MEMO_PROGRAM_ID), keys: [], data: Buffer.from(text, "utf8") });
}

export function computeBudgetIxs(units: number, microLamports = CU_PRICE_MICRO_LAMPORTS): TransactionInstruction[] {
  return [ComputeBudgetProgram.setComputeUnitLimit({ units }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports })];
}

export async function fetchLookupTables(conn: Connection, keys: PublicKey[]): Promise<AddressLookupTableAccount[]> {
  return Promise.all(
    keys.map(async (k) => {
      const res = await conn.getAddressLookupTable(k);
      if (!res.value) throw new Error(`Address lookup table ${k.toBase58()} not found`);
      return res.value;
    }),
  );
}

const compactLen = (n: number) => (n < 0x80 ? 1 : n < 0x4000 ? 2 : 3);

/** Exact wire size of a v0 transaction (web3.js serialize() throws past 1232 bytes, so we measure analytically). */
export function v0Size(msg: MessageV0): number {
  const sigs = msg.header.numRequiredSignatures;
  let size = compactLen(sigs) + 64 * sigs;
  size += 1 + 3; // version prefix + header
  size += compactLen(msg.staticAccountKeys.length) + 32 * msg.staticAccountKeys.length;
  size += 32; // recent blockhash
  size += compactLen(msg.compiledInstructions.length);
  for (const ix of msg.compiledInstructions) {
    size += 1 + compactLen(ix.accountKeyIndexes.length) + ix.accountKeyIndexes.length;
    size += compactLen(ix.data.length) + ix.data.length;
  }
  size += compactLen(msg.addressTableLookups.length);
  for (const l of msg.addressTableLookups) {
    size += 32 + compactLen(l.writableIndexes.length) + l.writableIndexes.length;
    size += compactLen(l.readonlyIndexes.length) + l.readonlyIndexes.length;
  }
  return size;
}

export type CompiledTx = { transaction: VersionedTransaction | null; bytes: number };

/** Compiles a v0 tx; `transaction` is null when it would not fit in 1232 bytes. */
export function compileV0(payer: PublicKey, ixs: TransactionInstruction[], alts: AddressLookupTableAccount[], recentBlockhash: string): CompiledTx {
  const message = new TransactionMessage({ payerKey: payer, recentBlockhash, instructions: ixs }).compileToV0Message(alts);
  const bytes = v0Size(message);
  return { transaction: bytes <= MAX_TX_BYTES ? new VersionedTransaction(message) : null, bytes };
}

/**
 * Chain clock in unix seconds (what the Jupiter Lock program compares cliffTime against), NOT the local clock:
 * they diverge on a time-travelled fork and can drift on mainnet. getSlot + getBlockTime, falling back to the
 * Clock sysvar (unix_timestamp at offset 32) when the block time is not available yet.
 */
export async function chainNow(conn: Connection): Promise<bigint> {
  try {
    const t = await conn.getBlockTime(await conn.getSlot("confirmed"));
    if (t != null) return BigInt(t);
  } catch {
    /* fall through to the Clock sysvar */
  }
  const clock = await conn.getAccountInfo(new PublicKey("SysvarC1ock11111111111111111111111111111111"), "confirmed");
  if (!clock) throw new Error("Could not read the chain clock");
  return readI64le(clock.data, 32);
}

/** Base fields every builder returns, so the UI can confirm with the same blockhash. */
export type BuiltTransaction = {
  transaction: VersionedTransaction;
  blockhash: string;
  lastValidBlockHeight: number;
  bytes: number;
};
