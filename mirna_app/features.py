from __future__ import annotations

import math
from collections import Counter

from .structure import StructureStats, structure_stats
from .types import FoldHit


DINUCLEOTIDES = tuple(a + b for a in "ACGU" for b in "ACGU")
FEATURE_NAMES = (
    "length",
    "gc_fraction",
    "a_fraction",
    "c_fraction",
    "g_fraction",
    "u_fraction",
    "sequence_entropy",
    "max_homopolymer",
    "mfe",
    "mfe_per_nt",
    "pair_count",
    "paired_fraction",
    "longest_stem",
    "terminal_loop_size",
    "internal_unpaired_fraction",
    "internal_unpaired_runs",
    "top_level_stems",
    "gc_pair_fraction",
    "au_pair_fraction",
    "gu_pair_fraction",
    *(f"dinuc_{d.lower()}" for d in DINUCLEOTIDES),
)


def _max_homopolymer(sequence: str) -> int:
    if not sequence:
        return 0
    best = current = 1
    for previous, current_base in zip(sequence, sequence[1:]):
        if previous == current_base:
            current += 1
            best = max(best, current)
        else:
            current = 1
    return best


def _entropy(sequence: str) -> float:
    counts = Counter(sequence)
    total = max(1, len(sequence))
    return -sum((count / total) * math.log2(count / total) for count in counts.values())


def _pair_fractions(sequence: str, stats: StructureStats) -> tuple[float, float, float]:
    counts = Counter()
    for i, j in enumerate(stats.pair_table):
        if j <= i:
            continue
        pair = "".join(sorted((sequence[i], sequence[j])))
        if pair == "CG":
            counts["GC"] += 1
        elif pair == "AU":
            counts["AU"] += 1
        elif pair == "GU":
            counts["GU"] += 1
    denominator = max(1, stats.pair_count)
    return (
        counts["GC"] / denominator,
        counts["AU"] / denominator,
        counts["GU"] / denominator,
    )


def extract_features(hit: FoldHit) -> dict[str, float]:
    sequence = hit.sequence.upper().replace("T", "U")
    stats = structure_stats(hit.structure)
    length = len(sequence)
    counts = Counter(sequence)
    gc_pairs, au_pairs, gu_pairs = _pair_fractions(sequence, stats)
    dinucleotide_counts = Counter(sequence[i : i + 2] for i in range(max(0, length - 1)))
    dinucleotide_total = max(1, length - 1)

    features: dict[str, float] = {
        "length": float(length),
        "gc_fraction": (counts["G"] + counts["C"]) / length,
        "a_fraction": counts["A"] / length,
        "c_fraction": counts["C"] / length,
        "g_fraction": counts["G"] / length,
        "u_fraction": counts["U"] / length,
        "sequence_entropy": _entropy(sequence),
        "max_homopolymer": float(_max_homopolymer(sequence)),
        "mfe": float(hit.mfe),
        "mfe_per_nt": float(hit.mfe) / length,
        "pair_count": float(stats.pair_count),
        "paired_fraction": stats.paired_fraction,
        "longest_stem": float(stats.longest_stem),
        "terminal_loop_size": float(stats.terminal_loop_size),
        "internal_unpaired_fraction": stats.internal_unpaired_fraction,
        "internal_unpaired_runs": float(stats.internal_unpaired_runs),
        "top_level_stems": float(stats.top_level_stems),
        "gc_pair_fraction": gc_pairs,
        "au_pair_fraction": au_pairs,
        "gu_pair_fraction": gu_pairs,
    }
    features.update(
        {f"dinuc_{d.lower()}": dinucleotide_counts[d] / dinucleotide_total for d in DINUCLEOTIDES}
    )
    return features


def passes_candidate_gate(features: dict[str, float]) -> bool:
    return (
        55 <= features["length"] <= 120
        and features["pair_count"] >= 16
        and features["paired_fraction"] >= 0.35
        and 3 <= features["terminal_loop_size"] <= 30
        and features["top_level_stems"] == 1
        and features["mfe_per_nt"] <= -0.15
    )


def feature_vector(features: dict[str, float]) -> list[float]:
    return [float(features[name]) for name in FEATURE_NAMES]
