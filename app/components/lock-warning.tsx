import { TriangleAlertIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TESSERA_LOCK_WARNING, TESSERA_TERMS_URL } from "@/lib/brand";

/** Always visible (not a tooltip) whenever a lock is selected. */
export function LockWarning() {
  const [title, ...rest] = TESSERA_LOCK_WARNING.split(": ");
  return (
    <Alert className="border-amber-500/50 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
      <TriangleAlertIcon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="text-amber-900 dark:text-amber-100/90">
        {rest.join(": ")}{" "}
        <a href={TESSERA_TERMS_URL} target="_blank" rel="noreferrer">
          See Tessera terms.
        </a>
      </AlertDescription>
    </Alert>
  );
}
