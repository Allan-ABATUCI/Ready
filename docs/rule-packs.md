# Rule packs

A rule pack holds one CRM's import requirements: required fields and value formats. Packs are signed, and the browser rejects any pack whose signature doesn't verify.

## Where they live

| Path                                          | Contents                                                            |
| --------------------------------------------- | ------------------------------------------------------------------- |
| `rule-packs/src/<crm>.json`                   | Editable source for `hubspot`, `salesforce` and `pipedrive`         |
| `rule-packs/signed/<crm>.json`                | Signed copies `{ payload, signature }`, served by the API           |
| `src/lib/rule-packs/public-key.ts`            | Public key the browser verifies against (ECDSA P-256)               |
| `src/lib/control-plane/rule-pack-manifest.ts` | `DEFAULT_MANIFEST`: pack versions, used when Edge Config is not set |

## Change a pack

1. Edit `rule-packs/src/<crm>.json` and bump its `version`.
2. Bump the matching entry in `DEFAULT_MANIFEST`.
3. Re-sign:

   ```bash
   node scripts/rule-packs.mjs sign   # needs .keys/rule-pack.private.jwk or RULE_PACK_PRIVATE_KEY
   ```

`src/lib/rule-packs/bundled.test.ts` fails if a signed pack is stale or doesn't verify.

## Keys

The private key is never committed: `.keys/` is gitignored and excluded from the Docker image. To rotate it, run `node scripts/rule-packs.mjs keygen`, paste the printed public JWK into `src/lib/rule-packs/public-key.ts`, and re-sign every pack.
