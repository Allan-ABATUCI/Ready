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

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  const file = readFileSync((await (await download).path())!, "utf8");
  const lines = file.trim().split(/\r\n/);
  expect((await download).suggestedFilename()).toBe("ready-hubspot.csv");
  expect(lines[0]).toBe("First Name,Last Name,Email,Phone Number,Company Name");
  expect(lines).toHaveLength(1 + 7);
});
