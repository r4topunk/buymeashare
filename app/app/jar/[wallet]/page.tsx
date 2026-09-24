import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CopyButton } from "@/components/copy-button";
import { CreatorIdentity } from "@/components/creator-identity";
import { JarHero } from "@/components/jar/jar-hero";
import { JarSection, JarSkeleton } from "@/components/jar/jar-section";
import { LocksPanel } from "@/components/jar/locks-panel";
import { VesselProvider } from "@/components/jar/vessel-context";
import { MyDepositsLink } from "@/components/deposits/my-deposits-link";
import { TesseraNotice } from "@/components/tessera-notice";
import { Button } from "@/components/ui/button";
import { shortAddress } from "@/lib/format";
import { getJar } from "@/lib/jar/getJar";
import { getPrices } from "@/lib/prices";
import { parseTipQuery, parseWalletParam } from "@/lib/route-params";
import { siteUrl } from "@/lib/env";
import { tipPath } from "@/lib/schemas";

export async function generateMetadata({ params }: PageProps<"/jar/[wallet]">): Promise<Metadata> {
  const wallet = parseWalletParam((await params).wallet);
  return { title: `Jar ${shortAddress(wallet)}`, robots: { index: false } };
}

export default async function JarPage({ params, searchParams }: PageProps<"/jar/[wallet]">) {
  const wallet = parseWalletParam((await params).wallet);
  const q = parseTipQuery(await searchParams);
  const link = tipPath(wallet, { name: q.name, x: q.x });
  const prices = await getPrices().catch(() => null);
  const jar = getJar(wallet).catch(() => null);

  return (
    <VesselProvider>
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:gap-16 lg:pt-6">
        <div className="flex flex-col gap-6 lg:sticky lg:top-24">
          <CreatorIdentity wallet={wallet} name={q.name} x={q.x} eyebrow="Creator view" />
          <div className="flex flex-wrap gap-2">
            <CopyButton value={`${siteUrl()}${link}`} label="Copy tip link" showLabel />
            <Button variant="outline" nativeButton={false} render={<Link href={link} />}>
              Open tip page
            </Button>
          </div>
          <JarHero jar={jar} prices={prices} label="Your jar" />
        </div>
        <div className="flex flex-col gap-10">
          <LocksPanel creator={wallet} />
          <Suspense fallback={<JarSkeleton />}>
            <JarSection wallet={wallet} title="Holdings" />
          </Suspense>
          <div className="flex flex-col gap-4">
            <MyDepositsLink />
            <TesseraNotice />
          </div>
        </div>
      </div>
    </VesselProvider>
  );
}
