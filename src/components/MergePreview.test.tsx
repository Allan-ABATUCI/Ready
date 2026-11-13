import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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

describe("MergePreview field picker", () => {
  it("offers a choice only for differing fields and shows the merged result", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const onChoose = vi.fn();
    const { rerender } = render(
      <MergePreview
        headers={["Name", "Email", "Phone"]}
        left={["Zoë Müller", "zoe@example.test", ""]}
        right={["zoë müller", "zoe@example.test", "+49 30 1234567"]}
        onChoose={onChoose}
      />,
    );
    const table = screen.getByTestId("merge-preview");
    expect(within(table).getAllByRole("radio")).toHaveLength(4);
    expect(within(table).getByRole("columnheader", { name: "Merged" })).toBeInTheDocument();

    // Default: keep A, fill A's blank phone from B.
    const merged = () =>
      within(table)
        .getAllByRole("row")
        .slice(1)
        .map((r) => r.lastElementChild?.textContent);
    expect(merged()).toEqual(["Zoë Müller", "zoe@example.test", "+49 30 1234567"]);
    expect(within(table).getByLabelText("Use Record B value for Phone")).toBeChecked();

    await userEvent.click(within(table).getByLabelText("Use Record B value for Name"));
    expect(onChoose).toHaveBeenCalledWith(0, "b");

    rerender(
      <MergePreview
        headers={["Name", "Email", "Phone"]}
        left={["Zoë Müller", "zoe@example.test", ""]}
        right={["zoë müller", "zoe@example.test", "+49 30 1234567"]}
        choices={{ 0: "b" }}
        onChoose={onChoose}
      />,
    );
    expect(merged()[0]).toBe("zoë müller");
  });

  it("is read-only without onChoose", () => {
    render(<MergePreview headers={["Name"]} left={["A"]} right={["a"]} />);
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Merged" })).toBeNull();
  });
});
