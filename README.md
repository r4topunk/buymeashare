# Buy Me a Share

Tip a creator a few dollars in SOL or USDC. In one Solana transaction, Jupiter swaps the tip into a Tessera pre-IPO T-Token (T-OpenAI, T-Kalshi or T-SpaceX) and delivers it to the creator's wallet. The fan can optionally lock the tip for a period of their choice using Jupiter Lock. No signup: the link is the wallet.

Built for the Solana Stocklana hackathon (Consumer + Tessera bounty).

> T-Tokens are issued by Tessera and are not equity. They are not available to U.S. persons or residents of excluded jurisdictions. See https://terms.tessera.pe/terms-and-conditions.

## Repo layout

| Path | What |
|---|---|
| `app/` | Next.js app (tip page, creator jar, fan deposits, Solana Action / Blink). See `app/AGENTS.md`. |
| `spike/` | Feasibility spike run on a Surfpool mainnet fork: swap-to-other, swap-and-lock in one tx, claim, close escrow. Results in `spike/README.md`. |

## Run

```bash
cd app && pnpm install && pnpm dev
```

Deploy on Vercel with Root Directory `app`. Env vars are in `app/.env.example`.
