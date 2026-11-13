import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CellIssue } from "@/lib/data-plane/types";
import { groupIssues, IssuesSummary } from "./IssuesSummary";

const headers = ["Name", "Email"];
const rows = [
  ["ACME TEST", "bad@"],
  ["Ok Name", "also bad"],
];
const issues: CellIssue[] = [
  { row: 0, col: 0, code: "inconsistent_case", suggestion: "Acme Test" },
  { row: 0, col: 1, code: "invalid_email" },
  { row: 1, col: 1, code: "invalid_email" },
];

describe("IssuesSummary", () => {
  it("groups issues by type and column with counts", () => {
    render(<IssuesSummary headers={headers} rows={rows} issues={issues} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Invalid email in Email · 2");
    expect(items[1]).toHaveTextContent("Inconsistent capitalization in Name · 1");
  });

  it("shows affected rows and suggestions when expanded", async () => {
    render(<IssuesSummary headers={headers} rows={rows} issues={issues} />);
    await userEvent.click(screen.getByText("Inconsistent capitalization"));
    const item = screen.getAllByRole("listitem")[1]!;
    expect(within(item).getByText("ACME TEST")).toBeInTheDocument();
    expect(within(item).getByText("Acme Test")).toBeInTheDocument();
  });

  it("says so when there are no issues", () => {
    render(<IssuesSummary headers={headers} rows={rows} issues={[]} />);
    expect(screen.getByText(/no formatting issues/i)).toBeInTheDocument();
  });

  it("orders groups deterministically", () => {
    expect(groupIssues([...issues].reverse()).map((g) => `${g.code}:${g.col}`)).toEqual([
      "invalid_email:1",
      "inconsistent_case:0",
    ]);
  });

  describe("ambiguous dates", () => {
    const dateRows = [["01/02/2024"], ["03/04/2024"]];
    const ambiguous: CellIssue[] = [
      { row: 0, col: 0, code: "ambiguous_date" },
      { row: 1, col: 0, code: "ambiguous_date" },
    ];

    it("lists them and asks how dates are written", async () => {
      const onDateOrder = vi.fn();
      render(<IssuesSummary headers={["Signup"]} rows={dateRows} issues={ambiguous} onDateOrder={onDateOrder} />);
      expect(screen.getByText("Date could be day/month or month/day")).toBeInTheDocument();
      const prompt = screen.getByTestId("ambiguous-dates");
      const select = within(prompt).getByLabelText("Dates are written as");
      expect(select).toHaveDisplayValue("Not sure");

      await userEvent.selectOptions(select, "Day/Month/Year");
      expect(onDateOrder).toHaveBeenCalledWith("dmy");
    });

    it("doesn't ask when there are none", () => {
      render(<IssuesSummary headers={headers} rows={rows} issues={issues} onDateOrder={() => {}} />);
      expect(screen.queryByTestId("ambiguous-dates")).not.toBeInTheDocument();
    });
  });

  describe("fixing cells", () => {
    it("is read-only without onEdit", () => {
      render(<IssuesSummary headers={headers} rows={rows} issues={issues} />);
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    });

    it("saves an edited value", async () => {
      const onEdit = vi.fn();
      render(<IssuesSummary headers={headers} rows={rows} issues={issues} onEdit={onEdit} />);
      const input = screen.getByLabelText("Fix row 2, Email");
      expect(input).toHaveValue("also bad");
      const save = within(input.closest("form")!).getByRole("button", { name: "Save" });
      expect(save).toBeDisabled(); // nothing changed yet

      await userEvent.clear(input);
      await userEvent.type(input, "zoë@example.test{Enter}");
      expect(onEdit).toHaveBeenLastCalledWith(1, 1, "zoë@example.test");
    });

    it("applies a suggestion in one click", async () => {
      const onEdit = vi.fn();
      render(<IssuesSummary headers={headers} rows={rows} issues={issues} onEdit={onEdit} />);
      await userEvent.click(screen.getByRole("button", { name: "Use suggestion" }));
      expect(onEdit).toHaveBeenCalledWith(0, 0, "Acme Test");
    });

    it("is disabled while busy, and resets the draft when the value changes", async () => {
      const { rerender } = render(
        <IssuesSummary headers={headers} rows={rows} issues={issues} onEdit={() => {}} busy />,
      );
      expect(screen.getByLabelText("Fix row 1, Email")).toBeDisabled();

      rerender(<IssuesSummary headers={headers} rows={rows} issues={issues} onEdit={() => {}} />);
      await userEvent.type(screen.getByLabelText("Fix row 1, Email"), "draft");
      const edited = [["ACME TEST", "now@example"], rows[1]!];
      rerender(<IssuesSummary headers={headers} rows={edited} issues={issues} onEdit={() => {}} />);
      expect(screen.getByLabelText("Fix row 1, Email")).toHaveValue("now@example");
    });
  });

  it("shows email typo suggestions with a one-click fix", async () => {
    const onEdit = vi.fn();
    render(
      <IssuesSummary
        headers={["Email"]}
        rows={[["avery@gmial.com"]]}
        issues={[{ row: 0, col: 0, code: "email_typo", suggestion: "avery@gmail.com" }]}
        onEdit={onEdit}
      />,
    );
    expect(screen.getByText("Possible typo in email domain")).toBeInTheDocument();
    expect(screen.getByText("avery@gmail.com")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Use suggestion" }));
    expect(onEdit).toHaveBeenCalledWith(0, 0, "avery@gmail.com");
  });
});
