import { getPrices } from "@/lib/prices";

export const revalidate = 30;

export async function GET() {
  const prices = await getPrices();
  return Response.json(prices, {
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
  });
}
