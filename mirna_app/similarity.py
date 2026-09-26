from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer

from .types import ReferenceMatch


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_REFERENCE_PATH = ROOT / "assets" / "references" / "hsa_precursors.fa"


def read_fasta(path: Path) -> list[tuple[str, str]]:
    records: list[tuple[str, str]] = []
    current_name: str | None = None
    pieces: list[str] = []
    if not path.exists():
        return records
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith(">"):
            if current_name and pieces:
                records.append((current_name, "".join(pieces).upper().replace("T", "U")))
            current_name = line[1:].split()[0]
            pieces = []
        else:
            pieces.append(line)
    if current_name and pieces:
        records.append((current_name, "".join(pieces).upper().replace("T", "U")))
    return records


def local_alignment_identity(query: str, reference: str) -> tuple[float, float]:
    """Smith-Waterman identity and reference coverage using a compact traceback."""
    match_score, mismatch, gap = 2, -1, -2
    rows, columns = len(query) + 1, len(reference) + 1
    scores = np.zeros((rows, columns), dtype=np.int16)
    trace = np.zeros((rows, columns), dtype=np.int8)
    best_score = best_i = best_j = 0
    for i in range(1, rows):
        for j in range(1, columns):
            diagonal = scores[i - 1, j - 1] + (match_score if query[i - 1] == reference[j - 1] else mismatch)
            up = scores[i - 1, j] + gap
            left = scores[i, j - 1] + gap
            value = max(0, diagonal, up, left)
            scores[i, j] = value
            if value == 0:
                trace[i, j] = 0
            elif value == diagonal:
                trace[i, j] = 1
            elif value == up:
                trace[i, j] = 2
            else:
                trace[i, j] = 3
            if value > best_score:
                best_score, best_i, best_j = int(value), i, j

    i, j = best_i, best_j
    matches = aligned_columns = query_bases = reference_bases = 0
    while i > 0 and j > 0 and scores[i, j] > 0:
        direction = trace[i, j]
        if direction == 1:
            aligned_columns += 1
            query_bases += 1
            reference_bases += 1
            matches += int(query[i - 1] == reference[j - 1])
            i -= 1
            j -= 1
        elif direction == 2:
            aligned_columns += 1
            query_bases += 1
            i -= 1
        elif direction == 3:
            aligned_columns += 1
            reference_bases += 1
            j -= 1
        else:
            break
    identity = matches / max(1, aligned_columns)
    coverage = reference_bases / max(1, len(reference))
    return identity, coverage


class ReferenceMatcher:
    def __init__(
        self,
        records: list[tuple[str, str]],
        species: str = "Human",
        source: str = "MirGeneDB 3.0",
    ):
        self.records = records
        self.species = species
        self.source = source
        self.names = [name for name, _ in records]
        self.sequences = [sequence for _, sequence in records]
        self.vectorizer: TfidfVectorizer | None = None
        self.matrix = None
        if records:
            self.vectorizer = TfidfVectorizer(analyzer="char", ngram_range=(4, 6), lowercase=False)
            self.matrix = self.vectorizer.fit_transform(self.sequences)

    def match(self, query: str) -> ReferenceMatch:
        if not self.records or self.vectorizer is None or self.matrix is None:
            return ReferenceMatch()
        query_vector = self.vectorizer.transform([query])
        similarities = (self.matrix @ query_vector.T).toarray().ravel()
        shortlist = np.argsort(similarities)[-5:][::-1]
        best: ReferenceMatch | None = None
        best_key = (-1.0, -1.0, -1.0)
        for index in shortlist:
            identity, coverage = local_alignment_identity(query, self.sequences[int(index)])
            similarity = float(similarities[int(index)])
            key = (identity * coverage, identity, similarity)
            if key > best_key:
                best_key = key
                best = ReferenceMatch(
                    self.names[int(index)], identity, coverage, similarity,
                    self.species, self.source,
                )
        return best or ReferenceMatch()


@lru_cache(maxsize=12)
def load_reference_matcher(
    path: str | None = None,
    species: str = "Human",
    source: str = "MirGeneDB 3.0",
) -> ReferenceMatcher:
    reference_path = Path(path) if path else DEFAULT_REFERENCE_PATH
    return ReferenceMatcher(read_fasta(reference_path), species=species, source=source)
