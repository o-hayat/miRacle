from __future__ import annotations

import csv
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from .similarity import read_fasta
from .sequence import reverse_complement_rna
from .types import CandidateResult


ROOT = Path(__file__).resolve().parent.parent
MATURE_PATH = ROOT / "assets" / "references" / "hsa_mature.fa"
MIRTARBASE_PATH = ROOT / "assets" / "references" / "hsa_MTI.csv"
BUNDLED_TARGET_PATH = ROOT / "assets" / "references" / "known_target_examples.csv"
EXTERNAL_MACHINERY_PATH = ROOT / "assets" / "references" / "external_machinery_interactions.csv"
EXTERNAL_PANEL_PATH = ROOT / "assets" / "examples" / "external_ncbi_mirnas"
LITERATURE_PATH = ROOT / "assets" / "references" / "literature_summaries.csv"


@dataclass(frozen=True, slots=True)
class ProteinContext:
    symbol: str
    stage: str
    relationship: str
    candidate_specific: bool = False


@dataclass(frozen=True, slots=True)
class TargetEvidence:
    mature_mirna: str
    target_gene: str
    target_protein: str
    experiments: str
    support_type: str
    reference: str
    source_url: str = ""
    external_control: bool = False


@dataclass(frozen=True, slots=True)
class MachineryEvidence:
    mature_mirna: str
    protein: str
    result: str
    evidence_type: str
    experiment: str
    biological_context: str
    reference: str
    source_url: str


@dataclass(frozen=True, slots=True)
class LiteratureContext:
    display_name: str
    summary: str
    evidence: str
    caveat: str
    source_label: str
    source_url: str


BIOGENESIS_PROTEINS = (
    ProteinContext("DROSHA", "Nuclear cropping", "Cleaves pri-miRNA as part of the Microprocessor."),
    ProteinContext("DGCR8", "Nuclear recognition", "Recognizes pri-miRNA junctions with DROSHA."),
    ProteinContext("XPO5", "Nuclear export", "Exports suitable pre-miRNA-like hairpins."),
    ProteinContext("DICER1", "Cytoplasmic processing", "Cleaves pre-miRNA into a short duplex."),
    ProteinContext("TARBP2", "Dicer cofactor", "Supports DICER1 processing and duplex loading."),
    ProteinContext("AGO2", "RISC effector", "Binds a selected mature strand in RISC."),
    ProteinContext("TNRC6A", "Target repression", "Connects AGO-loaded miRNA to repression machinery."),
)


@lru_cache(maxsize=1)
def _mature_records() -> list[tuple[str, str]]:
    return read_fasta(MATURE_PATH)


