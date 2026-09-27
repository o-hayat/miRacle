import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";

const fixture = JSON.parse(
  fs.readFileSync("tests/fixtures/mir21_region-cds.json", "utf8"),
);
const candidates = fixture.analysis.result.candidates;
const metrics = JSON.parse(
  fs.readFileSync("../artifacts/evaluation/metrics.json", "utf8"),
);

async function saved(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "View saved example", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Analysis results" }),
  ).toBeVisible();
}

test("quiet input disclosures retain settings and saved-result validation", async ({
  page,
}) => {
  await page.goto("/");
  const settings = page.getByRole("button", {
    name: "Analysis settings",
    exact: true,
  });
  const references = page.getByRole("button", {
    name: "Reference controls",
    exact: true,
  });
  await expect(settings).toHaveAttribute("aria-expanded", "false");
  await expect(references).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.getByRole("combobox", { name: "Protein-region preprocessing" }),
  ).toBeHidden();
  await settings.click();
  const mask = page.getByRole("combobox", {
    name: "Protein-region preprocessing",
  });
  await mask.click();
  await page
    .getByRole("option", { name: "Do not mask protein regions", exact: true })
    .click();
  await settings.click();
  await expect(settings).toContainText("No masking");
  await settings.click();
  await expect(mask).toContainText("Do not mask protein regions");
  await page
    .getByRole("button", { name: "View saved example", exact: true })
    .click();
  await expect(
    page.getByText(/This saved result does not match/),
  ).toBeVisible();
  await references.click();
  await expect(
    page.getByRole("combobox", { name: "Example", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Load selected control", exact: true }),
  ).toBeVisible();
});

test("research figures use reference values and preserve candidate selection", async ({
  page,
}) => {
  await saved(page);
  await page
    .getByRole("button", {
      name: "Inspect candidate 2 on position map",
      exact: true,
    })
    .click();
  await expect(page.locator(".feature-readout")).toContainText("Candidate 2");
  const point = page.getByRole("button", {
    name: "Select candidate 3 in feature plot",
    exact: true,
  });
  await point.focus();
  await page.keyboard.press("Enter");
  const c = candidates[2];
  await expect(page.locator(".feature-readout")).toContainText(
    `${c.features.mfe_per_nt.toFixed(3)} kcal/mol/nt`,
  );
  await expect(page.locator(".feature-readout")).toContainText(
    `${(c.model_score * 100).toFixed(1)}/100 score`,
  );
  await expect(page.locator(".feature-readout")).toContainText(
    `${(c.features.paired_fraction * 100).toFixed(1)}% paired`,
  );
  await page.getByRole("tab", { name: "Evidence", exact: true }).click();
  for (const match of c.comparative_matches) {
    await expect(
      page.getByRole("meter", {
        name: `${match.species} Identity`,
        exact: true,
      }),
    ).toHaveAttribute("aria-valuenow", String(match.identity * 100));
    await expect(
      page.getByRole("meter", {
        name: `${match.species} Coverage`,
        exact: true,
      }),
    ).toHaveAttribute("aria-valuenow", String(match.coverage * 100));
  }
  await page.getByRole("tab", { name: "Evaluation", exact: true }).click();
  const matrix = page.getByRole("table", {
    name: "Confusion matrix for Logistic regression",
    exact: true,
  });
  await expect(matrix.locator("td strong")).toHaveText([
    "634",
    "14",
    "6",
    "48",
  ]);
  await expect(matrix.locator("td small")).toHaveText([
    "97.8% of row",
    "2.2% of row",
    "11.1% of row",
    "88.9% of row",
  ]);
  for (const [name, scores] of Object.entries(metrics.test)) {
    await expect(
      page.getByRole("meter", { name: `${name} PR-AUC`, exact: true }),
    ).toHaveAttribute(
      "aria-valuenow",
      String((scores as { pr_auc: number }).pr_auc),
    );
  }
  await page.getByRole("tab", { name: "Discover", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Inspect candidate 3", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("3D feature view renders, supports keyboard controls and survives tab switches", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await saved(page);
  await expect(page.locator(".three-canvas")).toHaveCount(0);
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await expect(page.locator('.three-canvas[data-ready="true"]')).toBeVisible();
  await page.getByRole("button", { name: "Rotate view", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("button", { name: "Select plotted candidate 2", exact: true })
    .click();
  await expect(page.locator(".feature-readout")).toContainText("Candidate 2");
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  await page.getByRole("tab", { name: "Evidence", exact: true }).click();
  await page.getByRole("tab", { name: "Discover", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "3D", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", {
      name: "Select plotted candidate 2",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.locator(".feature-figure").screenshot({
    path: `../docs/review/research-3d-${info.project.name}.png`,
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await expect(page.locator(".three-canvas")).toHaveCount(0);
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await expect(page.locator('.three-canvas[data-ready="true"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test("unavailable WebGL leaves 2D research figures usable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      ...args: Parameters<typeof original>
    ) {
      if (String(args[0]).includes("webgl")) return null;
      return original.apply(this, args);
    } as typeof original;
  });
  await saved(page);
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await expect(
    page.getByText(
      "3D is unavailable in this browser. Use the 2D view to explore the same candidates.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await page
    .getByRole("button", { name: "Select plotted candidate 2", exact: true })
    .click();
  await expect(page.locator(".feature-readout")).toContainText("Candidate 2");
});

test("research figures remain readable and accessible at review widths", async ({
  page,
}, info) => {
  await saved(page);
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [tab, selector] of [
      ["Discover", ".candidate-figures"],
      ["Evidence", ".similarity-figure"],
      ["Evaluation", ".evaluation-figures"],
    ]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      await expect(page.locator(selector)).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.locator(selector).screenshot({
        path: `../docs/review/research-${tab.toLowerCase()}-${info.project.name}-${width}.png`,
      });
    }
  }
});

test("3D stays optional when its on-demand download fails", async ({
  page,
}) => {
  const directory = "out/_next/static/chunks";
  const rendererChunks = fs
    .readdirSync(directory)
    .filter(
      (file) =>
        file.endsWith(".js") &&
        fs
          .readFileSync(`${directory}/${file}`, "utf8")
          .includes("THREE.WebGLRenderer"),
    );
  expect(rendererChunks.length).toBeGreaterThan(0);
  const requested: string[] = [];
  page.on("request", (request) => requested.push(request.url()));
  await saved(page);
  expect(
    requested.some((url) =>
      rendererChunks.some((file) => url.endsWith(`/${file}`)),
    ),
  ).toBe(false);
  for (const file of rendererChunks)
    await page.route(`**/_next/static/chunks/${file}`, (route) =>
      route.abort(),
    );
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await expect(
    page.getByText(
      "The 3D viewer could not be downloaded. Switch to 2D to continue exploring the candidates.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Select candidate 1 in feature plot",
      exact: true,
    }),
  ).toBeVisible();
});
