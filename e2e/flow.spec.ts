import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { answerConfirm, goToStep } from "./steps";

test("walks the sample file through all four steps", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Steps" });
  // Nothing to fix, review or export before a file is loaded.
  await expect(nav.getByRole("button", { name: /Export/ })).toBeDisabled();

  await page.getByRole("button", { name: "Try a sample file" }).click();
  await expect(page.getByTestId("status")).toHaveText("Done.");
  // A loaded file opens on the Fix step.
  await expect(nav.getByRole("button", { name: /Fix/ })).toHaveAttribute("aria-current", "step");
  await expect(page.getByTestId("step-fix")).toBeVisible();
  await expect(page.getByTestId("step-upload")).toBeHidden();
  await expect(page.getByRole("heading", { name: /Columns/ })).toContainText("12 rows");
  await expect(page.getByTestId("issues")).toContainText("Possible typo in email domain");

  await page.getByRole("button", { name: /Next: review duplicates/ }).click();
  await expect(page.getByTestId("step-review")).toBeVisible();
  await expect(page.getByTestId("step-review")).toBeFocused();
  await page.getByRole("button", { name: /Merge all exact matches/ }).click();

  await page.getByRole("button", { name: /Next: export/ }).click();
  await page.getByLabel("Salesforce").check();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  expect((await download).suggestedFilename()).toBe("ready-salesforce.csv");
  await expect(page.getByTestId("download-status")).toContainText("Downloaded");
  // Earlier steps are checked off.
  await expect(nav.getByRole("button", { name: /Review/ })).toContainText("✓");
});

test("asks before a new file replaces fixes and decisions", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try a sample file" }).click();
  await goToStep(page, "Review");
  await page.getByRole("button", { name: "Merge", exact: true }).click();
  await expect(page.getByTestId("review-progress")).toContainText("1 to merge");

  await goToStep(page, "Upload");
  await page.getByRole("button", { name: "Try a sample file" }).click();
  await answerConfirm(page, "Cancel");
  await goToStep(page, "Review");
  await expect(page.getByTestId("review-progress")).toContainText("1 to merge");

  await goToStep(page, "Upload");
  await page.getByRole("button", { name: "Try a sample file" }).click();
  await answerConfirm(page, "Load file");
  await expect(page.getByTestId("status")).toHaveText("Done.");
  await goToStep(page, "Review");
  await expect(page.getByTestId("review-progress")).toContainText("0 to merge");
});

test.describe("with reduced motion", () => {
  test.use({ colorScheme: "light", reducedMotion: "reduce" });

  test("shows counts at their final value straight away", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Try a sample file" }).click();
    await expect(page.getByTestId("status")).toHaveText("Done.");
    const issues = page.getByRole("heading", { name: /Issues/ });
    const first = await issues.textContent();
    expect(first).not.toContain("(0)");
    await expect(issues).toHaveText(first!);
  });
});

test("saves progress to a file and picks up from it later", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try a sample file" }).click();
  await expect(page.getByTestId("status")).toHaveText("Done.");
  await goToStep(page, "Review");
  await page.getByRole("button", { name: /Merge all exact matches/ }).click();
  await expect(page.getByTestId("review-progress")).toContainText(/Reviewed (\d+) of \d+ · \1 to merge/);
  const progress = await page.getByTestId("review-progress").textContent();
  await goToStep(page, "Export");
  await page.getByLabel("Pipedrive").check();

  const saving = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save progress" }).click();
  const saved = await saving;
  expect(saved.url()).toMatch(/^blob:/);
  expect(saved.suggestedFilename()).toBe("sample-contacts.ready.json");
  const sessionPath = (await saved.path())!;

  // A fresh page: nothing kept in the browser, everything comes from the file.
  await page.reload();
  await expect(page.getByRole("navigation", { name: "Steps" }).getByRole("button", { name: /Export/ })).toBeDisabled();
  // Playwright keeps downloads under a random name, so give it back its own.
  await page.getByTestId("file-input").setInputFiles({
    name: saved.suggestedFilename(),
    mimeType: "application/json",
    buffer: readFileSync(sessionPath),
  });
  await expect(page.getByTestId("status")).toHaveText("Done.");
  await expect(page.getByTestId("step-export")).toBeVisible();
  await expect(page.getByLabel("Pipedrive")).toBeChecked();
  await goToStep(page, "Review");
  await expect(page.getByTestId("review-progress")).toHaveText(progress!);
});

test("explains when a dropped file isn't a session it can read", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles({
    name: "notes.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"hello":"world"}'),
  });
  await expect(page.getByTestId("status")).toHaveText("That doesn't look like a saved Ready session.");
});
