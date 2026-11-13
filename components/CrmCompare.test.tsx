import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { detectKeyColumns } from "@/lib/data-plane/columns";
import type { CrmComparison } from "@/lib/data-plane/crm-compare";
import { parseCsv } from "@/lib/data-plane/csv";
import { CrmCompare, type CrmCompareProps } from "./CrmCompare";

const parsed = parseCsv("Full Name,Email\nAvery Example,avery@example.test\nBrand New,new@example.test\n");
const comparison: CrmComparison = {
  matches: [{ row: 0, refRow: 3, refLabel: "Avery Example (CRM)", score: 100, matchedOn: ["email"] }],
  referenceRows: 120,
  referenceRoles: ["email", "firstName", "lastName"],
};

const setup = (props: Partial<CrmCompareProps> = {}) => {
  const all: CrmCompareProps = {
    parsed,
    roles: detectKeyColumns(parsed.headers),
    fileName: null,
    comparison: null,
    status: "idle",
    onFile: vi.fn(),
    onClear: vi.fn(),
    exclude: true,
    onExclude: vi.fn(),
    ...props,
  };
  render(<CrmCompare {...all} />);
  return all;
};

describe("CrmCompare", () => {
  it("takes a CRM export", async () => {
    const { onFile } = setup();
    const file = new File(["Email\n"], "crm.csv");
    await userEvent.upload(screen.getByTestId("crm-file-input"), file);
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it("lists rows already in the CRM, and lets the user keep them in the export", async () => {
    const { onExclude, onClear } = setup({ fileName: "crm.csv", comparison });
    expect(screen.getByTestId("crm-compare-status")).toHaveTextContent(
      "1 of 2 rows are already in your CRM (120 contacts, compared on email, first name, last name).",
    );
    expect(screen.getByTestId("crm-matches")).toHaveTextContent("Avery ExampleAvery Example (CRM)email");
    await userEvent.click(screen.getByLabelText("Leave them out of the export"));
    expect(onExclude).toHaveBeenCalledWith(false);
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onClear).toHaveBeenCalled();
  });

  it("says when the export has nothing to compare on, or can't be read", () => {
    setup({ fileName: "notes.csv", comparison: { matches: [], referenceRows: 3, referenceRoles: ["company"] } });
    expect(screen.getByTestId("crm-compare-status")).toHaveTextContent("couldn't find email, phone or name columns");
  });

  it("says when the export can't be read", () => {
    setup({ fileName: "bad.xlsx", status: "error" });
    expect(screen.getByTestId("crm-compare-status")).toHaveTextContent("couldn't read that CRM export");
  });
});
