import { test, expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { WORKER_PATH } from "../../src/lib/worker-path";
import type { BrowserAnalysis } from "../../src/lib/analysis/types";
import { runAnalysis } from "./helpers";

function compare(actual: unknown, expected: unknown, location = "result") {
  if (location.endsWith("runtime_ms")) return;
  if (typeof expected === "number") {
    assert.equal(typeof actual, "number", location);
    const tolerance = location.includes("layouts")
      ? 0
      : location.includes("mfe")
        ? 1e-5
        : 1e-7;
    assert.ok(
      Math.abs((actual as number) - expected) <= tolerance,
      `${location}: ${actual} != ${expected} (tolerance ${tolerance})`,
    );
  } else if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), location);
    const array = actual as unknown[];
    assert.equal(array.length, expected.length, `${location}.length`);
    expected.forEach((v, i) => compare(array[i], v, `${location}[${i}]`));
  } else if (expected && typeof expected === "object") {
    assert.ok(actual && typeof actual === "object", location);
    assert.deepEqual(
      Object.keys(actual).sort(),
      Object.keys(expected).sort(),
      `${location}.keys`,
    );
    for (const [k, v] of Object.entries(expected))
      compare((actual as Record<string, unknown>)[k], v, `${location}.${k}`);
  } else assert.equal(actual, expected, location);
}

test("all 60 bundled control/preprocessing outputs match Python in the exported worker", async ({
  page,
}, info) => {
  test.setTimeout(600000);
  await page.goto("/");
  const files: string[] = JSON.parse(
    fs.readFileSync("tests/fixtures/index.json", "utf8"),
  );
  const times: { file: string; runtime_ms: number; wasm_heap_bytes: number }[] =
    [];
  for (const file of files) {
    const fixture = JSON.parse(
      fs.readFileSync(`tests/fixtures/${file}`, "utf8"),
    );
    const output = await page.evaluate(
      ({ workerPath, text, options }) =>
        new Promise<BrowserAnalysis>((resolve, reject) => {
          const worker = new Worker(workerPath, { type: "module" });
          worker.onerror = (e) => {
            worker.terminate();
            reject(e.message);
          };
          worker.onmessage = (e) => {
            if (e.data.type === "result") {
              worker.terminate();
              resolve(e.data.analysis);
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
    compare(output.result, fixture.analysis.result, file);
    compare(output.layouts, fixture.analysis.layouts, `${file}.layouts`);
    assert.equal(output.provenance.key, fixture.analysis.provenance.key);
    times.push({
      file,
      runtime_ms: output.result.runtime_ms,
      wasm_heap_bytes: output.memory_bytes,
    });
  }
  fs.writeFileSync(
    `../docs/review/parity-${info.project.name}.json`,
    JSON.stringify(times, null, 2),
  );
});

test("20,000 nt stays responsive and records runtime and memory", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  await page.goto("/");
  const mir21 = JSON.parse(
    fs.readFileSync("tests/fixtures/mir21_region-cds.json", "utf8"),
  )
    .text.split("\n")
    .slice(1)
    .join("");
  const sequence = mir21.repeat(30).slice(0, 20000);
  let peakRssKiB = 0;
  // macOS/Linux process RSS sum for the Playwright browser executable tree.
  const sample = () => {
    try {
      const rows = execFileSync("ps", ["-axo", "rss=,command="], {
        encoding: "utf8",
      }).split("\n");
      const rss = rows
        .filter((row) => row.includes("ms-playwright/"))
        .reduce((sum, row) => sum + Number(row.trim().split(/\s/)[0]), 0);
      peakRssKiB = Math.max(peakRssKiB, rss);
    } catch {
      /* RSS sampling is optional on platforms without ps. */
    }
  };
  sample();
  const timer = setInterval(sample, 1000);
  try {
    const output = await page.evaluate(
      ({ workerPath, sequence }) =>
        new Promise<{
          analysis: BrowserAnalysis;
          ticks: number;
          maxTickGapMs: number;
          wallMs: number;
        }>((resolve, reject) => {
          const began = performance.now();
          let ticks = 0,
            last = began,
            maxGap = 0;
          const ticker = setInterval(() => {
            const now = performance.now();
            ticks++;
            maxGap = Math.max(maxGap, now - last);
            last = now;
          }, 50);
          const worker = new Worker(workerPath, { type: "module" });
          worker.onerror = (e) => {
            clearInterval(ticker);
            worker.terminate();
            reject(e.message);
          };
          worker.onmessage = (e) => {
            if (e.data.type === "result") {
              clearInterval(ticker);
              worker.terminate();
              resolve({
                analysis: e.data.analysis,
                ticks,
                maxTickGapMs: maxGap,
                wallMs: performance.now() - began,
              });
            } else if (e.data.type === "error") {
              clearInterval(ticker);
              worker.terminate();
              reject(e.data.message);
            }
          };
          worker.postMessage({
            type: "analyze",
            id: "long",
            sequence_text: sequence,
            options: {
              input_type: "genomic",
              input_id: "benchmark-20000",
              mask_mode: "none",
            },
          });
        }),
      { workerPath: WORKER_PATH, sequence },
    );
    expect(output.analysis.result.input_length).toBe(20000);
    expect(output.ticks).toBeGreaterThan(20);
    expect(output.maxTickGapMs).toBeLessThan(1000);
    fs.writeFileSync(
      `../docs/review/performance-${info.project.name}.json`,
      JSON.stringify(
        {
          inputLength: 20000,
          runtimeMs: output.analysis.result.runtime_ms,
          wallMs: output.wallMs,
          mainThreadTicks: output.ticks,
          maxTickGapMs: output.maxTickGapMs,
          wasmHeapBytes: output.analysis.memory_bytes,
          peakBrowserRssKiB: peakRssKiB,
          rssMethod:
            "ps RSS sum of processes with ms-playwright executable paths, sampled once per second; may count shared pages more than once",
        },
        null,
        2,
      ),
    );
  } finally {
    clearInterval(timer);
  }
});

test("accessible initial page and loaded results", async ({ page }) => {
  await page.goto("/");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await runAnalysis(page);
  await expect(
    page.getByRole("region", { name: "Analysis results" }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test("missing reference assets fail explicitly and external controls show primary evidence", async ({
  page,
}) => {
  await page.goto("/");
  await page.route("**/references/1.json", (r) =>
    r.fulfill({ status: 404, body: "missing" }),
  );
  await page
    .getByRole("button", { name: "Run candidate scan", exact: true })
    .click();
  await expect(
    page.getByText(/Could not load references\/1.json/),
  ).toBeVisible();
  await page.unroute("**/references/1.json");
  await page
    .getByRole("button", { name: "Reference controls", exact: true })
    .click();
  await page.getByRole("combobox", { name: "Example", exact: true }).click();
  await page
    .getByRole("option", { name: "External MIR630 — AGO2 RIP", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Load selected control", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Run candidate scan", exact: true })
    .click();
  await expect(
    page.getByText("Analysis complete.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Evidence", exact: true }).click();
  const row = page
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: "AGO2", exact: true }) });
  await expect(row).toContainText("Supported interaction");
  await expect(row.getByRole("link")).toHaveAttribute(
    "href",
    "https://pubmed.ncbi.nlm.nih.gov/38991944/",
  );
});
