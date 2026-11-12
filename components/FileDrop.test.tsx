import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FileDrop } from "./FileDrop";

describe("FileDrop", () => {
  it("passes the chosen file to onFile", async () => {
    const onFile = vi.fn();
    render(<FileDrop onFile={onFile} />);
    const file = new File(["a,b\n1,2\n"], "contacts.csv", { type: "text/csv" });
    await userEvent.upload(screen.getByTestId("file-input"), file);
    expect(onFile).toHaveBeenCalledExactlyOnceWith(file);
  });

  it("renders disabled with 'Loading…' until hydrated, so an inert page can't look ready", () => {
    // Server rendering never runs effects: this is what the page shows before hydration.
    const html = renderToString(<FileDrop onFile={() => {}} />);
    expect(html).toContain("Loading…");
    expect(html).toMatch(/<input[^>]*disabled=""/);
  });

  it("is enabled once hydrated", () => {
    render(<FileDrop onFile={() => {}} />);
    expect(screen.getByTestId("file-input")).toBeEnabled();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });

  it("tells the user the file stays in the browser", () => {
    render(<FileDrop onFile={() => {}} />);
    expect(screen.getByText(/never uploaded/i)).toBeInTheDocument();
  });
});
