import { expect, type Page } from "@playwright/test";

export type StepName = "Upload" | "Fix" | "Review" | "Export";

/** Go to a step of the guided flow through the step bar, and wait for its panel. */
export async function goToStep(page: Page, step: StepName): Promise<void> {
  await page
    .getByRole("navigation", { name: "Steps" })
    .getByRole("button", { name: new RegExp(`^\\d*\\s*${step}`) })
    .click();
  await expect(page.getByTestId(`step-${step.toLowerCase()}`)).toBeVisible();
}

/** Answer the app's in-page confirmation dialog. */
export async function answerConfirm(page: Page, button: string): Promise<void> {
  await page.getByRole("alertdialog").getByRole("button", { name: button, exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeHidden();
}
