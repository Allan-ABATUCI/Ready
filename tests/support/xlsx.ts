import { strToU8, zipSync } from "fflate";

/** A cell for `buildXlsx`: text (shared string), a number, or a number shown as a date. */
export type TestCell = string | number | { date: number } | null;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const colName = (i: number): string =>
  i < 26 ? String.fromCharCode(65 + i) : colName(Math.floor(i / 26) - 1) + colName(i % 26);

/**
 * A minimal, valid .xlsx workbook built in memory from synthetic rows, the way
 * Excel lays one out: shared strings, a styles part with a date format (style 1),
 * and the sheet reached through the workbook's relationships.
 */
export function buildXlsx(
  rows: TestCell[][],
  { date1904 = false, sheetPath = "worksheets/sheet1.xml" } = {},
): Uint8Array {
  const shared: string[] = [];
  const sheetRows = rows
    .map((row, r) => {
      const cells = row
        .map((cell, c) => {
          const ref = `${colName(c)}${r + 1}`;
          if (cell === null) return "";
          if (typeof cell === "string") {
            shared.push(cell);
            return `<c r="${ref}" t="s"><v>${shared.length - 1}</v></c>`;
          }
          if (typeof cell === "number") return `<c r="${ref}"><v>${cell}</v></c>`;
          return `<c r="${ref}" s="1"><v>${cell.date}</v></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");

  return zipSync({
    "[Content_Types].xml": strToU8(
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${
        date1904 ? '<workbookPr date1904="1"/>' : ""
      }<sheets><sheet name="Contacts" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="worksheet" Target="${sheetPath}"/></Relationships>`,
    ),
    "xl/sharedStrings.xml": strToU8(
      `<?xml version="1.0"?><sst>${shared.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join("")}</sst>`,
    ),
    "xl/styles.xml": strToU8(
      '<?xml version="1.0"?><styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>' +
        '<cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164" applyNumberFormat="1"/></cellXfs></styleSheet>',
    ),
    [`xl/${sheetPath}`]: strToU8(`<?xml version="1.0"?><worksheet><sheetData>${sheetRows}</sheetData></worksheet>`),
  });
}
