import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectKeyColumns } from "./columns";
import { parseCsv } from "./csv";
import type { DateOrder } from "./dates";
import { findCellIssues, isSingleCase, titleCase } from "./issues";
import { profileColumns } from "./profile";

function issuesFor(text: string, dateOrder: DateOrder | null = null) {
  const parsed = parseCsv(text);
  return findCellIssues(parsed, profileColumns(parsed), detectKeyColumns(parsed.headers), dateOrder);
}

describe("titleCase", () => {
  it.each([
    ["ZOË MÜLLER", "Zoë Müller"],
    ["o'brien-smith", "O'Brien-Smith"],
    ["ÅNGSTRÖM", "Ångström"],
    ["  ", "  "],
  ])("%j → %j", (input, expected) => expect(titleCase(input)).toBe(expected));
});

describe("isSingleCase", () => {
  it.each(["ACME", "bo sample", "ZOË"])("flags %j", (v) => expect(isSingleCase(v)).toBe(true));
  it.each(["Acme Corp", "ACME corp", "A", "123", "", "McDonald"])("ignores %j", (v) =>
    expect(isSingleCase(v)).toBe(false),
  );
});

describe("findCellIssues", () => {
  const text = readFileSync("tests/fixtures/contacts-issues.csv", "utf8");
  const issues = issuesFor(text);

  it("flags malformed emails, phones and dates, ignoring empty cells", () => {
    expect(issues.filter((i) => i.code !== "inconsistent_case")).toEqual([
      { row: 1, col: 4, code: "invalid_date" },
      { row: 2, col: 1, code: "invalid_email" },
      { row: 2, col: 2, code: "invalid_phone" },
      { row: 3, col: 2, code: "invalid_phone" },
    ]);
  });

  it("accepts international phone formats", () => {
    const phoneRows = issues.filter((i) => i.code === "invalid_phone").map((i) => i.row);
    expect(phoneRows).not.toContain(0);
    expect(phoneRows).not.toContain(1);
    expect(phoneRows).not.toContain(4);
  });

  it("flags case variants and single-case proper nouns with a suggestion", () => {
    expect(issues.filter((i) => i.code === "inconsistent_case")).toEqual([
      { row: 1, col: 0, code: "inconsistent_case", suggestion: "Zoë Müller" },
      { row: 2, col: 0, code: "inconsistent_case", suggestion: "Bo Sample" },
      { row: 2, col: 3, code: "inconsistent_case", suggestion: "Acme Corp" },
      { row: 4, col: 5, code: "inconsistent_case", suggestion: "ok" },
    ]);
  });

  it("leaves quoted multiline cells intact and unflagged", () => {
    expect(issues.some((i) => i.row === 3 && i.col === 5)).toBe(false);
  });

  it("is deterministic and sorted by row, column, code", () => {
    expect(issuesFor(text)).toEqual(issues);
    const keys = issues.map((i) => [i.row, i.col]);
    expect(keys).toEqual([...keys].sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!));
  });

  it("works with semicolon-delimited files with a BOM", () => {
    const bom = issuesFor("﻿Name;Email\nACME TEST;bad-email\n");
    expect(bom).toEqual([
      { row: 0, col: 0, code: "inconsistent_case", suggestion: "Acme Test" },
      { row: 0, col: 1, code: "invalid_email" },
    ]);
  });

  it("never puts cell values in issue codes", () => {
    for (const i of issues) expect(i.code).toMatch(/^[a-z_]+$/);
  });

  it("returns nothing for an empty file", () => {
    expect(issuesFor("Name,Email\n")).toEqual([]);
  });

  describe("dates", () => {
    // Tab-delimited, with a BOM, an empty cell and a quoted multiline note.
    const dates =
      '\uFEFFName\tSignup\tNotes\nA\t01/02/2024\t"x\ny"\nB\t31/12/2024\t\nC\t\t\nD\t31/04/2024\t\nE\t2024-12-31\t\n';

    it("reads dates in the order the file settles, flagging impossible ones", () => {
      expect(issuesFor(dates, "dmy")).toEqual([{ row: 3, col: 1, code: "invalid_date" }]);
    });

    it("flags values that read two ways when no order is set", () => {
      expect(issuesFor(dates, null)).toEqual([
        { row: 0, col: 1, code: "ambiguous_date" },
        { row: 3, col: 1, code: "invalid_date" },
      ]);
    });

    it("lets an explicit order override what the values suggest", () => {
      // Month-first: 31/12/2024 is no longer a date; 01/02/2024 is January 2nd.
      expect(issuesFor(dates, "mdy")).toEqual([
        { row: 1, col: 1, code: "invalid_date" },
        { row: 3, col: 1, code: "invalid_date" },
      ]);
    });

    it("accepts only year-first dates under the year-first order", () => {
      expect(issuesFor(dates, "ymd").map((i) => i.row)).toEqual([0, 1, 3]);
    });
  });
});
