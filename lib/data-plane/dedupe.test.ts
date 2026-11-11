import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectKeyColumns } from "./columns";
import { parseCsv } from "./csv";
import { findDuplicateCandidates } from "./dedupe";

const text = readFileSync("tests/fixtures/contacts-duplicates.csv", "utf8");

describe("detectKeyColumns", () => {
  it("recognizes common header spellings", () => {
    expect(detectKeyColumns(["E-Mail", "first_name", "Last Name", "Organisation", "Mobile"])).toEqual({
      email: 0,
      firstName: 1,
      lastName: 2,
      company: 3,
      phone: 4,
    });
  });
});

describe("findDuplicateCandidates", () => {
  const dupes = findDuplicateCandidates(parseCsv(text));
  const pairs = dupes.map((d) => [d.a, d.b]);

  it("matches case-insensitive email + fuzzy name/company", () => {
    expect(dupes.find((d) => d.a === 0 && d.b === 1)?.matchedOn).toEqual(["email", "name", "company"]);
  });

  it("matches identical normalized phone numbers across different formatting", () => {
    expect(dupes.find((d) => d.a === 2 && d.b === 3)?.matchedOn).toEqual(["phone"]);
  });

  it("matches unicode names case-insensitively without stripping non-ASCII", () => {
    expect(pairs).toContainEqual([6, 7]);
  });

  it("does not match unrelated rows", () => {
    expect(pairs.some(([a, b]) => a === 8 || b === 8)).toBe(false);
  });

  it("is deterministic: identical output across runs, sorted by score then index", () => {
    const again = findDuplicateCandidates(parseCsv(text));
    expect(again).toEqual(dupes);
    for (let i = 1; i < dupes.length; i++) {
      const p = dupes[i - 1]!;
      const c = dupes[i]!;
      expect(p.score > c.score || (p.score === c.score && (p.a < c.a || (p.a === c.a && p.b < c.b)))).toBe(true);
    }
  });

  it("uses first + last name when there is no full-name column", () => {
    const parsed = parseCsv("First Name,Last Name\nAvery,Example\navery,example\nBo,Sample\n");
    expect(findDuplicateCandidates(parsed).map((d) => [d.a, d.b])).toEqual([[0, 1]]);
  });

  it("returns nothing for files without key columns or with empty cells", () => {
    expect(findDuplicateCandidates(parseCsv("Foo,Bar\n1,2\n1,2\n"))).toEqual([]);
    expect(findDuplicateCandidates(parseCsv("Email,Phone\n,\n,\n"))).toEqual([]);
  });
});
