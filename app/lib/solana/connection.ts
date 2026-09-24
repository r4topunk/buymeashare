import { Connection } from "@solana/web3.js";
import { publicEnv, serverRpcUrl } from "@/lib/env";

let server: Connection | undefined;

/** Server-side connection (RPC_URL if set, else NEXT_PUBLIC_RPC_URL). */
export function serverConnection(): Connection {
  server ??= new Connection(serverRpcUrl(), { commitment: "confirmed", disableRetryOnRateLimit: false });
  return server;
}

/**
 * Browser RPC: always our same-origin proxy (/api/rpc), because the public mainnet RPC rejects browser-origin
 * requests and a keyed RPC_URL must stay server-side. On the server (SSR) it falls back to NEXT_PUBLIC_RPC_URL.
 */
export function clientRpcUrl(): string {
  if (typeof window !== "undefined") return `${window.location.origin}/api/rpc`;
  return publicEnv.NEXT_PUBLIC_RPC_URL;
}
