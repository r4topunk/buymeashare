import { Connection } from "@solana/web3.js";
import { publicEnv, serverRpcUrl } from "@/lib/env";

let server: Connection | undefined;

/** Server-side connection (RPC_URL if set, else NEXT_PUBLIC_RPC_URL). */
export function serverConnection(): Connection {
  server ??= new Connection(serverRpcUrl(), { commitment: "confirmed", disableRetryOnRateLimit: false });
  return server;
}

export function clientRpcUrl(): string {
  return publicEnv.NEXT_PUBLIC_RPC_URL;
}
