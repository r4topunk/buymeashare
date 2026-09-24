# Feasibility: measured facts

**TL;DR:** The whole flow fits in **one v0 transaction**: swap + deliver (628 B USDC / 1088 B SOL) or swap + lock (897 B USDC / 1126 B SOL). It ran end to end on a Surfpool mainnet fork (spike + app e2e 7/7), and the first real mainnet tip landed on 2026-09-24. The Jupiter Lock escrow stays fully funded under the 0.2% Token-2022 fee. The main costs of a locked tip are the 0.00511 SOL refundable escrow rent and ~0.9% less delivered to the creator.

Full step-by-step table: **RESULTS** in [spike/README.md](../spike/README.md).

## T-Token mints (read from mainnet RPC, 2026-09-23)

| Fact | Value |
|---|---|
| Program | Token-2022 (`TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`) |
| Decimals | 9 |
| Extensions | `transferFeeConfig` **20 bps (0.2%) per transfer, no cap**, `metadataPointer`, `tokenMetadata` |
| Freeze authority | `7n2PNcDXVDMK2m8dyV9cVPNY7p4jM4ZMHv7TzfibEt8o`: Tessera can freeze token accounts (checked on T-OpenAI and T-Kalshi) |
| Mints | T-OpenAI `oPAiAikWTaFj9RYoRFD35ccfwhnMcB3ThgBZRHSkjTZ`, T-Kalshi `TKLSidmLVt3cqGaaodG8tyRzoANfQwoh67AccjmubeZ`, T-SpaceX `TSPXcLV76s6V2zDiZQ18kBfcbnjaE2ZzNT3ga2Pd99v` (source: `app/lib/tokens.ts`) |

## Jupiter quotes (2026-09-23, `lite-api.jup.ag/swap/v1/quote`, USDC → T-Token, 100 bps slippage)

| Token | Price impact at $3 | Price impact at $100 | Route | ExactOut |
|---|---|---|---|---|
| T-OpenAI | 0.198% | 0.198% | Meteora DLMM | `NO_ROUTES_FOUND` |
| T-Kalshi | 0.198% | 0.198% | Meteora DLMM | `NO_ROUTES_FOUND` |
| T-SpaceX | 0.418% | 0.418% | Meteora DLMM | `NO_ROUTES_FOUND` |

- Impact is identical at $3 and $100, so it most likely comes from the 0.2% transfer fee, not thin liquidity (hypothesis, not proven).
- No ExactOut route, so the exact output is unknown when the tx is built. The lock therefore escrows `minOut − fee(minOut)`; the slippage buffer stays with the fan.
- `quote.outAmount` is already **net** of the transfer fee (exact match in spike step 2).
- SOL price on Jupiter, 2026-09-23: $114.54.

## Prices (Tessera API vs Jupiter, 2026-09-23)

| Token | Tessera `markPrice` | Jupiter (approx.) |
|---|---|---|
| T-OpenAI | $812.79 (markValuation $950B) | ~$1,047 (~29% premium) |
| T-Kalshi | $413.80 | ~$446 |
| T-SpaceX | $423 | ~$563 |

## Jupiter Lock

| Fact | Value |
|---|---|
| Program id | `LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn` (from `jup-ag/lock-sdk` IDL, locker v0.4.0; executable on mainnet on 2026-09-23) |
| Instructions used | `createVestingEscrowV2`, `claimV2`, `closeVestingEscrow`, hand-encoded from the IDL. All take `tokenProgram`, so they work with Token-2022 |
| SDK | Not used: `@jup-ag/lock-sdk` is not on npm; the repo publishes under a third-party scope and builds ATAs with the legacy Token program, which breaks Token-2022 |
| Deposit under the 0.2% fee | **Fee-inclusive**: the program debits the sender deposit + fee, so the escrow ATA holds exactly `cliffUnlockAmount`. Measured in both net and gross modes |
| Claim before the cliff | **Succeeds and moves 0** (no error). The UI gates Claim on chain time (`CLIFF_NOT_REACHED`) |
| Escrow rent | **0.00511 SOL** (5,108,640 lamports = escrow 2,951,040 + escrow ATA 2,157,600), ~$0.59. Refundable **only to the fan** (escrow creator), only after the full claim, in a tx the fan signs |
| Creator receives with a lock | **−0.90%** vs direct delivery (942,773 vs 951,313 raw on $1): 0.2% deposit fee + 0.2% claim fee + 0.5% slippage buffer left with the fan |
| Cancel mode | `NONE` (nobody can cancel) |

