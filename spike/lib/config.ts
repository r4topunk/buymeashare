// Shared configuration, constants, CLI parsing and keypair loading.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs, type ParseArgsConfig } from "node:util";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

export const RPC_URL = process.env.RPC_URL ?? "https://api.mainnet-beta.solana.com";
export const JUP_API = process.env.JUP_API_URL ?? "https://lite-api.jup.ag/swap/v1";

export const MEMO_TEXT = "buymeashare:v0";
export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

export const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
export const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

// Tessera pre-IPO T-Tokens (Token-2022, 9 decimals, 20 bps transfer fee).
export const T_TOKENS = {
  openai: new PublicKey("oPAiAikWTaFj9RYoRFD35ccfwhnMcB3ThgBZRHSkjTZ"),
  kalshi: new PublicKey("TKLSidmLVt3cqGaaodG8tyRzoANfQwoh67AccjmubeZ"),
  spacex: new PublicKey("TSPXcLV76s6V2zDiZQ18kBfcbnjaE2ZzNT3ga2Pd99v"),
} as const;
export type TTokenName = keyof typeof T_TOKENS;

export const FAN_KEYPAIR_PATH =
  process.env.FAN_KEYPAIR ?? join(homedir(), ".config/solana/stocklana-test.json");
export const CREATOR_KEYPAIR_PATH =
  process.env.CREATOR_KEYPAIR ?? join(homedir(), ".config/solana/stocklana-creator.json");

export function connection(): Connection {
  return new Connection(RPC_URL, "confirmed");
}

/**
 * Loads a keypair file in-process. Secret bytes never leave this function's
 * return value: nothing here logs, prints or copies them.
 */
export function loadKeypair(path: string): Keypair {
  const raw = JSON.parse(readFileSync(path, "utf8")) as number[];
  if (!Array.isArray(raw) || raw.length !== 64) {
    throw new Error(`Keypair file ${path} is not a 64-byte JSON array`);
  }
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

export type Mode = "simulate" | "send";

export function isLocalRpc(url = RPC_URL): boolean {
  const host = new URL(url).hostname;
  return ["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"].includes(host);
}

/**
 * Common flags: --simulate (default) | --send, plus script-specific options.
 * Guard: --send is only allowed against a local RPC (e.g. Surfpool) unless --mainnet is also passed.
 */
export function parseCli<T extends NonNullable<ParseArgsConfig["options"]>>(options: T) {
  const { values } = parseArgs({
    options: {
      simulate: { type: "boolean", default: false },
      send: { type: "boolean", default: false },
      mainnet: { type: "boolean", default: false },
      ...options,
    },
    strict: true,
    allowPositionals: false,
  });
  const v = values as Record<string, unknown>;
  if (v.simulate && v.send) throw new Error("Pass either --simulate or --send, not both");
  const mode: Mode = v.send === true ? "send" : "simulate";
  if (mode === "send" && !isLocalRpc() && v.mainnet !== true) {
    console.error(`Refusing --send: RPC_URL (${RPC_URL}) is not localhost. Add --mainnet to send a REAL mainnet transaction.`);
    process.exit(3);
  }
  return { mode, values: v };
}

export function tokenMint(name: string): PublicKey {
  const mint = T_TOKENS[name as TTokenName];
  if (!mint) throw new Error(`--token must be one of ${Object.keys(T_TOKENS).join("|")}`);
  return mint;
}

export function banner(title: string, mode: Mode) {
  console.log(`\n=== ${title} ===`);
  const target = isLocalRpc() ? "LOCAL surfnet/validator" : "REAL MAINNET TRANSACTION";
  console.log(`mode: ${mode.toUpperCase()}${mode === "simulate" ? " (nothing is sent)" : ` (${target})`}`);
  console.log(`rpc:  ${RPC_URL}${isLocalRpc() ? " (local)" : ""}`);
}
