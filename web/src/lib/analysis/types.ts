/** Mirrors mirna_app/types.py. Coordinates are 1-based, inclusive. */
export interface ReferenceMatch {
  name: string;
  identity: number;
  coverage: number;
  similarity: number;
  species: string;
  source: string;
}
export interface Influence {
  feature: string;
  delta_score: number;
  direction: "supports" | "cautions";
}
export interface CandidateResult {
  id: string;
  start: number;
  end: number;
  strand: "+" | "-";
  sequence_rna: string;
  dot_bracket: string;
  mfe_kcal_mol: number;
  features: Record<string, number>;
  model_score: number;
  rank: number;
  nearest_reference: ReferenceMatch;
  nearest_non_mirna: ReferenceMatch;
  comparative_matches: ReferenceMatch[];
  influences: Influence[];
  summary: string[];
  limitations: string[];
}
export interface AnalysisResult {
  input_id: string;
  input_length: number;
  runtime_ms: number;
  warnings: string[];
  candidates: CandidateResult[];
  export_candidates: CandidateResult[];
  scanner: string;
  model_name: string;
  score_threshold: number | null;
  genomic_interval: string | null;
  masked_exonic_nt: number;
  overlapping_coding_genes: string[];
  exon_mask_mode: string;
}
export interface FoldHit {
  start: number;
  end: number;
  strand: "+" | "-";
  sequence: string;
  structure: string;
  mfe: number;
}
export type MaskMode = "cds" | "all_exons" | "none";
export interface AnalysisOptions {
  input_type: "genomic" | "rna";
  input_id: string;
  mask_mode: MaskMode;
}
export type Coordinates = [number, number][];
export interface BrowserAnalysis {
  result: AnalysisResult;
  layouts: Record<string, Coordinates>;
  provenance: {
    engine: string;
    data: string;
    key: string;
    source: "live" | "saved";
  };
  memory_bytes: number;
}
export interface WorkerRequest {
  type: "analyze";
  id: string;
  sequence_text: string;
  options: AnalysisOptions;
}
export type WorkerResponse =
  | {
      type: "progress";
      id: string;
      stage: string;
      completed: number;
      total: number;
    }
  | { type: "result"; id: string; analysis: BrowserAnalysis }
  | { type: "error"; id: string; message: string };
export interface ModelAsset {
  feature_names: string[];
  mean: number[];
  scale: number[];
  coefficients: number[];
  intercept: number;
  medians: number[];
  threshold: number;
  name: string;
  feature_labels: Record<string, string>;
}
export interface ReferenceAsset {
  records: [string, string][];
  species: string;
  source: string;
  vocabulary: Record<string, number>;
  idf: number[];
  indptr: number[];
  indices: number[];
  data: number[];
}
export interface Manifest {
  schema: number;
  version: string;
  engine: string;
  base: string;
  model: string;
  references: string[];
  evidence: string;
  metrics: string;
  annotations: Record<string, Partial<Record<MaskMode, string>>>;
  examples: string;
  files: Record<string, { sha256: string; bytes: number }>;
}
export interface Example {
  name: string;
  label: string;
  text: string;
  saved: string;
}
export type EvidenceRow = Record<string, string>;
export interface EvidenceAsset {
  mature: [string, string][];
  external: [string, EvidenceRow][];
  literature: EvidenceRow[];
  targets: EvidenceRow[];
  proteins: {
    symbol: string;
    stage: string;
    relationship: string;
    candidate_specific: boolean;
  }[];
}
