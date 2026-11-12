import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_EXPORT_OPTIONS, type ExportOptions } from "@/lib/data-plane/export-table";
import type { Decisions } from "@/lib/data-plane/merge";
import { processCsv } from "@/lib/data-plane/process";
import type { Crm } from "@/lib/rule-packs/types";
import { ExportPanel } from "./ExportPanel";

const result = processCsv("Full Name,Email\nAvery Example,AVERY@example.test\navery example,avery@example.test\n");

function Harness({
  download,
  decisions = {},
}: {
  download: (filename: string, headers: string[], rows: string[][]) => void;
  decisions?: Decisions;
}) {
  const [crm, setCrm] = useState<Crm | null>(null);
  const [options, setOptions] = useState<ExportOptions>(DEFAULT_EXPORT_OPTIONS);
  return (
    <ExportPanel
      result={result}
      decisions={decisions}
      crm={crm}
      options={options}
      onCrm={setCrm}
      onOption={(k, v) => setOptions((o) => ({ ...o, [k]: v }))}
      download={download}
    />
  );
}

describe("ExportPanel", () => {
  it("requires a CRM before downloading", async () => {
    const download = vi.fn();
    render(<Harness download={download} />);
    const button = screen.getByRole("button", { name: "Download CSV" });
    expect(button).toBeDisabled();
    expect(screen.getByText("Pick a CRM first.")).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("HubSpot"));
    expect(button).toBeEnabled();
    expect(screen.getByTestId("export-summary")).toHaveTextContent(
      "2 rows → 2 after merging · columns: First Name, Last Name, Email",
    );
    await userEvent.click(button);
    expect(download).toHaveBeenCalledExactlyOnceWith(
      "ready-hubspot.csv",
      ["First Name", "Last Name", "Email"],
      [
        ["Avery", "Example", "avery@example.test"],
        ["Avery", "Example", "avery@example.test"],
      ],
    );
  });

  it("applies merges and honours clean-up options", async () => {
    const download = vi.fn();
    render(<Harness download={download} decisions={{ "0:1": { action: "merge", fields: {} } }} />);
    await userEvent.click(screen.getByLabelText("Pipedrive"));
    await userEvent.click(screen.getByLabelText("Lower-case email addresses"));
    expect(screen.getByTestId("export-summary")).toHaveTextContent("2 rows → 1 after merging");
    await userEvent.click(screen.getByRole("button", { name: "Download CSV" }));
    expect(download).toHaveBeenCalledWith(
      "ready-pipedrive.csv",
      ["Name", "Email"],
      [["Avery Example", "AVERY@example.test"]],
    );
  });
});

describe("ExportPanel rule-pack checks", () => {
  const base = {
    result: processCsv("Full Name,Email\nAvery Example,avery@example.test\nBo,not-an-email\n"),
    decisions: {},
    options: DEFAULT_EXPORT_OPTIONS,
    onCrm: () => {},
    onOption: () => {},
  };

  it("lists missing required fields and bad formats from a verified pack", () => {
    const pack = {
      crm: "salesforce" as const,
      version: "1.0.0",
      requiredFields: ["Last Name", "Company"],
      formats: { Email: "email" as const },
    };
    render(<ExportPanel {...base} crm="salesforce" rulePack={pack} rulePackStatus="verified" />);
    const rules = screen.getByTestId("crm-rules");
    expect(rules).toHaveTextContent("Checked against Salesforce rules v1.0.0");
    expect(rules).toHaveTextContent("Required field is empty: Last Name (1 row)");
    expect(rules).toHaveTextContent("No column for required field: Company");
    expect(rules).toHaveTextContent("Wrong format: Email (1 row)");
  });

  it("ignores a pack for a different CRM", () => {
    const pack = { crm: "hubspot" as const, version: "1.0.0", requiredFields: ["Nope"], formats: {} };
    render(<ExportPanel {...base} crm="pipedrive" rulePack={pack} rulePackStatus="loading" />);
    expect(screen.getByTestId("crm-rules")).toHaveTextContent("Loading Pipedrive import rules");
    expect(screen.getByTestId("crm-rules")).not.toHaveTextContent("Nope");
  });

  it("says checks are off when verification failed, but still allows download", () => {
    render(<ExportPanel {...base} crm="hubspot" rulePack={null} rulePackStatus="failed" />);
    expect(screen.getByTestId("crm-rules")).toHaveTextContent("Couldn't verify the HubSpot import rules");
    expect(screen.getByRole("button", { name: "Download CSV" })).toBeEnabled();
  });
});
