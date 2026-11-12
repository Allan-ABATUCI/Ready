import { describe, expect, it } from "vitest";
import { applyDecisions, defaultSide, isExactMatch, mergePair, pairKey, type Decisions } from "./merge";
import type { DuplicateCandidate, ParsedCsv } from "./types";

const parsed: ParsedCsv = {
  headers: ["Name", "Email", "Phone"],
  rows: [
    ["Zoë Müller", "zoe@example.test", ""],
    ["Bo Sample", "bo@example.test", "+44 20 7946 0000"],
    ["zoë müller", "", "+49 30 1234567"],
    ["Zoe Muller", "zoe.m@example.test", "+49 30 7654321"],
    ["Unrelated", "u@example.test", ""],
  ],
  delimiter: ",",
  hadBom: false,
  encoding: "utf-8",
  issues: [],
};

const pair = (a: number, b: number): DuplicateCandidate => ({ a, b, score: 95, matchedOn: ["name"] });
const candidates = [pair(0, 2), pair(2, 3), pair(1, 4)];

describe("isExactMatch", () => {
  it("accepts perfect email or name matches but not phone-only ones", () => {
    expect(isExactMatch({ score: 100, matchedOn: ["email"] })).toBe(true);
    expect(isExactMatch({ score: 100, matchedOn: ["email", "phone"] })).toBe(true);
    expect(isExactMatch({ score: 100, matchedOn: ["name", "company"] })).toBe(true);
    expect(isExactMatch({ score: 100, matchedOn: ["phone"] })).toBe(false);
    expect(isExactMatch({ score: 97, matchedOn: ["name"] })).toBe(false);
  });
});

describe("defaultSide / mergePair", () => {
  it("keeps A unless only B has a value", () => {
    expect(defaultSide("x", "y")).toBe("a");
    expect(defaultSide("", "y")).toBe("b");
    expect(defaultSide(" ", "")).toBe("a");
  });

  it("fills blanks from B and honours explicit picks", () => {
    expect(mergePair(parsed.rows[0]!, parsed.rows[2]!, {})).toEqual([
      "Zoë Müller",
      "zoe@example.test",
      "+49 30 1234567",
    ]);
    expect(mergePair(parsed.rows[0]!, parsed.rows[2]!, { 0: "b" })[0]).toBe("zoë müller");
  });

  it("lets an explicit pick choose an empty value", () => {
    expect(mergePair(parsed.rows[0]!, parsed.rows[2]!, { 2: "a" })[2]).toBe("");
  });
});

describe("applyDecisions", () => {
  it("keeps every row when nothing is decided", () => {
    const r = applyDecisions(parsed, candidates, {});
    expect(r.rows).toEqual(parsed.rows);
    expect(r.sourceRows).toEqual([0, 1, 2, 3, 4]);
    expect(r.removed).toEqual([]);
    expect(r.mergedGroups).toBe(0);
  });

  it("ignores keep_both decisions", () => {
    const d: Decisions = { [pairKey(pair(0, 2))]: { action: "keep_both", fields: {} } };
    expect(applyDecisions(parsed, candidates, d).rows).toHaveLength(5);
  });

  it("merges a pair into the earlier row, keeping its position", () => {
    const d: Decisions = { "0:2": { action: "merge", fields: {} } };
    const r = applyDecisions(parsed, candidates, d);
    expect(r.sourceRows).toEqual([0, 1, 3, 4]);
    expect(r.removed).toEqual([2]);
    expect(r.mergedGroups).toBe(1);
    expect(r.rows[0]).toEqual(["Zoë Müller", "zoe@example.test", "+49 30 1234567"]);
  });

  it("collapses transitive merges (A~B, B~C) into one record; later explicit picks win", () => {
    const d: Decisions = {
      "2:3": { action: "merge", fields: { 1: "b", 2: "b" } },
      "0:2": { action: "merge", fields: { 2: "b" } },
    };
    const r = applyDecisions(parsed, candidates, d);
    expect(r.sourceRows).toEqual([0, 1, 4]);
    expect(r.removed).toEqual([2, 3]);
    expect(r.mergedGroups).toBe(1);
    expect(r.rows[0]).toEqual(["Zoë Müller", "zoe.m@example.test", "+49 30 7654321"]);
  });

  it("does not mutate the input", () => {
    const before = JSON.stringify(parsed);
    applyDecisions(parsed, candidates, { "0:2": { action: "merge", fields: { 0: "b" } } });
    expect(JSON.stringify(parsed)).toBe(before);
  });

  it("is independent of candidate and decision order", () => {
    const d: Decisions = {
      "0:2": { action: "merge", fields: {} },
      "2:3": { action: "merge", fields: { 1: "b" } },
      "1:4": { action: "merge", fields: {} },
    };
    const a = applyDecisions(parsed, candidates, d);
    const reversed = Object.fromEntries(Object.entries(d).reverse());
    expect(applyDecisions(parsed, [...candidates].reverse(), reversed)).toEqual(a);
  });
});
