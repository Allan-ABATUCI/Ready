import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildExportTable, DEFAULT_EXPORT_OPTIONS } from "./export-table";
import { applyDecisions } from "./merge";
import { processCsv } from "./process";

const text = readFileSync("tests/fixtures/contacts-duplicates.csv", "utf8");
const result = processCsv(text);
const noMerges = applyDecisions(result.parsed, result.duplicates, {});

describe("buildExportTable", () => {
  it("maps columns, fixes case, trims and lower-cases emails by default", () => {
    const t = buildExportTable(result, noMerges, "hubspot", DEFAULT_EXPORT_OPTIONS);
    expect(t.headers).toEqual(["First Name", "Last Name", "Email", "Phone Number", "Company Name"]);
    expect(t.rows).toHaveLength(9);
    // Row 2: "avery example" / "AVERY@EXAMPLE.TEST"
    expect(t.rows[1]).toEqual(["Avery", "Example", "avery@example.test", "", "Example Widgets Ltd."]);
    // Row 8: "zoë müller"
    expect(t.rows[7]!.slice(0, 2)).toEqual(["Zoë", "Müller"]);
  });

  it("leaves values alone when every option is off", () => {
    const t = buildExportTable(result, noMerges, "pipedrive", {
      trim: false,
      lowercaseEmails: false,
      fixCase: false,
    });
    expect(t.rows[1]).toEqual(["avery example", "AVERY@EXAMPLE.TEST", "", "Example Widgets Ltd."]);
  });

  it("applies merges and case fixes to merged values", () => {
    const avery = result.duplicates.find((c) => c.a === 0 && c.b === 1)!;
    const merged = applyDecisions(result.parsed, result.duplicates, {
      [`${avery.a}:${avery.b}`]: { action: "merge", fields: { 0: "b" } },
    });
    const t = buildExportTable(result, merged, "salesforce", DEFAULT_EXPORT_OPTIONS);
    expect(t.rows).toHaveLength(8);
    // Picked "avery example" from row 2; the case fix still applies after the merge.
    expect(t.rows[0]!.slice(0, 3)).toEqual(["Avery", "Example", "avery@example.test"]);
  });

  it("is deterministic", () => {
    const a = buildExportTable(result, noMerges, "hubspot", DEFAULT_EXPORT_OPTIONS);
    expect(buildExportTable(result, noMerges, "hubspot", DEFAULT_EXPORT_OPTIONS)).toEqual(a);
  });
});
