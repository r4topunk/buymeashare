// Proves the Blink POST returns a transaction that simulates OK on a LOCAL Surfpool fork.
//
//   RPC_URL=http://127.0.0.1:8899 pnpm start -p 3100          (server builds txs against the fork)
//   set -x RPC_URL http://127.0.0.1:8899; set -x BLINK_BASE http://localhost:3100
//   pnpm blink:simulate
//
// The fan keypair (~/.config/solana/stocklana-test.json, or FAN_KEYPAIR) is loaded in-process and only used to
// sign for simulateTransaction with sigVerify:true, which also checks the server's partial escrow-base signature.
// Nothing is sent. Run `pnpm e2e:surfpool` first so the fan wallet is funded on the fork.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
import { TESSERA_LOCK_WARNING } from "@/lib/brand";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const BASE = process.env.BLINK_BASE ?? "http://localhost:3100";
if (!["localhost", "127.0.0.1"].includes(new URL(RPC).hostname)) {
  console.error(`Refusing to run: RPC_URL=${RPC} is not local`);
  process.exit(3);
}
const raw = JSON.parse(readFileSync(process.env.FAN_KEYPAIR ?? join(homedir(), ".config/solana/stocklana-test.json"), "utf8")) as number[];
const fan = Keypair.fromSecretKey(Uint8Array.from(raw));
const creator = process.env.CREATOR_PUBKEY ?? "BV2KTH6X17ueowpX2b58JDJC41WpLYPf8tfr2WTaiNRg";
const conn = new Connection(RPC, "confirmed");

type Case = { label: string; qs: Record<string, string>; locked: boolean };
const CASES: Case[] = [
  { label: "unlocked $1 USDC -> T-OpenAI", qs: { token: "openai", amount: "1", payWith: "USDC", lockAmount: "", lockUnit: "none" }, locked: false },
  { label: "locked 1 day $5 USDC -> T-OpenAI", qs: { token: "openai", amount: "5", payWith: "USDC", lockAmount: "1", lockUnit: "days" }, locked: true },
  { label: "locked 2 years $5 SOL -> T-SpaceX", qs: { token: "spacex", amount: "5", payWith: "SOL", lockAmount: "2", lockUnit: "years" }, locked: true },
];

async function main() {
  let failures = 0;
  const meta = (await (await fetch(`${BASE}/api/actions/tip/${creator}`)).json()) as {
    links: { actions: { label: string; href: string; parameters: { name: string }[] }[] };
  };
  const actions = meta.links.actions;
  const names = actions[0]?.parameters.map((p) => p.name).join(",");
  console.log(`GET: ${actions.length} action(s): "${actions[0]?.label}" params=[${names}]`);
  if (actions.length !== 1 || actions[0].label !== "Tip" || names !== "token,amount,payWith,lockAmount,lockUnit") failures++;

  // Guard rails: locked tips under $5 and locks over 5 years must be rejected.
  for (const [label, qs] of [
    ["locked $1 (below $5 min)", { token: "openai", amount: "1", payWith: "USDC", lockAmount: "1", lockUnit: "days" }],
    ["lock 6 years (over max)", { token: "openai", amount: "5", payWith: "USDC", lockAmount: "6", lockUnit: "years" }],
  ] as const) {
    const res = await fetch(`${BASE}/api/actions/tip/${creator}?${new URLSearchParams(qs)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ account: fan.publicKey.toBase58() }),
    });
    const body = (await res.json()) as { message?: string };
    const ok = res.status === 400;
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"} reject ${label}: HTTP ${res.status} "${body.message}"`);
  }

  for (const c of CASES) {
    // Up to 3 POSTs (fresh Jupiter quote each): fork pool state diverges from the live state Jupiter routes against,
    // which surfaces as DLMM 6002 InvalidInput on some routes (see ../spike/README.md RESULTS #5).
    for (let attempt = 1; attempt <= 3; attempt++) {
      const r = await runCase(c, attempt);
      if (r === "ok") break;
      if (r === "fatal" || attempt === 3) failures++;
    }
  }
  console.log(failures === 0 ? "\nBLINK OK" : `\n${failures} failure(s)`);
  if (failures) process.exitCode = 1;
}

async function runCase(c: Case, attempt: number): Promise<"ok" | "retry" | "fatal"> {
  const res = await fetch(`${BASE}/api/actions/tip/${creator}?${new URLSearchParams(c.qs)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account: fan.publicKey.toBase58() }),
  });
  const body = (await res.json()) as { transaction?: string; message?: string };
  if (!res.ok || !body.transaction) {
    console.log(`FAIL ${c.label}: HTTP ${res.status} ${body.message}`);
    return "fatal";
  }
  const bytes = Buffer.from(body.transaction, "base64");
  const tx = VersionedTransaction.deserialize(bytes);
  const presigned = tx.signatures.filter((s) => s.some((b) => b !== 0)).length;
  tx.sign([fan]);
  const sim = await conn.simulateTransaction(tx, { sigVerify: true, replaceRecentBlockhash: false, commitment: "confirmed" });
  const warningOk = !c.locked || (body.message ?? "").includes(TESSERA_LOCK_WARNING);
  const ok = sim.value.err == null && warningOk && (c.locked ? presigned === 1 : presigned === 0);
  console.log(
    `${ok ? "PASS" : sim.value.err ? `RETRY(${attempt})` : "FAIL"} ${c.label}: ${bytes.length} B, signers=${tx.message.header.numRequiredSignatures} (server pre-signed ${presigned}), ` +
      `simulate(sigVerify:true) err=${JSON.stringify(sim.value.err)} CU=${sim.value.unitsConsumed}; Tessera warning in message: ${c.locked ? warningOk : "n/a"}`,
  );
  if (sim.value.err) console.log(`    logs: ${(sim.value.logs ?? []).filter((l) => /failed|Error/i.test(l)).slice(-3).join(" | ")}`);
  if (ok && c.locked) console.log(`    message: ${body.message}`);
  return ok ? "ok" : sim.value.err && warningOk ? "retry" : "fatal";
}

main().catch((e) => {
  console.error(`FATAL: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
