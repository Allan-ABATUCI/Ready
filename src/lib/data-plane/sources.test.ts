import { describe, expect, it } from "vitest";
import { describeRow, fileOfRow, rowOrigin, sourceFilesOf } from "./sources";
import type { RowSources } from "./types";

// Three files: rows 0–2, none, rows 3–4.
const sources: RowSources = { files: ["tradeshow.csv", "empty.csv", "Webinar.xlsx"], starts: [0, 3, 3] };

describe("row sources", () => {
  it("finds each row's file, skipping files with no rows", () => {
    expect([0, 1, 2, 3, 4].map((r) => fileOfRow(sources, r))).toEqual([0, 0, 0, 2, 2]);
  });

  it("numbers a row within its own file", () => {
    expect(rowOrigin(sources, 3)).toEqual({ line: 1, file: "Webinar.xlsx" });
    expect(describeRow(sources, 4)).toBe("Row 2 of Webinar.xlsx");
  });

  it("numbers rows of a single file as before", () => {
    expect(rowOrigin(undefined, 4)).toEqual({ line: 5, file: null });
    expect(describeRow(undefined, 0)).toBe("Row 1");
  });

  it("lists the files of a merged contact once each, in file order", () => {
    expect(sourceFilesOf(sources, [4, 1, 3])).toBe("tradeshow.csv; Webinar.xlsx");
    expect(sourceFilesOf(sources, [2])).toBe("tradeshow.csv");
  });
});
