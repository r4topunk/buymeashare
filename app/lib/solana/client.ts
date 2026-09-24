import { Connection } from "@solana/web3.js";
import { clientRpcUrl } from "@/lib/solana/connection";

let fallback: Connection | undefined;

/** Connection used by the tx builders when the caller passes none (the /api/rpc proxy in the browser). */
export function defaultConnection(): Connection {
  fallback ??= new Connection(clientRpcUrl(), "confirmed");
  return fallback;
}
