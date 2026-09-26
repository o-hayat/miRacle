from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal


@dataclass(slots=True)
class ReferenceMatch:
    name: str = "No close curated match"
    identity: float = 0.0
    coverage: float = 0.0
    similarity: float = 0.0
    species: str = "Human"
    source: str = "MirGeneDB 3.0"


@dataclass(slots=True)
class Influence:
    feature: str
    delta_score: float
    direction: Literal["supports", "cautions"]


@dataclass(slots=True)
class CandidateResult:
    id: str
    start: int
    end: int
    strand: Literal["+", "-"]
    sequence_rna: str
    dot_bracket: str
    mfe_kcal_mol: float
    features: dict[str, float]
    model_score: float = 0.0
    rank: int = 0
    nearest_reference: ReferenceMatch = field(default_factory=ReferenceMatch)
    nearest_non_mirna: ReferenceMatch = field(default_factory=ReferenceMatch)
    comparative_matches: list[ReferenceMatch] = field(default_factory=list)
    influences: list[Influence] = field(default_factory=list)
    summary: list[str] = field(default_factory=list)
    limitations: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class AnalysisResult:
    input_id: str
    input_length: int
    runtime_ms: int
    warnings: list[str]
    candidates: list[CandidateResult]
    export_candidates: list[CandidateResult]
    scanner: str
    model_name: str
    score_threshold: float | None = None
    genomic_interval: str | None = None
    masked_exonic_nt: int = 0
    overlapping_coding_genes: list[str] = field(default_factory=list)
    exon_mask_mode: str = "none"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class FoldHit:
    start: int
    end: int
    strand: Literal["+", "-"]
    sequence: str
    structure: str
    mfe: float
