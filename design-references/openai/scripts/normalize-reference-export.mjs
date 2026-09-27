import fs from "node:fs/promises";
import path from "node:path";

// Next 16.3.5 normalizes an /index/... app route to /index/index/...
// when copying its HTML and full RSC payload into the static export. Segment
// payloads already use the public pathname. Restore the five supplied URLs
// without requiring a runtime server or a host-specific rewrite.
const plans = JSON.parse(await fs.readFile("docs/output-plan.json", "utf8"));
for (const plan of plans) {
  const route = new URL(plan.url).pathname;
  if (!route.startsWith("/index/")) throw new Error(`Unexpected reference route: ${route}`);
  const target = path.join("out", route);
  const normalized = path.join("out/index", route);
  for (const filename of ["index.html", "index.txt"]) {
    const destination = path.join(target, filename);
    try { await fs.access(destination); }
    catch {
      await fs.mkdir(target, { recursive: true });
      await fs.copyFile(path.join(normalized, filename), destination);
    }
  }
  const html = await fs.readFile(path.join(target, "index.html"), "utf8");
  if (!html.includes('id="reference-capture"')) throw new Error(`Missing reference content: ${route}`);
}
console.log(`Verified ${plans.length} exported reference pathnames.`);
