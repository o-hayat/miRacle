from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

from .sequence import MAX_SEQUENCE_LENGTH, SequenceValidationError


ROOT = Path(__file__).resolve().parent.parent
EXAMPLES_DIR = ROOT / "assets" / "examples"
RAW_DIR = ROOT / "artifacts" / "raw"
UCSC_SEQUENCE_API = "https://api.genome.ucsc.edu/getData/sequence"

# GRCh38 primary-assembly chromosome lengths. Keeping these local lets the UI
# reject invalid coordinates before making a network request.
HG38_CHROMOSOME_LENGTHS = {
    "chr1": 248_956_422,
    "chr2": 242_193_529,
    "chr3": 198_295_559,
    "chr4": 190_214_555,
    "chr5": 181_538_259,
    "chr6": 170_805_979,
    "chr7": 159_345_973,
    "chr8": 145_138_636,
    "chr9": 138_394_717,
    "chr10": 133_797_422,
    "chr11": 135_086_622,
    "chr12": 133_275_309,
    "chr13": 114_364_328,
    "chr14": 107_043_718,
    "chr15": 101_991_189,
    "chr16": 90_338_345,
    "chr17": 83_257_441,
    "chr18": 80_373_285,
    "chr19": 58_617_616,
    "chr20": 64_444_167,
    "chr21": 46_709_983,
    "chr22": 50_818_468,
    "chrX": 156_040_895,
    "chrY": 57_227_415,
}

_INTERVAL = re.compile(
    r"(?P<chrom>chr(?:[0-9]{1,2}|X|Y)):(?P<start>[0-9,]+)-(?P<end>[0-9,]+)",
    re.IGNORECASE,
)


def normalize_chromosome(chromosome: str) -> str:
    suffix = chromosome.strip()
    if suffix.lower().startswith("chr"):
        suffix = suffix[3:]
    suffix = suffix.upper() if not suffix.isdigit() else str(int(suffix))
    chrom = f"chr{suffix}"
    if chrom not in HG38_CHROMOSOME_LENGTHS:
        raise SequenceValidationError(f"{chromosome!r} is not a supported GRCh38 chromosome.")
    return chrom


def validate_hg38_region(chromosome: str, start: int, end: int) -> tuple[str, int, int]:
    """Validate a one-based inclusive hg38 interval for interactive analysis."""
    chrom = normalize_chromosome(chromosome)
    if start < 1:
        raise SequenceValidationError("Start index must be at least 1.")
    if end < start:
        raise SequenceValidationError("End index must be greater than or equal to the start index.")
    if end > HG38_CHROMOSOME_LENGTHS[chrom]:
        raise SequenceValidationError(
            f"End index exceeds the GRCh38 length of {chrom} ({HG38_CHROMOSOME_LENGTHS[chrom]:,} nt)."
        )
    length = end - start + 1
    if length < 55:
        raise SequenceValidationError("The selected region must be at least 55 nucleotides long.")
    if length > MAX_SEQUENCE_LENGTH:
        raise SequenceValidationError(
            f"The selected region is {length:,} nt; the interactive limit is {MAX_SEQUENCE_LENGTH:,} nt."
        )
    return chrom, int(start), int(end)


def _read_fasta(path: Path) -> tuple[str, str]:
    lines = [line.strip() for line in path.read_text().splitlines() if line.strip()]
    if not lines or not lines[0].startswith(">"):
        return "", ""
    return lines[0][1:], "".join(lines[1:]).upper()


def _bundled_region(chrom: str, start: int, end: int) -> str | None:
    """Return a requested slice when a bundled hg38 example covers it."""
    for path in sorted(EXAMPLES_DIR.rglob("*.fa")):
        description, sequence = _read_fasta(path)
        match = _INTERVAL.search(description)
        if not match or not re.search(r"\b(?:hg38|GRCh38)\b", description, re.IGNORECASE):
            continue
        source_chrom = normalize_chromosome(match.group("chrom"))
        source_start = int(match.group("start").replace(",", ""))
        source_end = int(match.group("end").replace(",", ""))
        if len(sequence) != source_end - source_start + 1:
            continue
        if source_chrom == chrom and source_start <= start and end <= source_end:
            left = start - source_start
            return sequence[left : left + (end - start + 1)]
    return None


def _local_chromosome_region(chrom: str, start: int, end: int) -> str | None:
    """Read a slice from an optional downloaded chromosome FASTA."""
    path = RAW_DIR / f"{chrom}.fa"
    if not path.exists():
        return None
    sequence_parts: list[str] = []
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            if not line.startswith(">"):
                sequence_parts.append(line.strip())
    sequence = "".join(sequence_parts).upper()
    return sequence[start - 1 : end] if len(sequence) >= end else None


def _ucsc_region(chrom: str, start: int, end: int, timeout: float = 15.0) -> str:
    query = urllib.parse.urlencode(
        {"genome": "hg38", "chrom": chrom, "start": start - 1, "end": end}
    )
    request = urllib.request.Request(
        f"{UCSC_SEQUENCE_API}?{query}",
        headers={"User-Agent": "miRacle-hackathon/0.3"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.load(response)
    except Exception as error:
        raise SequenceValidationError(
            "This hg38 region is not bundled locally and could not be downloaded from UCSC. "
            "Check the internet connection or paste the sequence manually."
        ) from error
    dna = str(payload.get("dna", "")).upper()
    if len(dna) != end - start + 1 or set(dna) - set("ACGTN"):
        raise SequenceValidationError("UCSC returned an incomplete or invalid sequence for this interval.")
    return dna


def fetch_hg38_region(chromosome: str, start: int, end: int) -> str:
    """Return one coordinate-aware FASTA record for a 1-based hg38 interval."""
    chrom, start, end = validate_hg38_region(chromosome, int(start), int(end))
    sequence = (
        _bundled_region(chrom, start, end)
        or _local_chromosome_region(chrom, start, end)
        or _ucsc_region(chrom, start, end)
    )
    identifier = f"hg38_{chrom}_{start}_{end}"
    return f">{identifier} {chrom}:{start}-{end} hg38\n{sequence}\n"
