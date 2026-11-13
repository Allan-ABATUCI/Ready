import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  addColumn,
  checkMapping,
  combineTables,
  leftOutColumns,
  MappingError,
  previewTable,
  proposeMapping,
  renameColumn,
  setSource,
  type ColumnMapping,
} from "./combine";
import { decodeCsvBytes, parseCsv } from "./csv";
import { processParsed } from "./process";
import type { ParsedCsv } from "./types";

const read = (name: string): { name: string; parsed: ParsedCsv } => {
  const { text, encoding } = decodeCsvBytes(new Uint8Array(readFileSync(`tests/fixtures/${name}`)));
  return { name, parsed: parseCsv(text, encoding) };
};
const tradeshow = read("multi-tradeshow.csv");
const webinar = read("multi-webinar.csv");
const tables = [tradeshow, webinar];
const previews = tables.map((t) => previewTable(t.name, t.parsed));
const headersOf = (m: ColumnMapping) => m.map((r) => r.header);

describe("previewTable", () => {
  it("lists headers, the row count and a few distinct non-blank examples per column", () => {
    const p = previewTable("x.csv", parseCsv("Name,Tag\nA,t\n,t\nB,t\nC,u\nD,v\n"));
    expect(p).toEqual({
      name: "x.csv",
      headers: ["Name", "Tag"],
      rowCount: 5,
      samples: [
        ["A", "B", "C"],
        ["t", "u", "v"],
      ],
    });
  });
});

describe("proposeMapping", () => {
  it("lines up columns by role when names differ, and keeps columns only one file has", () => {
    const m = proposeMapping(previews);
    expect(m).toEqual([
      { header: "First Name", sources: [0, 1] }, // Given name
      { header: "Last Name", sources: [1, 2] }, // Surname
      { header: "Email", sources: [2, 0] }, // E-mail
      { header: "Phone", sources: [3, 3] }, // Mobile
      { header: "Company", sources: [4, 4] }, // Organisation
      { header: "Booth", sources: [5, null] },
      { header: "Webinar", sources: [null, 5] },
    ]);
  });

  it("matches the same name ignoring case, accents and punctuation", () => {
    const m = proposeMapping([{ headers: ["Société", "Notes"] }, { headers: ["notes", "SOCIETE"] }]);
    expect(m).toEqual([
      { header: "Société", sources: [0, 1] },
      { header: "Notes", sources: [1, 0] },
    ]);
  });

  it("prefers an exact name over a role match", () => {
    // Both "Phone" and "Mobile" exist in the first file; the second file's "Mobile" goes with "Mobile".
    const m = proposeMapping([{ headers: ["Phone", "Mobile"] }, { headers: ["Mobile"] }]);
    expect(m).toEqual([
      { header: "Phone", sources: [0, null] },
      { header: "Mobile", sources: [1, 0] },
    ]);
  });

  it("never feeds two columns of one file into one combined column", () => {
    const m = proposeMapping([{ headers: ["Email"] }, { headers: ["Email", "email"] }]);
    expect(m).toEqual([
      { header: "Email", sources: [0, 0] },
      { header: "email", sources: [null, 1] },
    ]);
  });

  it("keeps blank headers as separate columns", () => {
    const m = proposeMapping([{ headers: ["", "A"] }, { headers: [""] }]);
    expect(headersOf(m)).toEqual(["", "A", ""]);
  });

  it("is deterministic", () => {
    expect(proposeMapping(previews)).toEqual(proposeMapping(previews));
  });
});

describe("editing a mapping", () => {
  const base = proposeMapping(previews);

  it("setSource moves a file column, and drops a combined column no file feeds any more", () => {
    // The webinar's "Webinar" column goes into "Booth": the "Webinar" row is now empty and goes.
    const m = setSource(base, 5, 1, 5);
    expect(m.at(-1)).toEqual({ header: "Booth", sources: [5, 5] });
    expect(headersOf(m)).not.toContain("Webinar");
  });

  it("setSource to null leaves the column out", () => {
    const m = setSource(base, 3, 1, null);
    expect(m[3]).toEqual({ header: "Phone", sources: [3, null] });
    expect(leftOutColumns(m, previews)).toEqual([{ file: 1, col: 3 }]);
  });

  it("addColumn gives a left-out column its own combined column, at the end", () => {
    const m = addColumn(setSource(base, 3, 1, null), previews, 1, 3);
    expect(m.at(-1)).toEqual({ header: "Mobile", sources: [null, 3] });
    expect(leftOutColumns(m, previews)).toEqual([]);
  });

  it("renameColumn changes only the header", () => {
    expect(renameColumn(base, 6, "Event")[6]).toEqual({ header: "Event", sources: [null, 5] });
  });

  it("does not change the mapping it is given", () => {
    const copy = structuredClone(base);
    setSource(base, 0, 0, 2);
    addColumn(base, previews, 0, 0);
    renameColumn(base, 0, "x");
    expect(base).toEqual(copy);
  });
});

