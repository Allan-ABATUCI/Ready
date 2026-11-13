import { describe, expect, it } from "vitest";
import { applyOverrides, cellKey } from "./overrides";
import type { ParsedCsv } from "./types";

const parsed: ParsedCsv = {
  headers: ["Name", "Email"],
  rows: [
    ["Zoë Ångström", "bad@"],
    ["Bo Sample", "bo@example.test"],
  ],
  delimiter: ";",
  hadBom: true,
  encoding: "utf-8",
  issues: [],
};

describe("applyOverrides", () => {
  it("returns the file itself when nothing was edited", () => {
    expect(applyOverrides(parsed, {})).toBe(parsed);
  });

  it("applies edits, copying only edited rows and leaving the input untouched", () => {
    const before = structuredClone(parsed);
    const out = applyOverrides(parsed, { [cellKey(0, 1)]: "zoë@example.test", [cellKey(0, 0)]: "Zoë\nÅngström" });
    expect(out.rows).toEqual([
      ["Zoë\nÅngström", "zoë@example.test"],
      ["Bo Sample", "bo@example.test"],
    ]);
    expect(out.rows[1]).toBe(parsed.rows[1]);
    expect(out).toMatchObject({ headers: parsed.headers, delimiter: ";", hadBom: true });
    expect(parsed).toEqual(before);
  });

  it("allows clearing a cell, and ignores rows that don't exist", () => {
    expect(applyOverrides(parsed, { "1:1": "", "9:0": "x" }).rows).toEqual([parsed.rows[0], ["Bo Sample", ""]]);
  });

  it("doesn't depend on the order of edits", () => {
    const a = applyOverrides(parsed, { "0:0": "A", "1:1": "B" });
    const b = applyOverrides(parsed, { "1:1": "B", "0:0": "A" });
    expect(a).toEqual(b);
  });
});
