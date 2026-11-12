import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import type { DuplicateCandidate, ParsedCsv } from "@/lib/data-plane/types";
import { useReadyStore } from "@/lib/state/store";
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
  encoding: "utf-8",
  issues: [],
};
const candidates: DuplicateCandidate[] = [
  { a: 0, b: 1, score: 100, matchedOn: ["email"] },
  { a: 2, b: 3, score: 91, matchedOn: ["name"] },
];

/** Wires the component to the real store, so tests exercise the app's decision logic. */
function Harness() {
  const s = useReadyStore();
  return (
    <DuplicateReview
      parsed={parsed}
      candidates={candidates}
      selected={s.selectedCandidate}
      onSelect={s.selectCandidate}
      decisions={s.decisions}
      onDecide={s.decide}
      onChooseField={s.chooseField}
      onMergeAllExact={s.mergeAllExact}
    />
  );
}

beforeEach(() => {
  useReadyStore.getState().reset();
  useReadyStore.getState().finishProcessing({
    parsed,
    profile: [],
    roles: {},
    dateOrder: null,
    duplicates: candidates,
    skippedLargeBlocks: 0,
    cellIssues: [],
  });
});

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

  it("says when very common names weren't compared, and stays quiet otherwise", () => {
    const { rerender } = render(
      <DuplicateReview parsed={parsed} candidates={[]} selected={0} onSelect={() => {}} skippedLargeBlocks={250} />,
    );
    expect(screen.getByTestId("skipped-blocks")).toHaveTextContent("Some very common names weren't compared");
    rerender(<DuplicateReview parsed={parsed} candidates={[]} selected={0} onSelect={() => {}} />);
    expect(screen.queryByTestId("skipped-blocks")).not.toBeInTheDocument();
  });
});
