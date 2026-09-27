import fs from "node:fs";
import path from "node:path";
import { Workspace } from "@/components/workspace";
import type { Manifest } from "@/lib/analysis/types";

export default function Page() {
  const root = path.join(process.cwd(), "public");
  const manifest: Manifest = JSON.parse(
    fs.readFileSync(path.join(root, "data/manifest.json"), "utf8"),
  );
  const read = (name: string) =>
    JSON.parse(fs.readFileSync(path.join(root, manifest.base, name), "utf8"));
  return (
    <Workspace
      manifest={manifest}
      examples={read(manifest.examples)}
      metrics={read(manifest.metrics)}
      signature={read("signature.json")}
    />
  );
}
