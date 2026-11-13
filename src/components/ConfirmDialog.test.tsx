import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmProvider, useConfirm } from "./ConfirmDialog";

function Asker({ onAnswer }: { onAnswer: (ok: boolean) => void }) {
  const confirm = useConfirm();
  return (
    <button
      type="button"
      onClick={() => void confirm("Clear your decisions?", { confirmLabel: "Clear" }).then(onAnswer)}
    >
      Ask
    </button>
  );
}

describe("ConfirmDialog", () => {
  it("asks in an in-page dialog, focusing Cancel, and resolves with the answer", async () => {
    const onAnswer = vi.fn();
    render(
      <ConfirmProvider>
        <Asker onAnswer={onAnswer} />
      </ConfirmProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Ask" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("Clear your decisions?");
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();

    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onAnswer).toHaveBeenLastCalledWith(true);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    // Focus goes back to what opened it.
    expect(screen.getByRole("button", { name: "Ask" })).toHaveFocus();
  });

  it("cancels on Escape and keeps Tab inside the dialog", async () => {
    const onAnswer = vi.fn();
    render(
      <ConfirmProvider>
        <Asker onAnswer={onAnswer} />
      </ConfirmProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Ask" }));
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Clear" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(onAnswer).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("falls back to the browser dialog without a provider", async () => {
    const native = vi.spyOn(window, "confirm").mockReturnValue(true);
    const onAnswer = vi.fn();
    render(<Asker onAnswer={onAnswer} />);
    await userEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(native).toHaveBeenCalledWith("Clear your decisions?");
    expect(onAnswer).toHaveBeenCalledWith(true);
    native.mockRestore();
  });
});
