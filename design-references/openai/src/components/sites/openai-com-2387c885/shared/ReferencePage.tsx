import fs from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import type { ReferenceContent } from "./types";
import { ReferenceInteractions } from "./ReferenceInteractions";
export async function ReferencePage({ pageKey }: { pageKey: string }) {
  const content: ReferenceContent = JSON.parse(await fs.readFile(path.join(process.cwd(), "docs/research/openai-com-2387c885", pageKey, "content.json"), "utf8"));
  return <>
    <div id="reference-capture" dangerouslySetInnerHTML={{ __html: content.html }} />
    <ReferenceInteractions content={content} />
    <aside className="reference-notice">Local design study for miRacle. <a href={content.url}>Original OpenAI article</a> · <Link href="/">All five references</Link></aside>
  </>;
}
