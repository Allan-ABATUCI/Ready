import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { processCsv } from "./process";

describe("processCsv", () => {
  it("returns parsed data, profile, duplicates and cell issues in one deterministic pass", () => {
    const text = readFileSync("tests/fixtures/contacts-duplicates.csv", "utf8");
    const a = processCsv(text);
    expect(a.parsed.rows).toHaveLength(9);
    expect(a.profile).toHaveLength(4);
    expect(a.duplicates.length).toBeGreaterThan(0);
    expect(Array.isArray(a.cellIssues)).toBe(true);
    expect(processCsv(text)).toEqual(a);
  });
});
