import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { isExactMatch, pairKey, type Decisions, type FieldSide, type PairAction } from "@/lib/data-plane/merge";
import type { DuplicateCandidate, ParsedCsv } from "@/lib/data-plane/types";
import { DuplicateReview } from "./DuplicateReview";

const parsed: ParsedCsv = {
  headers: ["Name", "Email"],
  rows: [
    ["Avery Example", "avery@example.test"],
    ["avery example", "AVERY@EXAMPLE.TEST"],
    ["José Núñez", "jose@example.test"],
    ["Jose Nunez", ""],
  ],
  delimiter: ",",
  hadBom: false,
  issues: [],
};
const candidates: DuplicateCandidate[] = [
  { a: 0, b: 1, score: 100, matchedOn: ["email"] },
  { a: 2, b: 3, score: 91, matchedOn: ["name"] },
];

function Harness() {
  const [selected, setSelected] = useState(0);
  const [decisions, setDecisions] = useState<Decisions>({});
  const decide = (i: number, action: PairAction) =>
    setDecisions((d) => ({
      ...d,
      [pairKey(candidates[i]!)]: { action, fields: d[pairKey(candidates[i]!)]?.fields ?? {} },
    }));
  const choose = (i: number, col: number, side: FieldSide) =>
    setDecisions((d) => {
      const k = pairKey(candidates[i]!);
      return { ...d, [k]: { action: "merge", fields: { ...d[k]?.fields, [col]: side } } };
    });
  const mergeAll = () =>
    setDecisions((d) => {
      const next = { ...d };
      for (const c of candidates)
        if (isExactMatch(c) && !next[pairKey(c)]) next[pairKey(c)] = { action: "merge", fields: {} };
      return next;
    });
  return (
    <DuplicateReview
      parsed={parsed}
      candidates={candidates}
      selected={selected}
      onSelect={setSelected}
      decisions={decisions}
      onDecide={decide}
      onChooseField={choose}
      onMergeAllExact={mergeAll}
    />
  );
}

describe("DuplicateReview", () => {
  it("records merge / keep decisions and tracks progress", async () => {
    render(<Harness />);
    expect(screen.getByTestId("review-progress")).toHaveTextContent("Reviewed 0 of 2 · 0 to merge");
    expect(screen.getByTestId("pair-status")).toHaveTextContent("Not reviewed");

    await userEvent.click(screen.getByRole("button", { name: "Merge" }));
    expect(screen.getByTestId("pair-status")).toHaveTextContent("Will merge");
    expect(screen.getByRole("button", { name: "Merge" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await userEvent.click(screen.getByRole("button", { name: "Keep separate" }));
    expect(screen.getByTestId("pair-status")).toHaveTextContent("Keeping both");
    expect(screen.getByTestId("review-progress")).toHaveTextContent("Reviewed 2 of 2 · 1 to merge");
  });

  it("picking a field value marks the pair as merge", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByLabelText("Use Row 2 value for Name"));
    expect(screen.getByTestId("pair-status")).toHaveTextContent("Will merge");
    expect(screen.getByLabelText("Use Row 2 value for Name")).toBeChecked();
  });

  it("merges all exact matches in one click", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: /Merge all exact matches \(1\)/ }));
    expect(screen.getByTestId("review-progress")).toHaveTextContent("Reviewed 1 of 2 · 1 to merge");
    expect(screen.queryByRole("button", { name: /Merge all exact/ })).toBeNull();
  });

  it("renders a read-only preview when no handlers are passed", () => {
    render(<DuplicateReview parsed={parsed} candidates={candidates} selected={0} onSelect={() => {}} />);
    expect(screen.queryByRole("button", { name: "Merge" })).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
  });
});
