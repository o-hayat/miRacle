import { extractFeatures, passesGate } from "./features";
import { explain, score } from "./model";
import { emptyMatch, matchReference } from "./similarity";
import {
  maskSequence,
  parseInterval,
  parseSequence,
  reverseComplement,
  reverseCoordinates,
  validSegments,
  type Exon,
} from "./sequence";
import type {
  AnalysisOptions,
  AnalysisResult,
  CandidateResult,
  FoldHit,
  ModelAsset,
  ReferenceAsset,
} from "./types";
import type { FoldingEngine } from "./wasm";

export const LIMITATIONS = [
  "Sequence-only evidence: expression and precise Drosha/Dicer processing were not tested.",
  "A high score reflects similarity to the training data, not experimental validation.",
  "Candidate boundaries are computational approximations.",
];
export type Progress = (
  stage: string,
  completed: number,
  total: number,
) => void;
export interface PipelineAssets {
  model: ModelAsset;
  references: ReferenceAsset[];
  exons?: Exon[];
}

export function windows(sequence: string, strand: "+" | "-") {
  const result: Omit<FoldHit, "structure" | "mfe">[] = [];
  for (const [offset, segment] of validSegments(sequence)) {
    const lengths =
      segment.length <= 120
        ? [
            ...new Set([
              segment.length,
              ...[60, 70, 90, 110].filter((n) => n <= segment.length),
            ]),
          ].sort((a, b) => a - b)
        : [60, 70, 90, 110];
    for (const length of lengths) {
      if (length > segment.length) continue;
      const starts: number[] = [];
      for (let i = 0; i <= segment.length - length; i += 10) starts.push(i);
      const last = segment.length - length;
      if (!starts.includes(last)) starts.push(last);
      for (const local of starts)
        result.push({
          start: offset + local + 1,
          end: offset + local + length,
          strand,
          sequence: segment.slice(local, local + length),
        });
    }
  }
  return result;
}
export function suppressOverlap(candidates: CandidateResult[]) {
  const kept: CandidateResult[] = [];
  for (const c of [...candidates].sort(
    (a, b) => b.model_score - a.model_score,
  )) {
    if (
      kept.every((k) => {
        if (c.strand !== k.strand) return true;
        const intersection = Math.max(
          0,
          Math.min(c.end, k.end) - Math.max(c.start, k.start) + 1,
        );
        return (
          intersection /
            Math.max(
              1,
              c.end - c.start + 1 + k.end - k.start + 1 - intersection,
            ) <
          0.6
        );
      })
    )
      kept.push(c);
  }
  return kept;
}
export function candidateSummary(c: CandidateResult, threshold: number) {
  const f = c.features,
    m = c.nearest_reference,
    d = c.nearest_non_mirna;
  return [
    c.model_score >= threshold
      ? "Model score passes the validation-selected prioritization threshold."
      : "Model score is below the validation-selected prioritization threshold.",
    f.paired_fraction >= 0.5 && f.longest_stem >= 5
      ? "Supportive single-hairpin geometry with a sustained paired stem."
      : "Hairpin geometry passes the loose screen but has weaker stem continuity.",
    f.mfe_per_nt <= -0.25
      ? "Folding energy is favorable after normalizing for candidate length."
      : "Folding energy passes the loose screen but is not strongly favorable.",
    m.identity >= 0.9 && m.coverage >= 0.85
      ? `Near-exact curated reference match: ${m.name}.`
      : m.identity >= 0.75 && m.coverage >= 0.7
        ? `Moderate sequence similarity to curated reference ${m.name}.`
        : "No close curated precursor match; this does not establish novelty.",
    d.identity >= 0.9 && d.coverage >= 0.85
      ? `Caution: close match to a curated Rfam non-miRNA (${d.name}).`
      : "No near-exact match to the bundled Rfam non-miRNA decoy set.",
  ];
}

