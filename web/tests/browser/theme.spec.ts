import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { runAnalysis } from "./helpers";

async function theme(page: Page, value: "Light" | "Dark" | "System") {
  await page
    .getByRole("button", { name: /^Change theme, current theme/ })
    .click();
  await page.getByRole("menuitemradio", { name: value, exact: true }).click();
  await expect(
    page.getByRole("button", { name: `Change theme, current theme ${value}` }),
  ).toBeVisible();
}

test("theme choices persist and System follows the device without hydration errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Change theme, current theme System" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveClass("dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveClass("light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass("dark");
  await page
    .getByRole("button", { name: /^Change theme, current theme/ })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("menuitemradio", { name: "System", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(
    page.getByRole("menuitemradio", { name: "Dark", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveClass("dark");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Change theme, current theme Dark" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveClass("dark");
  await page
    .getByRole("button", { name: "Change theme, current theme Dark" })
    .click();
  await expect(
    page.getByRole("menuitemradio", { name: "Dark", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await theme(page, "System");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveClass("light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass("dark");
  await theme(page, "Light");
  await expect(page.locator("html")).toHaveClass("light");
  expect(errors).toEqual([]);
});

test("theme changes preserve disclosures, candidates and the active 3D view", async ({
  page,
}, info) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Analysis settings", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("combobox", {
      name: "Protein-region preprocessing",
      exact: true,
    }),
  ).toBeVisible();
  await runAnalysis(page);
  await page
    .getByRole("button", { name: "Select plotted candidate 2", exact: true })
    .click();
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await expect(page.locator('.three-canvas[data-ready="true"]')).toBeVisible();
  const canvas = page.locator(".three-canvas canvas");
  const light = await canvas.screenshot();
  await theme(page, "Dark");
  await expect(page.locator("html")).toHaveClass("dark");
  await expect(
    page.getByRole("button", { name: "Analysis settings", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("button", {
      name: "Select plotted candidate 2",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "3D", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const dark = await canvas.screenshot();
  expect(dark.equals(light)).toBe(false);
  await page
    .locator(".feature-figure")
    .screenshot({ path: `../docs/review/theme-3d-${info.project.name}.png` });
  await theme(page, "Light");
  await expect(
    page.getByRole("button", {
      name: "Select plotted candidate 2",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('.three-canvas[data-ready="true"]')).toBeVisible();
});

test("dark theme has accessible controls and research panels at desktop and phone widths", async ({
  page,
}, info) => {
  await page.goto("/");
  await runAnalysis(page);
  await theme(page, "Dark");
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const tab of [
      "Discover",
      "Compare controls",
      "Evidence",
      "Evaluation",
      "Science & limitations",
    ]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.locator("#workspace").screenshot({
        path: `../docs/review/theme-${tab.toLowerCase().replaceAll(" ", "-")}-${info.project.name}-${width}.png`,
      });
    }
    await page
      .getByRole("button", { name: /^Change theme, current theme/ })
      .click();
    await expect(page.getByRole("menu")).toHaveCSS("opacity", "1");
    // Base UI focus sentinels redirect focus and are not user-facing controls.
    // Upstream explains this axe false positive: mui/base-ui#4668, comment 4306200868.
    // Keep all rules enabled for the actual menu and page content.
    expect(
      (
        await new AxeBuilder({ page })
          .exclude("[data-base-ui-focus-guard]")
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: `../docs/review/theme-menu-${info.project.name}-${width}.png`,
    });
    const guardRedirects = await page
      .locator('[data-base-ui-focus-guard][tabindex="0"]')
      .first()
      .evaluate((guard) => {
        (guard as HTMLElement).focus();
        return new Promise<boolean>((resolve) =>
          requestAnimationFrame(() =>
            resolve(document.activeElement !== guard),
          ),
        );
      });
    expect(guardRedirects).toBe(true);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await page.getByRole("tab", { name: "Discover", exact: true }).click();
    await page
      .getByRole("combobox", { name: "Input method", exact: true })
      .click();
    await expect(page.locator('[data-slot="select-content"]')).toHaveAttribute(
      "data-open",
      "",
    );
    await expect(page.locator('[data-slot="select-content"]')).toHaveCSS(
      "opacity",
      "1",
    );
    expect(
      (
        await new AxeBuilder({ page })
          .exclude("[data-base-ui-focus-guard]")
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: `../docs/review/theme-dropdown-${info.project.name}-${width}.png`,
    });
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-slot="select-content"]')).toBeHidden();
  }
});