@lru_cache(maxsize=1)
def _external_machinery_records() -> list[tuple[str, dict[str, str]]]:
    if not EXTERNAL_MACHINERY_PATH.exists():
        return []
    records: list[tuple[str, dict[str, str]]] = []
    with EXTERNAL_MACHINERY_PATH.open(newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            fasta_path = EXTERNAL_PANEL_PATH / row["fasta_file"]
            if not fasta_path.exists():
                continue
            fasta_records = read_fasta(fasta_path)
            if len(fasta_records) == 1:
                records.append((fasta_records[0][1], row))
    return records


def _matching_external_rows(candidate: CandidateResult) -> list[dict[str, str]]:
    """Match only exact contiguous sequence from a bundled external precursor."""
    sequence = candidate.sequence_rna
    matches: list[dict[str, str]] = []
    for precursor, row in _external_machinery_records():
        reverse = reverse_complement_rna(precursor)
        if sequence in precursor or precursor in sequence or sequence in reverse or reverse in sequence:
            matches.append(row)
    return matches


def mature_arms(candidate: CandidateResult) -> list[tuple[str, str]]:
    """Return mature annotation for an exact external segment or near-exact precursor."""
    external = _matching_external_rows(candidate)
    if external:
        seen: set[tuple[str, str]] = set()
        arms: list[tuple[str, str]] = []
        for row in external:
            item = (row["mature_mirna"], row["mature_sequence"])
            if item not in seen:
                seen.add(item)
                arms.append(item)
        return arms
    match = candidate.nearest_reference
    if match.identity < 0.95 or match.coverage < 0.90 or match.name.startswith("No close"):
        return []
    precursor_prefix = match.name.removesuffix("_pre")
    return [
        (name, sequence)
        for name, sequence in _mature_records()
        if name.startswith(precursor_prefix + "_")
    ]


def mirtarbase_names(arms: list[tuple[str, str]]) -> list[str]:
    """Conservatively translate simple MirGeneDB names to miRBase-style names."""
    names: list[str] = []
    for name, _ in arms:
        if "-P" in name or "-v" in name:
            continue
        if not name.startswith("Hsa-Mir-") or "_" not in name:
            continue
        stem, arm = name.rsplit("_", 1)
        names.append(stem.replace("Hsa-Mir-", "hsa-miR-") + "-" + arm)
    return names


def _field(row: dict[str, str], *needles: str) -> str:
    for key, value in row.items():
        normalized = key.lower().replace("_", " ")
        if all(needle in normalized for needle in needles):
            return (value or "").strip()
    return ""


def validated_targets(candidate: CandidateResult, limit: int = 12) -> list[TargetEvidence]:
    """Read optional miRTarBase CSV; no target inference is made for novel candidates."""
    arms = mature_arms(candidate)
    accepted_names = {name.lower() for name in mirtarbase_names(arms)}
    source_path = MIRTARBASE_PATH if MIRTARBASE_PATH.exists() else BUNDLED_TARGET_PATH
    if not accepted_names or not source_path.exists():
        return []
    results: list[TargetEvidence] = []
    with source_path.open(newline="", encoding="utf-8-sig", errors="replace") as handle:
        for row in csv.DictReader(handle):
            mirna = _field(row, "mirna")
            if mirna.lower() not in accepted_names:
                continue
            target_gene = _field(row, "target", "gene") or _field(row, "target")
            reference = _field(row, "reference") or _field(row, "pmid")
            results.append(
                TargetEvidence(
                    mature_mirna=mirna,
                    target_gene=target_gene,
                    target_protein=target_gene,
                    experiments=_field(row, "experiment"),
                    support_type=_field(row, "support"),
                    reference=reference,
                    source_url=reference if reference.startswith("http") else "",
                )
            )
            if len(results) >= limit:
                break
    return results


def machinery_evidence(candidate: CandidateResult) -> list[MachineryEvidence]:
    """Return only candidate-specific machinery results backed by a primary study."""
    return [
        MachineryEvidence(
            mature_mirna=row["mature_mirna"],
            protein=row["protein"],
            result=row["result"],
            evidence_type=row["evidence_type"],
            experiment=row["experiment"],
            biological_context=row["biological_context"],
            reference=f"PMID {row['pmid']}",
            source_url=row["source_url"],
        )
        for row in _matching_external_rows(candidate)
    ]


@lru_cache(maxsize=1)
def _literature_records() -> list[dict[str, str]]:
    if not LITERATURE_PATH.exists():
        return []
    with LITERATURE_PATH.open(newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))


def literature_context(candidate: CandidateResult) -> LiteratureContext | None:
    """Return manually curated context only for a strong human reference match."""
    match = candidate.nearest_reference
    if match.identity < 0.90 or match.coverage < 0.85:
        return None
    row = next(
        (
            item for item in _literature_records()
            if match.name.startswith(item["reference_prefix"])
        ),
        None,
    )
    if row is None:
        return None
    return LiteratureContext(
        display_name=row["display_name"],
        summary=row["summary"],
        evidence=row["evidence"],
        caveat=row["caveat"],
        source_label=row["source_label"],
        source_url=row["source_url"],
    )


def evidence_level(candidate: CandidateResult) -> tuple[str, str]:
    match = candidate.nearest_reference
    conflict = candidate.nearest_non_mirna
    if conflict.identity >= 0.90 and conflict.coverage >= 0.85:
        return "Conflicting", "Close to a curated non-miRNA Rfam sequence."
    if _matching_external_rows(candidate):
        return (
            "External control + machinery evidence",
            "Exact sequence from an independent NCBI RefSeq precursor control with a primary study testing at least one miRNA-pathway protein.",
        )
    if match.identity >= 0.95 and match.coverage >= 0.90:
        return "Known-like", "Near-exact curated precursor match; functional evidence is still separate."
    if candidate.model_score >= 0.80:
        return "Computational", "Strong sequence/structure resemblance without independent biological evidence."
    return "Preliminary", "Passes loose hairpin screening but has limited supporting evidence."
