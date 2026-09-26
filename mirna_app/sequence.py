from __future__ import annotations

import re
from dataclasses import dataclass


VALID_SEQUENCE = re.compile(r"^[ACGTUN]+$")
MAX_SEQUENCE_LENGTH = 20_000


class SequenceValidationError(ValueError):
    """Raised when sequence input cannot be analyzed safely."""


@dataclass(frozen=True, slots=True)
class ParsedSequence:
    identifier: str
    sequence: str
    description: str = ""


def parse_sequence_text(text: str, fallback_id: str = "input_sequence") -> ParsedSequence:
    """Parse one raw sequence or one FASTA record and normalize it to RNA."""
    if not text or not text.strip():
        raise SequenceValidationError("Please paste or upload a sequence.")

    lines = [line.strip() for line in text.splitlines() if line.strip()]
    headers = [line for line in lines if line.startswith(">")]
    if len(headers) > 1:
        raise SequenceValidationError("MIR-NA accepts exactly one FASTA record at a time.")

    identifier = fallback_id
    description = ""
    sequence_lines: list[str] = []
    for line in lines:
        if line.startswith(">"):
            description = line[1:].strip()
            identifier = description.split()[0] or fallback_id
        else:
            sequence_lines.append(re.sub(r"\s+", "", line))

    sequence = "".join(sequence_lines).upper().replace("T", "U")
    if not sequence:
        raise SequenceValidationError("The input contains a header but no sequence.")
    if not VALID_SEQUENCE.fullmatch(sequence):
        invalid = sorted(set(sequence) - set("ACGUN"))
        raise SequenceValidationError(
            "Unsupported character(s): " + ", ".join(invalid) + ". Use only A, C, G, T, U, or N."
        )
    if len(sequence) < 55:
        raise SequenceValidationError("Sequence is too short; provide at least 55 nucleotides.")
    if len(sequence) > MAX_SEQUENCE_LENGTH:
        raise SequenceValidationError(
            f"Sequence is too long for this prototype; the maximum is {MAX_SEQUENCE_LENGTH:,} nt."
        )
    return ParsedSequence(identifier=identifier, sequence=sequence, description=description)


def infer_input_type(text: str) -> str:
    """Infer conservative strand handling without asking the user for a mode."""
    sequence = "".join(
        re.sub(r"\s+", "", line)
        for line in text.splitlines()
        if line.strip() and not line.lstrip().startswith(">")
    ).upper()
    return "rna" if "U" in sequence and "T" not in sequence else "genomic"


def reverse_complement_rna(sequence: str) -> str:
    return sequence.translate(str.maketrans("ACGUN", "UGCAN"))[::-1]


def valid_segments(sequence: str, min_length: int = 55) -> list[tuple[int, str]]:
    """Return zero-based starts and N-free segments long enough to fold."""
    segments: list[tuple[int, str]] = []
    offset = 0
    for part in sequence.split("N"):
        if len(part) >= min_length:
            segments.append((offset, part))
        offset += len(part) + 1
    return segments


def reverse_hit_to_forward(start: int, end: int, original_length: int) -> tuple[int, int]:
    """Map one-based inclusive reverse-complement coordinates to input coordinates."""
    return original_length - end + 1, original_length - start + 1
