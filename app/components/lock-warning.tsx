import { TriangleAlertIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TESSERA_LOCK_WARNING, TESSERA_TERMS_URL } from "@/lib/brand";

/** Always visible (not a tooltip) whenever a lock is selected. */
export function LockWarning() {
  const [title, ...rest] = TESSERA_LOCK_WARNING.split(": ");
  return (
    <Alert className="rounded-2xl border-amber-300/25 bg-amber-300/[0.07] px-3.5 py-3 text-amber-100">
      <TriangleAlertIcon className="text-amber-300" />
      <AlertTitle className="text-amber-100">{title}</AlertTitle>
      <AlertDescription className="text-amber-100/80 text-pretty">
        {rest.join(": ")}{" "}
        <a href={TESSERA_TERMS_URL} target="_blank" rel="noreferrer" className="text-amber-100 underline underline-offset-2">
          See Tessera terms.
        </a>
      </AlertDescription>
    </Alert>
  );
}
