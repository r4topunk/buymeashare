# Tessera Terms: what affects Buy Me a Share

**TL;DR:** T-Tokens are **Stablecoin Loan Tokens** (a USDC loan to a Panamanian issuer), not equity. They can be redeemed only during a **90-day window** after the issuer exits the investment, and anything not redeemed in that window is forfeited. **U.S. persons** and excluded jurisdictions can't use Tessera. So the product never calls the token a share, shows a visible warning on every lock, and shows a Tessera notice on the landing and tip pages.

Source: [Tessera Terms and Conditions](https://terms.tessera.pe/terms-and-conditions), **Date Last Revised: August 28, 2026**, read on 2026-09-23 and re-checked on 2026-09-24. Section numbers below are the ones in that document.

> This is a product-engineering reading of the terms, **not legal advice**. Nobody on the team is a lawyer.

## Clauses and product rules

| Section | What it says | Product rule | Where in code |
|---|---|---|---|
| Preamble | Each T-Token is issued by a Panamanian subsidiary of TWF: SPX Tessera Issuer Inc. (T-SpaceX), KLSH Tessera Issuer Inc. (T-Kalshi), OPAI Tessera Issuer Inc. (T-OpenAI) | Name Tessera as the issuer in the notice | `app/lib/brand.ts` (`TESSERA_NOTICE`) |
| 1.4 | A Lender who extends a Stablecoin Loan receives a "Stablecoin Loan Token" at 1 accepted stablecoin : 1 token | **Never** call the token a share, equity, stock, "a piece of OpenAI" or "own OpenAI". Say "T-OpenAI" or "OpenAI pre-IPO exposure (Tessera T-Token)" | Copy rules in `app/AGENTS.md`; `app/lib/tokens.ts` comment |
| 1.5 | The issuer intends to make a private-equity investment (OpenAI, SpaceX, Kalshi) with the loan proceeds | Describe it as exposure through Tessera's investment, not ownership | `PRODUCT_PITCH` in `app/lib/brand.ts` |
| 1.9(b) | A holder, "whether such holder is the Lender ... or acquiror of those Stablecoin Loan Token", may redeem during the Redemption Period | A creator who receives T-Tokens as a tip (secondary acquiror) can redeem like any other holder. This is what makes the tip meaningful | — |
| 1.15(a) | A Transaction Fee applies to Tessera transactions, including transfers of Stablecoin Loan Tokens | On-chain this shows up as the 20 bps Token-2022 transfer fee; always show "includes 0.2% token transfer fee" | `app/lib/tokens.ts` (`transferFeeBps: 20`) |
| 2.2(a) | Redemption = burning the tokens to claim the Redemption Amount in USDC/USDT | The creator (not us) redeems on Tessera | — |
| 2.2(a)(i) | Redemption Period: from the Redemption Start Date to the **90th day** after it | Lock warning mentions the 90-day window | `TESSERA_LOCK_WARNING` |
| 2.2(a)(ii) | Redemption Start Date: announced by TWF, no more than 90 days after the issuer receives the Liquidity Event Proceeds | Nobody can know in advance when the window opens, so a lock cap can't guarantee safety (reason P24 dropped the 60-day cap for a warning) | [product-decisions.md](product-decisions.md) P24 |
| 2.2(a)(iii) | Redemption Amount: a pro-rata share of the Liquidity Event Proceeds actually received; recourse only to those proceeds | Don't promise a value; show market price and Tessera mark as prices, not as a redemption value | `app/lib/prices/source.ts` |
| 2.2(b), 2.2(b)(i) | Redemption depends on a Liquidity Event (the issuer divesting **all** of its interest). No proprietary interest in the investment or the issuer's assets | Reinforces "not equity" | — |
| 2.2(c), 2.2(e), 2.2(f) | If the window expires without redemption, the issuer is discharged, the tokens can no longer be redeemed, and the holder has no claim: **total loss** | **Every lock shows a visible warning** (not a tooltip), in the UI and in the Blink POST `message`: a lock that spans the window could make the creator lose the tip | `app/components/lock-warning.tsx`, `TESSERA_LOCK_WARNING` in `app/lib/brand.ts` |
| 2.1(d) | Issuer may decline to issue tokens to Excluded Persons or people in Excluded Jurisdictions | Same audience limits as 3.1(c) | — |
| 3.1(c)(i) | Excluded Jurisdictions: (1) United States and its territories, (2) China, (3)–(14) CAR, North Korea, DR Congo, Belarus, Iran, Libya, Mali, Russia, Somalia, South Sudan, Sudan, Yemen, (15) FATF high-risk / call-for-action lists, (16) any jurisdiction where Tessera would need a licence, (17) any jurisdiction where offering or using Tessera is prohibited or restricted | Tessera notice on landing and tip pages: "not available to U.S. persons or residents of excluded jurisdictions" | `TESSERA_NOTICE`, `<TesseraNotice />` |
| 3.1(c)(ii) | Excluded Persons include citizens/residents of, or people located in, an Excluded Jurisdiction, UN-listed persons, and (5) any **U.S. person** (defined broadly) | Applies to **both** fan and creator. Launch post targets Brazilian Crypto Twitter, not U.S. audiences (P28) | [product-decisions.md](product-decisions.md) P28 |

## Product rules summary

- [x] Copy never calls T-Tokens shares / equity / stock (the product name "Buy Me a Share" is the one exception, and lives only in `PRODUCT_NAME`)
- [x] Tessera notice visible on landing and tip pages, with a link to the terms
- [x] Lock warning visible whenever a lock is selected (UI + Blink)
- [x] "includes 0.2% token transfer fee" next to estimates
- [ ] No geo-blocking or KYC in the app: the notice is informational only (see UNKNOWN)

## UNKNOWN

- **Brazil** is not named in 3.1(c)(i). Whether it falls under the catch-alls (16) (licensing) or (17) (prohibited/restricted) is UNKNOWN. Matters because the launch audience is Brazilian (P28).
- Whether a front-end that routes swaps into T-Tokens (this app) is itself "access and/or use of Tessera" for the fan, or only for the holder, is UNKNOWN.
- Whether a notice without geo-blocking is enough for a hackathon demo, or whether Tessera expects active blocking of U.S. persons, is UNKNOWN (not asked).
- Whether Tessera would freeze a Jupiter Lock escrow's token account (T-Tokens have a freeze authority) is UNKNOWN. See [feasibility.md](feasibility.md).
- The terms can change (section 11.6). This reading is pinned to the 28 Aug 2026 revision.
