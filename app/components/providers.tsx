"use client";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";
import { MotionConfig } from "motion/react";
import { Toaster } from "@/components/ui/sonner";
import { clientRpcUrl } from "@/lib/solana/connection";

/**
 * Wallets are discovered through the Wallet Standard (Phantom, Solflare, Backpack all register themselves),
 * so no legacy adapters are passed.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ConnectionProvider endpoint={clientRpcUrl()} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>
          {/* Motion honours prefers-reduced-motion for transforms/layout; opacity fades still run. */}
          <MotionConfig reducedMotion="user">
            {children}
            <Toaster position="top-center" theme="dark" />
          </MotionConfig>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
