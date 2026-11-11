/**
 * Public key used to verify rule packs (ECDSA P-256, JWK).
 * Null until the signing key is provisioned — `verifyRulePack` rejects every
 * pack while this is null (fail closed).
 */
export const RULE_PACK_PUBLIC_KEY: JsonWebKey | null = null;
