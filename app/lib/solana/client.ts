import { Connection } from "@solana/web3.js";
import { publicEnv } from "@/lib/env";

let fallback: Connection | undefined;

/** Connection used by the tx builders when the caller passes none (NEXT_PUBLIC_RPC_URL). */
export function defaultConnection(): Connection {
  fallback ??= new Connection(publicEnv.NEXT_PUBLIC_RPC_URL, "confirmed");
  return fallback;
}
