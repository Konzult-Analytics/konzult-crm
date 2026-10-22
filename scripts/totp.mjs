// Prints the current two-factor code for the dev test login (E2E_TEST_TOTP_SECRET
// in .env.local), so Claude can log in to localhost for browser checks.
// Usage: node scripts/totp.mjs
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const secret = env.match(/^E2E_TEST_TOTP_SECRET=(.*)$/m)?.[1];
if (!secret) throw new Error("E2E_TEST_TOTP_SECRET is missing from .env.local");

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const bits = [...secret.replace(/=+$/, "").toUpperCase()]
  .map((c) => alphabet.indexOf(c).toString(2).padStart(5, "0"))
  .join("");
const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));

const now = Math.floor(Date.now() / 1000);
const counter = Buffer.alloc(8);
counter.writeBigUInt64BE(BigInt(Math.floor(now / 30)));
const hmac = createHmac("sha1", key).update(counter).digest();
const offset = hmac[hmac.length - 1] & 0xf;
const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
console.log(`${String(code).padStart(6, "0")} (valid for ${30 - (now % 30)}s)`);
