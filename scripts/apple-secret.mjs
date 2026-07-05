#!/usr/bin/env node
// Generate the Sign in with Apple client secret (an ES256 JWT) that Supabase's
// Apple provider wants in its "Secret Key" field. Pure Node — no dependencies;
// the .p8 private key never leaves your machine.
//
// Usage:
//   node scripts/apple-secret.mjs <AuthKey_XXXXXX.p8> <TEAM_ID> <KEY_ID> <SERVICES_ID>
// Example:
//   node scripts/apple-secret.mjs ~/Downloads/AuthKey_AB12CD34EF.p8 5X9ABCDE12 AB12CD34EF app.youreta.signin
//
// The output JWT is valid ~6 months (Apple's maximum) — regenerate and paste
// into Supabase again before it expires.
import { readFileSync } from "node:fs";
import { createPrivateKey, sign } from "node:crypto";

const [, , p8Path, teamId, keyId, clientId] = process.argv;
if (!p8Path || !teamId || !keyId || !clientId) {
  console.error(
    "Usage: node scripts/apple-secret.mjs <AuthKey.p8> <TEAM_ID> <KEY_ID> <SERVICES_ID>"
  );
  process.exit(1);
}

const b64url = (input) => Buffer.from(input).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const header = { alg: "ES256", kid: keyId, typ: "JWT" };
const payload = {
  iss: teamId,
  iat: now,
  exp: now + 15_776_000, // just under Apple's 6-month maximum
  aud: "https://appleid.apple.com",
  sub: clientId,
};

const signingInput = `${b64url(JSON.stringify(header))}.${b64url(
  JSON.stringify(payload)
)}`;
const key = createPrivateKey(readFileSync(p8Path, "utf8"));
const signature = sign("sha256", Buffer.from(signingInput), {
  key,
  dsaEncoding: "ieee-p1363",
});

console.log(`${signingInput}.${b64url(signature)}`);
console.error(
  `\n(valid until ${new Date((now + 15_776_000) * 1000).toDateString()} — regenerate before then)`
);
