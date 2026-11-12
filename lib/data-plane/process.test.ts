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

  it("reports stages in pipeline order", () => {
    const stages: string[] = [];
    processCsv("Email\na@example.test\n", { onStage: (s) => stages.push(s) });
    expect(stages).toEqual(["parsing", "profiling", "matching", "checking"]);
  });

  it("records the encoding it was given", () => {
    expect(processCsv("a\n1\n").parsed.encoding).toBe("utf-8");
    expect(processCsv("a\n1\n", { encoding: "windows-1252" }).parsed.encoding).toBe("windows-1252");
  });
});
