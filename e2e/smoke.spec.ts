import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { syntheticContacts } from "../tests/support/synthetic";

test("profiles a file and shows duplicates side by side", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Ready" })).toBeVisible();

  await page
    .getByTestId("file-input")
    .setInputFiles(path.join(__dirname, "..", "tests", "fixtures", "contacts-duplicates.csv"));
  await expect(page.getByTestId("status")).toHaveText("Done.");
  await expect(page.getByRole("heading", { name: /Columns/ })).toContainText("9 rows");
  // "avery example" / "zoë müller" are single-case proper nouns.
  await expect(page.getByTestId("issues")).toContainText("Inconsistent capitalization in Full Name");
  await expect(page.getByRole("heading", { name: /Possible duplicates/ })).toBeVisible();
  await expect(page.getByTestId("merge-preview")).toBeVisible();

  // Avery (same email) and Zoë (same name + company) are exact; Bo / "Different
  // Person" only share a phone, so they need a manual decision. 9 − 2 = 7 rows.
  await page.getByRole("button", { name: /Merge all exact matches \(2\)/ }).click();
  await expect(page.getByTestId("review-progress")).toContainText("2 to merge");

  await page.getByLabel("HubSpot").check();
  await expect(page.getByTestId("export-summary")).toContainText("9 rows → 7 after merging");
  // Signed HubSpot pack is fetched and verified; two contacts have no email.
  await expect(page.getByTestId("crm-rules")).toContainText("Checked against HubSpot rules v1.0.0");
  await expect(page.getByTestId("crm-rules")).toContainText("Required field is empty: Email (2 rows)");
  // Preview of the export, with the case fix on "avery example" highlighted.
  await expect(page.getByTestId("export-preview")).toContainText("Preview (first 7 of 7 rows)");
  await expect(page.getByTestId("export-preview").locator('td[data-change="changed"]').first()).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  const file = readFileSync((await (await download).path())!, "utf8");
  const lines = file.trim().split(/\r\n/);
  expect((await download).suggestedFilename()).toBe("ready-hubspot.csv");
  expect(lines[0]).toBe("First Name,Last Name,Email,Phone Number,Company Name");
  expect(lines).toHaveLength(1 + 7);
});

test("reads an Excel-saved Windows-1252 file without mangling accents", async ({ page }) => {
  await page.goto("/");
  await page
    .getByTestId("file-input")
    .setInputFiles(path.join(__dirname, "..", "tests", "fixtures", "windows-1252.csv"));
  await expect(page.getByTestId("status")).toHaveText("Done.");
  await expect(page.getByTestId("encoding-note")).toContainText("Read as Windows-1252");
  await expect(page.getByRole("heading", { name: /Columns/ })).toContainText("3 rows");

  await page.getByLabel("HubSpot").check();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  const file = readFileSync((await (await download).path())!, "utf8");
  expect(file).toContain("Zoë,Müller");
  expect(file).toContain("Société Exemple");
  expect(file).not.toContain("\uFFFD");
});

test("recognizes French headers and finds their duplicates automatically", async ({ page }) => {
  await page.goto("/");
  await page
    .getByTestId("file-input")
    .setInputFiles(path.join(__dirname, "..", "tests", "fixtures", "contacts-fr.csv"));
  await expect(page.getByTestId("status")).toHaveText("Done.");
  await expect(page.getByLabel("Use column 1 as")).toHaveValue("lastName");
  await expect(page.getByLabel("Use column 2 as")).toHaveValue("firstName");
  await expect(page.getByLabel("Use column 3 as")).toHaveValue("email");
  await expect(page.getByLabel("Use column 4 as")).toHaveValue("phone");
  await expect(page.getByLabel("Use column 5 as")).toHaveValue("company");
  // Zoë (same email) and Amélie (same phone, same accent-folded name) are both found.
  await expect(page.getByRole("heading", { name: /Possible duplicates/ })).toContainText("(2)");
});

test("lets the user assign a column the app didn't recognize", async ({ page }) => {
  await page.goto("/");
  await page
    .getByTestId("file-input")
    .setInputFiles(path.join(__dirname, "..", "tests", "fixtures", "unknown-email-header.csv"));
  await expect(page.getByTestId("status")).toHaveText("Done.");
  await expect(page.getByLabel("Use column 2 as")).toHaveValue("");
  await expect(page.getByRole("heading", { name: /Possible duplicates/ })).toContainText("(0)");

  await page.getByLabel("Use column 2 as").selectOption("Email");
  await expect(page.getByTestId("status")).toHaveText("Done.");
  await expect(page.getByRole("heading", { name: /Possible duplicates/ })).toContainText("(1)");
  await expect(page.getByTestId("merge-preview")).toContainText("Accounts Team");

  await page.getByLabel("HubSpot").check();
  await expect(page.getByTestId("export-summary")).toContainText("columns: First Name, Last Name, Email, City");
});

