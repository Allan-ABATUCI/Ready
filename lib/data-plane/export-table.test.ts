import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildExportTable, DEFAULT_EXPORT_OPTIONS, type ExportOptions } from "./export-table";
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
      normalizePhones: false,
      defaultCountry: null,
    });
    expect(t.rows[1]).toEqual(["avery example", "AVERY@EXAMPLE.TEST", "", "Example Widgets Ltd."]);
    expect(t.rows[2]![2]).toBe("+44 20 7946 0000");
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

  it("writes phones in E.164 by default, keeping values it can't convert", () => {
    const t = buildExportTable(result, noMerges, "pipedrive", DEFAULT_EXPORT_OPTIONS);
    const phones = t.rows.map((r) => r[2]);
    expect(phones[2]).toBe("+442079460000");
    // 555-01xx numbers are fictional, so not valid: left exactly as written.
    expect(phones[0]).toBe("+1 (555) 010-0001");
  });

  describe("phone normalization", () => {
    const phones = processCsv("Name,Phone\nA,06 12 34 56 78\nB,0033 6 12 34 56 79\nC,+44 20 7946 0958\nD,\n");
    const unmerged = applyDecisions(phones.parsed, phones.duplicates, {});
    const exported = (opts: Partial<ExportOptions>) =>
      buildExportTable(phones, unmerged, "pipedrive", { ...DEFAULT_EXPORT_OPTIONS, ...opts }).rows.map((r) => r[1]);

    it("leaves national numbers alone when no default country is chosen", () => {
      expect(exported({})).toEqual(["06 12 34 56 78", "+33612345679", "+442079460958", ""]);
    });

    it("converts national numbers with the chosen default country", () => {
      expect(exported({ defaultCountry: "FR" })).toEqual(["+33612345678", "+33612345679", "+442079460958", ""]);
    });

    it("does nothing when switched off, even with a country", () => {
      expect(exported({ normalizePhones: false, defaultCountry: "FR" })).toEqual([
        "06 12 34 56 78",
        "0033 6 12 34 56 79",
        "+44 20 7946 0958",
        "",
      ]);
    });

    it("only touches the phone column", () => {
      const other = processCsv("Name,Reference\nA,06 12 34 56 78\n");
      const t = buildExportTable(other, applyDecisions(other.parsed, [], {}), "pipedrive", {
        ...DEFAULT_EXPORT_OPTIONS,
        defaultCountry: "FR",
      });
      expect(t.rows[0]).toEqual(["A", "06 12 34 56 78"]);
    });
  });

  it("is deterministic", () => {
    const a = buildExportTable(result, noMerges, "hubspot", DEFAULT_EXPORT_OPTIONS);
    expect(buildExportTable(result, noMerges, "hubspot", DEFAULT_EXPORT_OPTIONS)).toEqual(a);
  });
});
