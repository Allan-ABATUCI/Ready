import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

// No next/font/google, analytics or third-party scripts: see CLAUDE.md privacy invariant.
export const metadata: Metadata = {
  title: "Ready — CRM-ready CSVs, processed in your browser",
  description:
    "Clean and deduplicate contact CSVs for HubSpot, Salesforce and Pipedrive. Your data never leaves your browser.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
