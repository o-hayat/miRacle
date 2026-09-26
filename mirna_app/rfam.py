from __future__ import annotations

import gzip
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator


NEGATIVE_TYPE_MARKERS = ("trna", "rrna", "snrna", "snorna", "ribozyme", "riboswitch")


@dataclass(frozen=True, slots=True)
class RfamSequence:
    accession: str
    family_id: str
    rna_type: str
    sequence_id: str
    sequence: str


def _open_text(path: Path):
    if path.suffix == ".gz":
        return gzip.open(path, "rt", encoding="utf-8", errors="replace")
    return path.open("r", encoding="utf-8", errors="replace")


def iter_seed_families(path: Path) -> Iterator[tuple[str, str, str, dict[str, str]]]:
    """Yield Rfam Stockholm seed families with multi-block sequences joined."""
    accession = family_id = rna_type = ""
    fragments: dict[str, list[str]] = defaultdict(list)
    with _open_text(path) as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if line.startswith("#=GF AC"):
                accession = line.split(maxsplit=2)[-1]
            elif line.startswith("#=GF ID"):
                family_id = line.split(maxsplit=2)[-1]
            elif line.startswith("#=GF TP"):
                rna_type = line.split(maxsplit=2)[-1]
            elif line == "//":
                joined = {name: "".join(parts) for name, parts in fragments.items()}
                if accession:
                    yield accession, family_id, rna_type, joined
                accession = family_id = rna_type = ""
                fragments = defaultdict(list)
            elif line and not line.startswith("#"):
                fields = line.split()
                if len(fields) >= 2:
                    fragments[fields[0]].append(fields[1])


def load_structured_decoys(
    path: Path,
    *,
    min_length: int = 55,
    max_length: int = 120,
    max_per_family: int = 40,
) -> list[RfamSequence]:
    """Load diverse non-miRNA structural RNA seed sequences as hard decoys."""
    records: list[RfamSequence] = []
    seen_sequences: set[str] = set()
    for accession, family_id, rna_type, sequences in iter_seed_families(path):
        normalized_type = rna_type.lower()
        if "mirna" in normalized_type or not any(
            marker in normalized_type for marker in NEGATIVE_TYPE_MARKERS
        ):
            continue
        accepted = 0
        for sequence_id in sorted(sequences):
            sequence = sequences[sequence_id].replace("-", "").replace(".", "")
            sequence = sequence.upper().replace("T", "U")
            if not min_length <= len(sequence) <= max_length:
                continue
            if set(sequence) - set("ACGU") or sequence in seen_sequences:
                continue
            records.append(RfamSequence(accession, family_id, rna_type, sequence_id, sequence))
            seen_sequences.add(sequence)
            accepted += 1
            if accepted >= max_per_family:
                break
    return records


def write_decoy_fasta(records: list[RfamSequence], destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    lines: list[str] = []
    for record in records:
        safe_type = record.rna_type.replace(";", ",").replace(" ", "_")
        lines.extend(
            [
                f">{record.accession}|{record.family_id}|{safe_type}|{record.sequence_id}",
                record.sequence,
            ]
        )
    destination.write_text("\n".join(lines) + "\n")
