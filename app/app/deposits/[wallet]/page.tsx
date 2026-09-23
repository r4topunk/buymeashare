import type { Metadata } from "next";
import { CopyButton } from "@/components/copy-button";
import { DepositsPanel } from "@/components/deposits/deposits-panel";
import { explorerAccount, shortAddress } from "@/lib/format";
import { ESCROW_DEPOSIT_SOL } from "@/lib/lock";
import { parseWalletParam } from "@/lib/route-params";

export async function generateMetadata({ params }: PageProps<"/deposits/[wallet]">): Promise<Metadata> {
  const wallet = parseWalletParam((await params).wallet);
  return { title: `Deposits ${shortAddress(wallet)}`, robots: { index: false } };
}

/** Fan view: refundable escrow deposits for locked tips this wallet sent. */
export default async function DepositsPage({ params }: PageProps<"/deposits/[wallet]">) {
  const wallet = parseWalletParam((await params).wallet);
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-brand">Fan view</p>
        <h1 className="text-2xl font-semibold tracking-tight">Your locked-tip deposits</h1>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <a href={explorerAccount(wallet)} target="_blank" rel="noreferrer" className="font-mono text-xs hover:text-foreground" title={wallet}>
            {shortAddress(wallet, 4)}
          </a>
          <CopyButton value={wallet} label="Copy wallet" />
        </div>
        <p className="text-sm text-muted-foreground text-pretty">
          Every locked tip holds a ~{ESCROW_DEPOSIT_SOL.toFixed(4)} SOL refundable deposit (escrow rent). After the creator claims the tip, reclaim it
          here. Only the wallet that sent the tip can reclaim.
        </p>
      </div>
      <DepositsPanel sender={wallet} />
    </div>
  );
}
