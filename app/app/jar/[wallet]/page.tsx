import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CopyButton } from "@/components/copy-button";
import { CreatorIdentity } from "@/components/creator-identity";
import { JarSection, JarSkeleton } from "@/components/jar/jar-section";
import { LocksPanel } from "@/components/jar/locks-panel";
import { MyDepositsLink } from "@/components/deposits/my-deposits-link";
import { TesseraNotice } from "@/components/tessera-notice";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { shortAddress } from "@/lib/format";
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

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-brand">Creator view</p>
        <CreatorIdentity wallet={wallet} name={q.name} x={q.x} />
        <div className="flex flex-wrap gap-2">
          <CopyButton value={`${siteUrl()}${link}`} label="Copy tip link" showLabel />
          <Button variant="outline" nativeButton={false} render={<Link href={link} />}>
            Open tip page
          </Button>
        </div>
      </div>
      <Suspense fallback={<JarSkeleton />}>
        <JarSection wallet={wallet} title="Holdings" />
      </Suspense>
      <Separator />
      <LocksPanel creator={wallet} />
      <MyDepositsLink />
      <TesseraNotice />
    </div>
  );
}
