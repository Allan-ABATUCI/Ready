import { describe, expect, it } from "vitest";
import { detectKeyColumns } from "./columns";
import { compareWithReference } from "./crm-compare";
import { parseCsv } from "./csv";
import { handleRequest } from "./worker/handle";
import type { WorkerResponse } from "./worker/protocol";

const ours = parseCsv(
  [
    "Full Name,Email,Phone,Company",
    "Avery Example,avery@example.test,,Example Widgets",
    "Robin Sample,,+44 20 7946 0000,Sample Holdings",
    "Zoë Müller,,,Müller GmbH",
    "Brand New,new@example.test,,Fresh Co",
    "",
  ].join("\n"),
);
// A HubSpot-style export: split names, its own header names, different order.
const crm = parseCsv(
  [
    "Last Name,First Name,Email,Phone Number,Company Name",
    "Someone,Else,else@example.test,,Other Co",
    "Example,Avery,AVERY@EXAMPLE.TEST,,Example Widgets",
    "Sample,Robin,,02079460000,Sample Holdings",
    "Muller,Zoe,,,Müller GmbH",
    "Müller,Zoë,zoe@example.test,,Müller GmbH",
  ].join("\n"),
);
const roles = detectKeyColumns(ours.headers);

describe("compareWithReference", () => {
  it("finds rows already in the CRM by email, phone and name, using the CRM's own headers", () => {
    const result = compareWithReference(ours, roles, "GB", crm);
    expect(result.referenceRows).toBe(5);
    expect(result.referenceRoles).toEqual(["email", "phone", "firstName", "lastName", "company"]);
    expect(result.matches).toEqual([
      { row: 0, refRow: 1, refLabel: "Avery Example", score: 100, matchedOn: ["email", "name", "company"] },
      { row: 1, refRow: 2, refLabel: "Robin Sample", score: 100, matchedOn: ["phone", "name", "company"] },
      // Two CRM rows match Zoë equally well: the earlier one wins, every time.
      expect.objectContaining({ row: 2, refRow: 4, matchedOn: ["name", "company"] }),
    ]);
  });

  it("needs the default country to match a national number with an international one", () => {
    const robin = compareWithReference(ours, roles, null, crm).matches.find((m) => m.row === 1);
    // Still found by name and company, but not by phone.
    expect(robin?.matchedOn).toEqual(["name", "company"]);
  });

  it("finds nothing in an export without usable columns", () => {
    const notes = parseCsv("Note,Created\nCall back,2024-01-01\n");
    expect(compareWithReference(ours, roles, null, notes)).toEqual({
      matches: [],
      referenceRows: 1,
      referenceRoles: [],
    });
  });

  it("runs in the worker and answers with codes only on failure", async () => {
    const run = async (file: File) => {
      const out: WorkerResponse[] = [];
      await handleRequest(
        { type: "compare", file, parsed: ours, inputs: { roles, dateOrder: null, defaultCountry: "GB" } },
        (m) => out.push(m),
      );
      return out.at(-1)!;
    };
    const csv = "Email\navery@example.test\n";
    const ok = await run(new File([csv], "crm.csv"));
    expect(ok.type === "compared" && ok.comparison.matches.map((m) => m.row)).toEqual([0]);
    expect(await run(new File([new Uint8Array([0x50, 0x4b, 3, 4, 9, 9])], "crm.xlsx"))).toEqual({
      type: "error",
      code: "xlsx_invalid",
    });
  });
});
