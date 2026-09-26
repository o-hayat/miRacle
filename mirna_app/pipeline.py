from __future__ import annotations

import time
from pathlib import Path

from .exon_mask import mask_hg38_coding_exons
from .features import extract_features, passes_candidate_gate
from .folding import ScanOutcome, scan_local_structures
from .model import load_scorer
from .sequence import parse_sequence_text, reverse_complement_rna, reverse_hit_to_forward
from .similarity import load_reference_matcher
from .types import AnalysisResult, CandidateResult, FoldHit


LIMITATIONS = [
    "Sequence-only evidence: expression and precise Drosha/Dicer processing were not tested.",
    "A high score reflects similarity to the training data, not experimental validation.",
    "Candidate boundaries are computational approximations.",
]

RFAM_DECOY_PATH = (
    Path(__file__).resolve().parent.parent
    / "assets"
    / "references"
    / "rfam_ncrna_decoys.fa"
)

REFERENCE_DIR = Path(__file__).resolve().parent.parent / "assets" / "references"
COMPARATIVE_REFERENCE_SETS = (
    ("House mouse", "MirGeneDB 3.0", REFERENCE_DIR / "mmu_precursors_mirgenedb.fa"),
    ("Sumatran orangutan", "MirGeneDB 3.0", REFERENCE_DIR / "pab_precursors_mirgenedb.fa"),
    ("Chimpanzee", "miRBase 22", REFERENCE_DIR / "ptr_precursors_mirbase22.fa"),
    ("Gorilla", "miRBase 22", REFERENCE_DIR / "ggo_precursors_mirbase22.fa"),
    ("Bottlenose dolphin", "RNAcentral/Ensembl panel", REFERENCE_DIR / "ttr_precursors_rnacentral.fa"),
)


def _interval_iou(left: CandidateResult, right: CandidateResult) -> float:
    intersection = max(0, min(left.end, right.end) - max(left.start, right.start) + 1)
    union = (left.end - left.start + 1) + (right.end - right.start + 1) - intersection
    return intersection / max(1, union)


def _non_maximum_suppression(candidates: list[CandidateResult], threshold: float = 0.60) -> list[CandidateResult]:
    selected: list[CandidateResult] = []
    for candidate in sorted(candidates, key=lambda item: item.model_score, reverse=True):
        if all(
            candidate.strand != kept.strand or _interval_iou(candidate, kept) < threshold
            for kept in selected
        ):
            selected.append(candidate)
    return selected


def _candidate_summary(candidate: CandidateResult, threshold: float) -> list[str]:
    f = candidate.features
    if candidate.model_score >= threshold:
        priority = "Model score passes the validation-selected prioritization threshold."
    else:
        priority = "Model score is below the validation-selected prioritization threshold."
    structure = (
        "Supportive single-hairpin geometry with a sustained paired stem."
        if f["paired_fraction"] >= 0.5 and f["longest_stem"] >= 5
        else "Hairpin geometry passes the loose screen but has weaker stem continuity."
    )
    energy = (
        "Folding energy is favorable after normalizing for candidate length."
        if f["mfe_per_nt"] <= -0.25
        else "Folding energy passes the loose screen but is not strongly favorable."
    )
    match = candidate.nearest_reference
    if match.identity >= 0.90 and match.coverage >= 0.85:
        reference = f"Near-exact curated reference match: {match.name}."
    elif match.identity >= 0.75 and match.coverage >= 0.70:
        reference = f"Moderate sequence similarity to curated reference {match.name}."
    else:
        reference = "No close curated precursor match; this does not establish novelty."
    conflict = candidate.nearest_non_mirna
    if conflict.identity >= 0.90 and conflict.coverage >= 0.85:
        non_mirna = f"Caution: close match to a curated Rfam non-miRNA ({conflict.name})."
    else:
        non_mirna = "No near-exact match to the bundled Rfam non-miRNA decoy set."
    return [priority, structure, energy, reference, non_mirna]


def _make_candidate(hit: FoldHit, input_length: int, index: int) -> CandidateResult:
    if hit.strand == "-":
        start, end = reverse_hit_to_forward(hit.start, hit.end, input_length)
    else:
        start, end = hit.start, hit.end
    return CandidateResult(
        id=f"raw-{index}",
        start=start,
        end=end,
        strand=hit.strand,
        sequence_rna=hit.sequence,
        dot_bracket=hit.structure,
        mfe_kcal_mol=hit.mfe,
        features=extract_features(hit),
        limitations=list(LIMITATIONS),
    )


