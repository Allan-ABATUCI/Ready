import { describe, expect, it } from "vitest";
import type { Decisions } from "./merge";
import { listPairs, NO_FILTER, pairStatus, rowLabel } from "./review";
import type { DuplicateCandidate } from "./types";

const candidates: DuplicateCandidate[] = [
  { a: 0, b: 1, score: 100, matchedOn: ["email"] },
  { a: 2, b: 3, score: 100, matchedOn: ["phone"] },
  { a: 4, b: 5, score: 95, matchedOn: ["name", "company"] },
  { a: 6, b: 7, score: 90, matchedOn: ["email", "name"] },
];
const decisions: Decisions = {
  "0:1": { action: "keep_both", fields: {} },
  "4:5": { action: "merge", fields: {} },
};

describe("listPairs", () => {
  it("keeps candidate (score) order with no filter", () => {
    expect(listPairs(candidates, decisions, NO_FILTER, "score")).toEqual([0, 1, 2, 3]);
  });

  it("filters by matched field and by status, together", () => {
    expect(listPairs(candidates, decisions, { matchedOn: "email", status: null }, "score")).toEqual([0, 3]);
    expect(listPairs(candidates, decisions, { matchedOn: null, status: "undecided" }, "score")).toEqual([1, 3]);
    expect(listPairs(candidates, decisions, { matchedOn: "email", status: "undecided" }, "score")).toEqual([3]);
    expect(listPairs(candidates, decisions, { matchedOn: "company", status: "keep_both" }, "score")).toEqual([]);
  });

  it("sorts by status (not reviewed, merge, keep) with ties in candidate order", () => {
    expect(listPairs(candidates, decisions, NO_FILTER, "status")).toEqual([1, 3, 2, 0]);
  });

  it("is deterministic and doesn't mutate its input", () => {
    const copy = structuredClone(candidates);
    expect(listPairs(candidates, decisions, NO_FILTER, "status")).toEqual(
      listPairs(candidates, decisions, NO_FILTER, "status"),
    );
    expect(candidates).toEqual(copy);
  });
});

describe("pairStatus", () => {
  it("reads the decision, or undecided", () => {
    expect(candidates.map((c) => pairStatus(c, decisions))).toEqual(["keep_both", "undecided", "merge", "undecided"]);
  });
});

describe("rowLabel", () => {
  it("uses the full name, then first + last name, then the row number", () => {
    expect(rowLabel(["Zoë Ångström", "x"], 0, { name: 0 })).toBe("Zoë Ångström");
    expect(rowLabel(["  ", "Renée", "O'Hara"], 0, { name: 0, firstName: 1, lastName: 2 })).toBe("Renée O'Hara");
    expect(rowLabel(["", "", ""], 4, { name: 0, firstName: 1, lastName: 2 })).toBe("Row 5");
    expect(rowLabel(["x"], 9, {})).toBe("Row 10");
    expect(rowLabel(undefined, 0, { name: 0 })).toBe("Row 1");
  });
});
