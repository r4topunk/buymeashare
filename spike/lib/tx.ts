// Transaction assembly, exact size measurement, simulation + error classification, sending.
import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  Connection,
  Keypair,
  MessageV0,
  PACKET_DATA_SIZE,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  type AccountInfo,
  type SimulatedTransactionResponse,
} from "@solana/web3.js";
import { LOCKER_ERRORS, LOCKER_PROGRAM_ID } from "./lock.js";
import { MEMO_PROGRAM_ID, MEMO_TEXT, isLocalRpc } from "./config.js";

export const MAX_TX_BYTES = PACKET_DATA_SIZE; // 1232

const JUPITER_PROGRAM_ID = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
const TOKEN_PROGRAMS = new Set([
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
]);

export function memoIx(text = MEMO_TEXT): TransactionInstruction {
  // No signer accounts: keeps the memo at ~1 key + data bytes.
  return new TransactionInstruction({ programId: MEMO_PROGRAM_ID, keys: [], data: Buffer.from(text, "utf8") });
}

export function computeBudgetIxs(units: number, microLamports: number): TransactionInstruction[] {
  return [
    ComputeBudgetProgram.setComputeUnitLimit({ units }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports }),
  ];
}

export async function fetchLookupTables(conn: Connection, keys: PublicKey[]): Promise<AddressLookupTableAccount[]> {
  const out: AddressLookupTableAccount[] = [];
  for (const k of keys) {
    const res = await conn.getAddressLookupTable(k);
    if (!res.value) throw new Error(`Address lookup table ${k.toBase58()} not found`);
    out.push(res.value);
  }
  return out;
}

const compactLen = (n: number) => (n < 0x80 ? 1 : n < 0x4000 ? 2 : 3);

/**
 * Exact wire size of a v0 transaction computed from the compiled message.
 * (web3.js serialize() throws past 1232 bytes, so we measure analytically to
 * report how far over the limit an oversized candidate is.)
 */
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

export type BuiltTx = {
  tx: VersionedTransaction | null; // null when oversized (cannot be serialized)
  message: MessageV0;
  v0Bytes: number;
  legacyBytes: number; // same instructions, no lookup tables
  fitsV0: boolean;
  fitsLegacy: boolean;
  numSigners: number;
  numStaticKeys: number;
  numLookupKeys: number;
  numInstructions: number;
};

export function buildTx(
  payer: PublicKey,
  ixs: TransactionInstruction[],
  alts: AddressLookupTableAccount[],
  recentBlockhash: string,
): BuiltTx {
  const message = new TransactionMessage({ payerKey: payer, recentBlockhash, instructions: ixs }).compileToV0Message(alts);
  const noAlt = new TransactionMessage({ payerKey: payer, recentBlockhash, instructions: ixs }).compileToV0Message([]);
  const v0Bytes = v0Size(message);
  // Legacy = v0 without lookups minus the version prefix byte and the empty lookup-array length byte.
  const legacyBytes = v0Size(noAlt) - 2;
  const fitsV0 = v0Bytes <= MAX_TX_BYTES;
  return {
    tx: fitsV0 ? new VersionedTransaction(message) : null,
    message,
    v0Bytes,
    legacyBytes,
    fitsV0,
    fitsLegacy: legacyBytes <= MAX_TX_BYTES,
    numSigners: message.header.numRequiredSignatures,
    numStaticKeys: message.staticAccountKeys.length,
    numLookupKeys: message.addressTableLookups.reduce((n, l) => n + l.writableIndexes.length + l.readonlyIndexes.length, 0),
    numInstructions: message.compiledInstructions.length,
  };
}

export function describeSize(b: BuiltTx): string {
  return [
    `v0 ${b.v0Bytes} B (${b.fitsV0 ? "fits" : `OVER by ${b.v0Bytes - MAX_TX_BYTES}`})`,
    `legacy ${b.legacyBytes} B (${b.fitsLegacy ? "fits" : `OVER by ${b.legacyBytes - MAX_TX_BYTES}`})`,
    `signers=${b.numSigners} staticKeys=${b.numStaticKeys} altKeys=${b.numLookupKeys} ixs=${b.numInstructions}`,
  ].join(" | ");
}

// ---------------------------------------------------------------------------
// Simulation

export type ErrorClass =
  | "OK"
  | "INSUFFICIENT_FUNDS" // expected with unfunded wallets
  | "SLIPPAGE" // transient market movement
  | "TX_TOO_LARGE" // structural
  | "PROGRAM_ERROR" // structural / logic
  | "COMPUTE_BUDGET" // structural (raise CU limit)
  | "RPC_ERROR";

export const STRUCTURAL: ErrorClass[] = ["TX_TOO_LARGE", "PROGRAM_ERROR", "COMPUTE_BUDGET"];

