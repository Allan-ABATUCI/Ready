import { describe, expect, it } from "vitest";
import { assignRole, detectKeyColumns, normalizeHeader } from "./columns";

describe("normalizeHeader", () => {
  it("folds accents, case, punctuation and spacing", () => {
    expect(normalizeHeader("  Tél. portable ")).toBe("tel portable");
    expect(normalizeHeader("Société")).toBe("societe");
    expect(normalizeHeader("E-Mail")).toBe("e mail");
    expect(normalizeHeader("Nom_de__famille")).toBe("nom de famille");
  });
});

describe("detectKeyColumns", () => {
  it("recognizes common header spellings", () => {
    expect(detectKeyColumns(["E-Mail", "first_name", "Last Name", "Organisation", "Mobile"])).toEqual({
      email: 0,
      firstName: 1,
      lastName: 2,
      company: 3,
      phone: 4,
    });
  });

  it("recognizes French headers with or without accents", () => {
    expect(detectKeyColumns(["Prénom", "Nom de famille", "Courriel", "Tél. portable", "Société"])).toEqual({
      firstName: 0,
      lastName: 1,
      email: 2,
      phone: 3,
      company: 4,
    });
    expect(detectKeyColumns(["NOM COMPLET", "Adresse e-mail", "Telephone", "Entreprise"])).toEqual({
      name: 0,
      email: 1,
      phone: 2,
      company: 3,
    });
    expect(detectKeyColumns(["Portable", "Organisation"])).toEqual({ phone: 0, company: 1 });
  });

  it('reads "nom" as the last name only when there is a first-name column, wherever it is', () => {
    expect(detectKeyColumns(["Nom", "Prénom"])).toEqual({ lastName: 0, firstName: 1 });
    expect(detectKeyColumns(["First Name", "Nom"])).toEqual({ firstName: 0, lastName: 1 });
    expect(detectKeyColumns(["Nom", "Courriel"])).toEqual({ name: 0, email: 1 });
  });

  it('does not let "nom" displace a column already playing that role', () => {
    expect(detectKeyColumns(["Nom complet", "Nom"])).toEqual({ name: 0 });
    expect(detectKeyColumns(["Prénom", "Last Name", "Nom"])).toEqual({ firstName: 0, lastName: 1 });
  });

  it("leaves unknown headers without a role", () => {
    expect(detectKeyColumns(["Primary Inbox", "Notes", ""])).toEqual({});
  });
});

describe("assignRole", () => {
  it("moves a role to a new column", () => {
    expect(assignRole({ email: 0, phone: 1 }, "email", 2)).toEqual({ email: 2, phone: 1 });
  });

  it("removes the column's previous role, keeping roles one-to-one", () => {
    expect(assignRole({ email: 0, phone: 1 }, "email", 1)).toEqual({ email: 1 });
  });

  it("clears a role with null", () => {
    expect(assignRole({ email: 0, phone: 1 }, "email", null)).toEqual({ phone: 1 });
  });

  it("does not mutate its input", () => {
    const roles = { email: 0 };
    assignRole(roles, "phone", 0);
    expect(roles).toEqual({ email: 0 });
  });
});
