import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StepNav } from "./StepNav";

const steps = [
  { id: "upload", label: "Upload" },
  { id: "fix", label: "Fix", count: 7 },
  { id: "review", label: "Review", count: 3 },
  { id: "export", label: "Export", disabled: true },
] as const;

describe("StepNav", () => {
  it("marks the current step, checks off earlier ones and slides the marker to it", () => {
    render(<StepNav steps={[...steps]} current="review" onStep={() => {}} />);
    expect(screen.getByRole("button", { name: /Review/ })).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("button", { name: /Upload/ })).toHaveTextContent("✓");
    expect(screen.getByRole("button", { name: /Fix/ })).toHaveTextContent("7"); // count shown straight away in tests
    expect(screen.getByTestId("step-marker")).toHaveStyle({ width: "25%", transform: "translateX(200%)" });
  });

  it("goes to a step on click, but not to a disabled one", async () => {
    const onStep = vi.fn();
    render(<StepNav steps={[...steps]} current="upload" onStep={onStep} />);
    await userEvent.click(screen.getByRole("button", { name: /Fix/ }));
    expect(onStep).toHaveBeenCalledWith("fix");
    expect(screen.getByRole("button", { name: /Export/ })).toBeDisabled();
  });
});
