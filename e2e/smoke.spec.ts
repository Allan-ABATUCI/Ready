import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

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
