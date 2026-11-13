import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PasteBox } from "./PasteBox";

describe("PasteBox", () => {
  it("turns pasted spreadsheet rows into a file", async () => {
    const onFile = vi.fn();
    render(<PasteBox onFile={onFile} />);
    await userEvent.click(screen.getByRole("button", { name: "Paste from a spreadsheet" }));
    const use = screen.getByRole("button", { name: "Use pasted rows" });
    expect(use).toBeDisabled();

    await userEvent.click(screen.getByLabelText(/Paste rows here/));
    await userEvent.paste("Name\tEmail\nAna Test\tana@example.test");
    await userEvent.click(use);

    const file = onFile.mock.lastCall![0] as File;
    expect(file.name).toBe("pasted-data.tsv");
    expect(await file.text()).toBe("Name\tEmail\nAna Test\tana@example.test");
    // Closed and emptied, so the pasted data doesn't linger on screen.
    expect(screen.getByRole("button", { name: "Paste from a spreadsheet" })).toBeInTheDocument();
  });

  it("can be cancelled", async () => {
    const onFile = vi.fn();
    render(<PasteBox onFile={onFile} />);
    await userEvent.click(screen.getByRole("button", { name: "Paste from a spreadsheet" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onFile).not.toHaveBeenCalled();
  });
});
