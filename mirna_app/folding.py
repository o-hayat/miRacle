from __future__ import annotations

import re
import shutil
import subprocess
from dataclasses import dataclass
from typing import Literal

from .sequence import valid_segments
from .types import FoldHit


class ViennaUnavailableError(RuntimeError):
    """Raised when neither ViennaRNA bindings nor command-line tools exist."""


@dataclass(frozen=True, slots=True)
class ScanOutcome:
    hits: list[FoldHit]
    scanner: str


_LOCAL_LINE = re.compile(
    r"^\s*([().]+)\s+\(\s*(-?\d+(?:\.\d+)?)\s*\)\s+(\d+)\s*$"
)
_FOLD_LINE = re.compile(r"^\s*([().]+)\s+\(\s*(-?\d+(?:\.\d+)?)\s*\)")


def _rna_module():
    try:
        import RNA  # type: ignore

        return RNA
    except ImportError:
        return None


def fold_one(sequence: str) -> tuple[str, float]:
    """Fold one RNA sequence with ViennaRNA."""
    rna = _rna_module()
    if rna is not None:
        structure, mfe = rna.fold(sequence)
        return str(structure), float(mfe)

    executable = shutil.which("RNAfold")
    if executable:
        process = subprocess.run(
            [executable, "--noPS"],
            input=sequence + "\n",
            text=True,
            capture_output=True,
            check=True,
            timeout=30,
        )
        for line in reversed(process.stdout.splitlines()):
            match = _FOLD_LINE.match(line)
            if match:
                return match.group(1), float(match.group(2))
        raise RuntimeError("RNAfold returned output that MIR-NA could not parse.")

    raise ViennaUnavailableError(
        "ViennaRNA is not installed. Install the conda environment from environment.yml "
        "or run `python -m pip install ViennaRNA`."
    )


def _scan_rnalfold_segment(
    sequence: str,
    strand: Literal["+", "-"],
    segment_offset: int,
    max_span: int,
) -> list[FoldHit]:
    executable = shutil.which("RNALfold")
    if not executable:
        raise ViennaUnavailableError("RNALfold executable is unavailable.")
    process = subprocess.run(
        [executable, "-L", str(max_span)],
        input=sequence + "\n",
        text=True,
        capture_output=True,
        check=True,
        timeout=60,
    )
    hits: list[FoldHit] = []
    for line in process.stdout.splitlines():
        match = _LOCAL_LINE.match(line)
        if not match:
            continue
        structure = match.group(1)
        mfe = float(match.group(2))
        local_start = int(match.group(3))
        start = segment_offset + local_start
        end = start + len(structure) - 1
        local_zero = local_start - 1
        candidate_sequence = sequence[local_zero : local_zero + len(structure)]
        if len(candidate_sequence) != len(structure):
            continue
        hits.append(
            FoldHit(
                start=start,
                end=end,
                strand=strand,
                sequence=candidate_sequence,
                structure=structure,
                mfe=mfe,
            )
        )
    return hits


def _scan_windows_segment(
    sequence: str,
    strand: Literal["+", "-"],
    segment_offset: int,
) -> list[FoldHit]:
    hits: list[FoldHit] = []
    # Include 60 nt so compact curated animal precursors are not diluted by
    # flanking sequence when RNALfold is unavailable.
    lengths = [60, 70, 90, 110]
    if len(sequence) <= 120:
        lengths = sorted(set([len(sequence), *[n for n in lengths if n <= len(sequence)]]))
    for length in lengths:
        if length > len(sequence):
            continue
        starts = list(range(0, len(sequence) - length + 1, 10))
        final_start = len(sequence) - length
        if final_start not in starts:
            starts.append(final_start)
        for local_start in starts:
            window = sequence[local_start : local_start + length]
            structure, mfe = fold_one(window)
            start = segment_offset + local_start + 1
            hits.append(
                FoldHit(
                    start=start,
                    end=start + length - 1,
                    strand=strand,
                    sequence=window,
                    structure=structure,
                    mfe=mfe,
                )
            )
    return hits


def scan_local_structures(
    sequence: str,
    strand: Literal["+", "-"],
    max_span: int = 120,
) -> ScanOutcome:
    """Scan N-free sequence segments with RNALfold, then safe RNAfold windows."""
    segments = valid_segments(sequence)
    if not segments:
        return ScanOutcome([], "No foldable N-free segment")

    use_rnalfold = shutil.which("RNALfold") is not None
    hits: list[FoldHit] = []
    if use_rnalfold:
        try:
            for offset, segment in segments:
                hits.extend(_scan_rnalfold_segment(segment, strand, offset, max_span))
            scanner = f"RNALfold local scan (L={max_span})"
        except (subprocess.SubprocessError, RuntimeError, ViennaUnavailableError):
            hits = []
            use_rnalfold = False

    if not use_rnalfold:
        for offset, segment in segments:
            hits.extend(_scan_windows_segment(segment, strand, offset))
        scanner = "RNAfold multi-scale windows (60/70/90/110 nt)"

    # For short submitted precursors, ensure the exact submitted sequence is considered.
    if len(sequence) <= 120 and "N" not in sequence:
        structure, mfe = fold_one(sequence)
        full = FoldHit(1, len(sequence), strand, sequence, structure, mfe)
        key = (full.start, full.end, full.structure)
        if all((h.start, h.end, h.structure) != key for h in hits):
            hits.append(full)
    return ScanOutcome(hits, scanner)
