import pytest

from mirna_app.structure import StructureError, build_pair_table, structure_stats


def test_pair_table_and_hairpin_stats():
    structure = "(" * 18 + "." * 10 + ")" * 18
    stats = structure_stats(structure)
    assert stats.pair_count == 18
    assert stats.longest_stem == 18
    assert stats.terminal_loop_size == 10
    assert stats.top_level_stems == 1


def test_unbalanced_structure_rejected():
    with pytest.raises(StructureError):
        build_pair_table("((...)")
