"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";

/** "Your deposits" link for the connected wallet (fan view). Renders nothing when no wallet is connected. */
export function MyDepositsLink({ className }: { className?: string }) {
  const { publicKey } = useWallet();
  if (!publicKey) return null;
  return (
    <p className={className ?? "text-sm text-muted-foreground"}>
      Sent a locked tip?{" "}
      <Link href={`/deposits/${publicKey.toBase58()}`} className="underline underline-offset-2">
        Reclaim your refundable deposits
      </Link>
      .
    </p>
  );
}
