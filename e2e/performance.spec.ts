import { expect, test } from "@playwright/test";
import { syntheticContacts } from "../tests/support/synthetic";
import { goToStep } from "./steps";

/**
 * A large file end to end in a real browser, with a time budget, so a slow
 * change shows up in CI. Generous on purpose: CI machines vary, and the point is
 * to catch order-of-magnitude regressions (say, an accidental n² step).
 */
const ROWS = 100_000;
const BUDGET_MS = 45_000;

test("processes 100,000 rows within the time budget", async ({ page }) => {
  test.setTimeout(BUDGET_MS * 3);
  const csv = Buffer.from(syntheticContacts({ rows: ROWS, seed: 7, dupRate: 0.1 }));
  await page.goto("/");

  const start = Date.now();
  await page.getByTestId("file-input").setInputFiles({ name: "large.csv", mimeType: "text/csv", buffer: csv });
  await expect(page.getByTestId("status")).toHaveText("Done.", { timeout: BUDGET_MS });
  const processed = Date.now() - start;
  test.info().annotations.push({ type: "processed in", description: `${processed} ms` });
  console.log(`100,000 rows processed in ${processed} ms`);
  expect(processed).toBeLessThan(BUDGET_MS);

  // The page stays usable: the review list pages through the pairs and export builds.
  await goToStep(page, "Review");
  await expect(page.getByTestId("pair-page")).toContainText(/Page 1 of \d+/);
  await goToStep(page, "Export");
  const exportStart = Date.now();
  await page.getByLabel("HubSpot").check();
  await expect(page.getByTestId("export-summary")).toContainText(/\d{5} rows → \d+ after merging/);
  console.log(`export preview built in ${Date.now() - exportStart} ms`);
});
