import { describe, expect, it } from "vitest";
import { groupBy } from "./group";

describe("groupBy", () => {
  it("groups in first-seen order and keeps item order", () => {
    expect(groupBy(["b1", "a1", "b2", "a2", "c1"], (s) => s[0]!)).toEqual([
      { key: "b", items: ["b1", "b2"] },
      { key: "a", items: ["a1", "a2"] },
      { key: "c", items: ["c1"] },
    ]);
  });

  it("returns nothing for no items", () => {
    expect(groupBy([], String)).toEqual([]);
  });
});
