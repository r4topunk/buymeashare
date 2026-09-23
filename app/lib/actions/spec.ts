/**
 * Minimal Solana Actions (Blinks) types, mirroring @solana/actions-spec v2 for what we emit.
 * Kept local to avoid pulling the full SDK for metadata-only endpoints.
 */
export type ActionParameterSelectable = {
  type: "select" | "radio";
  name: string;
  label?: string;
  required?: boolean;
  options: Array<{ label: string; value: string; selected?: boolean }>;
};
export type ActionParameterNumber = {
  type: "number";
  name: string;
  label?: string;
  required?: boolean;
  min?: number;
  max?: number;
  patternDescription?: string;
};
export type ActionParameter = ActionParameterSelectable | ActionParameterNumber;

export type LinkedAction = {
  type: "transaction";
  href: string;
  label: string;
  parameters?: ActionParameter[];
};

export type ActionGetResponse = {
  type: "action";
  icon: string;
  title: string;
  description: string;
  label: string;
  disabled?: boolean;
  error?: { message: string };
  links?: { actions: LinkedAction[] };
};

export type ActionError = { message: string };

/** POST response for a transaction action: base64 serialized (partially signed) tx for the wallet to sign. */
export type ActionPostResponse = { type: "transaction"; transaction: string; message?: string };

// Solana mainnet genesis hash, CAIP-2.
export const SOLANA_MAINNET_CAIP2 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

export const ACTIONS_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, Content-Encoding, Accept-Encoding, X-Accept-Action-Version, X-Accept-Blockchain-Ids",
  "Access-Control-Expose-Headers": "X-Action-Version, X-Blockchain-Ids",
  "X-Action-Version": "2.4",
  "X-Blockchain-Ids": SOLANA_MAINNET_CAIP2,
  "Content-Type": "application/json",
};
