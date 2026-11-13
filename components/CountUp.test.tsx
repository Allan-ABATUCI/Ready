import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CountUp } from "./CountUp";

function mockMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: reduce })),
  );
}

describe("CountUp", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("shows the value at once when the user prefers reduced motion", () => {
    mockMotion(true);
    render(<CountUp value={42} />);
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("ticks up to the value and stops there", async () => {
    mockMotion(false);
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    const { container } = render(<CountUp value={40} />);
    expect(container).toHaveTextContent("0");
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    const mid = Number(container.textContent);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(40);
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(container).toHaveTextContent("40");
  });
});