export type SimReport = {
  cls: ErrorClass;
  detail: string;
  failedIxIndex?: number;
  failedProgram?: string;
  unitsConsumed?: number;
  logs: string[];
  postAccounts: (AccountInfo<Buffer> | null)[];
};

const JUPITER_ERRORS: Record<number, string> = {
  6001: "SlippageToleranceExceeded",
  6008: "NotEnoughAccountKeys",
  6014: "IncorrectTokenProgramID",
  6017: "ExactOutAmountNotMatched",
};

function programName(id: string | undefined): string {
  if (!id) return "?";
  if (id === JUPITER_PROGRAM_ID) return "Jupiter";
  if (id === LOCKER_PROGRAM_ID.toBase58()) return "JupiterLock";
  if (id === "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb") return "Token-2022";
  if (id === "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") return "SPL-Token";
  if (id === "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL") return "AssociatedToken";
  if (id === "11111111111111111111111111111111") return "System";
  if (id === MEMO_PROGRAM_ID.toBase58()) return "Memo";
  if (id === "ComputeBudget111111111111111111111111111111") return "ComputeBudget";
  return id;
}

export function classify(
  value: Pick<SimulatedTransactionResponse, "err" | "logs">,
  message: MessageV0,
): Omit<SimReport, "logs" | "postAccounts" | "unitsConsumed"> {
  const err = value.err as any;
  const logs = value.logs ?? [];
  if (!err) return { cls: "OK", detail: "simulation succeeded" };
  const logText = logs.join("\n");

  if (err === "AccountNotFound") {
    return { cls: "INSUFFICIENT_FUNDS", detail: "fee payer account does not exist on-chain (unfunded wallet)" };
  }
  if (err === "InsufficientFundsForFee") return { cls: "INSUFFICIENT_FUNDS", detail: "fee payer cannot pay the fee" };
  if (typeof err === "object" && "InsufficientFundsForRent" in err) {
    return { cls: "INSUFFICIENT_FUNDS", detail: `insufficient funds for rent (account index ${err.InsufficientFundsForRent.account_index})` };
  }
  if (typeof err === "string" && /Lookup|AddressTable/i.test(err)) return { cls: "PROGRAM_ERROR", detail: `lookup table error: ${err}` };

  if (typeof err === "object" && "InstructionError" in err) {
    const [idx, ixErr] = err.InstructionError as [number, any];
    const pid = message.staticAccountKeys[message.compiledInstructions[idx]?.programIdIndex ?? -1]?.toBase58();
    const prog = programName(pid);
    const base = { failedIxIndex: idx, failedProgram: prog };
    const custom = typeof ixErr === "object" && ixErr && "Custom" in ixErr ? (ixErr.Custom as number) : undefined;

    if (/insufficient (funds|lamports)/i.test(logText)) {
      return { ...base, cls: "INSUFFICIENT_FUNDS", detail: `ix #${idx} (${prog}): ${firstMatch(logText, /.*insufficient (funds|lamports).*/i)}` };
    }
    if (custom === 1 && pid && TOKEN_PROGRAMS.has(pid)) {
      return { ...base, cls: "INSUFFICIENT_FUNDS", detail: `ix #${idx} (${prog}): token InsufficientFunds` };
    }
    if (ixErr === "ComputationalBudgetExceeded" || /exceeded CUs meter|computational budget exceeded/i.test(logText)) {
      return { ...base, cls: "COMPUTE_BUDGET", detail: `ix #${idx} (${prog}): compute budget exceeded` };
    }
    if (custom !== undefined && pid === JUPITER_PROGRAM_ID && JUPITER_ERRORS[custom] === "SlippageToleranceExceeded") {
      return { ...base, cls: "SLIPPAGE", detail: `ix #${idx} (Jupiter): SlippageToleranceExceeded` };
    }
    // Jupiter bubbles up inner-program errors: detect insufficient funds inside CPI.
    if (custom === 1 && /Program Tokenz|Program Tokenkeg/.test(logText) && /failed: custom program error: 0x1/.test(logText)) {
      return { ...base, cls: "INSUFFICIENT_FUNDS", detail: `ix #${idx} (${prog}): inner token InsufficientFunds` };
    }
    let name = "";
    if (custom !== undefined && pid === LOCKER_PROGRAM_ID.toBase58()) name = LOCKER_ERRORS[custom] ?? "";
    if (custom !== undefined && pid === JUPITER_PROGRAM_ID) name = JUPITER_ERRORS[custom] ?? "";
    const anchorMsg = firstMatch(logText, /Error Message: .*/);
    return {
      ...base,
      cls: "PROGRAM_ERROR",
      detail: `ix #${idx} (${prog}): ${JSON.stringify(ixErr)}${name ? ` ${name}` : ""}${anchorMsg ? ` | ${anchorMsg}` : ""}`,
    };
  }
  return { cls: "PROGRAM_ERROR", detail: JSON.stringify(err) };
}

