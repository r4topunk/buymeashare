import { NextResponse } from "next/server";
import { serverRpcUrl } from "@/lib/env";

/**
 * Same-origin JSON-RPC proxy for the browser.
 * The public mainnet RPC rejects browser-origin requests (403), and a keyed RPC_URL must never reach the bundle,
 * so client Connections point here and we forward an allowlisted subset of methods to the server RPC.
 */
const ALLOWED = new Set([
  "getAccountInfo",
  "getMultipleAccounts",
  "getLatestBlockhash",
  "getBlockHeight",
  "getSlot",
  "getBlockTime",
  "getEpochInfo",
  "getBalance",
  "getTokenAccountBalance",
  "getTokenAccountsByOwner",
  "getMinimumBalanceForRentExemption",
  "getSignatureStatuses",
  "getSignaturesForAddress",
  "getTransaction",
  "getFeeForMessage",
  "getRecentPrioritizationFees",
  "isBlockhashValid",
  "simulateTransaction",
  "sendTransaction",
]);
const MAX_BODY_BYTES = 64 * 1024;
const MAX_BATCH = 20;

type RpcRequest = { jsonrpc?: string; id?: unknown; method?: unknown };

function rpcError(id: unknown, message: string, status: number) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code: -32601, message } }, { status });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return rpcError(null, "Request too large", 413);

  let body: RpcRequest | RpcRequest[];
  try {
    body = JSON.parse(raw);
  } catch {
    return rpcError(null, "Invalid JSON", 400);
  }

  const calls = Array.isArray(body) ? body : [body];
  if (calls.length === 0 || calls.length > MAX_BATCH) return rpcError(null, "Invalid batch size", 400);
  const blocked = calls.find((c) => typeof c.method !== "string" || !ALLOWED.has(c.method));
  if (blocked) return rpcError(blocked.id, `Method not allowed: ${String(blocked.method)}`, 403);

  const upstream = await fetch(serverRpcUrl(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw,
    cache: "no-store",
  });
  return new NextResponse(await upstream.text(), {
    status: upstream.status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
