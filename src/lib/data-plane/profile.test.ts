import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";
import { profileColumns } from "./profile";

describe("profileColumns", () => {
  const parsed = parseCsv(readFileSync("tests/fixtures/contacts-duplicates.csv", "utf8"));
  const profile = profileColumns(parsed);

  it("computes fill rate, distinct count and pattern per column", () => {
    const byHeader = Object.fromEntries(profile.map((p) => [p.header, p]));
    expect(byHeader["Full Name"]).toMatchObject({ filled: 9, fillRate: 1, pattern: "text" });
    expect(byHeader["Email"]).toMatchObject({ filled: 6, pattern: "email", distinct: 6 });
    expect(byHeader["Phone"]).toMatchObject({ filled: 3, pattern: "phone", distinct: 2 });
  });

  it("marks fully empty columns and handles zero rows", () => {
    expect(profileColumns(parseCsv("a,b\n1,\n2,\n"))[1]).toMatchObject({ pattern: "empty", fillRate: 0 });
    expect(profileColumns(parseCsv("a\n"))[0]).toMatchObject({ pattern: "empty", fillRate: 0 });
  });
});

describe("date columns", () => {
  it("profiles local-format dates as dates, not phone numbers", () => {
    const parsed = parseCsv("Name,Signup\nA,31/12/2024\nB,12/31/2024\nC,2024-12-31\n");
    expect(profileColumns(parsed)[1]!.pattern).toBe("date");
  });

  it("still profiles real phone columns as phones", () => {
    const parsed = parseCsv("Phone\n+1 (555) 010-0001\n555-0100\n+44 20 7946 0958\n06 12 34 56 78\n");
    expect(profileColumns(parsed)[0]!.pattern).toBe("phone");
  });
});
