/**
 * Which price drives every displayed USD value (jar totals, token hints, estimates, OG card).
 *  - "market":  Jupiter DEX price, i.e. what a tip swap actually gets. Default.
 *  - "tessera": Tessera mark price.
 * The other one is always shown next to it as "Tessera mark: $X" (or the market price). Decision pending: change it here only.
 */
export type PriceSource = "market" | "tessera";
export const PRICE_SOURCE: PriceSource = "market";
