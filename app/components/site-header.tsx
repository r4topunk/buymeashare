import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/brand";
import { WalletButton } from "@/components/wallet-button";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-border/60 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-3 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span aria-hidden className="inline-block size-2.5 rounded-full bg-brand" />
          {PRODUCT_NAME}
        </Link>
        <div className="wallet-slot">
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
