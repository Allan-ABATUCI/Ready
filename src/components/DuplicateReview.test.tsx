import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ColumnRoles } from "@/lib/data-plane/columns";
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
  const result = s.result!;
  return (
    <DuplicateReview
      parsed={result.parsed}
      candidates={result.duplicates}
      roles={result.roles}
      selected={s.selectedCandidate}
      onSelect={s.selectCandidate}
      decisions={s.decisions}
      onDecide={s.decide}
      onChooseField={s.chooseField}
      onMergeAllExact={s.mergeAllExact}
      onDecideMany={s.decideMany}
      onUndo={s.undo}
      canUndo={s.history.length > 0}
    />
  );
}

function load(p: ParsedCsv, duplicates: DuplicateCandidate[], roles: ColumnRoles = {}) {
  useReadyStore.getState().reset();
  useReadyStore.getState().finishProcessing({
    parsed: p,
    profile: [],
    roles,
    dateOrder: null,
    defaultCountry: null,
    duplicates,
    skippedLargeBlocks: 0,
    cellIssues: [],
  });
}

beforeEach(() => load(parsed, candidates));

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

  it("names rows from the name column in the pair list", () => {
    load(parsed, candidates, { name: 0 });
    render(<Harness />);
    expect(screen.getByTestId("pair-list")).toHaveTextContent("Avery Example ↔ avery example");
    expect(screen.getByTestId("pair-list")).toHaveTextContent("José Núñez ↔ Jose Nunez");
  });
});

describe("DuplicateReview at scale", () => {
  // 120 synthetic pairs: every third matched on email, the rest on name.
  const many: ParsedCsv = {
    ...parsed,
    rows: Array.from({ length: 240 }, (_, i) => [`Person ${Math.floor(i / 2)}`, `p${i}@example.test`]),
  };
  const pairs: DuplicateCandidate[] = Array.from({ length: 120 }, (_, i) => ({
    a: 2 * i,
    b: 2 * i + 1,
    score: 100 - Math.floor(i / 10),
    matchedOn: i % 3 === 0 ? ["email"] : ["name"],
  }));
  const listText = () => screen.getByTestId("pair-list").textContent;
  const progress = () => screen.getByTestId("review-progress");

  beforeEach(() => load(many, pairs, { name: 0 }));
  afterEach(() => vi.restoreAllMocks());

  it("lists pairs 50 to a page", async () => {
    render(<Harness />);
    expect(within(screen.getByTestId("pair-list")).getAllByRole("row")).toHaveLength(1 + 50);
    expect(screen.getByTestId("pair-page")).toHaveTextContent("Page 1 of 3");
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByTestId("pair-page")).toHaveTextContent("Page 2 of 3");
    expect(listText()).toContain("Person 50 ↔ Person 50");
    expect(listText()).not.toContain("Person 49 ↔");
  });

  it("opens a pair from the list in the side-by-side view", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Person 7 ↔ Person 7" }));
    expect(screen.getByTestId("current-pair")).toHaveTextContent("Pair 8 of 120");
    expect(screen.getByTestId("merge-preview")).toHaveTextContent("p14@example.test");
  });

  it("filters by matched field and status, and returns to page 1", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    await userEvent.selectOptions(screen.getByLabelText("Matched on"), "Email");
    expect(screen.getByRole("button", { name: /Merge all shown \(40\)/ })).toBeInTheDocument();
    expect(screen.getByTestId("pair-page")).toHaveTextContent("Page 1 of 1");
    expect(listText()).toContain("Person 3 ↔ Person 3");
    expect(listText()).not.toContain("Person 1 ↔ Person 1");

    await userEvent.selectOptions(screen.getByLabelText("Status"), "Will merge");
    expect(screen.getByText("No pairs match these filters.")).toBeInTheDocument();
  });

  it("asks before a bulk action, applies it to every shown pair, and undoes it in one step", async () => {
    render(<Harness />);
    await userEvent.selectOptions(screen.getByLabelText("Matched on"), "Email");
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);

    await userEvent.click(screen.getByRole("button", { name: /Merge all shown/ }));
    expect(confirm).toHaveBeenLastCalledWith("Merge all 40 pairs shown?");
    expect(progress()).toHaveTextContent("Reviewed 0 of 120");

    await userEvent.click(screen.getByRole("button", { name: /Merge all shown/ }));
    expect(progress()).toHaveTextContent("Reviewed 40 of 120 · 40 to merge");

    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(progress()).toHaveTextContent("Reviewed 0 of 120");
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
  });

  it("supports keyboard shortcuts while the section has focus", async () => {
    render(<Harness />);
    screen.getByTestId("duplicate-review").focus();

    await userEvent.keyboard("m");
    expect(screen.getByTestId("pair-status")).toHaveTextContent("Will merge");
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByTestId("current-pair")).toHaveTextContent("Pair 2 of 120");
    await userEvent.keyboard("K");
    expect(screen.getByTestId("pair-status")).toHaveTextContent("Keeping both");
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByTestId("current-pair")).toHaveTextContent("Pair 1 of 120");
    expect(progress()).toHaveTextContent("Reviewed 2 of 120 · 1 to merge");

    await userEvent.keyboard("{Control>}z{/Control}");
    expect(progress()).toHaveTextContent("Reviewed 1 of 120 · 1 to merge");
    await userEvent.keyboard("{Meta>}z{/Meta}");
    expect(progress()).toHaveTextContent("Reviewed 0 of 120");
    expect(screen.getByTestId("shortcuts")).toHaveTextContent("M merge");
  });

  it("follows the filtered list and its pages when moving with the arrows", async () => {
    render(<Harness />);
    await userEvent.selectOptions(screen.getByLabelText("Status"), "Not reviewed");
    screen.getByTestId("duplicate-review").focus();
    // Deciding drops the pair from "Not reviewed"; → goes on to the next pair to review.
    await userEvent.keyboard("m{ArrowRight}");
    expect(screen.getByTestId("current-pair")).toHaveTextContent("Pair 2 of 120");

    for (let i = 0; i < 50; i++) await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByTestId("current-pair")).toHaveTextContent("Pair 52 of 120");
    expect(screen.getByTestId("pair-page")).toHaveTextContent("Page 2 of 3");
  });

  it("ignores shortcuts while focus is in a form field", async () => {
    render(<Harness />);
    const status = screen.getByLabelText("Status");
    status.focus();
    await userEvent.keyboard("m{ArrowRight}k");
    await userEvent.keyboard("{Control>}z{/Control}");
    expect(progress()).toHaveTextContent("Reviewed 0 of 120");
    expect(screen.getByTestId("current-pair")).toHaveTextContent("Pair 1 of 120");
  });
});

describe("DuplicateReview of combined files", () => {
  beforeEach(() =>
    load({ ...parsed, sources: { files: ["tradeshow.csv", "webinar.xlsx"], starts: [0, 1] } }, candidates, { name: 0 }),
  );

  it("says which file each contact is from, numbered as in that file", () => {
    render(<Harness />);
    const list = screen.getByTestId("pair-list");
    expect(
      within(list).getByRole("button", { name: "Avery Example (tradeshow.csv) ↔ avery example (webinar.xlsx)" }),
    ).toBeInTheDocument();
    const preview = screen.getByTestId("merge-preview");
    expect(within(preview).getByText("Row 1 of tradeshow.csv")).toBeInTheDocument();
    expect(within(preview).getByText("Row 1 of webinar.xlsx")).toBeInTheDocument();
  });
});
