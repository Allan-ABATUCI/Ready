import { describe, expect, it } from "vitest";
import { planColumns, projectRow } from "./crm-mapping";

describe("planColumns", () => {
  const headers = ["Full Name", "Email", "Phone", "Company", "Notes"];

  it("maps to HubSpot headers, splitting the full name", () => {
    const cols = planColumns(headers, "hubspot");
    expect(cols.map((c) => c.header)).toEqual([
      "First Name",
      "Last Name",
      "Email",
      "Phone Number",
      "Company Name",
      "Notes",
    ]);
    expect(projectRow(["Zoë Müller", "z@example.test", "+49 30 1234567", "Müller GmbH", "hi"], cols)).toEqual([
      "Zoë",
      "Müller",
      "z@example.test",
      "+49 30 1234567",
      "Müller GmbH",
      "hi",
    ]);
  });

  it("maps to Salesforce headers", () => {
    expect(planColumns(headers, "salesforce").map((c) => c.header)).toEqual([
      "First Name",
      "Last Name",
      "Email",
      "Phone",
      "Company",
      "Notes",
    ]);
  });

  it("maps to Pipedrive, joining first / last name columns", () => {
    const cols = planColumns(["first_name", "Last Name", "E-mail", "Organisation"], "pipedrive");
    expect(cols.map((c) => c.header)).toEqual(["Name", "Email", "Organization"]);
    expect(projectRow([" Bo ", "Sample", "bo@example.test", "Sample Holdings"], cols)[0]).toBe("Bo Sample");
    expect(projectRow(["", "Sample", "", ""], cols)[0]).toBe("Sample");
  });

  it("uses explicit first / last columns for split CRMs and passes the full name through", () => {
    const cols = planColumns(["Name", "First Name", "Last Name"], "hubspot");
    expect(cols.map((c) => c.header)).toEqual(["First Name", "Last Name", "Name"]);
  });

  it("suffixes pass-through headers that collide with CRM headers", () => {
    const cols = planColumns(["Email", "Work Email", "phone number", "Mobile"], "hubspot");
    // "Work Email" is a second email column; "phone number" is the phone; "Mobile" passes through.
    expect(cols.map((c) => c.header)).toEqual(["Email", "Phone Number", "Work Email", "Mobile"]);
    expect(planColumns(["Email", "email"], "hubspot").map((c) => c.header)).toEqual(["Email", "email (2)"]);
  });

  it("passes unknown files through unchanged", () => {
    expect(planColumns(["SKU", "Qty"], "salesforce").map((c) => c.header)).toEqual(["SKU", "Qty"]);
  });
});
