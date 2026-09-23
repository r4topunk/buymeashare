import { Buffer } from "buffer";

/**
 * @solana/spl-token reads the global `Buffer` inside its instruction builders. Node has it; browsers do not.
 * Importing this module (side effect) installs Next's bundled polyfill once. Safe on the server.
 *
 * Next's bundled polyfill predates the BigInt methods (no writeBigUInt64LE / readBigUInt64LE), so u64/i64
 * fields go through DataView helpers below instead (verified in headless Chrome).
 */
const g = globalThis as { Buffer?: typeof Buffer };
g.Buffer ??= Buffer;

export { Buffer };

export function u64le(value: bigint): Buffer {
  const out = Buffer.alloc(8);
  new DataView(out.buffer, out.byteOffset, 8).setBigUint64(0, value, true);
  return out;
}

export function readU64le(data: Uint8Array, offset: number): bigint {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(offset, true);
}

export function readI64le(data: Uint8Array, offset: number): bigint {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getBigInt64(offset, true);
}
