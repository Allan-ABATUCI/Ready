import { describe, expect, it } from "vitest";
import { detectDateOrder, isCalendarDate, looksLikeDate, parseDate, readDate } from "./dates";

describe("parseDate", () => {
  it.each([
    ["31/12/2024", "dmy", "2024-12-31"],
    ["12/31/2024", "mdy", "2024-12-31"],
    ["2024/12/31", "ymd", "2024-12-31"],
    ["1.2.2024", "dmy", "2024-02-01"],
    ["1.2.2024", "mdy", "2024-01-02"],
    ["05-03-2024", "dmy", "2024-03-05"],
    ["  31/12/2024 ", "dmy", "2024-12-31"],
    ["29/02/2024", "dmy", "2024-02-29"],
    ["29/02/2000", "dmy", "2000-02-29"],
    ["2024-1-5", "ymd", "2024-01-05"],
  ] as const)("%j as %s → %s", (value, order, iso) => expect(parseDate(value, order)).toBe(iso));

  it("reads a leading 4-digit year the same way under every order", () => {
    for (const order of ["dmy", "mdy", "ymd"] as const) expect(parseDate("2024-12-31", order)).toBe("2024-12-31");
  });

  it.each([
    ["29/02/2023", "dmy"], // not a leap year
    ["29/02/1900", "dmy"], // divisible by 100, not by 400
    ["31/04/2024", "dmy"], // April has 30 days
    ["12/31/2024", "dmy"], // no month 31
    ["31/12/2024", "mdy"],
    ["00/01/2024", "dmy"],
    ["31/12/24", "dmy"], // two-digit year: century unknown
    ["24/12/31", "ymd"],
    ["31/12/2024", "ymd"], // year-first order rejects day-first values
    ["31/12/2024 14:30", "dmy"], // time part: left as is
    ["2024-12-31T10:00", "ymd"],
    ["31/12-2024", "dmy"], // mixed separators
    ["٣١/١٢/٢٠٢٤", "dmy"], // Arabic-Indic digits
    ["３１/１２/２０２４", "dmy"], // full-width digits
    ["", "dmy"],
    ["31 Dec 2024", "dmy"],
    ["123/12/2024", "dmy"],
  ] as const)("rejects %j as %s", (value, order) => expect(parseDate(value, order)).toBeNull());
});

describe("isCalendarDate", () => {
  it("handles years before 100 like any other year", () => {
    expect(isCalendarDate(4, 2, 29)).toBe(true);
    expect(isCalendarDate(1, 2, 29)).toBe(false);
  });
});

describe("readDate", () => {
  it("is ambiguous only when the two readings differ, and only without an order", () => {
    expect(readDate("01/02/2024", null)).toEqual({ kind: "ambiguous" });
    expect(readDate("05/05/2024", null)).toEqual({ kind: "date", iso: "2024-05-05" });
    expect(readDate("31/12/2024", null)).toEqual({ kind: "date", iso: "2024-12-31" });
    expect(readDate("01/02/2024", "mdy")).toEqual({ kind: "date", iso: "2024-01-02" });
    expect(readDate("31/12/2024", "mdy")).toEqual({ kind: "invalid" });
    expect(readDate("nope", null)).toEqual({ kind: "invalid" });
  });
});

describe("looksLikeDate", () => {
  it.each(["31/12/2024", "12/31/2024", "2024-12-31", "1.2.2024"])("accepts %j", (v) =>
    expect(looksLikeDate(v)).toBe(true),
  );
  it.each(["+1 (555) 010-0001", "555-0100", "31/12/24", "2024", "", "32/13/2024"])("rejects %j", (v) =>
    expect(looksLikeDate(v)).toBe(false),
  );
});

describe("detectDateOrder", () => {
  it.each([
    [["01/02/2024", "31/12/2024"], "dmy"],
    [["01/02/2024", "12/31/2024"], "mdy"],
    [["2024-01-02", "2024-12-31"], "ymd"],
    [["2024-01-02", "31/12/2024", "not a date", ""], "dmy"],
    [["31/12/2024", "12/31/2024"], null], // conflicting
    [["01/02/2024", "03/04/2024"], null], // all ambiguous
    [["2024-01-02", "01/02/2024"], null], // year-first can't settle the day-first ones
    [["05/05/2024"], null], // reads the same either way: no evidence
    [[], null],
  ] as const)("%j → %s", (values, order) => expect(detectDateOrder(values)).toBe(order));

  it("doesn't depend on the order of values", () => {
    const values = ["01/02/2024", "13/02/2024", "2024-01-01", "x"];
    expect(detectDateOrder([...values].reverse())).toBe(detectDateOrder(values));
  });
});
