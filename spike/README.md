# Buy Me a Share: feasibility spike (Jupiter swap -> Tessera T-Token -> Jupiter Lock)

TL;DR: the full flow works in **one v0 transaction** (swap + lock + memo, 897 B for USDC input,
1126-1127 B for SOL input). It ran end to end on a Surfpool mainnet fork: swap, lock, claim
after the cliff, and close to recover rent. The escrow stays **fully backed** under the 0.2% Token-2022 fee because
`createVestingEscrowV2` pulls a fee-inclusive amount from the sender. Spike scripts never sent to real mainnet (the app later sent the first real tip on 2026-09-24; see ../README.md).

## Setup

```fish
cd spike
pnpm install
```

Wallets are loaded in-process from `~/.config/solana/stocklana-test.json` (fan/payer) and
`~/.config/solana/stocklana-creator.json` (creator). You can override them with `FAN_KEYPAIR` / `CREATOR_KEYPAIR`.
Secret bytes are never printed.

| env | default |
|---|---|
| `RPC_URL` | `https://api.mainnet-beta.solana.com` |
| `JUP_API_URL` | `https://lite-api.jup.ag/swap/v1` (quotes always come from real mainnet) |

### Safety rules (enforced in code)

- The default mode is `--simulate` (build + `simulateTransaction` with `sigVerify:false, replaceRecentBlockhash:true`).
- `--send` is **refused unless `RPC_URL` is localhost**. A real mainnet send needs `--send --mainnet`.
- `--as <pubkey|auto>` impersonates a funded wallet **for simulation only**, so the whole instruction
  chain runs (it cannot be combined with `--send`).

## Scripts

| script | what it does |
|---|---|
| `swap-to-other.ts` | 1 tx: create creator T-Token ATA (idempotent, fan pays), Jupiter swap with `destinationTokenAccount = creator ATA`, memo `buymeashare:v0` |
| `swap-and-lock.ts` | 1 tx: swap into fan ATA, create escrow ATA, `createVestingEscrowV2` (recipient = creator, cliff = chain now + N s, cancel NONE), memo. `--mode auto\|single\|two` (auto falls back to 2 txs if it does not fit). The shrink ladder tries default, then maxAccounts 40/30/20, then onlyDirectRoutes |
| `claim.ts` | creator runs `claimV2` (max) after the cliff |
| `close-escrow.ts` | fan (escrow creator) runs `closeVestingEscrow` after the full claim to recover rent |
| `fund-creator.ts` | SOL transfer fan -> creator |
| `surfnet.ts` | Surfpool cheatcodes: `--fund`, `--warp-seconds N`, `--status` (local RPC only) |

### Mainnet simulate (read-only)

```fish
pnpm tsx swap-to-other.ts --in USDC --token openai --usd 1
pnpm tsx swap-to-other.ts --in SOL  --token spacex --usd 1 --as auto      # e2e as a funded wallet
pnpm tsx swap-and-lock.ts --in USDC --token openai --usd 1 --lock-seconds 120
pnpm tsx swap-and-lock.ts --in USDC --token openai --usd 1 --lock-seconds 120 --as auto
pnpm tsx claim.ts --escrow <ESCROW> --as recipient
pnpm tsx fund-creator.ts --sol 0.01
```

With the unfunded wallets, the verdict is `INSUFFICIENT_FUNDS (expected ... NOT structural)`.
Structural failures are labeled `TX_TOO_LARGE` / `PROGRAM_ERROR` / `COMPUTE_BUDGET` `(STRUCTURAL)` and exit with code 2.

### Surfpool (local mainnet fork) run

```fish
# install (done): release v1.6.0 darwin-arm64 tarball, sha256 verified, binary at ~/.local/bin/surfpool
surfpool start --network mainnet --no-tui --no-studio --no-deploy --airdrop-amount 0 -y   # RPC 127.0.0.1:8899

set -x RPC_URL http://127.0.0.1:8899
pnpm tsx surfnet.ts --fund                      # fan 1 SOL + 10 USDC, creator 0.05 SOL
pnpm tsx fund-creator.ts --sol 0.01 --send
pnpm tsx swap-to-other.ts --in USDC --token openai --usd 1 --send
pnpm tsx swap-to-other.ts --in SOL  --token spacex --usd 1 --send
pnpm tsx swap-and-lock.ts --in USDC --token openai --usd 1 --lock-seconds 120 --send
pnpm tsx swap-and-lock.ts --in SOL  --token openai --usd 1 --lock-seconds 60 --send
pnpm tsx swap-and-lock.ts --in USDC --token kalshi --usd 1 --lock-seconds 60 --mode two --send
pnpm tsx claim.ts --escrow <ESCROW>             # before cliff: OK, 0 transferred
pnpm tsx surfnet.ts --warp-seconds 130          # surfnet_timeTravel (ms timestamp)
pnpm tsx claim.ts --escrow <ESCROW> --send
pnpm tsx close-escrow.ts --escrow <ESCROW> --send
```

## Program ids

- Jupiter Lock: `LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn`. Source: `jup-ag/lock-sdk` `src/locker/idl.ts`
  (`IDL.address`, locker v0.4.0). The program forks also have it as the mainnet `declare_id!`. On 2026-09-23 it
  was executable on mainnet (BPFLoaderUpgradeable).
- Instructions used (hand-encoded from the IDL, no SDK dependency): `createVestingEscrowV2`, `claimV2`,
  `closeVestingEscrow`. All three take `tokenProgram`, which makes them Token-2022 capable.
- npm: `@jup-ag/lock-sdk` does **not** exist (404). The repo's package.json publishes as
  `@dongnguyen91861/locker-sdk@0.1.0`, a third-party scope, so we don't use it. Its `createVestingPlan` also builds ATAs
  with the legacy Token program, which breaks Token-2022.

