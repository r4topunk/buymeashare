import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CreatorIdentity } from "@/components/creator-identity";
import { MyDepositsLink } from "@/components/deposits/my-deposits-link";
import { JarHero } from "@/components/jar/jar-hero";
import { JarSection, JarSkeleton } from "@/components/jar/jar-section";
import { VesselProvider } from "@/components/jar/vessel-context";
import { TesseraNotice } from "@/components/tessera-notice";
import { TipForm } from "@/components/tip-form";
import { PRODUCT_NAME } from "@/lib/brand";
import { shortAddress } from "@/lib/format";
import { getJar } from "@/lib/jar/getJar";
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
  // Not awaited: the jar streams into the glass while the form is already usable.
  const jar = getJar(wallet).catch(() => null);

  return (
    <VesselProvider>
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:gap-16 lg:pt-6">
        <div className="flex flex-col gap-6 lg:sticky lg:top-24">
          <CreatorIdentity wallet={wallet} name={q.name} x={q.x} />
          <JarHero jar={jar} prices={initialPrices} label={`${creatorLabel}'s jar`} />
        </div>
        <div className="flex flex-col gap-4">
          <section className="surface rounded-[28px] p-4 sm:p-6" aria-label={`Tip ${creatorLabel}`}>
            <TipForm creator={wallet} creatorLabel={creatorLabel} initialToken={q.token ?? DEFAULT_TOKEN_ID} initialPrices={initialPrices} />
          </section>
          <TesseraNotice className="px-1" />
        </div>
      </div>

      <div className="mx-auto mt-14 flex w-full max-w-2xl flex-col gap-6">
        <Suspense fallback={<JarSkeleton />}>
          <JarSection wallet={wallet} title={`${creatorLabel}'s jar`} showHoldings={false} />
        </Suspense>
        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          <p>
            Is this your wallet?{" "}
            <Link href={`/jar/${wallet}`} className="text-foreground underline underline-offset-2">
              Open the creator view
            </Link>{" "}
            to see locked tips and claim them.
          </p>
          <MyDepositsLink className="text-sm text-muted-foreground" />
        </div>
      </div>
    </VesselProvider>
  );
}
