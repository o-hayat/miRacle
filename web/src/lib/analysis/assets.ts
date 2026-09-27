import type { AnalysisOptions, Manifest } from "./types";
import { parseSequence } from "./sequence";
import { DATA_VERSION } from "../data-version";

export async function sha256(bytes: Uint8Array) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    bytes as Uint8Array<ArrayBuffer>,
  );
  return Array.from(new Uint8Array(hash), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
}
export async function requestKey(
  text: string,
  options: AnalysisOptions,
  manifest: Manifest,
) {
  const parsed = parseSequence(text, options.input_id);
  return sha256(
    new TextEncoder().encode(
      JSON.stringify([
        manifest.engine,
        manifest.version,
        parsed.sequence,
        parsed.description,
        parsed.identifier,
        options.input_type,
        options.mask_mode,
      ]),
    ),
  );
}
export async function loadManifest(): Promise<Manifest> {
  const response = await fetch("/data/manifest.json", {
    cache: "no-cache",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw new Error(
      "The analysis data manifest is unavailable. Check your connection and retry.",
    );
  const m: Manifest = await response.json();
  if (
    m.schema !== 1 ||
    m.engine !== "ViennaRNA-2.7.2-RNAfold-windows-v1" ||
    m.version !== DATA_VERSION
  )
    throw new Error(
      "This data version is incompatible. Reload the page to update miRacle.",
    );
  return m;
}
export async function loadAsset<T>(
  manifest: Manifest,
  name: string,
): Promise<T> {
  const entry = manifest.files[name];
  if (!entry)
    throw new Error(
      `The required data asset ${name} is missing. Rebuild or reload the site.`,
    );
  try {
    const response = await fetch(manifest.base + name, {
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length !== entry.bytes || (await sha256(bytes)) !== entry.sha256)
      throw new Error("Asset integrity check failed");
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch (error) {
    throw new Error(
      `Could not load ${name}. Check your connection and retry. ${error instanceof Error ? error.message : ""}`,
    );
  }
}
