import { readdir, stat } from "node:fs/promises";
import path from "node:path";
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) =>
        e.isDirectory() ? walk(path.join(dir, e.name)) : path.join(dir, e.name),
      ),
    )
  ).flat();
}
const files = await walk("out");
let max = { file: "", bytes: 0 },
  total = 0;
for (const file of files) {
  const { size } = await stat(file);
  total += size;
  if (size > max.bytes) max = { file, bytes: size };
  if (size > 25 * 1024 ** 2) throw new Error(`Asset exceeds the project download budget of 25 MiB: ${file}`);
}

console.log(
  JSON.stringify(
    {
      assets: files.length,
      totalBytes: total,
      largest: max,
      projectAssetBudgetBytes: 25 * 1024 ** 2,
    },
    null,
    2,
  ),
);
