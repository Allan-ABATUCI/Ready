import { describe, expect, it } from "vitest";
import type { RulePack } from "@/lib/rule-packs/types";
import { checkRequirements } from "./requirements";

const pack: RulePack = {
  crm: "salesforce",
  version: "1.0.0",
  requiredFields: ["Last Name", "Company"],
  formats: { Phone: "phone", Email: "email" },
};

describe("checkRequirements", () => {
  it("flags empty required cells and malformed formatted cells", () => {
    const table = {
      headers: ["First Name", "Last Name", "Email", "Phone", "Company"],
      rows: [
        ["Zoë", "Müller", "zoe@example.test", "+49 30 1234567", "Müller GmbH"],
        ["Bo", "", "bad@", "555-CALL-NOW", "  "],
        ["Ana", "Test", "", "", "Acme"],
      ],
    };
    expect(checkRequirements(table, pack)).toEqual([
      { row: 1, field: "Last Name", code: "missing_required" },
      { row: 1, field: "Company", code: "missing_required" },
      { row: 1, field: "Email", code: "invalid_format" },
      { row: 1, field: "Phone", code: "invalid_format" },
    ]);
  });

  it("reports a missing required column once", () => {
    const table = { headers: ["Email"], rows: [["a@example.test"], ["b@example.test"]] };
    expect(checkRequirements(table, pack)).toEqual([
      { row: null, field: "Last Name", code: "missing_column" },
      { row: null, field: "Company", code: "missing_column" },
    ]);
  });

  it("matches CRM headers case-insensitively", () => {
    const table = { headers: ["last name", "COMPANY"], rows: [["X", "Y"]] };
    expect(checkRequirements(table, pack)).toEqual([]);
  });
});
