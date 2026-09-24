import Link from "next/link";
import { Coin } from "@/components/fx/coin";
import { SoundToggle } from "@/components/fx/sound-toggle";
import { PRODUCT_NAME } from "@/lib/brand";
import { WalletButton } from "@/components/wallet-button";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-background/70 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-2 rounded-md font-semibold tracking-[-0.01em] outline-none focus-visible:ring-2 focus-visible:ring-brand/70">
          <Coin token="openai" size={20} />
          <span className="truncate max-[359px]:sr-only">{PRODUCT_NAME}</span>
        </Link>
        <div className="flex items-center gap-2">
          <SoundToggle />
          <div className="wallet-slot">
            <WalletButton />
          </div>
        </div>
      </div>
    </header>
  );
}
