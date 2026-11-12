import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ColumnProfile } from "@/lib/data-plane/types";
import { ProfileSummary } from "./ProfileSummary";

const profile: ColumnProfile[] = [{ index: 0, header: "Email", filled: 2, fillRate: 1, distinct: 2, pattern: "email" }];

describe("ProfileSummary", () => {
  it("lists columns with fill rate and pattern", () => {
    render(<ProfileSummary profile={profile} rowCount={2} />);
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.queryByTestId("encoding-note")).not.toBeInTheDocument();
  });

  it("notes when the file was read as Windows-1252", () => {
    render(<ProfileSummary profile={profile} rowCount={2} encoding="windows-1252" />);
    expect(screen.getByTestId("encoding-note")).toHaveTextContent("Read as Windows-1252");
  });
});
