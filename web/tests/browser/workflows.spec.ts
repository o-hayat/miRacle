import { test, expect, type Page } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { WORKER_PATH } from "../../src/lib/worker-path";
import { runAnalysis } from "./helpers";

function csvCells(line: string) {
  const cells: string[] = [];
  let cell = "",
    quoted = false;
  for (let i = 0; i < line.length; i++) {
    const character = line[i];
    if (character === '"') {
      if (quoted && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else cell += character;
  }
  cells.push(cell);
  return cells;
}

function compareCsv(actual: string, expected: string) {
  const rows = actual.trim().split("\r\n").map(csvCells),
    expectedRows = expected.trim().split("\r\n").map(csvCells);
  assert.equal(rows.length, 26, "CSV must contain all 25 export candidates");
  assert.equal(rows.length, expectedRows.length);
  assert.deepEqual(rows[0], expectedRows[0]);
  for (let row = 1; row < rows.length; row++) {
    assert.equal(rows[row].length, expectedRows[row].length);
    rows[row].forEach((cell, column) => {
      const location = `CSV row ${row}, ${rows[0][column]}`;
      if ([7, 8, 10, 11, 13, 14].includes(column)) {
        const tolerance = column === 7 ? 1e-5 : 1e-7;
        assert.ok(
          Math.abs(Number(cell) - Number(expectedRows[row][column])) <=
            tolerance,
          location,
        );
      } else assert.equal(cell, expectedRows[row][column], location);
    });
  }
}

async function choose(page: Page, label: string, value: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: value, exact: true }).click();
}
test("live scan, candidate state, evidence, exports and comparison", async ({
  page,
}) => {
  const fixture = JSON.parse(
    fs.readFileSync("tests/fixtures/mir21_region-cds.json", "utf8"),
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "microRNA candidates",
  );
  await page
    .getByRole("button", { name: "Run candidate scan", exact: true })
    .click();
  await expect(
    page.getByText("Analysis complete.", { exact: true }),
  ).toBeVisible({ timeout: 90000 });
  await expect(
    page.getByRole("region", { name: "Analysis results" }),
  ).toContainText("99.5/100");
  await page
    .getByRole("button", { name: "Inspect candidate 2", exact: true })
    .click();
  await page.getByRole("tab", { name: "Evidence", exact: true }).click();
  await expect(page.getByText(/CANDIDATE 2 ·/)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "miRNA-associated protein machinery" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Discover", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Inspect candidate 2", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Base-pair arcs", exact: true })
    .click();
  await page.getByRole("tab", { name: "Evaluation", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Confusion matrix — Logistic regression",
    }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Discover", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Base-pair arcs", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  for (const [label, suffix] of [
    ["Download CSV", ".csv"],
    ["Download FASTA", ".fa"],
    ["Download structure SVG", ".svg"],
  ]) {
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: label, exact: true }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(new RegExp(`\\${suffix}$`));
    const content = fs.readFileSync((await file.path())!, "utf8");
    expect(content.length).toBeGreaterThan(100);
    if (suffix === ".csv") compareCsv(content, fixture.csv);
    if (suffix === ".fa") {
      expect(content.match(/^>/gm)).toHaveLength(25);
      assert.equal(content, fixture.fasta);
    }
    if (suffix === ".svg") expect(content).not.toMatch(/<script|onclick/);
  }
  await page
    .getByRole("tab", { name: "Compare controls", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Run comparison", exact: true })
    .click();
  await expect(page.getByText("+94.8 points", { exact: true })).toBeVisible({
    timeout: 90000,
  });
  await expect(page.getByText(/Expected contrast:/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("changed inputs mark previous results and uploads preserve local privacy", async ({
  page,
}) => {
  const sent: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET") sent.push(r.url());
  });
  await page.goto("/");
  await runAnalysis(page);
  await page
    .getByLabel("Sequence or FASTA", { exact: true })
    .fill("A".repeat(60));
  await expect(
    page.getByText(/The input or preprocessing has changed/),
  ).toBeVisible();
  await page.getByLabel("Upload one FASTA or text record").setInputFiles({
    name: "control.fa",
    mimeType: "text/plain",
    buffer: Buffer.from(">uploaded\n" + "A".repeat(60)),
  });
  await page
    .getByRole("button", { name: "Run candidate scan", exact: true })
    .click();
  await expect(
    page.getByText("Analysis complete.", { exact: true }),
  ).toBeVisible({ timeout: 90000 });
  await expect(
    page.getByText(
      /No local structure passed the loose precursor-like filters/,
    ),
  ).toBeVisible();
  expect(sent).toEqual([]);
});

test("validation, cancellation, repeated scans, and unavailable engine", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Sequence or FASTA", { exact: true })
    .fill(">first\n" + "A".repeat(60) + "\n>second\n" + "C".repeat(60));
  await page
    .getByRole("button", { name: "Run candidate scan", exact: true })
    .click();
  await expect(
    page.getByText("miRacle accepts exactly one FASTA record at a time."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reference controls", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Load selected control", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Run candidate scan", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Cancel analysis", exact: true })
    .click();
  await expect(
    page.getByText(/Analysis cancelled. You can edit/),
  ).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(
    page.getByRole("region", { name: "Analysis results" }),
  ).toHaveCount(0);
  await page.route("**/engine/*.wasm", (r) => r.abort());
  await page
    .getByRole("button", { name: "Run candidate scan", exact: true })
    .click();
  await expect(
    page.getByText(/folding engine could not be downloaded or initialized/),
  ).toBeVisible();
  await page.unroute("**/engine/*.wasm");
  await page
    .getByRole("button", { name: "Run candidate scan", exact: true })
    .click();
  await expect(
    page.getByText("Analysis complete.", { exact: true }),
  ).toBeVisible({ timeout: 90000 });
});

test("hg38 bundled loading and UCSC failures", async ({ page }) => {
  await page.goto("/");
  await choose(page, "Input method", "hg38 genomic coordinates");
  await page.getByRole("button", { name: "Load region", exact: true }).click();
  await expect(
    page.getByLabel("Sequence or FASTA", { exact: true }),
  ).toHaveValue(/^>hg38_chr17_59840773_59841772/);
  await page.route("https://api.genome.ucsc.edu/**", (r) => r.abort());
  await page.getByLabel("Start index", { exact: true }).fill("1000000");
  await page.getByLabel("End index", { exact: true }).fill("1001000");
  await page.getByRole("button", { name: "Load region", exact: true }).click();
  await expect(
    page.getByText(/could not be downloaded from UCSC/),
  ).toBeVisible();
});

test("keyboard, reduced motion and responsive screenshots", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to sequence analysis" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await page.getByRole("tab", { name: "Discover", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Compare controls", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Put a candidate in context." }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Discover", exact: true }).click();
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `../docs/review/${info.project.name}-${width}.png`,
      fullPage: true,
    });
  }
});

