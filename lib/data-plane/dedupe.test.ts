import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { syntheticContacts } from "@/tests/support/synthetic";
import { detectKeyColumns } from "./columns";
import { parseCsv } from "./csv";
import { findDuplicateCandidates as findWithRoles, keyRows, MAX_BLOCK, nameSignature, scorePair } from "./dedupe";
import { applyDecisions, pairKey } from "./merge";
import type { CountryCode } from "./phone";
import type { DuplicateCandidate, ParsedCsv } from "./types";

const text = readFileSync("tests/fixtures/contacts-duplicates.csv", "utf8");

/** Dedupe with the roles detected from the headers, as processCsv does by default. */
const findDuplicateCandidates = (parsed: ParsedCsv, country: CountryCode | null = null) =>
  findWithRoles(parsed, detectKeyColumns(parsed.headers), country);

/** The previous O(n²) implementation: the reference that blocking must reproduce. */
function naiveCandidates(parsed: ParsedCsv, country: CountryCode | null = null): DuplicateCandidate[] {
  const rows = keyRows(parsed, detectKeyColumns(parsed.headers), country);
  const out: DuplicateCandidate[] = [];
  for (let a = 0; a < rows.length; a++) {
    for (let b = a + 1; b < rows.length; b++) {
      const match = scorePair(rows[a]!, rows[b]!);
      if (match) out.push({ a, b, ...match });
    }
  }
  return out.sort((x, y) => y.score - x.score || x.a - y.a || x.b - y.b);
}

describe("nameSignature", () => {
  it("folds accents and case, keeps 3-character prefixes and sorts tokens", () => {
    expect(nameSignature("Zoë Müller")).toBe("mul zoe");
    expect(nameSignature("zoe muller")).toBe("mul zoe");
    expect(nameSignature("Muller Zoe")).toBe("mul zoe");
  });

  it("ignores one-letter tokens unless the name has nothing else", () => {
    expect(nameSignature("J. Robert Example")).toBe("exa rob");
    expect(nameSignature("J. K.")).toBe("j k");
    expect(nameSignature("--")).toBe("");
  });
});

describe("findDuplicateCandidates", () => {
  const { candidates: dupes } = findDuplicateCandidates(parseCsv(text));
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
    const again = findDuplicateCandidates(parseCsv(text)).candidates;
    expect(again).toEqual(dupes);
    for (let i = 1; i < dupes.length; i++) {
      const p = dupes[i - 1]!;
      const c = dupes[i]!;
      expect(p.score > c.score || (p.score === c.score && (p.a < c.a || (p.a === c.a && p.b < c.b)))).toBe(true);
    }
  });

  it("uses first + last name when there is no full-name column", () => {
    const parsed = parseCsv("First Name,Last Name\nAvery,Example\navery,example\nBo,Sample\n");
    expect(findDuplicateCandidates(parsed).candidates.map((d) => [d.a, d.b])).toEqual([[0, 1]]);
  });

  it("returns nothing for files without key columns or with empty cells", () => {
    expect(findDuplicateCandidates(parseCsv("Foo,Bar\n1,2\n1,2\n")).candidates).toEqual([]);
    expect(findDuplicateCandidates(parseCsv("Email,Phone\n,\n,\n")).candidates).toEqual([]);
  });
});

describe("blocking is equivalent to the pairwise scan", () => {
  const fixtures = readdirSync("tests/fixtures").filter((f) => f.endsWith(".csv"));

  it.each(fixtures)("on fixture %s", (name) => {
    const parsed = parseCsv(readFileSync(`tests/fixtures/${name}`, "utf8"));
    expect(findDuplicateCandidates(parsed)).toEqual({ candidates: naiveCandidates(parsed), skippedLargeBlocks: 0 });
  });

  it("on a 400-row synthetic file with injected near-duplicates", () => {
    const parsed = parseCsv(syntheticContacts({ rows: 400, seed: 42, dupRate: 0.15 }));
    const expected = naiveCandidates(parsed);
    expect(expected.length).toBeGreaterThan(30); // the generator really did inject duplicates
    expect(findDuplicateCandidates(parsed)).toEqual({ candidates: expected, skippedLargeBlocks: 0 });
  });
});

describe("phones across national and international formats", () => {
  const parsed = parseCsv(readFileSync("tests/fixtures/phones-mixed.csv", "utf8"));
  const pairsFor = (country: CountryCode | null) =>
    findDuplicateCandidates(parsed, country).candidates.map((c) => [c.a, c.b, c.matchedOn.join()]);

  it("matches only same-format numbers without a default country", () => {
    // "+33 6 12…" vs "06 12…" can't be compared without knowing the country.
    expect(pairsFor(null)).toEqual([]);
  });

  it("matches national numbers with international ones in the default country", () => {
    expect(pairsFor("FR")).toEqual([
      [0, 1, "phone"],
      [2, 3, "phone"],
    ]);
    // A UK national number isn't read as UK when the default is France.
    expect(pairsFor("GB")).toEqual([[4, 5, "phone"]]);
  });

  it("blocking still matches the pairwise scan with a country", () => {
    for (const country of ["FR", "GB"] as const) {
      expect(findDuplicateCandidates(parsed, country)).toEqual({
        candidates: naiveCandidates(parsed, country),
        skippedLargeBlocks: 0,
      });
    }
  });
});

describe("block-size guard", () => {
  it("links a large exact block as a star, and merging still collapses every row", () => {
    // Email only, so no name matches muddy the count.
    const parsed = parseCsv(["Email", ...Array<string>(300).fill("same@example.test")].join("\n"));
    const { candidates } = findDuplicateCandidates(parsed);

    expect(candidates).toHaveLength(299);
    expect(candidates.every((c) => c.a === 0 && c.matchedOn.join() === "email")).toBe(true);

    const decisions = Object.fromEntries(candidates.map((c) => [pairKey(c), { action: "merge" as const, fields: {} }]));
    expect(applyDecisions(parsed, candidates, decisions).rows).toHaveLength(1);
  });

  it("skips name blocks over MAX_BLOCK and reports how many rows were skipped", () => {
    const common = Array.from({ length: MAX_BLOCK + 1 }, () => "Avery Example");
    const parsed = parseCsv(["Full Name", ...common, "Bo Sample", "bo sample"].join("\n"));
    const { candidates, skippedLargeBlocks } = findDuplicateCandidates(parsed);
    expect(skippedLargeBlocks).toBe(MAX_BLOCK + 1);
    expect(candidates.map((c) => [c.a, c.b])).toEqual([[MAX_BLOCK + 1, MAX_BLOCK + 2]]);
  });
});

describe("performance", () => {
  // About 2.3 s alone; the budget leaves room for the rest of the suite running
  // in parallel. Order-of-magnitude regressions still fail here, and
  // e2e/performance.spec.ts times a 100,000-row file in a real browser.
  it("handles 20,000 rows with varied names in under 5 s", () => {
    const parsed = parseCsv(syntheticContacts({ rows: 20_000, seed: 7 }));
    const start = performance.now();
    const { candidates } = findDuplicateCandidates(parsed);
    const ms = performance.now() - start;
    expect(candidates.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(5000);
  });
});
