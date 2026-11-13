import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeCsvBytes, parseCsv, toCsv } from "./csv";

const fixture = (name: string) => readFileSync(`tests/fixtures/${name}`, "utf8");

describe("parseCsv", () => {
  it("strips a UTF-8 BOM, detects ';' and keeps quoted multiline fields", () => {
    const parsed = parseCsv(fixture("bom-semicolon.csv"));
    expect(parsed.hadBom).toBe(true);
    expect(parsed.delimiter).toBe(";");
    expect(parsed.headers).toEqual(["Full Name", "Email", "Notes"]);
    expect(parsed.rows[0]).toEqual(["Zoë Ångström", "zoe@example.test", "line one\r\nline two; with semicolon"]);
    expect(parsed.rows[1]).toEqual(["Renée O'Hara", "", ""]);
  });

  it.each([
    [",", "a,b\n1,2\n"],
    ["\t", "a\tb\n1\t2\n"],
    ["|", "a|b\n1|2\n"],
  ])("detects delimiter %j", (delim, text) => {
    const parsed = parseCsv(text);
    expect(parsed.delimiter).toBe(delim);
    expect(parsed.rows).toEqual([["1", "2"]]);
  });

  it("pads short rows and truncates long rows to the header width", () => {
    const parsed = parseCsv("a,b,c\n1\n1,2,3,4\n");
    expect(parsed.rows).toEqual([
      ["1", "", ""],
      ["1", "2", "3"],
    ]);
  });

  it("handles an empty file and a header-only file", () => {
    expect(parseCsv("")).toMatchObject({ headers: [], rows: [] });
    expect(parseCsv("a,b\n")).toMatchObject({ headers: ["a", "b"], rows: [] });
  });

  it("reports issues as codes only, never cell values", () => {
    const parsed = parseCsv('a,b\n"SECRET_VALUE,2\n');
    expect(parsed.issues.length).toBeGreaterThan(0);
    expect(JSON.stringify(parsed.issues)).not.toContain("SECRET_VALUE");
  });
});

describe("decodeCsvBytes", () => {
  it("reads valid UTF-8 as UTF-8 and keeps the BOM for parseCsv", () => {
    const bytes = new Uint8Array(readFileSync("tests/fixtures/bom-semicolon.csv"));
    const { text, encoding } = decodeCsvBytes(bytes);
    expect(encoding).toBe("utf-8");
    expect(parseCsv(text, encoding)).toMatchObject({ hadBom: true, encoding: "utf-8" });
  });

  it("falls back to Windows-1252 for Excel-saved files with accented names", () => {
    const bytes = new Uint8Array(readFileSync("tests/fixtures/windows-1252.csv"));
    const { text, encoding } = decodeCsvBytes(bytes);
    expect(encoding).toBe("windows-1252");
    const parsed = parseCsv(text, encoding);
    expect(parsed.encoding).toBe("windows-1252");
    expect(parsed.delimiter).toBe(";");
    expect(parsed.rows.map((r) => r[0])).toEqual(["Zoë Müller", "José Núñez", "Renée Ångström"]);
    expect(parsed.rows[2]![2]).toBe("Société Exemple");
  });

  it("decodes an empty file as UTF-8", () => {
    expect(decodeCsvBytes(new Uint8Array())).toEqual({ text: "", encoding: "utf-8" });
  });
});

describe("Excel sep= line", () => {
  it("strips the hint and uses its delimiter, even when another delimiter appears in the data", () => {
    const parsed = parseCsv(fixture("excel-sep.csv"));
    expect(parsed.delimiter).toBe(";");
    expect(parsed.headers).toEqual(["Full Name", "Email", "Notes"]);
    expect(parsed.rows).toEqual([
      ["Avery Example", "avery@example.test", "a, b and c"],
      ["Bo Sample", "bo@example.test", "semi; colon"],
    ]);
  });

  it.each([
    ["tab, after a BOM", "\uFEFFsep=\t\na\tb\n1\t2\n", "\t"],
    ["upper case, LF endings", "SEP=|\na|b\n1|2\n", "|"],
  ])("handles %s", (_label, text, delim) => {
    const parsed = parseCsv(text);
    expect(parsed.delimiter).toBe(delim);
    expect(parsed.headers).toEqual(["a", "b"]);
    expect(parsed.rows).toEqual([["1", "2"]]);
  });

  it("leaves a real first column called sep alone", () => {
    expect(parseCsv("sep=x,b\n1,2\n").headers).toEqual(["sep=x", "b"]);
  });
});

describe("toCsv", () => {
  it("round-trips quoting, commas, newlines and unicode", () => {
    const headers = ["Name", "Note"];
    const rows = [["Zoë, Jr.", 'says "hi"\nthere']];
    const out = toCsv(headers, rows);
    expect(out).toBe('Name,Note\r\n"Zoë, Jr.","says ""hi""\nthere"');
    expect(parseCsv(out).rows).toEqual(rows);
  });
});
