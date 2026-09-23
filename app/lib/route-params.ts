import { notFound } from "next/navigation";
import { tipQuerySchema, walletSchema, type TipQuery } from "@/lib/schemas";

/** Validates the [wallet] segment; invalid addresses render the 404 page. */
export function parseWalletParam(raw: string): string {
  const parsed = walletSchema.safeParse(decodeURIComponent(raw));
  if (!parsed.success) notFound();
  return parsed.data;
}

export function parseTipQuery(sp: Record<string, string | string[] | undefined>): TipQuery {
  return tipQuerySchema.parse(sp);
}
