import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { goToStep, type StepName } from "./steps";

/** WCAG 2.1 A and AA rules, on what is on screen. */
async function violations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`);
}

test("every step passes an automated accessibility check", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(400); // entrance animations
  expect(await violations(page)).toEqual([]);

  await page.getByRole("button", { name: "Try a sample file" }).click();
  await expect(page.getByTestId("status")).toHaveText("Done.");
  for (const step of ["Fix", "Review", "Export"] satisfies StepName[]) {
    await goToStep(page, step);
    if (step === "Export") await page.getByLabel("HubSpot").check();
    // Let entrance animations finish, so contrast is measured at full opacity.
    await page.waitForTimeout(400);
    expect(await violations(page), step).toEqual([]);
  }
});

test("the confirmation dialog passes too", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try a sample file" }).click();
  await goToStep(page, "Review");
  await page.getByRole("button", { name: /Merge all shown/ }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.waitForTimeout(300);
  expect(await violations(page)).toEqual([]);
});

test("the column mapping screen for combined files passes too", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles([
    { name: "a.csv", mimeType: "text/csv", buffer: Buffer.from("Email,Phone,Booth\na@example.test,555-0101,B1\n") },
    { name: "b.csv", mimeType: "text/csv", buffer: Buffer.from("E-mail,Mobile\nb@example.test,555-0102\n") },
  ]);
  const mapper = page.getByTestId("column-mapping");
  await expect(mapper).toBeVisible();
  // Leave a column out, so the "left out" list is checked as well.
  await mapper.getByLabel("Phone: column from b.csv").selectOption({ label: "— not in this file —" });
  await expect(page.getByTestId("left-out-columns")).toBeVisible();
  await page.waitForTimeout(400);
  expect(await violations(page)).toEqual([]);
});
