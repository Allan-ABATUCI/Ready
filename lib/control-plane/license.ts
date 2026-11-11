import "server-only";

export const LICENSE_KEY_RE = /^RDY(-[A-Z0-9]{5}){4}$/;

export type LicenseResult = { valid: true } | { valid: false; reason: "malformed" | "not_implemented" };

/** Placeholder: format check only. Real lookup lands with the billing/licensing story. */
export function verifyLicenseKey(key: string): LicenseResult {
  if (!LICENSE_KEY_RE.test(key)) return { valid: false, reason: "malformed" };
  return { valid: false, reason: "not_implemented" };
}
