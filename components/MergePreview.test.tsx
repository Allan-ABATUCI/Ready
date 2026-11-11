import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MergePreview } from "./MergePreview";

describe("MergePreview", () => {
  it("renders both records side by side and flags differing fields", () => {
    render(
      <MergePreview
        headers={["Name", "Email", "Phone"]}
        left={["Avery Example", "avery@example.test", ""]}
        right={["avery example", "avery@example.test"]}
        leftLabel="Row 1"
        rightLabel="Row 2"
      />,
    );
    const table = screen.getByTestId("merge-preview");
    expect(within(table).getByRole("columnheader", { name: "Row 1" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Row 2" })).toBeInTheDocument();

    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => r.getAttribute("data-differs"))).toEqual(["true", "false", "false"]);
    expect(within(rows[0]!).getByText("avery example")).toBeInTheDocument();
  });
});
