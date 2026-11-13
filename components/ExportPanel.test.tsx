import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_EXPORT_OPTIONS, type ExportOptions } from "@/lib/data-plane/export-table";
import type { Decisions } from "@/lib/data-plane/merge";
import { processCsv } from "@/lib/data-plane/process";
import type { ProcessResult } from "@/lib/data-plane/types";
import type { Crm } from "@/lib/rule-packs/types";
import { ExportPanel } from "./ExportPanel";

const result = processCsv("Full Name,Email\nAvery Example,AVERY@example.test\navery example,avery@example.test\n");

function Harness({ download, decisions = {} }: { download: Download; decisions?: Decisions }) {
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

  it("confirms the download, but only once one has started", async () => {
    render(<Harness download={vi.fn()} />);
    expect(screen.getByTestId("download-status")).toBeEmptyDOMElement();
    await userEvent.click(screen.getByLabelText("HubSpot"));
    await userEvent.click(screen.getByRole("button", { name: "Download CSV" }));
    expect(screen.getByTestId("download-status")).toHaveTextContent("Downloaded. Your file is ready to import.");
  });
});

type Download = (filename: string, headers: string[], rows: string[][]) => void;

/** Pipedrive export of `result` with live clean-up options. */
function OptionsHarness({ result, download }: { result: ProcessResult; download: Download }) {
  const [options, setOptions] = useState<ExportOptions>(DEFAULT_EXPORT_OPTIONS);
  return (
    <ExportPanel
      result={result}
      decisions={{}}
      crm="pipedrive"
      options={options}
      onCrm={() => {}}
      onOption={(k, v) => setOptions((o) => ({ ...o, [k]: v }))}
      download={download}
    />
  );
}

/** Download, and return the second exported column. */
const downloaded = async (download: ReturnType<typeof vi.fn>) => {
  await userEvent.click(screen.getByRole("button", { name: "Download CSV" }));
  return (download.mock.lastCall![2] as string[][]).map((r) => r[1]);
};

describe("ExportPanel phone options", () => {
  const text = "Full Name,Phone\nAvery Example,06 12 34 56 78\nBo Sample,+44 20 7946 0958\n";

  it("normalizes by default, leaving national numbers when there is no default country", async () => {
    const download = vi.fn();
    render(<OptionsHarness result={processCsv(text)} download={download} />);
    expect(screen.getByLabelText(/International phone format/)).toBeChecked();
    expect(await downloaded(download)).toEqual(["06 12 34 56 78", "+442079460958"]);
  });

  it("uses the analysis' default country, and leaves numbers alone when switched off", async () => {
    const download = vi.fn();
    render(<OptionsHarness result={processCsv(text, { defaultCountry: "FR" })} download={download} />);
    expect(await downloaded(download)).toEqual(["+33612345678", "+442079460958"]);
    await userEvent.click(screen.getByLabelText(/International phone format/));
    expect(await downloaded(download)).toEqual(["06 12 34 56 78", "+44 20 7946 0958"]);
  });
});

describe("ExportPanel date option", () => {
  it("writes ISO dates by default and can be switched off", async () => {
    const download = vi.fn();
    render(<OptionsHarness result={processCsv("Name;Signup\nA;31/12/2024\nB;01/02/2024\n")} download={download} />);
    expect(screen.getByLabelText("Dates as YYYY-MM-DD")).toBeChecked();
    expect(await downloaded(download)).toEqual(["2024-12-31", "2024-02-01"]);
    await userEvent.click(screen.getByLabelText("Dates as YYYY-MM-DD"));
    expect(await downloaded(download)).toEqual(["31/12/2024", "01/02/2024"]);
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

describe("ExportPanel preview and change report", () => {
  const changes = processCsv(readFileSync("tests/fixtures/export-changes.csv", "utf8"));
  const many = processCsv(
    ["Full Name,Email", ...Array.from({ length: 30 }, (_, i) => `Person ${i}, p${i}@example.test`)].join("\n"),
  );

  it("previews the first 20 export rows under the CRM headers, highlighting cleaned cells", () => {
    render(<OptionsHarness result={changes} download={vi.fn()} />);
    const preview = screen.getByTestId("export-preview");
    expect(
      within(preview)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["Name", "Email", "Phone", "Organization", "Signup", "Notes"]);
    const [first, second] = within(preview).getAllByRole("row").slice(1);
    const cells = (row: HTMLElement) => within(row).getAllByRole("cell");
    expect(cells(first!)[0]).toHaveTextContent("Avery Example");
    expect(cells(first!)[0]).toHaveAttribute("data-change", "changed");
    expect(cells(first!)[0]).toHaveAttribute("title", "Capitalization fixed");
    expect(cells(first!)[3]).not.toHaveAttribute("data-change");
    expect(cells(second!)[2]).toHaveAttribute("data-change", "unconverted");
    expect(screen.getByTestId("change-summary")).toHaveTextContent("Capitalization fixed: 2");
  });

  it("shows the changes of every file column behind a joined column", () => {
    // Pipedrive joins first and last name into one "Name" column.
    render(<OptionsHarness result={processCsv("First Name,Last Name\nAVERY,Example\n")} download={vi.fn()} />);
    const name = within(screen.getByTestId("export-preview")).getAllByRole("cell")[0]!;
    expect(name).toHaveTextContent("Avery Example");
    expect(name).toHaveAttribute("data-change", "changed");
  });

  it("caps the preview at 20 rows", () => {
    render(<OptionsHarness result={many} download={vi.fn()} />);
    expect(within(screen.getByTestId("export-preview")).getAllByRole("row")).toHaveLength(1 + 20);
    expect(screen.getByText("Preview (first 20 of 30 rows)")).toBeInTheDocument();
    expect(screen.getByTestId("change-summary")).toHaveTextContent("Extra spaces removed: 30");
  });

  it("downloads a change report covering every row, not just the preview", async () => {
    const download = vi.fn();
    render(<OptionsHarness result={many} download={download} />);
    await userEvent.click(screen.getByRole("button", { name: "Download change report" }));
    const [name, headers, rows] = download.mock.lastCall! as [string, string[], string[][]];
    expect(name).toBe("ready-pipedrive-report.csv");
    expect(headers.slice(0, 2)).toEqual(["Summary", "Count"]);
    expect(rows.filter((r) => r[2] === "Extra spaces removed")).toHaveLength(30);
    expect(rows.at(-1)).toEqual(["30", "Email", "Extra spaces removed", " p29@example.test", "p29@example.test"]);
  });
});

describe("ExportPanel email typo option", () => {
  it("is off by default and applies the suggestions when ticked", async () => {
    const download = vi.fn();
    render(<OptionsHarness result={processCsv("Name,Email\nAvery,avery@gmial.com\n")} download={download} />);
    const option = screen.getByLabelText(/Fix likely email typos/);
    expect(option).not.toBeChecked();
    expect(await downloaded(download)).toEqual(["avery@gmial.com"]);
    await userEvent.click(option);
    expect(await downloaded(download)).toEqual(["avery@gmail.com"]);
    expect(screen.getByTestId("change-summary")).toHaveTextContent("Email typo fixed: 1");
  });
});