def analyze(
    sequence: str,
    input_type: str = "genomic",
    input_id: str = "input_sequence",
    exclude_coding_exons: bool = True,
    exon_mask_mode: str = "cds",
) -> AnalysisResult:
    """Run the complete local candidate-ranking pipeline."""
    started = time.perf_counter()
    parsed = parse_sequence_text(sequence, fallback_id=input_id)
    if input_type not in {"genomic", "rna"}:
        raise ValueError("input_type must be 'genomic' or 'rna'.")

    warnings: list[str] = []
    analysis_sequence = parsed.sequence
    genomic_interval = None
    masked_exonic_nt = 0
    overlapping_coding_genes: list[str] = []
    if input_type == "genomic" and exclude_coding_exons:
        mask = mask_hg38_coding_exons(parsed.sequence, parsed.description, mode=exon_mask_mode)
        analysis_sequence = mask.sequence
        genomic_interval = mask.interval.label if mask.interval else None
        masked_exonic_nt = mask.masked_nt
        overlapping_coding_genes = list(mask.genes)
        if mask.status.startswith("not applied"):
            warnings.append("Coding-exon exclusion was " + mask.status + ".")
        elif mask.masked_nt:
            gene_note = f" across {len(mask.genes)} gene(s)" if mask.genes else ""
            warnings.append(
                f"Masked {mask.masked_nt:,} nt overlapping annotated hg38 RefSeq protein-coding exons{gene_note}."
            )
    if "N" in parsed.sequence:
        warnings.append("Regions containing N were skipped; coordinates still refer to the full input.")

    outcomes: list[ScanOutcome] = [scan_local_structures(analysis_sequence, "+")]
    if input_type == "genomic":
        outcomes.append(scan_local_structures(reverse_complement_rna(analysis_sequence), "-"))

    raw_hits = [hit for outcome in outcomes for hit in outcome.hits]
    candidates: list[CandidateResult] = []
    for index, hit in enumerate(raw_hits, start=1):
        candidate = _make_candidate(hit, len(parsed.sequence), index)
        if passes_candidate_gate(candidate.features):
            candidates.append(candidate)

    scorer = load_scorer()
    if scorer.is_fallback:
        warnings.append(
            "The bundled supervised model was not found; scores use the transparent heuristic fallback."
        )
    scores = scorer.score_many([candidate.features for candidate in candidates])
    for candidate, score in zip(candidates, scores):
        candidate.model_score = score

    candidates = _non_maximum_suppression(candidates)[:25]
    matcher = load_reference_matcher()
    decoy_matcher = load_reference_matcher(str(RFAM_DECOY_PATH), "Non-miRNA", "Rfam")
    comparative_matchers = [
        load_reference_matcher(str(path), species, source)
        for species, source, path in COMPARATIVE_REFERENCE_SETS
    ]
    if not matcher.records:
        warnings.append("Curated reference FASTA is unavailable; similarity annotations are empty.")

    for rank, candidate in enumerate(candidates, start=1):
        candidate.rank = rank
        candidate.id = f"candidate-{rank}"
        candidate.nearest_reference = matcher.match(candidate.sequence_rna)
        candidate.nearest_non_mirna = decoy_matcher.match(candidate.sequence_rna)
        candidate.comparative_matches = [
            comparative_matcher.match(candidate.sequence_rna)
            for comparative_matcher in comparative_matchers
        ]
        candidate.influences = scorer.explain(candidate.features)
        candidate.summary = _candidate_summary(candidate, scorer.threshold)

    if not candidates:
        warnings.append(
            "No local structure passed the loose precursor-like filters. This is a valid negative result, not proof that the region lacks functional RNA."
        )

    scanners = ", ".join(dict.fromkeys(outcome.scanner for outcome in outcomes))
    runtime_ms = int((time.perf_counter() - started) * 1000)
    return AnalysisResult(
        input_id=parsed.identifier,
        input_length=len(parsed.sequence),
        runtime_ms=runtime_ms,
        warnings=warnings,
        candidates=candidates[:10],
        export_candidates=candidates,
        scanner=scanners,
        model_name=scorer.name,
        score_threshold=scorer.threshold,
        genomic_interval=genomic_interval,
        masked_exonic_nt=masked_exonic_nt,
        overlapping_coding_genes=overlapping_coding_genes,
        exon_mask_mode=exon_mask_mode if input_type == "genomic" and exclude_coding_exons else "none",
    )
