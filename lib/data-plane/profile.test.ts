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
