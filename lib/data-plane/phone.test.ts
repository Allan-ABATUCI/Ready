import { describe, expect, it } from "vitest";
import { toE164 } from "./phone";

describe("toE164", () => {
  it.each([
    ["France, international", "+33 6 12 34 56 78", null, "+33612345678"],
    ["France, national", "06 12 34 56 78", "FR", "+33612345678"],
    ["France, with (0)", "+33 (0)6 12 34 56 78", null, "+33612345678"],
    ["UK, international", "+44 20 7946 0958", null, "+442079460958"],
    ["UK, national", "020 7946 0958", "GB", "+442079460958"],
    ["US, international", "+1 201-555-0123", null, "+12015550123"],
    ["US, national", "(201) 555-0123", "US", "+12015550123"],
    ["Japan, international", "+81 3-1234-5678", null, "+81312345678"],
    ["Japan, national", "03-1234-5678", "JP", "+81312345678"],
    ["00 prefix", "0033 6 12 34 56 78", null, "+33612345678"],
    ["00 prefix ignores the default country", "0044 20 7946 0958", "FR", "+442079460958"],
    ["+ ignores the default country", "+33 6 12 34 56 78", "US", "+33612345678"],
    ["surrounding spaces", "  +33 6 12 34 56 78  ", null, "+33612345678"],
  ] as const)("%s", (_label, value, country, expected) => {
    expect(toE164(value, country)).toBe(expected);
  });

  it.each([
    ["empty", "", "FR"],
    ["blank", "   ", "FR"],
    ["national number without a default country", "06 12 34 56 78", null],
    ["too short", "12345", "FR"],
    ["letters", "555-CALL-NOW", "US"],
    ["invalid area code", "+1 555 010 0001", null],
    ["has an extension, which E.164 can't hold", "+33 6 12 34 56 78 ext. 12", null],
  ] as const)("returns null (value left unchanged) when %s", (_label, value, country) => {
    expect(toE164(value, country)).toBeNull();
  });

  it("is deterministic", () => {
    const inputs = ["06 12 34 56 78", "+44 20 7946 0958", "nope", "03-1234-5678"];
    const run = () => inputs.map((v) => toE164(v, "FR"));
    expect(run()).toEqual(run());
  });
});
