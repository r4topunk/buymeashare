"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import type { Connection, Keypair } from "@solana/web3.js";
import { useCallback } from "react";
import type { BuiltTransaction } from "@/lib/tip/types";

/**
 * HTTP-only confirmation. The browser talks to the /api/rpc proxy, which has no websocket, so
 * connection.confirmTransaction (signature subscription) can't be used here.
 */
async function confirmByPolling(connection: Connection, signature: string, lastValidBlockHeight: number) {
  for (;;) {
    const { value } = await connection.getSignatureStatuses([signature]);
    const status = value[0];
    if (status?.err) throw new Error(`Transaction failed on-chain: ${JSON.stringify(status.err)}`);
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return;
    if ((await connection.getBlockHeight("confirmed")) > lastValidBlockHeight) {
      throw new Error("Transaction expired before confirmation. Please try again.");
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Wallet signs, we send and confirm with the blockhash the tx was built with.
 * Locked tips arrive already partially signed by an ephemeral escrow base key that only ever lives in this tab's
 * memory. If the wallet rewrites the message (e.g. adds priority fees), the base key re-signs the new message.
 */
export function useSendTransaction() {
  const { connection } = useConnection();
  const { publicKey, signTransaction, sendTransaction } = useWallet();

  return useCallback(
    async (built: BuiltTransaction, ephemeralSigners: Keypair[] = [], onSent?: (signature: string) => void): Promise<string> => {
      if (!publicKey) throw new Error("Connect a wallet first");
      let signature: string;
      if (signTransaction) {
        const before = built.transaction.message.serialize();
        const signed = await signTransaction(built.transaction);
        if (ephemeralSigners.length && !sameBytes(signed.message.serialize(), before)) signed.sign(ephemeralSigners);
        signature = await connection.sendRawTransaction(signed.serialize(), { maxRetries: 3 });
      } else {
        signature = await sendTransaction(built.transaction, connection);
      }
      onSent?.(signature);
      await confirmByPolling(connection, signature, built.lastValidBlockHeight);
      return signature;
    },
    [connection, publicKey, signTransaction, sendTransaction],
  );
}