## Transaction sizes (limit 1232 B)

| Tx | v0 | legacy |
|---|---|---|
| Swap-to-creator, USDC → T-OpenAI | **628** | 933 |
| Swap-to-creator, SOL → T-SpaceX (3 hops) | **1088** | 1821 |
| Swap + lock, USDC → T-OpenAI | **897** | 1202 |
| Swap + lock, SOL → T-OpenAI | **1126** (after shrink ladder to `maxAccounts=30`; default route was 1578) | — |
| Claim | 568 | 566 |
| Close escrow | 593 | 591 |

The builder walks a shrink ladder (default → `maxAccounts` 40/30/20 → `onlyDirectRoutes`) until the tx fits.

## End-to-end runs

| Run | Result |
|---|---|
| Spike on Surfpool v1.6.0 (mainnet fork, slot ~449.83M) | 9 steps sent/simulated as expected. [spike/README.md](../spike/README.md) |
| App `pnpm e2e:surfpool` | 7/7: USDC→T-OpenAI, SOL→T-SpaceX, 120 s locked tip, listLocks, claim after time travel, reclaim deposit, jar |
| App `pnpm blink:simulate` | Blink GET shape, POST guard rails, POST txs simulate with `sigVerify:true` |
| First real mainnet tip, 2026-09-24 | $1 SOL → T-OpenAI; creator `DrPUR2AiAk9rp1NJDs3dQn73xZt1nTG3jLKZzqsLYFsk` received **0.000959413 T-OpenAI**; network fee 0.000011 SOL. [Tx on Solscan](https://solscan.io/tx/2mHQrsc5fpxJDcQEyKqdK7SZso9TZAZx4TbtonyHGpnAPeAJQ5RB2zGH1omzZgYMFmZ7BfaThoaN2Z8Xd8ZMCjLM) |

## Infra findings

- The public mainnet RPC rejects browser-origin requests (403), and a keyed RPC must not reach the client bundle. The browser therefore uses the same-origin `/api/rpc` proxy (method allowlist, max 20 calls per batch, 64 KB body), forwarding to `RPC_URL`.
- Locked tips and deposits need `getProgramAccounts`, which public RPCs often refuse; the app degrades to "can't be read on this RPC" (`RPC_UNSUPPORTED`).
- Fork caveats: Jupiter quotes come from live mainnet while the fork executes against snapshotted pools, so a DLMM `6002` / Jupiter `0x1770` or a Surfpool `Failed to fetch accounts from remote` can occur. Scripts retry with a fresh quote.

## UNKNOWN

- A **locked** tip on real mainnet from a real wallet (Phantom etc.) with the tx pre-signed by the escrow base key: not recorded yet.
- Tessera freezing an escrow ATA or a creator ATA: not tested.
- Where the withheld transfer fees go when the escrow ATA is closed (probably harvested to the mint): not traced.
- Whether jup.ag/lock lists escrows created without `createVestingEscrowMetadata` (skipped to save bytes): unverified.
- The fee-inclusive deposit was measured, not read from source (Jupiter Lock v2 source is not public).
- The fan's own T-Token account rent (~0.00207 SOL) and the slippage dust (~0.5%) on locked tips are neither refunded nor shown in the UI.
- Priority fees, blockhash expiry and congestion on mainnet: untested at volume.
- `lite-api.jup.ag` longevity and rate limits; production may need `api.jup.ag` with a key.
- Blink unfurl on X requires the Dialect registry, which we are not applying to (P20); dial.to / Phantom are the fallback.
