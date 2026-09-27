import fs from "node:fs";
import path from "node:path";
import { Workspace } from "@/components/workspace";
import type { Manifest } from "@/lib/analysis/types";

const description =
  "Find pre-miRNA-like hairpins in human DNA or RNA. miRacle folds sequences with ViennaRNA, ranks candidates, and shows the evidence, all in your browser.";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "miRacle",
  url: "https://miracle-vienna.tech/",
  description,
  applicationCategory: "ScienceApplication",
  operatingSystem: "Any",
  isAccessibleForFree: true,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  author: [
    {
      "@type": "Person",
      name: "Hayat",
      url: "https://github.com/o-hayat",
    },
    {
      "@type": "Person",
      name: "Helena",
      url: "https://github.com/halinamai",
    },
    {
      "@type": "Person",
      name: "Julian",
      url: "https://github.com/julian-at",
    },
  ],
};

export default function Page() {
  const root = path.join(process.cwd(), "public");
  const manifest: Manifest = JSON.parse(
    fs.readFileSync(path.join(root, "data/manifest.json"), "utf8"),
  );
  const read = (name: string) =>
    JSON.parse(fs.readFileSync(path.join(root, manifest.base, name), "utf8"));
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Workspace
        manifest={manifest}
        examples={read(manifest.examples)}
        metrics={read(manifest.metrics)}
        signature={read("signature.json")}
      />
    </>
  );
}
