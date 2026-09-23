import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-start gap-3 pt-10">
      <h1 className="text-2xl font-semibold tracking-tight">Nothing here</h1>
      <p className="text-muted-foreground">That link doesn&apos;t point to a valid Solana wallet.</p>
      <Link href="/" className="underline underline-offset-2">
        Create a tip link
      </Link>
    </div>
  );
}
