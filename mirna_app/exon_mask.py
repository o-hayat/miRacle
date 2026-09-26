from __future__ import annotations

import gzip
import re
from bisect import bisect_left
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_EXON_PATH = ROOT / "assets" / "references" / "hg38_refseq_coding_exons.bed.gz"
DEFAULT_CDS_PATH = ROOT / "assets" / "references" / "hg38_refseq_cds_segments.bed.gz"

_COORDINATE = re.compile(
    r"(?P<chrom>chr(?:[0-9]{1,2}|X|Y|M)):(?P<start>[0-9,]+)-(?P<end>[0-9,]+)",
    re.IGNORECASE,
)


@dataclass(frozen=True, slots=True)
class GenomicInterval:
    chrom: str
    start: int  # 1-based, inclusive
    end: int  # 1-based, inclusive

    @property
    def label(self) -> str:
        return f"{self.chrom}:{self.start:,}-{self.end:,} (hg38)"


@dataclass(frozen=True, slots=True)
class MaskResult:
    sequence: str
    interval: GenomicInterval | None
    masked_nt: int
    genes: tuple[str, ...]
    status: str


def parse_hg38_interval(description: str, sequence_length: int) -> GenomicInterval | None:
    """Read an hg38 reference-forward interval from a FASTA description."""
    if not re.search(r"\b(?:hg38|GRCh38)\b", description, flags=re.IGNORECASE):
        return None
    match = _COORDINATE.search(description)
    if not match:
        return None
    start = int(match.group("start").replace(",", ""))
    end = int(match.group("end").replace(",", ""))
    chrom_suffix = match.group("chrom")[3:]
    chrom = "chr" + (chrom_suffix.upper() if not chrom_suffix.isdigit() else chrom_suffix)
    if start < 1 or end < start or end - start + 1 != sequence_length:
        return None
    return GenomicInterval(chrom, start, end)


@lru_cache(maxsize=2)
def _load_exons(path: str) -> dict[str, tuple[list[int], list[tuple[int, int, str]]]]:
    """Load zero-based BED exons, indexed by chromosome and start."""
    exons: dict[str, list[tuple[int, int, str]]] = {}
    source = Path(path)
    if not source.exists():
        return {}
    opener = gzip.open if source.suffix == ".gz" else open
    with opener(source, "rt", encoding="utf-8") as handle:
        for raw in handle:
            if not raw.strip() or raw.startswith("#"):
                continue
            chrom, start, end, genes = raw.rstrip("\n").split("\t")[:4]
            exons.setdefault(chrom, []).append((int(start), int(end), genes))
    indexed: dict[str, tuple[list[int], list[tuple[int, int, str]]]] = {}
    for chrom, records in exons.items():
        records.sort()
        indexed[chrom] = ([record[0] for record in records], records)
    return indexed


def mask_hg38_coding_exons(
    sequence: str,
    description: str,
    mode: str = "cds",
    exon_path: Path | None = None,
) -> MaskResult:
    """Mask overlapping RefSeq CDS segments or full exons while preserving coordinates."""
    interval = parse_hg38_interval(description, len(sequence))
    if interval is None:
        return MaskResult(
            sequence,
            None,
            0,
            (),
            "not applied: header needs a length-matched hg38/GRCh38 chr:start-end interval",
        )
    if mode not in {"cds", "all_exons"}:
        raise ValueError("mode must be 'cds' or 'all_exons'.")
    selected_path = exon_path or (DEFAULT_CDS_PATH if mode == "cds" else DEFAULT_EXON_PATH)
    indexed = _load_exons(str(selected_path))
    if not indexed:
        return MaskResult(sequence, interval, 0, (), "not applied: local hg38 annotation index is unavailable")

    # Convert the submitted 1-based inclusive interval to BED coordinates.
    query_start = interval.start - 1
    query_end = interval.end
    starts, records = indexed.get(interval.chrom, ([], []))
    stop = bisect_left(starts, query_end)
    masked = list(sequence)
    genes: set[str] = set()
    for exon_start, exon_end, exon_genes in records[:stop]:
        if exon_end <= query_start:
            continue
        local_start = max(exon_start, query_start) - query_start
        local_end = min(exon_end, query_end) - query_start
        if local_start >= local_end:
            continue
        masked[local_start:local_end] = "N" * (local_end - local_start)
        genes.update(gene for gene in exon_genes.split(",") if gene)
    masked_sequence = "".join(masked)
    masked_nt = sum(base == "N" and original != "N" for base, original in zip(masked_sequence, sequence))
    label = "protein-coding CDS" if mode == "cds" else "protein-coding transcript exon"
    status = f"applied: {masked_nt:,} nt of {label} excluded" if masked_nt else f"applied: no {label} overlap"
    return MaskResult(masked_sequence, interval, masked_nt, tuple(sorted(genes)), status)
