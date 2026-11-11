import "client-only";

export type KeyColumn = "email" | "phone" | "name" | "firstName" | "lastName" | "company";

const ALIASES: Record<KeyColumn, string[]> = {
  email: ["email", "e mail", "email address", "work email"],
  phone: ["phone", "phone number", "mobile", "mobile phone", "telephone", "tel"],
  name: ["name", "full name", "contact name", "contact"],
  firstName: ["first name", "firstname", "given name"],
  lastName: ["last name", "lastname", "surname", "family name"],
  company: ["company", "company name", "organization", "organisation", "account", "account name"],
};

export function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ");
}

/** Map well-known columns to their index (first match wins, left to right). */
export function detectKeyColumns(headers: string[]): Partial<Record<KeyColumn, number>> {
  const found: Partial<Record<KeyColumn, number>> = {};
  headers.forEach((raw, idx) => {
    const h = normalizeHeader(raw);
    for (const key of Object.keys(ALIASES) as KeyColumn[]) {
      if (found[key] === undefined && ALIASES[key].includes(h)) found[key] = idx;
    }
  });
  return found;
}
