export type TipErrorCode =
  | "INVALID_PARAMS"
  | "TX_TOO_LARGE"
  | "ESCROW_NOT_FOUND"
  | "NOT_RECIPIENT"
  | "NOT_ESCROW_CREATOR"
  | "CLIFF_NOT_REACHED"
  | "NOTHING_TO_CLAIM"
  | "NOT_FULLY_CLAIMED"
  | "RPC_UNSUPPORTED";

/** Expected, user-facing failures of the tx layer. `message` is safe to show as-is. */
export class TipError extends Error {
  constructor(
    readonly code: TipErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TipError";
  }
}

export function isTipError(err: unknown, code?: TipErrorCode): err is TipError {
  return err instanceof TipError && (code === undefined || err.code === code);
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
