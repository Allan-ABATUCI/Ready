import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ColumnProfile } from "@/lib/data-plane/types";
import { ProfileSummary } from "./ProfileSummary";

const profile: ColumnProfile[] = [
  { index: 0, header: "Email", filled: 2, fillRate: 1, distinct: 2, pattern: "email" },
  { index: 1, header: "Primary Inbox", filled: 2, fillRate: 1, distinct: 2, pattern: "email" },
];

describe("ProfileSummary", () => {
  it("lists columns with fill rate and pattern", () => {
    render(<ProfileSummary profile={profile} rowCount={2} />);
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getAllByText("100%")).toHaveLength(2);
    expect(screen.queryByTestId("encoding-note")).not.toBeInTheDocument();
  });

  it("notes when the file was read as Windows-1252", () => {
    render(<ProfileSummary profile={profile} rowCount={2} encoding="windows-1252" />);
    expect(screen.getByTestId("encoding-note")).toHaveTextContent("Read as Windows-1252");
  });

  it("has no role pickers when read-only", () => {
    render(<ProfileSummary profile={profile} rowCount={2} roles={{ email: 0 }} />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("pre-fills each picker from the roles and reports changes", async () => {
    const onRole = vi.fn();
    render(<ProfileSummary profile={profile} rowCount={2} roles={{ email: 0 }} onRole={onRole} />);
    const [first, second] = screen.getAllByRole("combobox");
    expect(first).toHaveDisplayValue("Email");
    expect(second).toHaveDisplayValue("—");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(
      expect.arrayContaining(["—", "Email", "Phone", "Full name", "First name", "Last name", "Company"]),
    );

    await userEvent.selectOptions(second!, "Email");
    expect(onRole).toHaveBeenLastCalledWith("email", 1);

    await userEvent.selectOptions(first!, "—");
    expect(onRole).toHaveBeenLastCalledWith("email", null);
  });

  it("disables the pickers while busy", () => {
    render(<ProfileSummary profile={profile} rowCount={2} roles={{}} onRole={() => {}} busy />);
    for (const select of screen.getAllByRole("combobox")) expect(select).toBeDisabled();
  });

  describe("date order", () => {
    const withDates: ColumnProfile[] = [
      ...profile,
      { index: 2, header: "Signup", filled: 2, fillRate: 1, distinct: 2, pattern: "date" },
    ];

    it("is offered only when there is a date column", () => {
      render(<ProfileSummary profile={profile} rowCount={2} onDateOrder={() => {}} />);
      expect(screen.queryByLabelText("Dates are written as")).not.toBeInTheDocument();
    });

    it("is pre-filled with the detected order and reports changes", async () => {
      const onDateOrder = vi.fn();
      render(<ProfileSummary profile={withDates} rowCount={2} dateOrder="dmy" onDateOrder={onDateOrder} />);
      const select = screen.getByLabelText("Dates are written as");
      expect(select).toHaveDisplayValue("Day/Month/Year");

      await userEvent.selectOptions(select, "Month/Day/Year");
      expect(onDateOrder).toHaveBeenLastCalledWith("mdy");
      await userEvent.selectOptions(select, "Not sure");
      expect(onDateOrder).toHaveBeenLastCalledWith(null);
    });

    it('shows "Not sure" when the order is unknown, and is disabled while busy', () => {
      render(<ProfileSummary profile={withDates} rowCount={2} dateOrder={null} onDateOrder={() => {}} busy />);
      const select = screen.getByLabelText("Dates are written as");
      expect(select).toHaveDisplayValue("Not sure");
      expect(select).toBeDisabled();
    });
  });
});
