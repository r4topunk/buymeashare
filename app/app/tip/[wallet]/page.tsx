import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CreatorIdentity } from "@/components/creator-identity";
import { MyDepositsLink } from "@/components/deposits/my-deposits-link";
import { JarSection, JarSkeleton } from "@/components/jar/jar-section";
import { TesseraNotice } from "@/components/tessera-notice";
import { TipForm } from "@/components/tip-form";
import { Separator } from "@/components/ui/separator";
import { PRODUCT_NAME } from "@/lib/brand";
import { shortAddress } from "@/lib/format";
import { getPrices } from "@/lib/prices";
import { parseTipQuery, parseWalletParam } from "@/lib/route-params";
import { DEFAULT_TOKEN_ID } from "@/lib/tokens";

export async function generateMetadata({ params, searchParams }: PageProps<"/tip/[wallet]">): Promise<Metadata> {
  const wallet = parseWalletParam((await params).wallet);
  const q = parseTipQuery(await searchParams);
  const who = q.name ?? shortAddress(wallet);
  const og = new URLSearchParams({ wallet });
  if (q.name) og.set("name", q.name);
  const title = `Tip ${who}`;
  const description = `Send ${who} a tip in T-OpenAI, T-Kalshi or T-SpaceX (Tessera pre-IPO T-Tokens). Pay with SOL or USDC.`;
  const images = [{ url: `/api/og?${og}`, width: 1200, height: 630, alt: `${who} on ${PRODUCT_NAME}` }];
  return { title, description, openGraph: { title, description, images }, twitter: { card: "summary_large_image", title, description, images } };
}

export default async function TipPage({ params, searchParams }: PageProps<"/tip/[wallet]">) {
  const wallet = parseWalletParam((await params).wallet);
  const q = parseTipQuery(await searchParams);
  const initialPrices = await getPrices().catch(() => null);
  const creatorLabel = q.name ?? shortAddress(wallet);

  return (
    <div className="flex flex-col gap-8">
      <CreatorIdentity wallet={wallet} name={q.name} x={q.x} />
      <section className="rounded-2xl border bg-card p-4 shadow-xs sm:p-5">
        <TipForm creator={wallet} creatorLabel={creatorLabel} initialToken={q.token ?? DEFAULT_TOKEN_ID} initialPrices={initialPrices} />
      </section>
      <TesseraNotice className="-mt-4" />
      <Separator />
      <Suspense fallback={<JarSkeleton />}>
        <JarSection wallet={wallet} title={`${creatorLabel}'s jar`} />
      </Suspense>
      <p className="text-sm text-muted-foreground">
        Is this your wallet?{" "}
        <Link href={`/jar/${wallet}`} className="underline underline-offset-2">
          Open the creator view
        </Link>{" "}
        to see locked tips and claim them.
      </p>
      <MyDepositsLink className="-mt-6 text-sm text-muted-foreground" />
    </div>
  );
}
