import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyze, checkIssues, processCsv } from "./process";

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

  it("uses the detected roles by default and returns them", () => {
    expect(processCsv("Courriel,Société\na@example.test,X\n").roles).toEqual({ email: 0, company: 1 });
  });

  it("uses explicit roles instead, which changes duplicates and issues", () => {
    // "Primary Inbox" isn't a known header, so by default nothing ties these rows together.
    const text = "Full Name,Primary Inbox\nAvery Example,avery@example.test\nAccounts Team,AVERY@example.test\n";
    const detected = processCsv(text);
    expect(detected.roles).toEqual({ name: 0 });
    expect(detected.duplicates).toEqual([]);

    const chosen = processCsv(text, { roles: { name: 0, email: 1 } });
    expect(chosen.roles).toEqual({ name: 0, email: 1 });
    expect(chosen.duplicates).toEqual([{ a: 0, b: 1, score: 100, matchedOn: ["email"] }]);
  });

  it("analyze() reruns only the role-dependent stages, matching a full run with the same roles", () => {
    const text =
      "Full Name,Desk Line,Org Label\nAvery Example,555-0100,ACME LTD\nFront Desk,(555) 0100,Sample Holdings\n";
    const first = processCsv(text);
    expect(first.duplicates).toEqual([]);
    expect(first.cellIssues).toEqual([]);

    const roles = { name: 0, phone: 1, company: 2 };
    const stages: string[] = [];
    const again = analyze(first.parsed, first.profile, { roles, dateOrder: null, defaultCountry: null }, (s) =>
      stages.push(s),
    );
    expect(stages).toEqual(["matching", "checking"]);
    const full = processCsv(text, { roles });
    expect(again).toEqual({
      duplicates: full.duplicates,
      skippedLargeBlocks: full.skippedLargeBlocks,
      cellIssues: full.cellIssues,
    });
    // Same phone once the column is a phone; ALL CAPS flagged once the column is a company.
    expect(again.duplicates).toEqual([{ a: 0, b: 1, score: 100, matchedOn: ["phone"] }]);
    expect(again.cellIssues).toEqual([{ row: 0, col: 2, code: "inconsistent_case", suggestion: "Acme Ltd" }]);
  });

  describe("date order", () => {
    const text = "Name;Signup\nA;01/02/2024\nB;31/12/2024\n";

    it("is detected from the date columns and returned", () => {
      const r = processCsv(text);
      expect(r.dateOrder).toBe("dmy");
      expect(r.cellIssues).toEqual([]);
    });

    it("is null when the values don't settle it, which flags ambiguous dates", () => {
      const r = processCsv("Name,Signup\nA,01/02/2024\nB,05/05/2024\n");
      expect(r.dateOrder).toBeNull();
      expect(r.cellIssues).toEqual([{ row: 0, col: 1, code: "ambiguous_date" }]);
    });

    it("can be set explicitly, and analyze() with it matches a full run", () => {
      const chosen = processCsv(text, { dateOrder: "mdy" });
      expect(chosen.dateOrder).toBe("mdy");
      expect(chosen.cellIssues).toEqual([{ row: 1, col: 1, code: "invalid_date" }]);
      const first = processCsv(text);
      const again = analyze(first.parsed, first.profile, { ...first, dateOrder: "mdy" });
      expect(again.cellIssues).toEqual(chosen.cellIssues);
      expect(again.duplicates).toEqual(first.duplicates); // dates never affect matching
    });

    it("ignores date-looking values outside date columns", () => {
      expect(processCsv("Name,Ref\nA,31/12/2024\nB,x\nC,y\n").dateOrder).toBeNull();
    });
  });

  it("checkIssues() re-checks issues alone, matching analyze()'s issues", () => {
    const r = processCsv("Name,Email,Signup\nAvery Example,bad@,2024-02-30\nAVERY EXAMPLE,bad@,2024-01-01\n");
    const stages: string[] = [];
    expect(checkIssues(r.parsed, r.profile, r, (s) => stages.push(s))).toEqual({ cellIssues: r.cellIssues });
    expect(stages).toEqual(["checking"]);
  });
});
