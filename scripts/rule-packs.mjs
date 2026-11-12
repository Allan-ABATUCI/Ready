#!/usr/bin/env node
/**
 * Rule-pack signing tool (ECDSA P-256 / SHA-256, IEEE P1363 signatures — the
 * format lib/rule-packs/verify.ts expects).
 *
 *   node scripts/rule-packs.mjs keygen   # writes .keys/rule-pack.private.jwk, prints the public JWK
 *   node scripts/rule-packs.mjs sign     # rule-packs/src/*.json → rule-packs/signed/*.json
 *
 * The private key path can be overridden with RULE_PACK_PRIVATE_KEY. Never
 * commit the private key; only the public JWK goes in lib/rule-packs/public-key.ts.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const KEY_PATH = process.env.RULE_PACK_PRIVATE_KEY ?? path.join(ROOT, ".keys", "rule-pack.private.jwk");
const SRC = path.join(ROOT, "rule-packs", "src");
const OUT = path.join(ROOT, "rule-packs", "signed");
const ALGO = { name: "ECDSA", namedCurve: "P-256" };

async function keygen() {
  if (existsSync(KEY_PATH)) throw new Error(`${KEY_PATH} already exists; refusing to overwrite`);
  const { privateKey, publicKey } = await crypto.subtle.generateKey(ALGO, true, ["sign", "verify"]);
  mkdirSync(path.dirname(KEY_PATH), { recursive: true });
  writeFileSync(KEY_PATH, JSON.stringify(await crypto.subtle.exportKey("jwk", privateKey)), { mode: 0o600 });
  const { kty, crv, x, y } = await crypto.subtle.exportKey("jwk", publicKey);
  console.log(`Private key written to ${KEY_PATH}\nPublic JWK:\n${JSON.stringify({ kty, crv, x, y }, null, 2)}`);
}

async function sign() {
  const key = await crypto.subtle.importKey("jwk", JSON.parse(readFileSync(KEY_PATH, "utf8")), ALGO, false, ["sign"]);
  mkdirSync(OUT, { recursive: true });
  for (const file of readdirSync(SRC)
    .filter((f) => f.endsWith(".json"))
    .sort()) {
    // The payload is the exact signed string: compact JSON of the source pack.
    const payload = JSON.stringify(JSON.parse(readFileSync(path.join(SRC, file), "utf8")));
    const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(payload));
    const signed = { payload, signature: Buffer.from(sig).toString("base64") };
    writeFileSync(path.join(OUT, file), `${JSON.stringify(signed, null, 2)}\n`);
    console.log(`signed ${file}`);
  }
}

const commands = { keygen, sign };
const cmd = commands[process.argv[2]];
if (!cmd) {
  console.error("usage: node scripts/rule-packs.mjs <keygen|sign>");
  process.exit(1);
}
await cmd();