## RESULTS (2026-09-23, Surfpool v1.6.0 forking mainnet slot ~449.83M; quotes from lite-api)

| # | step | tx bytes (v0 / legacy) | result | creator received (raw, 9 dec) | fee withheld | notes |
|---|---|---|---|---|---|---|
| 1 | fund-creator 0.01 SOL | 266 / 264 | SENT | n/a | n/a | |
| 2 | swap-to-other USDC -> T-OpenAI $1 | **628 / 933** | SENT | 951,313 | 1,907 (creator ATA) | 1-hop Meteora DLMM, 83.7k CU. `quote.outAmount` is **net** of the fee (exact match) |
| 3 | swap-to-other SOL -> T-SpaceX $1 | **1088 / 1821** | SENT (after 1 datasource retry) | 1,770,854 | 3,549 | 3-hop route (Byreal/Manifest/DLMM, 1124 B). Only v0 fits. Received was 649 below the quote (stale fork pool) |
| 4 | swap-and-lock USDC -> T-OpenAI, 1 tx | **897 / 1202** | SENT | escrow holds 944,663 = cliffUnlockAmount | 1,894 (escrow ATA) | 2 signers (fan + escrow base), 105k CU on fork, 138k in mainnet sim. Fan keeps 4,756 dust (outAmount - minOut) |
| 5 | swap-and-lock SOL -> T-OpenAI, 1 tx | default 1578 (over by 346); maxAccounts=40 1250 (over by 18); maxAccounts=30 **1127** | 1st send: PROGRAM_ERROR in DLMM `swap2` 6002 InvalidInput (fork state divergence); 2nd: SENT at **1126 B** (Quantum -> DLMM) | escrow 944,814 = owed | 1,894 | SOL input adds wSOL setup/cleanup ixs. The shrink ladder handles it |
| 6 | swap-and-lock USDC -> T-Kalshi, `--mode two` | 556 + 740 | SENT both | escrow 2,227,056 = owed | 4,464 | locks the **actual** received amount (2,231,520 - fee), no dust |
| 7 | claim before cliff (simulate) | 568 / 566 | OK, 0 transferred | 0 | 0 | does **not** error, so the UI must gate on cliff |
| 8 | claim after cliff (time-travel), escrow from #4 | 568 / 566 | SENT | **942,773** | 1,890 | same for #5 (942,924 / 1,890) and #6 (2,222,601 / 4,455) |
| 9 | close-escrow after full claim | 593 / 591 | SENT | n/a | n/a | rent back to **fan**: 2,951,040 (escrow) + 2,157,600 (escrow ATA) = 5,108,640 lamports, net +5,101,640 after fee. Works even with withheld fees in the escrow ATA |

### Escrow accounting under the 0.2% transfer fee

- `createVestingEscrowV2` computes a **fee-inclusive** transfer: the escrow ATA ends up holding exactly
  `cliffUnlockAmount`. Checked in both modes:
  - `net` (default): owed 944,663, sender debited 946,557 (= minOut), escrow 944,663.
  - `gross`: owed 946,557, sender debited 948,454, escrow 946,557.
- Result: the escrow is always fully backed. `net` mode can never fail on funds in one tx, because the sender pays at most minOut.
  `gross` fails when the actual swap output is below minOut + fee.
- The fee is paid 3 times (swap delivery, deposit, claim): creator gets 942,773 vs 951,313 with a direct
  delivery, which is **-0.90%** (0.2% deposit fee + 0.2% claim fee + 0.5% slippage buffer left with the fan in single-tx mode).
- Rent: **0.00511 SOL per escrow** (about $0.59 at the $114.8/SOL implied by the quote). That is 59% of a $1 tip, and it stays locked until
  the **fan** (the escrow creator) closes it after the creator's full claim. Only the escrow creator can close it
  (it must sign).

### Divergence risks, fork vs mainnet

1. Jupiter picks routes and bin arrays from **live mainnet**, but the fork executes against pool accounts that were
   snapshotted at first touch and are then mutated only by local txs. Observed effects: a DLMM `InvalidInput` (6002) on one route,
   and -649 raw vs the quote on T-SpaceX. On mainnet this shows up as ordinary slippage or re-quote errors.
2. Surfpool's datasource is the public RPC. `Failed to fetch accounts from remote` happens intermittently on send, so
   `signAndSend` retries up to 6 times.
3. No real fee market or landing. Priority fees, blockhash expiry and congestion are untested. The CU numbers are from the fork plus one mainnet simulation.
4. Time travel moves the chain clock ahead of the wall clock. The cliff is computed from chain time (`getBlockTime`), not `Date.now()`.
5. The fork runs the same program bytecode (fetched from mainnet), but the SVM feature set is Surfpool's (LiteSVM), not validator-identical.

### UNKNOWN

- A real mainnet `--send` has never been done (it needs funding plus `--mainnet`).
- Where the withheld fees go when the escrow ATA is closed: the close marks the mint writable, so the program probably harvests them
  to the mint. This was not traced.
- We skip `createVestingEscrowMetadata` to save bytes. Whether jup.ag/lock lists escrows that have no metadata is unverified.
- T-Tokens have a freeze authority, and Tessera could freeze the escrow ATA or the creator ATA. Not tested.
- The fee-inclusive deposit behavior was measured, not read from source (`jup-ag/jup-lock` program source is not public; the public forks predate v2).
- `lite-api.jup.ag` longevity and rate limits: it may need `api.jup.ag` with a key in production.
- `bigint: Failed to load bindings` is a harmless warning (the `bigint-buffer` native build is intentionally blocked in `pnpm-workspace.yaml`).
