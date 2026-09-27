import { loadAsset, loadManifest, requestKey } from "./assets";
import { analyze } from "./pipeline";
import { parseInterval, parseSequence, type Exon } from "./sequence";
import { loadVienna } from "./wasm";
import type {
  ModelAsset,
  ReferenceAsset,
  WorkerRequest,
  WorkerResponse,
} from "./types";

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type !== "analyze") return;
  const send = (message: WorkerResponse) => self.postMessage(message);
  const progress = (stage: string, completed = 0, total = 0) =>
    send({ type: "progress", id: request.id, stage, completed, total });
  try {
    const parsed = parseSequence(
      request.sequence_text,
      request.options.input_id,
    );
    progress("Downloading folding engine and reference data");
    const manifest = await loadManifest();
    const interval =
      request.options.input_type === "genomic" &&
      request.options.mask_mode !== "none"
        ? parseInterval(parsed.description, parsed.sequence.length)
        : null;
    const annotation = interval
      ? manifest.annotations[interval.chrom]?.[request.options.mask_mode]
      : undefined;
    if (interval && !annotation)
      throw new Error(
        `No annotation index is available for ${interval.chrom}. Choose no masking to analyze without protein-region exclusion.`,
      );
    const [engine, model, references, exons, key] = await Promise.all([
      loadVienna(manifest.base + "engine/"),
      loadAsset<ModelAsset>(manifest, manifest.model),
      Promise.all(
        manifest.references.map((name) =>
          loadAsset<ReferenceAsset>(manifest, name),
        ),
      ),
      annotation ? loadAsset<Exon[]>(manifest, annotation) : undefined,
      requestKey(request.sequence_text, request.options, manifest),
    ]);
    const result = analyze(
      request.sequence_text,
      request.options,
      { model, references, exons },
      engine,
      progress,
    );
    progress("Laying out secondary structures");
    const layouts = Object.fromEntries(
      result.export_candidates.map((c) => [c.id, engine.layout(c.dot_bracket)]),
    );
    send({
      type: "result",
      id: request.id,
      analysis: {
        result,
        layouts,
        provenance: {
          engine: manifest.engine,
          data: manifest.version,
          key,
          source: "live",
        },
        memory_bytes: engine.memory(),
      },
    });
  } catch (error) {
    send({
      type: "error",
      id: request.id,
      message:
        error instanceof Error
          ? error.message
          : "Analysis could not complete. Retry with a shorter sequence.",
    });
  }
};
