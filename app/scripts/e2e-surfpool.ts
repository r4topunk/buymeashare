// End-to-end proof of the app's tx layer on a LOCAL Surfpool mainnet fork. Never runs against a non-local RPC.
//
//   surfpool start --network mainnet --no-tui --no-studio --no-deploy --airdrop-amount 0 -y     # 127.0.0.1:8899
//   set -x RPC_URL http://127.0.0.1:8899; set -x NEXT_PUBLIC_RPC_URL http://127.0.0.1:8899
//   pnpm e2e:surfpool
//
// Wallets: ~/.config/solana/stocklana-test.json (fan) and ~/.config/solana/stocklana-creator.json (creator),
// overridable with FAN_KEYPAIR / CREATOR_KEYPAIR. Loaded in-process only; secret bytes are never printed.
// Quotes come from the real Jupiter API; execution happens on the fork.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Connection, Keypair, PublicKey, type VersionedTransaction } from "@solana/web3.js";
import { getJar } from "@/lib/jar/getJar";
import { ata, loadMint } from "@/lib/solana/token";
import { escrowTokenAccount } from "@/lib/solana/lock";
import {
  buildClaimTransaction,
  buildCloseEscrowTransaction,
  buildTipTransaction,
  isTipError,
  listDeposits,
  listLocks,
  type BuiltTransaction,
} from "@/lib/tip";
import { PAY_ASSETS, tokenById } from "@/lib/tokens";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const LOCK_SECONDS = 120;

function isLocal(url: string) {
  return ["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"].includes(new URL(url).hostname);
}
for (const [k, v] of [["RPC_URL", RPC], ["NEXT_PUBLIC_RPC_URL", process.env.NEXT_PUBLIC_RPC_URL ?? ""]] as const) {
  if (!v || !isLocal(v)) {
    console.error(`Refusing to run: ${k}=${v || "(unset)"} is not a local RPC. This script only talks to a Surfpool fork.`);
    process.exit(3);
  }
}

function loadKeypair(path: string): Keypair {
  const raw = JSON.parse(readFileSync(path, "utf8")) as number[];
  if (!Array.isArray(raw) || raw.length !== 64) throw new Error(`Keypair file ${path} is not a 64-byte JSON array`);
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}
const fan = loadKeypair(process.env.FAN_KEYPAIR ?? join(homedir(), ".config/solana/stocklana-test.json"));
const creator = loadKeypair(process.env.CREATOR_KEYPAIR ?? join(homedir(), ".config/solana/stocklana-creator.json"));
const conn = new Connection(RPC, "confirmed");

async function rpc(method: string, params: unknown[]): Promise<{ epoch?: number } & Record<string, unknown>> {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await res.json()) as { error?: unknown; result: never };
  if (body.error) throw new Error(`${method}: ${JSON.stringify(body.error)}`);
  return body.result;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Builds, signs (in-process keypair = the "wallet") and sends. Retries the Surfpool datasource hiccup on the
 * same tx, and rebuilds (fresh quote) on execution errors: the fork's pool state diverges from the live
 * mainnet state Jupiter quotes against (see ../spike/README.md "Divergence risks").
 */
async function send<T extends BuiltTransaction>(label: string, build: () => Promise<T>, signer: Keypair, rebuilds = 3): Promise<{ built: T; signature: string }> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= rebuilds; attempt++) {
    const built = await build();
    signTx(built.transaction, signer);
    for (let i = 1; ; i++) {
      try {
        const signature = await conn.sendRawTransaction(built.transaction.serialize(), { skipPreflight: false, maxRetries: 3 });
        const conf = await conn.confirmTransaction(
          { signature, blockhash: built.blockhash, lastValidBlockHeight: built.lastValidBlockHeight },
          "confirmed",
        );
        if (conf.value.err) throw new Error(`tx ${signature} failed: ${JSON.stringify(conf.value.err)}`);
        return { built, signature };
      } catch (e) {
        lastErr = e;
        const msg = e instanceof Error ? e.message : String(e);
        if (/Failed to fetch accounts from remote/.test(msg) && i < 6) {
          console.log(`    [${label}] surfnet datasource hiccup, resending in ${2 * i}s`);
          await sleep(2000 * i);
          continue;
        }
        const logs = (e as { logs?: string[] }).logs;
        console.log(`    [${label}] attempt ${attempt} failed: ${msg.split("\n")[0].slice(0, 200)}${logs ? ` | ${logs.filter((l) => /failed|Error/i.test(l)).slice(-2).join(" | ")}` : ""}`);
        break;
      }
    }
  }
  throw lastErr;
}

function signTx(tx: VersionedTransaction, signer: Keypair) {
  // Same as a wallet: adds the fee payer signature next to the ephemeral escrow-base signature already present.
  tx.sign([signer]);
}

async function tokenBalance(address: PublicKey): Promise<bigint> {
  const b = await conn.getTokenAccountBalance(address, "confirmed").catch(() => null);
  return BigInt(b?.value.amount ?? "0");
}

