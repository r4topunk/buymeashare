"use client";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";
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
          {children}
          <Toaster position="top-center" />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
