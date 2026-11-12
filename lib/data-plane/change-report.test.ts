import { readFileSync } from "node:fs";
import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import { buildChangeReport, DETAIL_HEADERS } from "./change-report";
import { toCsv } from "./csv";
import { buildExportTable, DEFAULT_EXPORT_OPTIONS } from "./export-table";
import { applyDecisions } from "./merge";
import { processCsv } from "./process";

const result = processCsv(readFileSync("tests/fixtures/export-changes.csv", "utf8"));
const merged = applyDecisions(result.parsed, result.duplicates, { "0:3": { action: "merge", fields: {} } });
const table = buildExportTable(result, merged, "salesforce", DEFAULT_EXPORT_OPTIONS, Infinity);
const report = buildChangeReport(table, result.parsed.headers);
const csv = toCsv(report.headers, report.rows);

describe("buildChangeReport", () => {
  it("starts with the summary counts", () => {
    expect(report.rows.slice(0, 10).map((r) => r.slice(0, 2))).toEqual([
      ["Rows in", "4"],
      ["Rows out", "3"],
      ["Merged groups", "1"],
      ["Capitalization fixed", "1"],
      ["Extra spaces removed", "2"],
      ["Email lower-cased", "2"],
      ["Phone in international format", "1"],
      ["Date as YYYY-MM-DD", "1"],
      ["Phone left as written (couldn't convert)", "1"],
      ["Date left as written (couldn't convert)", "1"],
    ]);
  });

  it("then lists each changed cell with its file column and before / after values", () => {
    const start = report.rows.findIndex((r) => r[0] === DETAIL_HEADERS[0]);
    expect(report.rows[start - 1]!.every((c) => c === "")).toBe(true);
    expect(report.rows.slice(start + 1, start + 3)).toEqual([
      ["1", "Full Name", "Capitalization fixed", "avery example", "Avery Example"],
      ["1", "Email", "Extra spaces removed; Email lower-cased", " AVERY@EXAMPLE.TEST ", "avery@example.test"],
    ]);
    expect(report.rows.at(-1)).toEqual(["3", "Email", "Email lower-cased", "Zoë@Example.test", "zoë@example.test"]);
    expect(report.rows).toHaveLength(10 + 1 + 1 + 8);
  });

  it("writes a rectangular CSV that round-trips multiline and unicode values", () => {
    const parsed = Papa.parse<string[]>(csv, { skipEmptyLines: false }).data;
    expect(parsed.every((r) => r.length === DETAIL_HEADERS.length)).toBe(true);
    expect(parsed.slice(1)).toEqual(report.rows);
    expect(csv).toContain('"  first line\r\nsecond line "');
    expect(csv).toContain("zoë@example.test");
  });

  it("is deterministic", () => {
    const again = buildChangeReport(
      buildExportTable(result, merged, "salesforce", DEFAULT_EXPORT_OPTIONS, Infinity),
      result.parsed.headers,
    );
    expect(toCsv(again.headers, again.rows)).toBe(csv);
  });

  it("names a blank header by its position", () => {
    const blank = processCsv("Email,\na@example.test, x \n");
    const t = buildExportTable(
      blank,
      applyDecisions(blank.parsed, [], {}),
      "pipedrive",
      DEFAULT_EXPORT_OPTIONS,
      Infinity,
    );
    expect(buildChangeReport(t, blank.parsed.headers).rows.at(-1)).toEqual([
      "1",
      "Column 2",
      "Extra spaces removed",
      " x ",
      "x",
    ]);
  });
});
