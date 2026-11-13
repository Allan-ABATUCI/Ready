import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { proposeMapping, type ColumnMapping, type TablePreview } from "@/lib/data-plane/combine";
import { ColumnMapper } from "./ColumnMapper";

const tables: TablePreview[] = [
  {
    name: "tradeshow.csv",
    headers: ["Email", "Phone", "Booth"],
    rowCount: 3,
    samples: [["amelie@example.test", "jonas@example.test"], ["555-0101"], ["B12"]],
  },
  { name: "webinar.xlsx", headers: ["E-mail", "Mobile"], rowCount: 1, samples: [["li.wei@example.test"], []] },
];

function Harness({ onConfirm = () => {}, onCancel = () => {} }: { onConfirm?: () => void; onCancel?: () => void }) {
  const [mapping, setMapping] = useState<ColumnMapping>(proposeMapping(tables));
  return (
    <>
      <ColumnMapper tables={tables} mapping={mapping} onChange={setMapping} onConfirm={onConfirm} onCancel={onCancel} />
      <output data-testid="mapping">{JSON.stringify(mapping)}</output>
    </>
  );
}
const mapping = () => JSON.parse(screen.getByTestId("mapping").textContent!) as ColumnMapping;

describe("ColumnMapper", () => {
  it("shows each file with its row count, and the proposed line-up with examples", () => {
    render(<Harness />);
    expect(screen.getByText(/combining 2 files \(4 rows\)/i)).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /webinar\.xlsx\s*1 row$/ })).toBeInTheDocument();
    const rows = screen.getAllByTestId("mapping-row");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByLabelText("Email: column from webinar.xlsx")).toHaveDisplayValue("E-mail");
    expect(within(rows[0]!).getByText("e.g. amelie@example.test, jonas@example.test")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("(empty)")).toBeInTheDocument(); // webinar's Mobile has no values
    expect(within(rows[2]!).getByLabelText("Booth: column from webinar.xlsx")).toHaveDisplayValue(
      "— not in this file —",
    );
  });

  it("lets the user take a column out, then add it back as its own column", async () => {
    render(<Harness />);
    await userEvent.selectOptions(screen.getByLabelText("Phone: column from webinar.xlsx"), "— not in this file —");
    const leftOut = screen.getByTestId("left-out-columns");
    expect(leftOut).toHaveTextContent("Mobile from webinar.xlsx");
    await userEvent.click(within(leftOut).getByRole("button", { name: "Add as its own column" }));
    expect(screen.queryByTestId("left-out-columns")).not.toBeInTheDocument();
    expect(mapping().at(-1)).toEqual({ header: "Mobile", sources: [null, 1] });
  });

  it("moves a column when it is picked for another combined column", async () => {
    render(<Harness />);
    await userEvent.selectOptions(screen.getByLabelText("Booth: column from webinar.xlsx"), "Mobile");
    expect(mapping()).toEqual([
      { header: "Email", sources: [0, 0] },
      { header: "Phone", sources: [1, null] },
      { header: "Booth", sources: [2, 1] },
    ]);
  });

  it("renames a combined column", async () => {
    render(<Harness />);
    const name = screen.getByLabelText("Name of combined column 3");
    await userEvent.clear(name);
    await userEvent.type(name, "Stand");
    expect(mapping()[2]!.header).toBe("Stand");
  });

  it("confirms or cancels", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<Harness onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: "Combine 2 files →" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
