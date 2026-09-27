// Run after building the reference app and serving its out/ directory on :3002.
import { chromium } from "../web/node_modules/playwright-core/index.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const root = path.resolve("design-references/openai");
const plans = JSON.parse(await fs.readFile(path.join(root, "docs/output-plan.json"), "utf8"));
const browser = await chromium.launch();
const report = [];
try {
  for (const plan of plans) {
    for (const width of [390, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
      const errors = [];
      const failures = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("response", response => {
        if (response.url().startsWith("http://127.0.0.1:3002/") && response.status() >= 400) failures.push(response.url());
      });
      const route = new URL(plan.url).pathname;
      await page.goto("http://127.0.0.1:3002" + route);
      await page.evaluate(async () => {
        await document.fonts.ready;
        // Load the captured images before checking the entire article.
        document.querySelectorAll("img").forEach(image => image.loading = "eager");
        await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
      });
      const state = await page.evaluate(() => ({
        heading: document.querySelector("main h1")?.textContent,
        overflow: document.documentElement.scrollWidth > innerWidth,
        brokenImages: [...document.images].filter(image => !image.naturalWidth).map(image => image.src),
        chartCount: document.querySelectorAll("svg.marks").length,
      }));
      const screenshot = path.join(root, plan.screenshots, `local-${width}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      report.push({ route, width, ...state, errors, failures });
      assert.ok(state.heading, `${route}: missing article heading`);
      assert.equal(state.overflow, false, `${route} at ${width}: horizontal overflow`);
      assert.deepEqual(state.brokenImages, [], `${route}: missing images`);
      assert.deepEqual(errors, [], `${route}: browser errors`);
      assert.deepEqual(failures, [], `${route}: unavailable local assets`);
      await page.close();
      console.log(`${width}px ${route}: passed`);
    }
  }
} finally {
  await browser.close();
  await fs.writeFile(path.join(root, "docs/verification.json"), JSON.stringify(report, null, 2));
}
