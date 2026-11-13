import { describe, expect, it } from "vitest";
import { joinName, splitName } from "./names";

describe("splitName", () => {
  it.each([
    ["Zoë Müller", ["Zoë", "Müller"]],
    ["  José  Núñez  García ", ["José", "Núñez  García"]],
    ["Ångström", ["Ångström", ""]],
    ["", ["", ""]],
  ] as const)("%j → %j", (input, expected) => expect(splitName(input)).toEqual(expected));
});

describe("joinName", () => {
  it.each([
    [" Bo ", "Sample", "Bo Sample"],
    ["", "Sample", "Sample"],
    ["Zoë", "", "Zoë"],
    ["", " ", ""],
  ])("(%j, %j) → %j", (first, last, expected) => expect(joinName(first, last)).toBe(expected));
});