describe("checkMapping", () => {
  const widths = [6, 6];
  it("accepts a proposed mapping", () => {
    expect(() => checkMapping(proposeMapping(previews), widths)).not.toThrow();
  });
  it.each<[string, ColumnMapping]>([
    ["no columns", []],
    ["only empty columns", [{ header: "A", sources: [null, null] }]],
    ["a column out of range", [{ header: "A", sources: [6, null] }]],
    ["a wrong number of files", [{ header: "A", sources: [0] }]],
    [
      "a file column used twice",
      [
        { header: "A", sources: [0, null] },
        { header: "B", sources: [0, null] },
      ],
    ],
  ])("rejects %s", (_, mapping) => {
    expect(() => checkMapping(mapping, widths)).toThrow(MappingError);
  });
});

describe("combineTables", () => {
  const combined = combineTables(tables, proposeMapping(previews));

  it("stacks rows in file order under the combined columns, blank where a file has no column", () => {
    expect(combined.headers).toEqual(["First Name", "Last Name", "Email", "Phone", "Company", "Booth", "Webinar"]);
    expect(combined.rows).toEqual([
      ["Amélie", "Durand", "amelie.durand@example.test", "+33 1 99 00 01 01", "Exemple SARL", "B12", ""],
      ["Jonas", "Berg", "jonas.berg@example.test", "555-0101", "Sample GmbH", "A3", ""],
      ["Priya", "Nair", "priya.nair@example.test", "555-0102", "Demo Ltd", "C7", ""],
      ["Jonas", "Berg", "JONAS.BERG@example.test", "555-0101", "Sample GmbH", "", "Data 101"],
      ["Wei", "Li", "li.wei@example.test", "555-0103", "Example Inc", "", "Data 101"],
    ]);
  });

  it("records which file each row came from", () => {
    expect(combined.sources).toEqual({ files: ["multi-tradeshow.csv", "multi-webinar.csv"], starts: [0, 3] });
  });

  it("finds duplicates across files", () => {
    const result = processParsed(combined);
    expect(result.duplicates.map((d) => [d.a, d.b])).toContainEqual([1, 3]);
  });

  it("keeps parse issues on their rows, offset to the combined table", () => {
    const broken = { name: "b.csv", parsed: parseCsv('A\n1\n"unterminated\n') };
    const ok = { name: "a.csv", parsed: parseCsv("A\n1\n2\n") };
    const out = combineTables([ok, broken], [{ header: "A", sources: [0, 0] }]);
    expect(broken.parsed.issues.length).toBeGreaterThan(0);
    expect(out.issues).toEqual(
      broken.parsed.issues.map((i) => ({ code: i.code, row: i.row === null ? null : i.row + 2 })),
    );
  });

  it("notes Windows-1252 and a BOM if any file had them, and a delimiter only if all agree", () => {
    const latin = { name: "l.csv", parsed: { ...parseCsv("A\n1\n"), encoding: "windows-1252" as const } };
    const bom = { name: "b.csv", parsed: parseCsv("﻿A;B\n1;2\n") };
    const out = combineTables([latin, bom], [{ header: "A", sources: [0, 0] }]);
    expect(out.encoding).toBe("windows-1252");
    expect(out.hadBom).toBe(true);
    expect(out.delimiter).toBe("");
    expect(combined.delimiter).toBe("");
    const same = combineTables([ok(), ok()], [{ header: "A", sources: [0, 0] }]);
    expect(same.delimiter).toBe(",");
  });

  it("handles a file with no rows, unicode values and empty cells", () => {
    const empty = { name: "empty.csv", parsed: parseCsv("Name,Email\n") };
    const other = { name: "o.csv", parsed: parseCsv("Email,Name\n,Zoë 王\n") };
    const out = combineTables([empty, other], proposeMapping([empty.parsed, other.parsed]));
    expect(out.rows).toEqual([["Zoë 王", ""]]);
    expect(out.sources).toEqual({ files: ["empty.csv", "o.csv"], starts: [0, 0] });
  });

  it("rejects a mapping that doesn't fit the files", () => {
    expect(() => combineTables(tables, [{ header: "A", sources: [99, null] }])).toThrow(MappingError);
  });
});

function ok() {
  return { name: "ok.csv", parsed: parseCsv("A,B\n1,2\n") };
}