export function analyze(
  text: string,
  options: AnalysisOptions,
  assets: PipelineAssets,
  engine: FoldingEngine,
  progress: Progress = () => {},
): AnalysisResult {
  const began = performance.now(),
    parsed = parseSequence(text, options.input_id);
  if (!["genomic", "rna"].includes(options.input_type))
    throw new Error("input_type must be 'genomic' or 'rna'.");
  if (!["cds", "all_exons", "none"].includes(options.mask_mode))
    throw new Error("Unsupported preprocessing mode.");
  let sequence = parsed.sequence,
    genomic_interval: string | null = null,
    masked_exonic_nt = 0,
    overlapping_coding_genes: string[] = [];
  const warnings: string[] = [],
    mask = options.input_type === "genomic" && options.mask_mode !== "none";
  if (mask) {
    const interval = parseInterval(parsed.description, parsed.sequence.length);
    if (!interval)
      warnings.push(
        "Coding-exon exclusion was not applied: header needs a length-matched hg38/GRCh38 chr:start-end interval.",
      );
    else {
      if (!assets.exons)
        throw new Error(
          `The ${interval.chrom} annotation asset is unavailable. Retry the download or explicitly choose no masking.`,
        );
      const masked = maskSequence(
        sequence,
        interval.start,
        interval.end,
        assets.exons,
      );
      sequence = masked.sequence;
      genomic_interval = interval.label;
      masked_exonic_nt = masked.masked_nt;
      overlapping_coding_genes = masked.genes;
      if (masked_exonic_nt)
        warnings.push(
          `Masked ${masked_exonic_nt.toLocaleString("en-US")} nt overlapping annotated hg38 RefSeq protein-coding exons${masked.genes.length ? ` across ${masked.genes.length} gene(s)` : ""}.`,
        );
    }
  }
  if (parsed.sequence.includes("N"))
    warnings.push(
      "Regions containing N were skipped; coordinates still refer to the full input.",
    );
  const inputs = [
    ...windows(sequence, "+"),
    ...(options.input_type === "genomic"
      ? windows(reverseComplement(sequence), "-")
      : []),
  ];
  const raw: CandidateResult[] = [];
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i],
      fold = engine.fold(input.sequence),
      hit = { ...input, ...fold };
    const features = extractFeatures(hit);
    if (passesGate(features)) {
      const [start, end] =
        hit.strand === "-"
          ? reverseCoordinates(hit.start, hit.end, sequence.length)
          : [hit.start, hit.end];
      raw.push({
        id: `raw-${i + 1}`,
        start,
        end,
        strand: hit.strand,
        sequence_rna: hit.sequence,
        dot_bracket: hit.structure,
        mfe_kcal_mol: hit.mfe,
        features,
        model_score: score(features, assets.model),
        rank: 0,
        nearest_reference: emptyMatch(),
        nearest_non_mirna: emptyMatch(),
        comparative_matches: [],
        influences: [],
        summary: [],
        limitations: [...LIMITATIONS],
      });
    }
    if (i % 20 === 0 || i === inputs.length - 1)
      progress("Folding and scoring windows", i + 1, inputs.length);
  }
  const candidates = suppressOverlap(raw).slice(0, 25);
  candidates.forEach((c, i) => {
    c.rank = i + 1;
    c.id = `candidate-${i + 1}`;
    c.nearest_reference = matchReference(c.sequence_rna, assets.references[0]);
    c.nearest_non_mirna = matchReference(c.sequence_rna, assets.references[1]);
    c.comparative_matches = assets.references
      .slice(2)
      .map((r) => matchReference(c.sequence_rna, r));
    c.influences = explain(c.features, assets.model);
    c.summary = candidateSummary(c, assets.model.threshold);
    progress("Matching independent reference panels", i + 1, candidates.length);
  });
  if (!candidates.length)
    warnings.push(
      "No local structure passed the loose precursor-like filters. This is a valid negative result, not proof that the region lacks functional RNA.",
    );
  return {
    input_id: parsed.identifier,
    input_length: parsed.sequence.length,
    runtime_ms: Math.floor(performance.now() - began),
    warnings,
    candidates: candidates.slice(0, 10),
    export_candidates: candidates,
    scanner: inputs.length
      ? "RNAfold multi-scale windows (60/70/90/110 nt)"
      : "No foldable N-free segment",
    model_name: assets.model.name,
    score_threshold: assets.model.threshold,
    genomic_interval,
    masked_exonic_nt,
    overlapping_coding_genes,
    exon_mask_mode: mask ? options.mask_mode : "none",
  };
}
