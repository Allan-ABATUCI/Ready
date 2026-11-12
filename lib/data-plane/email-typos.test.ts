import { describe, expect, it } from "vitest";
import { COMMON_EMAIL_DOMAINS, editDistance, suggestEmailFix } from "./email-typos";

describe("editDistance", () => {
  it.each([
    ["gmail.com", "gmail.com", 0],
    ["gmial.com", "gmail.com", 1], // adjacent swap counts once
    ["gmal.com", "gmail.com", 1],
    ["gmaill.com", "gmail.com", 1],
    ["gnail.com", "gmail.com", 1],
    ["hotmial.co.uk", "hotmail.co.uk", 1],
    ["ab", "ba", 1],
    ["", "abc", 3],
    ["é", "e", 1], // code points, not UTF-16 units
    ["𝒶b", "b", 1],
  ])("%j ↔ %j = %i", (a, b, d) => {
    expect(editDistance(a, b)).toBe(d);
    expect(editDistance(b, a)).toBe(d);
  });
});

describe("suggestEmailFix", () => {
  it.each([
    ["avery@gmial.com", "avery@gmail.com"],
    ["avery@gmail.con", "avery@gmail.com"],
    ["avery@GMIAL.COM", "avery@gmail.com"],
    [" Zoë.Ångström@yaho.fr ", "Zoë.Ångström@yahoo.fr"],
    ["bo@hotmial.co.uk", "bo@hotmail.co.uk"],
    ["bo@outlookk.com", "bo@outlook.com"],
    ["bo@iclod.com", "bo@icloud.com"],
    ["bo@googlemial.cm", "bo@googlemail.com"], // two edits on a long domain
    ["a@b@gmial.com", "a@b@gmail.com"], // last "@" splits off the domain
  ])("%j → %j", (email, fixed) => expect(suggestEmailFix(email)).toBe(fixed));

  it.each([
    "avery@gmail.com",
    "avery@GMAIL.COM",
    "bo@ymail.com", // real lookalikes are left alone
    "bo@mail.com",
    "bo@gmx.com",
    "bo@me.com",
    "bo@live.fr",
    "bo@example.test",
    "bo@gmaiil.cm", // two edits on a short domain: too far
    "no-at-sign",
    "@gmial.com",
    "",
  ])("leaves %j alone", (email) => expect(suggestEmailFix(email)).toBeNull());

  it("never suggests a list domain for another list domain", () => {
    for (const d of COMMON_EMAIL_DOMAINS) expect(suggestEmailFix(`a@${d}`)).toBeNull();
  });

  it("breaks ties deterministically, towards the earlier list entry", () => {
    // One edit from both hotmail.de and hotmail.es.
    expect(suggestEmailFix("x@hotmail.e")).toBe("x@hotmail.de");
  });
});
