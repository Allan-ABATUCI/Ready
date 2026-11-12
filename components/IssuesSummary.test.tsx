import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
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
});
