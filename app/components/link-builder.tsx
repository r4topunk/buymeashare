"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { ExternalLinkIcon, WalletIcon } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useState, useSyncExternalStore } from "react";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isValidWallet, tipQuerySchema, tipPath } from "@/lib/schemas";

export function LinkBuilder() {
  const { publicKey } = useWallet();
  const [wallet, setWallet] = useState("");
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const origin = useSyncExternalStore(noopSubscribe, () => window.location.origin, () => "");

  const w = wallet.trim();
  const walletOk = isValidWallet(w);
  // Run the same schema the tip page uses, so the link never carries values the page would drop.
  const q = tipQuerySchema.parse({ name: name || undefined, x: handle || undefined });
  const path = walletOk ? tipPath(w, { name: q.name, x: q.x }) : null;
  const url = path ? `${origin}${path}` : "";

  const deferredPath = useDeferredValue(path);
  const ogSrc = deferredPath && walletOk ? `/api/og?wallet=${w}${q.name ? `&name=${encodeURIComponent(q.name)}` : ""}` : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="wallet">Your Solana wallet</Label>
          {publicKey ? (
            <Button type="button" variant="link" size="xs" onClick={() => setWallet(publicKey.toBase58())}>
              <WalletIcon /> Use connected wallet
            </Button>
          ) : null}
        </div>
        <Input
          id="wallet"
          placeholder="Paste your wallet address"
          autoComplete="off"
          spellCheck={false}
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
          aria-invalid={w !== "" && !walletOk}
          className="h-11 font-mono text-sm"
        />
        {w !== "" && !walletOk ? <p className="text-xs text-destructive">That is not a valid Solana address.</p> : null}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Display name (optional)</Label>
          <Input id="name" maxLength={40} placeholder="Ana" value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="handle">X handle (optional)</Label>
          <Input id="handle" maxLength={16} placeholder="@ana" value={handle} onChange={(e) => setHandle(e.target.value)} className="h-11" />
        </div>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">Name and handle are not verified. Fans always see your wallet next to them.</p>

      {path ? (
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-3">
          <code className="block rounded-md bg-muted px-2.5 py-2 font-mono text-xs break-all">{url}</code>
          <div className="flex flex-wrap gap-2">
            <CopyButton value={url} label="Copy link" showLabel />
            <Button variant="outline" nativeButton={false} render={<Link href={path} />}>
              <ExternalLinkIcon /> Open tip page
            </Button>
            <Button variant="ghost" nativeButton={false} render={<Link href={`/jar/${w}`} />}>
              My jar
            </Button>
          </div>
          {ogSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ogSrc} alt="Share card preview" width={1200} height={630} className="aspect-[1200/630] w-full rounded-lg border bg-muted object-cover" />
          ) : null}
          <p className="text-xs text-muted-foreground">This is the card people see when you share the link.</p>
        </div>
      ) : null}
    </div>
  );
}

function noopSubscribe() {
  return () => {};
}
