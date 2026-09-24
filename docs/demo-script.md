# Demo video script

**TL;DR:** ~2 min video, founder's voice in English + burned-in captions, 6 scenes (15 + 15 + 40 + 15 + 15 + 20 s = 120 s). Record the lock/claim scenes locally with `NEXT_PUBLIC_DEMO_LOCK_SECONDS=120` and the dev demo flags below; record traction from the real mainnet jar.

## Scenes

| # | Scene | Time | On screen | Narration (founder, EN) | Caption |
|---|---|---|---|---|---|
| 1 | Problem | 0:00–0:15 (15 s) | Founder, then a tip-jar / Buy Me a Coffee style screen | "I've always wanted exposure to OpenAI before an IPO. Most people don't even know that's possible. But everyone knows how to tip a creator a few dollars." | Pre-IPO exposure feels out of reach. Tipping doesn't. |
| 2 | Create your link | 0:15–0:30 (15 s) | `/`: paste wallet, name, X handle, copy link, share-card preview | "A creator pastes their wallet and gets a link. No signup, no database: the link is the wallet." | No signup. The link is the wallet. |
| 3 | Tip from a phone, locked | 0:30–1:10 (40 s) | Phone: `/tip/<wallet>`, pick T-OpenAI, $5, pay with SOL, lock 1 month. Show the Tessera lock warning and the refundable deposit line. Wallet signs **one** tx; coin flies into the jar | "A fan picks T-OpenAI, five dollars, pays with SOL, and chooses to lock it for a month. The app warns that Tessera T-Tokens can only be redeemed in a 90-day window, and shows the refundable deposit. One signature: Jupiter swaps SOL into T-OpenAI and locks it for the creator, in a single Solana transaction." | $5 SOL → T-OpenAI, locked 1 month. One transaction. |
| 4 | Claim | 1:10–1:25 (15 s) | `/jar/<wallet>` with a **2-minute demo lock**: sealed coin, Claim enabled at the cliff, coin breaks open. Then `/deposits/<wallet>`: Reclaim deposit | "For the demo I used a two-minute lock. When it opens, the creator claims it, and the fan gets the escrow deposit back." | Claim after the lock. Deposit refunded to the fan. |
| 5 | Real traction | 1:25–1:40 (15 s) | Real mainnet jar (`/jar/DrPUR2AiAk9rp1NJDs3dQn73xZt1nTG3jLKZzqsLYFsk`) + Solscan tx; tips from people outside the team | "This is live on mainnet. The first real tip landed on September 24th, and these tips came from people outside the team." | Live on Solana mainnet. |
| 6 | Why Solana | 1:40–2:00 (20 s) | Diagram: fan → Jupiter swap → creator account / Jupiter Lock escrow; tx size and fee callouts | "This only works on Solana: swap and deliver, or swap and lock, fit in one transaction under 1232 bytes, fees are a fraction of a cent, T-Tokens are Token-2022, the same tip works as a Blink, and Jupiter routing and Jupiter Lock mean we didn't deploy a single custom program." | One tx. Sub-cent fees. No custom program. |

Copy check before recording: never say "share", "equity", "stock", "own OpenAI" or "a piece of OpenAI" about the token (the product name is the exception). Say "T-OpenAI" or "OpenAI pre-IPO exposure". Keep the Tessera notice visible in scenes 2–3. See [tessera-terms.md](tessera-terms.md).

## Recording setup

| Need | How |
|---|---|
| 2-minute lock option ("Demo" unit, UI + Blink) | `NEXT_PUBLIC_DEMO_LOCK_SECONDS=120` in `app/.env.local`. **Never set in production** |
| Scene 3 without spending (screenshots / retakes) | `pnpm dev`, open `/tip/<wallet>?demoSuccess=1` (click Tip to run) or `?demoSuccess=auto` (runs ~1.6 s after load); add `&demoLock=1` to start with a $5 lock (Demo unit if enabled, else months). `?demoSuccess=error` shows the failure path |
| Scene 4 without waiting | `/jar/<wallet>?demoLocks=1`: fake escrows (one unlocks in 25 s, one already claimable) and a simulated claim |
| Real lock + claim on a fork | Surfpool + `RPC_URL`/`NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8899` + `NEXT_PUBLIC_DEMO_LOCK_SECONDS=120`, see [app/AGENTS.md](../app/AGENTS.md) |

Demo flags are **dev-only** (dead code in production builds). Nothing is built or sent in demo mode, so any scene shot with them must not be presented as a real transaction; scene 5 uses the real mainnet jar.
