"use client";

import dynamic from "next/dynamic";

// The adapter's button reads window state; render it client-only to avoid hydration mismatches.
export const WalletButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false, loading: () => <div className="h-9 w-32 rounded-lg bg-muted" /> },
);
