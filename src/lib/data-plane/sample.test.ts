import { describe, expect, it } from "vitest";
import { processCsv } from "./process";
import { SAMPLE_CSV, sampleFile } from "./sample";

describe("sample file", () => {
  const result = processCsv(SAMPLE_CSV);
  const codes = new Set(result.cellIssues.map((i) => i.code));

  it("shows every kind of issue the app flags", () => {
    expect(result.parsed.rows).toHaveLength(12);
    for (const code of ["invalid_email", "email_typo", "invalid_phone", "invalid_date", "inconsistent_case"]) {
      expect(codes).toContain(code);
    }
  });

  it("has duplicates found by email, phone and name", () => {
    const fields = new Set(result.duplicates.flatMap((d) => d.matchedOn));
    expect(fields).toEqual(new Set(["email", "phone", "name", "company"]));
  });

  it("is only synthetic data", () => {
    const emails = result.parsed.rows.map((r) => r[2]).filter(Boolean);
    // example.test is reserved; the one gmial.com address is the deliberate typo.
    expect(emails.every((e) => /@@?example\.test$/i.test(e!) || e === "robin.sample@gmial.com")).toBe(true);
  });

  it("is a CSV File, like a dropped one", async () => {
    const file = sampleFile();
    expect(file.name).toBe("sample-contacts.csv");
    expect(await file.text()).toBe(SAMPLE_CSV);
  });
});
