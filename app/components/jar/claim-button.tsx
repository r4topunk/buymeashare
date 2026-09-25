"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import { LockOpenIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { toastTx } from "@/components/tx-toast";
import { Button } from "@/components/ui/button";
import { useSendTransaction } from "@/hooks/use-send-transaction";
import * as sfx from "@/lib/fx/audio";
import { HAPTIC, haptic } from "@/lib/fx/haptics";
import { formatCountdown } from "@/lib/lock";
import { buildClaimTransaction, errorMessage, type LockedTip } from "@/lib/tip";
import { DEMO_FLAGS, demoSign } from "@/lib/demo";
import { formatTokenAmount } from "@/lib/format";
import { tokenById } from "@/lib/tokens";
import { useVessel } from "./vessel-context";

/** Dev-only: `demo-*` escrows from `?demoLocks=1` simulate the claim (nothing is built or sent). */
const DEMO_ENABLED = DEMO_FLAGS;

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
  const vessel = useVessel();
  const [busy, setBusy] = useState(false);
  const unlocked = lock.status === "claimable" || (lock.status === "locked" && chainNow != null && chainNow >= lock.unlockAt);
  const isCreator = publicKey?.toBase58() === creator;
  const demo = DEMO_ENABLED && lock.escrow.startsWith("demo-");

  /** After on-chain confirmation only: the seal breaks and the coin joins the jar. */
  function celebrate() {
    sfx.unseal();
    haptic(HAPTIC.success);
    vessel?.unseal(`lock-${lock.escrow}`);
    vessel?.confetti(lock.token);
  }

  async function claim() {
    if (demo) {
      setBusy(true);
      await demoSign({ title: "Claim locked tip", rows: [["You receive", `${formatTokenAmount(lock.amount)} ${tokenById(lock.token).symbol}`]] }, 700);
      await new Promise((r) => setTimeout(r, 900));
      setBusy(false);
      celebrate();
      onClaimed();
      return;
    }
    if (!publicKey) return setVisible(true);
    if (!isCreator) return toast.error("Connect the creator wallet to claim.");
    setBusy(true);
    try {
      const built = await buildClaimTransaction({ recipient: publicKey, escrow: new PublicKey(lock.escrow) });
      const signature = await sendTx(built);
      toastTx("Claimed", signature);
      celebrate();
      onClaimed();
    } catch (e) {
      toast.error(errorMessage(e));
      sfx.error();
    } finally {
      setBusy(false);
    }
  }

  if (!unlocked) {
    return (
      <Button size="sm" variant="outline" disabled className="h-9 rounded-full px-3.5">
        {chainNow != null ? `Unlocks ${formatCountdown(lock.unlockAt, chainNow)}` : "Locked"}
      </Button>
    );
  }
  return (
    <Button
      size="sm"
      disabled={busy}
      onClick={claim}
      onPointerDown={() => {
        sfx.unlock();
        sfx.press();
        haptic(HAPTIC.press);
      }}
      className="h-9 rounded-full bg-brand px-4 text-brand-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_3px_0_0_oklch(0.47_0.12_42),0_10px_24px_-10px_var(--brand)] hover:bg-brand/90 active:translate-y-0.5 active:shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_1px_0_0_oklch(0.47_0.12_42)]"
    >
      <LockOpenIcon />
      {busy ? "Claiming…" : publicKey && !isCreator && !demo ? "Creator can claim" : "Claim"}
    </Button>
  );
}
