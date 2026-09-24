import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { Ambient, FxLayer } from "@/components/fx/fx-layer";
import { Providers } from "@/components/providers";
import { SiteHeader } from "@/components/site-header";
import { PRODUCT_DESCRIPTION, PRODUCT_NAME } from "@/lib/brand";
import { siteUrl } from "@/lib/env";
import "./globals.css";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
/** Display face for amounts and headlines: numbers read like engraving on a coin. */
const display = Instrument_Serif({ variable: "--font-display-serif", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: PRODUCT_NAME, template: `%s · ${PRODUCT_NAME}` },
  description: PRODUCT_DESCRIPTION,
  openGraph: { siteName: PRODUCT_NAME, type: "website" },
  twitter: { card: "summary_large_image" },
};

// Single deliberate dark theme: glass and metal only read against a dark room (see globals.css).
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#15120f", colorScheme: "dark" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`dark ${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Ambient />
        <Providers>
          <SiteHeader />
          <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col overflow-x-clip px-4 pt-6 pb-16 sm:px-6">{children}</main>
        </Providers>
        <FxLayer />
      </body>
    </html>
  );
}
