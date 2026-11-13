import "client-only";

export type KeyColumn = "email" | "phone" | "name" | "firstName" | "lastName" | "company";

/** The column index playing each role. A role has at most one column, a column at most one role. */
export type ColumnRoles = Partial<Record<KeyColumn, number>>;

/** Display order for role pickers; also the order roles are matched in. */
export const KEY_COLUMNS: KeyColumn[] = ["email", "phone", "name", "firstName", "lastName", "company"];

/** Aliases in `normalizeHeader` form: lower case, no accents, single spaces. */
const ALIASES: Record<KeyColumn, string[]> = {
  email: ["email", "e mail", "email address", "work email", "courriel", "adresse email", "adresse e mail"],
  phone: [
    "phone",
    "phone number",
    "mobile",
    "mobile phone",
    "telephone",
    "tel",
    "portable",
    "tel portable",
    "telephone portable",
  ],
  name: ["name", "full name", "contact name", "contact", "nom complet"],
  firstName: ["first name", "firstname", "given name", "prenom"],
  lastName: ["last name", "lastname", "surname", "family name", "nom de famille"],
  company: [
    "company",
    "company name",
    "organization",
    "organisation",
    "account",
    "account name",
    "societe",
    "entreprise",
  ],
};

/** "Tél. portable" → "tel portable". Accents are folded so "Société" matches "societe". */
export function normalizeHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Map well-known columns to their index (first match wins, left to right). */
export function detectKeyColumns(headers: string[]): ColumnRoles {
  const found: ColumnRoles = {};
  const normalized = headers.map(normalizeHeader);
  normalized.forEach((h, idx) => {
    for (const key of KEY_COLUMNS) {
      if (found[key] === undefined && ALIASES[key].includes(h)) found[key] = idx;
    }
  });

  // French "nom" usually means the family name, but on its own it is the only
  // name column, so treat it as the full name. Decided after the main pass
  // because the "prénom" column may come after "nom".
  const nom = normalized.indexOf("nom");
  if (nom >= 0) {
    const role: KeyColumn = found.firstName !== undefined ? "lastName" : "name";
    if (found[role] === undefined) found[role] = nom;
  }
  return found;
}

/** True if `col` plays a role, i.e. its values are used to find duplicates. */
export function isRoleColumn(roles: ColumnRoles, col: number): boolean {
  return KEY_COLUMNS.some((k) => roles[k] === col);
}

/**
 * Give `role` to column `col` (or to no column when `col` is null). The role
 * leaves whichever column had it, and `col` loses any role it had, so both
 * stay one-to-one.
 */
export function assignRole(roles: ColumnRoles, role: KeyColumn, col: number | null): ColumnRoles {
  const next: ColumnRoles = {};
  for (const key of KEY_COLUMNS) {
    const c = roles[key];
    if (key !== role && c !== undefined && c !== col) next[key] = c;
  }
  if (col !== null) next[role] = col;
  return next;
}