test("warns before a role change clears merge decisions", async ({ page }) => {
  await page.goto("/");
  await page
    .getByTestId("file-input")
    .setInputFiles(path.join(__dirname, "..", "tests", "fixtures", "contacts-duplicates.csv"));
  await page.getByRole("button", { name: "Merge", exact: true }).click();
  await expect(page.getByTestId("review-progress")).toContainText("1 to merge");

  // Cancel: nothing changes.
  page.once("dialog", (d) => void d.dismiss());
  await page.getByLabel("Use column 3 as").selectOption("");
  await expect(page.getByLabel("Use column 3 as")).toHaveValue("phone");
  await expect(page.getByTestId("review-progress")).toContainText("1 to merge");

  // Accept: the role is cleared and decisions start over.
  page.once("dialog", (d) => void d.accept());
  await page.getByLabel("Use column 3 as").selectOption("");
  await expect(page.getByLabel("Use column 3 as")).toHaveValue("");
  await expect(page.getByTestId("review-progress")).toContainText("0 to merge");
});

test("detects day-first dates and exports them as YYYY-MM-DD", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles(path.join(__dirname, "..", "tests", "fixtures", "dates-eu.csv"));
  await expect(page.getByTestId("status")).toHaveText("Done.");
  // 31/12/2024 can only be day-first, so the ambiguous 05.03.2024 and 01/02/2023 are too.
  await expect(page.getByTestId("date-order").getByLabel("Dates are written as")).toHaveValue("dmy");
  await expect(page.getByTestId("issues")).not.toContainText("Date could be");

  await page.getByLabel("HubSpot").check();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  const file = readFileSync((await (await download).path())!, "utf8");
  for (const iso of ["2024-12-31", "2024-03-05", "2023-02-01", "2024-02-29"]) expect(file).toContain(iso);
  expect(file).not.toContain("31/12/2024");
});

test("reviews many pairs: filter by email, merge all shown, undo", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles({
    name: "synthetic.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(syntheticContacts({ rows: 600, seed: 11, dupRate: 0.3 })),
  });
  await expect(page.getByTestId("status")).toHaveText("Done.");
  await expect(page.getByTestId("pair-page")).toContainText(/Page 1 of [2-9]/);

  await page.getByLabel("Matched on").selectOption("Email");
  const mergeShown = page.getByRole("button", { name: /Merge all shown/ });
  const shown = Number(/\((\d+)\)/.exec((await mergeShown.textContent())!)![1]);
  expect(shown).toBeGreaterThan(0);

  page.once("dialog", (d) => void d.accept());
  await mergeShown.click();
  await expect(page.getByTestId("review-progress")).toContainText(`Reviewed ${shown} of`);
  await expect(page.getByTestId("review-progress")).toContainText(`${shown} to merge`);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByTestId("review-progress")).toContainText("Reviewed 0 of");
});

test("fixes flagged cells in place, and the fixes reach the export", async ({ page }) => {
  await page.goto("/");
  await page
    .getByTestId("file-input")
    .setInputFiles(path.join(__dirname, "..", "tests", "fixtures", "contacts-issues.csv"));
  await expect(page.getByTestId("status")).toHaveText("Done.");
  const issues = page.getByTestId("issues");

  // Not a role column: only issues are re-checked.
  await issues.getByText("Invalid date in Signup Date").click();
  await page.getByLabel("Fix row 2, Signup Date").fill("2024-02-28");
  await page.getByLabel("Fix row 2, Signup Date").press("Enter");
  await expect(page.getByTestId("status")).toHaveText("Done.");
  await expect(issues).not.toContainText("Invalid date");

  // The email column is used for matching, so this re-runs duplicate detection.
  page.on("dialog", (d) => void d.accept());
  await issues.getByText("Invalid email in Email").click();
  await page.getByLabel("Fix row 3, Email").fill("bo@example.test");
  await issues.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("status")).toHaveText("Done.");
  await expect(issues).not.toContainText("Invalid email");

  await page.getByLabel("HubSpot").check();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  const file = readFileSync((await (await download).path())!, "utf8");
  expect(file).toContain("2024-02-28");
  expect(file).toContain("bo@example.test");
  expect(file).not.toContain("bo@@example.test");
});
