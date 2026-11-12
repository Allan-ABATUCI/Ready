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
});
