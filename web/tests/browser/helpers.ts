import { expect, type Page } from "@playwright/test";

export async function runAnalysis(page: Page) {
  await page
    .getByRole("button", { name: "Run candidate scan", exact: true })
    .click();
  await expect(
    page.getByText("Analysis complete.", { exact: true }),
  ).toBeVisible({ timeout: 90000 });
}