function firstMatch(text: string, re: RegExp): string {
  return text.match(re)?.[0]?.trim() ?? "";
}

export async function simulate(conn: Connection, built: BuiltTx, watch: PublicKey[] = []): Promise<SimReport> {
  if (!built.tx) {
    return { cls: "TX_TOO_LARGE", detail: `v0 transaction is ${built.v0Bytes} B > ${MAX_TX_BYTES} B`, logs: [], postAccounts: [] };
  }
  try {
    const res = await conn.simulateTransaction(built.tx, {
      sigVerify: false,
      replaceRecentBlockhash: true,
      commitment: "processed",
      accounts: { encoding: "base64", addresses: watch.map((w) => w.toBase58()) },
    });
    const v = res.value;
    const postAccounts = (v.accounts ?? []).map((a) =>
      a ? ({ ...a, data: Buffer.from(a.data[0], "base64"), owner: new PublicKey(a.owner) } as AccountInfo<Buffer>) : null,
    );
    return { ...classify(v, built.message), unitsConsumed: v.unitsConsumed, logs: v.logs ?? [], postAccounts };
  } catch (e) {
    return { cls: "RPC_ERROR", detail: (e as Error).message, logs: [], postAccounts: [] };
  }
}

/** Which top-level instructions ran to success before the failure (from logs). */
export function executedIxSummary(logs: string[]): string[] {
  const out: string[] = [];
  const stack: string[] = [];
  for (const l of logs) {
    const inv = l.match(/^Program (\S+) invoke \[(\d+)\]/);
    if (inv) {
      stack.push(inv[1]);
      if (inv[2] === "1") out.push(`${programName(inv[1])}: running`);
      continue;
    }
    const done = l.match(/^Program (\S+) (success|failed.*)$/);
    if (done) {
      stack.pop();
      if (stack.length === 0 && out.length) out[out.length - 1] = out[out.length - 1].replace("running", done[2]);
    }
  }
  return out;
}

export function printSim(r: SimReport, verboseLogs = false) {
  const structural = STRUCTURAL.includes(r.cls);
  console.log(`  result: ${r.cls}${r.cls === "INSUFFICIENT_FUNDS" ? " (expected with unfunded wallets; NOT structural)" : ""}${structural ? " (STRUCTURAL)" : ""}`);
  console.log(`  detail: ${r.detail}`);
  if (r.unitsConsumed !== undefined) console.log(`  compute units consumed: ${r.unitsConsumed}`);
  const trail = executedIxSummary(r.logs);
  if (trail.length) console.log(`  top-level ix trail: ${trail.map((t, i) => `#${i} ${t}`).join(" ; ")}`);
  if ((verboseLogs || (r.cls !== "OK" && r.cls !== "INSUFFICIENT_FUNDS")) && r.logs.length) {
    console.log("  logs (tail):");
    for (const l of r.logs.slice(-25)) console.log(`    ${l}`);
  }
}

// ---------------------------------------------------------------------------
// Sending

export async function signAndSend(
  conn: Connection,
  built: BuiltTx,
  signers: Keypair[],
): Promise<string> {
  if (!built.tx) throw new Error("Refusing to send: transaction does not fit in 1232 bytes");
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  built.tx.message.recentBlockhash = blockhash;
  built.tx.sign(signers);
  // Surfpool lazily fetches accounts from its mainnet datasource; the public RPC intermittently
  // drops those requests. Retry only that specific, pre-execution failure.
  let sig = "";
  for (let attempt = 1; ; attempt++) {
    try {
      sig = await conn.sendRawTransaction(built.tx.serialize(), { skipPreflight: false, maxRetries: 3 });
      break;
    } catch (e) {
      const msg = (e as Error).message;
      if (!/Failed to fetch accounts from remote/.test(msg) || attempt >= 6) throw e;
      console.log(`  surfnet datasource fetch failed (attempt ${attempt}); retrying in ${2 * attempt}s`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  console.log(`  sent: ${sig}`);
  const conf = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  if (conf.value.err) throw new Error(`Transaction ${sig} failed: ${JSON.stringify(conf.value.err)}`);
  console.log(`  confirmed${isLocalRpc() ? " (local surfnet, not on mainnet)" : `: https://solscan.io/tx/${sig}`}`);
  return sig;
}

export async function fetchTxMeta(conn: Connection, sig: string) {
  for (let i = 0; i < 10; i++) {
    const tx = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
    if (tx) return tx;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`getTransaction(${sig}) returned null`);
}
