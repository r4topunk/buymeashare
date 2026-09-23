import { getJar } from "@/lib/jar/getJar";
import { walletSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

/** JSON view of a creator's jar (debugging, external clients). */
export async function GET(_req: Request, ctx: RouteContext<"/api/jar/[wallet]">) {
  const parsed = walletSchema.safeParse((await ctx.params).wallet);
  if (!parsed.success) return Response.json({ error: "invalid wallet" }, { status: 400 });
  const jar = await getJar(parsed.data);
  return Response.json(jar, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } });
}