test("a real worker result matches the Python reference", async ({ page }) => {
  const fixture = JSON.parse(
    fs.readFileSync("tests/fixtures/mir21_region-cds.json", "utf8"),
  );
  await page.goto("/");
  const result = await page.evaluate(
    ({ workerPath, text, options }) =>
      new Promise<unknown>((resolve, reject) => {
        const worker = new Worker(workerPath, { type: "module" });
        worker.onerror = (e) => {
          worker.terminate();
          reject(e.message);
        };
        worker.onmessage = (e) => {
          if (e.data.type === "result") {
            worker.terminate();
            resolve(e.data.analysis.result);
          } else if (e.data.type === "error") {
            worker.terminate();
            reject(e.data.message);
          }
        };
        worker.postMessage({
          type: "analyze",
          id: "parity",
          sequence_text: text,
          options,
        });
      }),
    { workerPath: WORKER_PATH, text: fixture.text, options: fixture.options },
  );
  const actual = result as typeof fixture.analysis.result;
  expect(actual.candidates.length).toBe(10);
  for (let i = 0; i < 25; i++) {
    const a = actual.export_candidates[i],
      b = fixture.analysis.result.export_candidates[i];
    expect([
      a.start,
      a.end,
      a.strand,
      a.dot_bracket,
      a.nearest_reference.name,
    ]).toEqual([
      b.start,
      b.end,
      b.strand,
      b.dot_bracket,
      b.nearest_reference.name,
    ]);
    expect(Math.abs(a.model_score - b.model_score)).toBeLessThan(1e-7);
    expect(Math.abs(a.mfe_kcal_mol - b.mfe_kcal_mol)).toBeLessThan(1e-5);
  }
});
