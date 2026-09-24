# Product decisions

**TL;DR:** Buy Me a Share is "Buy Me a Coffee, but the tip arrives as a Tessera T-Token". Fan picks the token (T-OpenAI / T-Kalshi / T-SpaceX), pays in SOL or USDC, and can optionally lock the tip for any duration up to 5 years (with a visible Tessera redemption-window warning). No signup, no database, no custom program. Decisions were made 2026-09-23 in a "grill-me" session (IDs P12–P28); rows marked *default* were cheap, reversible calls made by the assistant.

Status: **final** unless marked *superseded*.

## Product

| ID | Decision | Choice | Why |
|---|---|---|---|
| — | Idea filter | Every idea needs an obvious real-world analogy ("it's X, but...") | Earlier ideas were rejected because they were mechanics with no familiar equivalent |
| P12 | Concept | Buy Me a Share: a tip jar where the tip reaches the creator as a T-Token, delivered by a Jupiter swap straight to their wallet (non-custodial) | Tipping is a habit everyone already has; pre-IPO exposure is something people want but don't know is possible. Fits Consumer + Tessera ("Private Equities for Everyone"). A GitHub search on 23/09 (repos created after 01/07) found no blink + Tessera/xStocks/PreStocks tip jar |
| P15 | Which token | The fan picks one of Tessera's three: T-OpenAI, T-Kalshi, T-SpaceX. Anthropic / PreStocks out of scope | Keep one issuer and one set of terms |
| P16 | Pay with | USDC and SOL | The two assets fans are most likely to hold; Jupiter routes both |
| P17 | Accounts | No signup. Link is `/tip/<wallet>?name=&x=`; the jar is rebuilt from chain data, each tip tagged with an SPL Memo | No database, no custody, nothing to run besides the Next.js app |
| P21 | Name | "Buy Me a Share" (single source: `app/lib/brand.ts`) | Instant analogy with Buy Me a Coffee. The product copy never calls the token itself a share (see [tessera-terms.md](tessera-terms.md)) |
| P22 | Build order | App scaffold started in parallel with the feasibility spike; tx layer stubbed in `app/lib/tip/` until the spike passed | Deadline pressure; the UI didn't depend on the spike's outcome |
| *default* | Stack | Next.js on Vercel, no database; Solana Actions types written by hand (`app/lib/actions/spec.ts`) | Smallest thing that serves both the web page and the Blink |

## Lock

| ID | Decision | Choice | Why |
|---|---|---|---|
| P13 | Is locking mandatory? | **Optional** | Locking adds cost (escrow rent, extra 0.2% fees) and risk (redemption window) |
| P14 | Who picks the lock | The **fan**, at tip time. Originally two fixed Blink buttons ($3 and $3 locked 6 months). *Superseded by P24* | The fan is the one making the gift |
| P24 (v1) | Lock options | None / 1 week / 1 month / 2 months, capped at 60 days to stay inside the 90-day redemption window. *Superseded by P24 final* | Protect the creator from the redemption window |
| **P24 (final)** | Lock duration | **Free duration**: integer + unit (days / months / years; month = 30 d, year = 365 d). Technical cap **5 years** (*default*). Locked tip minimum **$5** (unlocked $1). **Whenever a lock is selected, show the Tessera redemption-window warning** and the refundable deposit line. Blink: one select field instead of a second button | A cap can't protect the creator anyway (nobody knows when the Liquidity Event happens), so inform instead of restrict. $5 minimum because the ~$0.59 escrow rent would be 59% of a $1 tip |
| *default* | Lock mechanism | Jupiter Lock `createVestingEscrowV2`, cliff = **chain** now + duration, `CancelMode.NONE`, amount = minOut − fee(minOut) so the escrow is always fully funded in one tx | Spike showed ExactOut has no route, so the exact output is unknown at build time; locking the guaranteed minimum can never fail on funds |
| *default* | Demo lock | 2-minute lock for the video (`NEXT_PUBLIC_DEMO_LOCK_SECONDS=120`), off in production | Show claim on camera without waiting |

## Pricing

| ID | Decision | Choice | Why |
|---|---|---|---|
| *default* | Tip amount | Free field, default $3, minimum $1; SOL amount computed from the live price | Tipping-sized amounts; $1 is viable because fees are sub-cent |
| P25 | Which price the jar shows | **Market price (Jupiter)**, with the Tessera mark shown next to it. Switchable in one place: `PRICE_SOURCE` in `app/lib/prices/source.ts` | On 23/09 the Tessera mark for T-OpenAI was $812.79 vs ~$1,047 on Jupiter (~29% premium). With the mark, a $3 tip would show as ~$2.33 in the jar, which looks like a loss |
| — | Fee disclosure | Always show "includes 0.2% token transfer fee" next to estimates | T-Tokens charge 20 bps on every transfer |

## UX

| ID | Decision | Choice | Why |
|---|---|---|---|
| P17 | Identity | `name` / `x` from the link are unverified: always show the short wallet and an "unverified" badge | Anyone can craft a link with any name |
| P24 | Lock warning | Visible text (not a tooltip) in the UI and in the Blink POST `message` | Long locks can span the redemption window: risk of total loss for the creator |
| P24 | Deposit disclosure | "+ ~0.0051 SOL refundable deposit (escrow rent), returned to you after the creator claims", with live USD value | Only the fan can recover the rent, and only after the full claim |
| — | Claim gating | Claim button disabled until the cliff, by chain clock | Claiming before the cliff succeeds on-chain but moves 0 tokens |

## Distribution

| ID | Decision | Choice | Why |
|---|---|---|---|
| P20 | Blink registry | **No Dialect registry** application. The main product is the `/tip/<wallet>` page; the Blink is an extra (works on dial.to / Phantom), same backend | X unfurl needs registry approval, which can't be counted on before the deadline |
| P23 | Traction | Collect real tips from people outside the team starting Thursday night (2026-09-24) | Real usage is the strongest demo; requires the app on mainnet by then |
| P26 | Domain | `buymeashare.r4to.com` | Founder-owned domain, no purchase needed |
| P27 | Demo video | Founder's voice in English + captions, ~2 min, 6 scenes. See [demo-script.md](demo-script.md) | Judges watch in English; captions for accessibility |
| P28 | Launch post | PT-BR, for Brazilian Crypto Twitter | Founder's own audience; U.S. persons are excluded by Tessera's terms anyway |

## Testing

| ID | Decision | Choice | Why |
|---|---|---|---|
| P18 | Test wallets | Throwaway keypairs in local files (`~/.config/solana/stocklana-test.json` fan, `~/.config/solana/stocklana-creator.json` creator), loaded in-process, never printed or committed | No real funds at risk; `.gitignore` blocks `*keypair*.json` / `stocklana-*.json` |
| P19 | Where to test | **Surfpool** (local mainnet fork) at zero cost; real mainnet only for the video and real tips | Real Jupiter quotes and real program bytecode without spending money. Spike and app e2e both refuse non-local RPCs for sends |
