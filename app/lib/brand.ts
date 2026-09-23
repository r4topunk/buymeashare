/**
 * Product naming lives here only. The name may change before submission,
 * so never hardcode it anywhere else (UI, OG image, Blink metadata).
 */
export const PRODUCT_NAME = "Buy Me a Share";
export const PRODUCT_PITCH =
  "Tip a creator a few dollars. They receive a Tessera pre-IPO T-Token (like T-OpenAI) straight to their wallet.";
export const PRODUCT_DESCRIPTION =
  "Tip with SOL or USDC. Jupiter swaps it into a Tessera T-Token and delivers it to the creator's wallet, optionally locked. No signup: the link is the wallet.";

export const TESSERA_TERMS_URL = "https://terms.tessera.pe/terms-and-conditions";
export const TESSERA_NOTICE =
  "T-Tokens are issued by Tessera and are not available to U.S. persons or residents of excluded jurisdictions. Not equity.";

/** Shown (visible, not a tooltip) whenever a tip lock is selected, in the UI and in the Blink message. */
export const TESSERA_LOCK_WARNING =
  "Tessera redemption window: T-Tokens can only be redeemed during a 90-day window after Tessera exits the investment. If that window opens and closes while this tip is locked, the creator may lose it.";
export const TESSERA_LOCK_WARNING_FULL = `${TESSERA_LOCK_WARNING} See Tessera terms: ${TESSERA_TERMS_URL}`;