async function chainTime(): Promise<number> {
  return (await conn.getBlockTime(await conn.getSlot("confirmed"))) ?? Math.floor(Date.now() / 1000);
}

type StepResult = { n: number; name: string; ok: boolean; detail: string };
const results: StepResult[] = [];
async function step(n: number, name: string, fn: () => Promise<string>) {
  console.log(`\n[${n}] ${name}`);
  const t0 = Date.now();
  try {
    const detail = await fn();
    results.push({ n, name, ok: true, detail });
    console.log(`    PASS (${((Date.now() - t0) / 1000).toFixed(1)}s): ${detail}`);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    results.push({ n, name, ok: false, detail });
    console.log(`    FAIL: ${detail}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log(`=== e2e-surfpool: app tx layer on a LOCAL fork (${RPC}) ===`);
  console.log(`fan:     ${fan.publicKey.toBase58()}`);
  console.log(`creator: ${creator.publicKey.toBase58()}`);
  console.log(`fork slot: ${await conn.getSlot()}`);

  // Funding via Surfpool cheatcodes (same as ../spike/surfnet.ts --fund, with more USDC for the $5 locked tip).
  await rpc("surfnet_setAccount", [fan.publicKey.toBase58(), { lamports: 1_000_000_000 }]);
  await rpc("surfnet_setAccount", [creator.publicKey.toBase58(), { lamports: 50_000_000 }]);
  await rpc("surfnet_setTokenAccount", [fan.publicKey.toBase58(), PAY_ASSETS.USDC.mint, { amount: 20_000_000 }, "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"]);
  console.log("funded via cheatcodes: fan 1 SOL + 20 USDC, creator 0.05 SOL");

  const openai = await loadMint(conn, new PublicKey(tokenById("openai").mint));
  const spacex = await loadMint(conn, new PublicKey(tokenById("spacex").mint));
  const creatorOpenAi = ata(openai, creator.publicKey);
  const creatorSpacex = ata(spacex, creator.publicKey);
  const tipSigs: string[] = [];
  let escrow: PublicKey | null = null;
  let lockedAmount = BigInt(0);

  await step(1, "tip unlocked $1 USDC -> T-OpenAI (delivered to creator ATA)", async () => {
    const pre = await tokenBalance(creatorOpenAi);
    const { built, signature } = await send(
      "tip1",
      () => buildTipTransaction({ payer: fan.publicKey, creator: creator.publicKey, token: "openai", payWith: "USDC", usdAmount: 1, lockSeconds: null }, { connection: conn }),
      fan,
    );
    const got = (await tokenBalance(creatorOpenAi)) - pre;
    assert(got > BigInt(0), "creator T-OpenAI balance did not increase");
    tipSigs.push(signature);
    return `sig ${signature.slice(0, 12)}… ${built.bytes} B (${built.attempt}; ${built.route}); creator +${got} raw (quoted ${built.expectedOut})`;
  });

  await step(2, "tip unlocked $1 SOL -> T-SpaceX (delivered to creator ATA)", async () => {
    const pre = await tokenBalance(creatorSpacex);
    const { built, signature } = await send(
      "tip2",
      () => buildTipTransaction({ payer: fan.publicKey, creator: creator.publicKey, token: "spacex", payWith: "SOL", usdAmount: 1, lockSeconds: null }, { connection: conn }),
      fan,
    );
    const got = (await tokenBalance(creatorSpacex)) - pre;
    assert(got > BigInt(0), "creator T-SpaceX balance did not increase");
    tipSigs.push(signature);
    return `sig ${signature.slice(0, 12)}… ${built.bytes} B (${built.attempt}; ${built.route}); creator +${got} raw; paid ${built.inputAmount} lamports`;
  });

  await step(3, `tip LOCKED ${LOCK_SECONDS}s $5 USDC -> T-OpenAI (swap + Jupiter Lock escrow, one tx, 2 signers)`, async () => {
    const { built, signature } = await send(
      "tip3",
      () => buildTipTransaction({ payer: fan.publicKey, creator: creator.publicKey, token: "openai", payWith: "USDC", usdAmount: 5, lockSeconds: LOCK_SECONDS }, { connection: conn }),
      fan,
    );
    assert(built.lock, "no lock plan returned");
    assert(built.ephemeralSigners.length === 1, "expected one ephemeral escrow base signer");
    escrow = new PublicKey(built.lock.escrow);
    lockedAmount = built.lock.amountRaw;
    const held = await tokenBalance(escrowTokenAccount(escrow, openai.mint, openai.programId));
    assert(held === built.lock.amountRaw, `escrow ATA holds ${held}, expected cliffUnlockAmount ${built.lock.amountRaw}`);
    const now = await chainTime();
    return `sig ${signature.slice(0, 12)}… ${built.bytes} B (${built.attempt}); escrow ${escrow.toBase58()} holds ${held} raw (fully backed); cliff ${built.lock.cliffTime} = chain now ${now} + ${built.lock.cliffTime - now}s`;
  });

  await step(4, "listLocks(creator) shows the locked tip; claim is gated before the cliff", async () => {
    assert(escrow, "no escrow from step 3");
    const { locks, chainTime: t } = await listLocks({ creator: creator.publicKey }, { connection: conn });
    const mine = locks.find((l) => l.escrow === escrow!.toBase58());
    assert(mine, `escrow not listed (got ${locks.length} locks)`);
    assert(mine.status === "locked" && !mine.claimable, `expected status locked, got ${mine.status}`);
    assert(mine.from === fan.publicKey.toBase58() && mine.token === "openai", "wrong sender/token");
    let gated = false;
    try {
      await buildClaimTransaction({ recipient: creator.publicKey, escrow: escrow! }, { connection: conn });
    } catch (e) {
      gated = isTipError(e, "CLIFF_NOT_REACHED");
      if (gated) console.log(`    buildClaimTransaction before cliff -> CLIFF_NOT_REACHED: ${(e as Error).message}`);
    }
    assert(gated, "buildClaimTransaction did not throw CLIFF_NOT_REACHED before the cliff");
    return `${locks.length} lock(s); ours: ${mine.amount} ${mine.token} status=${mine.status} unlockAt=${mine.unlockAt} (chain ${t}); deposit ${mine.depositLamports} lamports`;
  });

  await step(5, `creator claims after time travel (+${LOCK_SECONDS + 10}s chain clock)`, async () => {
    assert(escrow, "no escrow from step 3");
    const before = await chainTime();
    const info = await rpc("surfnet_timeTravel", [{ absoluteTimestamp: (before + LOCK_SECONDS + 10) * 1000 }]);
    const after = await chainTime();
    const { locks } = await listLocks({ creator: creator.publicKey }, { connection: conn });
    const mine = locks.find((l) => l.escrow === escrow!.toBase58());
    assert(mine?.status === "claimable", `expected claimable after time travel, got ${mine?.status}`);
    const pre = await tokenBalance(creatorOpenAi);
    const { built, signature } = await send("claim", () => buildClaimTransaction({ recipient: creator.publicKey, escrow: escrow! }, { connection: conn }), creator);
    const got = (await tokenBalance(creatorOpenAi)) - pre;
    assert(got > BigInt(0), "creator did not receive the claimed tokens");
    return `clock ${before} -> ${after} (epoch ${info.epoch}); sig ${signature.slice(0, 12)}… ${built.bytes} B; claimable ${built.claimableRaw} (locked ${lockedAmount}); creator +${got} raw (net of 0.2% fee)`;
  });

  await step(6, "fan reclaims the escrow deposit (closeVestingEscrow)", async () => {
    assert(escrow, "no escrow from step 3");
    const { locks } = await listDeposits({ sender: fan.publicKey }, { connection: conn });
    const mine = locks.find((l) => l.escrow === escrow!.toBase58());
    assert(mine?.status === "claimed", `expected deposit status claimed, got ${mine?.status}`);
    const pre = await conn.getBalance(fan.publicKey, "confirmed");
    const { built, signature } = await send("close", () => buildCloseEscrowTransaction({ sender: fan.publicKey, escrow: escrow! }, { connection: conn }), fan);
    const post = await conn.getBalance(fan.publicKey, "confirmed");
    const gone = (await conn.getAccountInfo(escrow!, "confirmed")) === null;
    assert(gone, "escrow account still exists");
    const after = await listDeposits({ sender: fan.publicKey }, { connection: conn });
    assert(!after.locks.some((l) => l.escrow === escrow!.toBase58()), "closed escrow still listed");
    return `sig ${signature.slice(0, 12)}… ${built.bytes} B; refund ${built.refundLamports} lamports; fan balance delta +${post - pre} (after fee); escrow closed`;
  });

  await step(7, "jar (getJar, memo-tagged) shows the unlocked tips", async () => {
    const jar = await getJar(creator.publicKey.toBase58());
    const found = tipSigs.filter((s) => jar.tips.some((t) => t.signature === s));
    assert(tipSigs.length > 0, "no tip signatures from steps 1-2");
    assert(found.length === tipSigs.length, `jar shows ${found.length}/${tipSigs.length} tagged tips (errors: ${jar.errors.join("; ") || "none"})`);
    const summary = jar.tips.map((t) => `${t.amount} ${t.token} from ${t.from.slice(0, 4)}…${t.memoTags.kind ? ` [${t.memoTags.kind}]` : ""}`).join(", ");
    return `${jar.tips.length} tagged tip(s): ${summary}; holdings ${jar.holdings.map((h) => `${h.amount} ${h.token}`).join(", ")}`;
  });

  console.log("\n=== SUMMARY ===");
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.n}. ${r.name}`);
  const passed = results.filter((r) => r.ok).length;
  console.log(`${passed}/${results.length} steps passed`);
  if (passed !== results.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(`FATAL: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
