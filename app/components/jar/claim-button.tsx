"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import { useState } from "react";
import { toast } from "sonner";
import { toastTx } from "@/components/tx-toast";
import { Button } from "@/components/ui/button";
import { useSendTransaction } from "@/hooks/use-send-transaction";
import { formatCountdown } from "@/lib/lock";
import { buildClaimTransaction, errorMessage, type LockedTip } from "@/lib/tip";

/**
 * Disabled until the cliff by the CHAIN clock (`chainNow`). Claiming earlier would succeed on-chain but move 0 tokens;
 * buildClaimTransaction also refuses it (CLIFF_NOT_REACHED).
 */
export function ClaimButton({
  lock,
  creator,
  chainNow,
  onClaimed,
}: {
  lock: LockedTip;
  creator: string;
  chainNow: number | null;
  onClaimed: () => void;
}) {
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const sendTx = useSendTransaction();
  const [busy, setBusy] = useState(false);
  const unlocked = lock.status === "claimable" || (lock.status === "locked" && chainNow != null && chainNow >= lock.unlockAt);
  const isCreator = publicKey?.toBase58() === creator;

  async function claim() {
    if (!publicKey) return setVisible(true);
    if (!isCreator) return toast.error("Connect the creator wallet to claim.");
    setBusy(true);
    try {
      const built = await buildClaimTransaction({ recipient: publicKey, escrow: new PublicKey(lock.escrow) });
      const signature = await sendTx(built);
      toastTx("Claimed", signature);
      onClaimed();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!unlocked) {
    return (
      <Button size="sm" variant="outline" disabled>
        {chainNow != null ? `Unlocks ${formatCountdown(lock.unlockAt, chainNow)}` : "Locked"}
      </Button>
    );
  }
  return (
    <Button size="sm" disabled={busy} onClick={claim}>
      {busy ? "Claiming…" : publicKey && !isCreator ? "Creator can claim" : "Claim"}
    </Button>
  );
}
