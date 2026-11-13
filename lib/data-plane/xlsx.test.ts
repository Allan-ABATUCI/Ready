import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildXlsx } from "@/tests/support/xlsx";
import { handleRequest } from "./worker/handle";
import type { WorkerResponse } from "./worker/protocol";
import {
  columnIndex,
  decodeXml,
  isDateFormat,
  looksLikeXlsx,
  numberText,
  readXlsx,
  serialToIso,
  XlsxError,
} from "./xlsx";

describe("readXlsx", () => {
  it("reads the first sheet as text: strings, numbers and dates", () => {
    const bytes = buildXlsx([
      ["Full Name", "Email", "Phone", "Signup Date", "Score"],
      ["Zoë Müller", "zoe@example.test", 33612345678, { date: 45306 }, 0.30000000000000004],
      ["José <Núñez> & Co", null, "+44 20 7946 0958", { date: 45306.5 }, 12],
    ]);
    expect(readXlsx(bytes)).toEqual({
      headers: ["Full Name", "Email", "Phone", "Signup Date", "Score"],
      rows: [
        ["Zoë Müller", "zoe@example.test", "33612345678", "2024-01-15", "0.3"],
        ["José <Núñez> & Co", "", "+44 20 7946 0958", "2024-01-15 12:00", "12"],
      ],
    });
  });

  it("skips leading and blank rows, and trims empty trailing columns", () => {
    const bytes = buildXlsx([
      [],
      ["Name", "Email", null],
      [],
      ["Ana Test", "ana@example.test", null],
      [null, null, ""],
    ]);
    expect(readXlsx(bytes)).toEqual({ headers: ["Name", "Email"], rows: [["Ana Test", "ana@example.test"]] });
  });

  it("follows the workbook's relationships to the first sheet", () => {
    const bytes = buildXlsx([["Name"], ["Kai Fictional"]], { sheetPath: "worksheets/contacts.xml" });
    expect(readXlsx(bytes).rows).toEqual([["Kai Fictional"]]);
  });

  it("reads dates in the 1904 date system", () => {
    const bytes = buildXlsx([["Date"], [{ date: 0 }]], { date1904: true });
    expect(readXlsx(bytes).rows).toEqual([["1904-01-01"]]);
  });

  it("rejects a zip that isn't a workbook, and an empty workbook", () => {
    expect(() => readXlsx(zipSync({ "hello.txt": strToU8("hi") }))).toThrow(new XlsxError("xlsx_invalid"));
    expect(() => readXlsx(strToU8("PK\x03\x04 not really a zip"))).toThrow(new XlsxError("xlsx_invalid"));
    expect(() => readXlsx(buildXlsx([[], [null]]))).toThrow(new XlsxError("xlsx_empty"));
  });

  it("goes through the worker like a CSV, and reports codes only on failure", async () => {
    const run = async (bytes: Uint8Array, name: string) => {
      const out: WorkerResponse[] = [];
      await handleRequest({ type: "process", file: new File([bytes as BlobPart], name) }, (m) => out.push(m));
      return out.at(-1)!;
    };
    const ok = await run(
      buildXlsx([
        ["Email", "Name"],
        ["avery@example.test", "Avery Example"],
        ["AVERY@example.test", "avery example"],
      ]),
      // Told apart by content, so a misnamed workbook still reads.
      "contacts.csv",
    );
    expect(ok.type).toBe("processed");
    if (ok.type === "processed") expect(ok.result.duplicates).toHaveLength(1);
    expect(await run(zipSync({ "QUILLON.txt": strToU8("x") }), "x.xlsx")).toEqual({
      type: "error",
      code: "xlsx_invalid",
    });
  });
});

describe("xlsx helpers", () => {
  it("recognizes a zip by its signature", () => {
    expect(looksLikeXlsx(buildXlsx([["a"]]))).toBe(true);
    expect(looksLikeXlsx(strToU8("Name,Email"))).toBe(false);
  });

  it("decodes XML entities and Excel escapes", () => {
    expect(decodeXml("a &amp; b &lt;c&gt; &#233; &#x1F600; _x000D_")).toBe("a & b <c> é 😀 \r");
  });

  it("numbers columns like Excel", () => {
    expect([columnIndex("A1"), columnIndex("Z9"), columnIndex("AA10"), columnIndex("XFD1")]).toEqual([
      0, 25, 26, 16383,
    ]);
  });

  it.each([
    ["dd/mm/yyyy", true],
    ["m/d/yy h:mm", true],
    ["[$-409]mmmm d, yyyy", true],
    ['0.00" days"', false],
    ["#,##0.00", false],
    ["General", false],
    ['[Red]"Due"0', false],
  ])("format %s is a date: %s", (code, date) => {
    expect(isDateFormat(code)).toBe(date);
  });

  it("converts serials to ISO without depending on the time zone", () => {
    expect(serialToIso(1, false)).toBe("1900-01-01");
    expect(serialToIso(59, false)).toBe("1900-02-28");
    expect(serialToIso(61, false)).toBe("1900-03-01");
    expect(serialToIso(45351, false)).toBe("2024-02-29");
    expect(serialToIso(45351.75, false)).toBe("2024-02-29 18:00");
    expect(serialToIso(45351.999999, false)).toBe("2024-03-01"); // rounds to midnight
  });

  it("shows numbers without float noise", () => {
    expect(numberText("0.30000000000000004")).toBe("0.3");
    expect(numberText("33612345678")).toBe("33612345678");
    expect(numberText("1E+21")).toBe("1e+21");
  });
});
