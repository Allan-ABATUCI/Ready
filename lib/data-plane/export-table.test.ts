import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildExportTable, DEFAULT_EXPORT_OPTIONS, type ExportOptions } from "./export-table";
import { applyDecisions } from "./merge";
import type { CountryCode } from "./phone";
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
      isoDates: false,
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
    const text = "Name,Phone\nA,06 12 34 56 78\nB,0033 6 12 34 56 79\nC,+44 20 7946 0958\nD,\n";
    // The default country is an analysis input, shared with duplicate matching.
    const exported = (opts: Partial<ExportOptions>, defaultCountry: CountryCode | null = null) => {
      const phones = processCsv(text, { defaultCountry });
      const unmerged = applyDecisions(phones.parsed, phones.duplicates, {});
      return buildExportTable(phones, unmerged, "pipedrive", { ...DEFAULT_EXPORT_OPTIONS, ...opts }).rows.map(
        (r) => r[1],
      );
    };

    it("leaves national numbers alone when no default country is chosen", () => {
      expect(exported({})).toEqual(["06 12 34 56 78", "+33612345679", "+442079460958", ""]);
    });

    it("converts national numbers with the chosen default country", () => {
      expect(exported({}, "FR")).toEqual(["+33612345678", "+33612345679", "+442079460958", ""]);
    });

    it("does nothing when switched off, even with a country", () => {
      expect(exported({ normalizePhones: false }, "FR")).toEqual([
        "06 12 34 56 78",
        "0033 6 12 34 56 79",
        "+44 20 7946 0958",
        "",
      ]);
    });

    it("only touches the phone column", () => {
      const other = processCsv("Name,Reference\nA,06 12 34 56 78\n", { defaultCountry: "FR" });
      const t = buildExportTable(other, applyDecisions(other.parsed, [], {}), "pipedrive", DEFAULT_EXPORT_OPTIONS);
      expect(t.rows[0]).toEqual(["A", "06 12 34 56 78"]);
    });
  });

  it("is deterministic", () => {
    const a = buildExportTable(result, noMerges, "hubspot", DEFAULT_EXPORT_OPTIONS);
    expect(buildExportTable(result, noMerges, "hubspot", DEFAULT_EXPORT_OPTIONS)).toEqual(a);
  });

  describe("ISO dates", () => {
    const dates = processCsv("Name;Signup\nA;01/02/2024\nB;31/12/2024\nC;31/04/2024\nD;\nE;2024-03-05\n");
    const unmerged = applyDecisions(dates.parsed, dates.duplicates, {});
    const exported = (opts: Partial<ExportOptions>, dateOrder = dates.dateOrder) =>
      buildExportTable({ ...dates, dateOrder }, unmerged, "pipedrive", { ...DEFAULT_EXPORT_OPTIONS, ...opts }).rows.map(
        (r) => r[1],
      );

    it("writes dates as YYYY-MM-DD in the detected order by default, keeping invalid ones", () => {
      expect(dates.dateOrder).toBe("dmy");
      expect(exported({})).toEqual(["2024-02-01", "2024-12-31", "31/04/2024", "", "2024-03-05"]);
    });

    it("uses the chosen order, and keeps ambiguous values when there is none", () => {
      expect(exported({}, "mdy")).toEqual(["2024-01-02", "31/12/2024", "31/04/2024", "", "2024-03-05"]);
      expect(exported({}, null)).toEqual(["01/02/2024", "2024-12-31", "31/04/2024", "", "2024-03-05"]);
    });

    it("leaves dates alone when switched off", () => {
      expect(exported({ isoDates: false })).toEqual(["01/02/2024", "31/12/2024", "31/04/2024", "", "2024-03-05"]);
    });
  });

  describe("change tracking", () => {
    // Every change kind occurs at least once, plus one merge (rows 1 and 4 share an email).
    const changes = processCsv(readFileSync("tests/fixtures/export-changes.csv", "utf8"));
    const mergedAll = applyDecisions(changes.parsed, changes.duplicates, {
      "0:3": { action: "merge", fields: {} },
    });
    const build = (cellRows?: number) =>
      buildExportTable(changes, mergedAll, "hubspot", DEFAULT_EXPORT_OPTIONS, cellRows);

    it("counts every kind of change over the whole table, and rows in / out", () => {
      expect(build().changes).toEqual({
        counts: {
          case_fixed: 1,
          trimmed: 2,
          email_lowercased: 2,
          phone_e164: 1,
          date_iso: 1,
          phone_unchanged: 1,
          date_unchanged: 1,
        },
        rowsIn: 4,
        rowsOut: 3,
        mergedGroups: 1,
        cells: [],
      });
    });

    it("lists changed and unconverted cells, by output row and file column, for the rows asked", () => {
      const { cells } = build(Infinity).changes;
      expect(cells).toEqual([
        { row: 0, col: 0, kinds: ["case_fixed"], before: "avery example", after: "Avery Example" },
        {
          row: 0,
          col: 1,
          kinds: ["trimmed", "email_lowercased"],
          before: " AVERY@EXAMPLE.TEST ",
          after: "avery@example.test",
        },
        { row: 0, col: 2, kinds: ["phone_e164"], before: "+44 20 7946 0958", after: "+442079460958" },
        { row: 0, col: 4, kinds: ["date_iso"], before: "31/12/2024", after: "2024-12-31" },
        {
          row: 0,
          col: 5,
          kinds: ["trimmed"],
          before: "  first line\r\nsecond line ",
          after: "first line\r\nsecond line",
        },
        { row: 1, col: 2, kinds: ["phone_unchanged"], before: "555-0100", after: "555-0100" },
        { row: 1, col: 4, kinds: ["date_unchanged"], before: "31/04/2024", after: "31/04/2024" },
        { row: 2, col: 1, kinds: ["email_lowercased"], before: "Zoë@Example.test", after: "zoë@example.test" },
      ]);
      expect(build(1).changes.cells.every((c) => c.row === 0)).toBe(true);
      // Listing cells doesn't change the table or the counts.
      expect({ ...build(Infinity), changes: null }).toEqual({ ...build(), changes: null });
      expect(build(Infinity).changes.counts).toEqual(build().changes.counts);
    });

    it("records nothing when every option is off", () => {
      const off = buildExportTable(
        changes,
        mergedAll,
        "hubspot",
        {
          trim: false,
          lowercaseEmails: false,
          fixCase: false,
          normalizePhones: false,
          isoDates: false,
        },
        Infinity,
      ).changes;
      expect(Object.values(off.counts).every((n) => n === 0)).toBe(true);
      expect(off.cells).toEqual([]);
    });

    it("is deterministic", () => {
      expect(build(Infinity)).toEqual(build(Infinity));
    });
  });
});
