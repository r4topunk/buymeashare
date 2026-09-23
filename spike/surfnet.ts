// Surfpool (local mainnet fork) helpers via cheatcodes. Refuses to run against a non-local RPC.
//
// RPC_URL=http://127.0.0.1:8899 pnpm tsx surfnet.ts --fund                 (fan: 1 SOL + 10 USDC, creator: 0.05 SOL)
// RPC_URL=http://127.0.0.1:8899 pnpm tsx surfnet.ts --warp-seconds 130     (jump the clock forward)
// RPC_URL=http://127.0.0.1:8899 pnpm tsx surfnet.ts --status
import { parseArgs } from "node:util";
import { PublicKey } from "@solana/web3.js";
import { CREATOR_KEYPAIR_PATH, FAN_KEYPAIR_PATH, RPC_URL, USDC_MINT, connection, isLocalRpc, loadKeypair } from "./lib/config.js";

const { values } = parseArgs({
  options: {
    fund: { type: "boolean", default: false },
    "fan-sol": { type: "string", default: "1" },
    "fan-usdc": { type: "string", default: "10" },
    "creator-sol": { type: "string", default: "0.05" },
    "warp-seconds": { type: "string" },
    status: { type: "boolean", default: false },
  },
  strict: true,
});

async function rpc(method: string, params: unknown[]): Promise<any> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${JSON.stringify(body.error)}`);
  return body.result;
}

async function main() {
  if (!isLocalRpc()) throw new Error(`surfnet.ts only runs against a local surfnet; RPC_URL=${RPC_URL}`);
  const conn = connection();
  const fan = loadKeypair(FAN_KEYPAIR_PATH).publicKey;
  const creator = loadKeypair(CREATOR_KEYPAIR_PATH).publicKey;

  if (values.fund) {
    const lamports = (sol: string) => Math.round(Number(sol) * 1e9);
    await rpc("surfnet_setAccount", [fan.toBase58(), { lamports: lamports(values["fan-sol"]!) }]);
    await rpc("surfnet_setAccount", [creator.toBase58(), { lamports: lamports(values["creator-sol"]!) }]);
    await rpc("surfnet_setTokenAccount", [
      fan.toBase58(),
      USDC_MINT.toBase58(),
      { amount: Math.round(Number(values["fan-usdc"]) * 1e6) },
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    ]);
    console.log("funded via cheatcodes");
  }

  if (values["warp-seconds"]) {
    const slot = await conn.getSlot("processed");
    const now = (await conn.getBlockTime(slot)) ?? Math.floor(Date.now() / 1000);
    const target = (now + Number(values["warp-seconds"])) * 1000; // cheatcode takes MILLISECONDS
    const info = await rpc("surfnet_timeTravel", [{ absoluteTimestamp: target }]);
    const slot2 = await conn.getSlot("processed");
    console.log(`time travel: ${now} -> ${await conn.getBlockTime(slot2)} (slot ${slot} -> ${slot2}, epoch ${info.epoch})`);
  }

  if (values.status || values.fund) {
    for (const [label, pk] of [["fan", fan], ["creator", creator]] as [string, PublicKey][]) {
      const sol = (await conn.getBalance(pk, "processed")) / 1e9;
      const usdc = await conn.getParsedTokenAccountsByOwner(pk, { mint: USDC_MINT }).catch(() => null);
      const u = usdc?.value[0]?.account.data.parsed.info.tokenAmount.uiAmountString ?? "0";
      console.log(`${label.padEnd(8)} ${pk.toBase58()}  ${sol} SOL  ${u} USDC`);
    }
  }
}

main().catch((e) => {
  console.error(`FATAL: ${(e as Error).message}`);
  process.exitCode = 1;
});
