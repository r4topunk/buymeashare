import { publicEnv } from "@/lib/env";

export function shortAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 1) return address;
  return `${address.slice(0, chars)}…${address.slice(-chars)}`;
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const usdSmall = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 });

export function formatUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value !== 0 && Math.abs(value) < 0.01) return usdSmall.format(value);
  return usd.format(value);
}

/** Token amounts: keep ~4 significant digits for tiny tips, fewer decimals for large balances. */
export function formatTokenAmount(value: number, maxDecimals = 6): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const decimals = abs === 0 ? 0 : abs >= 100 ? 2 : abs >= 1 ? 4 : Math.min(maxDecimals, Math.max(4, 3 - Math.floor(Math.log10(abs))));
  return value.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

export function formatDateTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Local RPC (Surfpool fork): point Solscan at it; mainnet otherwise. */
function clusterQuery(): string {
  const rpc = publicEnv.NEXT_PUBLIC_RPC_URL;
  const host = new URL(rpc).hostname;
  return ["localhost", "127.0.0.1", "0.0.0.0"].includes(host) ? `?cluster=custom&customUrl=${encodeURIComponent(rpc)}` : "";
}

export function explorerTx(signature: string): string {
  return `https://solscan.io/tx/${signature}${clusterQuery()}`;
}

export function explorerAccount(address: string): string {
  return `https://solscan.io/account/${address}${clusterQuery()}`;
}

export function formatSol(sol: number, decimals = 4): string {
  return `${sol.toFixed(decimals)} SOL`;
}
