/**
 * Public key used to verify rule packs (ECDSA P-256, JWK). The matching private
 * key lives outside the repo (see scripts/rule-packs.mjs). If it is ever set to
 * null, `verifyRulePack` rejects every pack (fail closed).
 *
 * Rotating: generate a new key with `node scripts/rule-packs.mjs keygen`, paste
 * the printed public JWK here, then re-sign with `node scripts/rule-packs.mjs sign`.
 */
export const RULE_PACK_PUBLIC_KEY: JsonWebKey | null = {
  kty: "EC",
  crv: "P-256",
  x: "e-tehG_1efpRhb9Aak6EyXtShIiqKdcNoJusyGIbKJ0",
  y: "VCWJeUqNEL2WIxmFfoHI7BzH2OXEgI-bOWor5n-Mr14",
};
