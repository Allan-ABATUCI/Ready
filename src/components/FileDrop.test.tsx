import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FileDrop } from "./FileDrop";

describe("FileDrop", () => {
  it("passes the chosen file to onFiles", async () => {
    const onFiles = vi.fn();
    render(<FileDrop onFiles={onFiles} />);
    const file = new File(["a,b\n1,2\n"], "contacts.csv", { type: "text/csv" });
    await userEvent.upload(screen.getByTestId("file-input"), file);
    expect(onFiles).toHaveBeenCalledExactlyOnceWith([file]);
  });

  it("passes several chosen files at once, in order", async () => {
    const onFiles = vi.fn();
    render(<FileDrop onFiles={onFiles} />);
    const a = new File(["a\n1\n"], "tradeshow.csv", { type: "text/csv" });
    const b = new File(["a\n2\n"], "webinar.csv", { type: "text/csv" });
    await userEvent.upload(screen.getByTestId("file-input"), [a, b]);
    expect(onFiles).toHaveBeenCalledExactlyOnceWith([a, b]);
  });

  it("passes every dropped file", () => {
    const onFiles = vi.fn();
    render(<FileDrop onFiles={onFiles} />);
    const a = new File(["a\n1\n"], "tradeshow.csv", { type: "text/csv" });
    const b = new File(["a\n2\n"], "webinar.csv", { type: "text/csv" });
    fireEvent.drop(screen.getByText(/drop csv or excel files/i), { dataTransfer: { files: [a, b] } });
    expect(onFiles).toHaveBeenCalledExactlyOnceWith([a, b]);
  });

  it("renders disabled with 'Loading…' until hydrated, so an inert page can't look ready", () => {
    // Server rendering never runs effects: this is what the page shows before hydration.
    const html = renderToString(<FileDrop onFiles={() => {}} />);
    expect(html).toContain("Loading…");
    expect(html).toMatch(/<input[^>]*disabled=""/);
  });

  it("is enabled once hydrated", () => {
    render(<FileDrop onFiles={() => {}} />);
    expect(screen.getByTestId("file-input")).toBeEnabled();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });

  it("tells the user the file stays in the browser", () => {
    render(<FileDrop onFiles={() => {}} />);
    expect(screen.getByText(/never uploaded/i)).toBeInTheDocument();
  });
});
