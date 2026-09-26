from __future__ import annotations

from dataclasses import dataclass


class StructureError(ValueError):
    """Raised for malformed dot-bracket structures."""


@dataclass(frozen=True, slots=True)
class StructureStats:
    pair_table: tuple[int, ...]
    pair_count: int
    paired_fraction: float
    longest_stem: int
    terminal_loop_size: int
    internal_unpaired_fraction: float
    internal_unpaired_runs: int
    top_level_stems: int


def build_pair_table(structure: str) -> tuple[int, ...]:
    stack: list[int] = []
    table = [-1] * len(structure)
    for i, char in enumerate(structure):
        if char == "(":
            stack.append(i)
        elif char == ")":
            if not stack:
                raise StructureError("Unbalanced closing parenthesis in dot-bracket structure.")
            j = stack.pop()
            table[i] = j
            table[j] = i
        elif char != ".":
            raise StructureError(f"Unsupported dot-bracket character: {char!r}")
    if stack:
        raise StructureError("Unbalanced opening parenthesis in dot-bracket structure.")
    return tuple(table)


def _longest_stem(pair_table: tuple[int, ...]) -> int:
    pairs = {(i, j) for i, j in enumerate(pair_table) if j > i}
    best = 0
    for i, j in pairs:
        length = 1
        while (i + length, j - length) in pairs:
            length += 1
        best = max(best, length)
    return best


def _hairpin_loops(pair_table: tuple[int, ...]) -> list[tuple[int, int, int]]:
    """Return (opening index, closing index, unpaired loop size) for terminal loops."""
    loops: list[tuple[int, int, int]] = []
    for i, j in enumerate(pair_table):
        if j <= i:
            continue
        contains_pair = any(pair_table[k] > k and pair_table[k] < j for k in range(i + 1, j))
        if not contains_pair:
            loops.append((i, j, j - i - 1))
    return loops


def _count_unpaired_runs(structure: str) -> int:
    runs = 0
    in_run = False
    for char in structure:
        if char == "." and not in_run:
            runs += 1
            in_run = True
        elif char != ".":
            in_run = False
    return runs


def structure_stats(structure: str) -> StructureStats:
    table = build_pair_table(structure)
    pairs = [(i, j) for i, j in enumerate(table) if j > i]
    pair_count = len(pairs)
    paired_fraction = (2.0 * pair_count / len(structure)) if structure else 0.0

    depth = 0
    top_level_stems = 0
    for char in structure:
        if char == "(":
            if depth == 0:
                top_level_stems += 1
            depth += 1
        elif char == ")":
            depth -= 1

    loops = _hairpin_loops(table)
    if loops:
        center = (len(structure) - 1) / 2
        loop = min(loops, key=lambda item: abs(((item[0] + item[1]) / 2) - center))
        terminal_loop_size = loop[2]
        terminal_range = range(loop[0] + 1, loop[1])
        terminal_positions = set(terminal_range)
    else:
        terminal_loop_size = 0
        terminal_positions = set()

    if pairs:
        outer_i, outer_j = min(pairs, key=lambda item: item[0])
        internal_positions = range(outer_i + 1, outer_j)
        internal_unpaired = [
            i for i in internal_positions if table[i] < 0 and i not in terminal_positions
        ]
        internal_unpaired_fraction = len(internal_unpaired) / max(1, outer_j - outer_i - 1)
        internal_mask = "".join(
            "." if i in internal_unpaired else "x" for i in internal_positions
        )
        internal_runs = _count_unpaired_runs(internal_mask)
    else:
        internal_unpaired_fraction = 1.0
        internal_runs = 0

    return StructureStats(
        pair_table=table,
        pair_count=pair_count,
        paired_fraction=paired_fraction,
        longest_stem=_longest_stem(table),
        terminal_loop_size=terminal_loop_size,
        internal_unpaired_fraction=internal_unpaired_fraction,
        internal_unpaired_runs=internal_runs,
        top_level_stems=top_level_stems,
    )
