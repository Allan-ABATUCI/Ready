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
});
