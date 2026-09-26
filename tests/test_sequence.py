import pytest

from mirna_app.sequence import (
    SequenceValidationError,
    infer_input_type,
    parse_sequence_text,
    reverse_complement_rna,
    reverse_hit_to_forward,
    valid_segments,
)


def test_parse_fasta_normalizes_dna():
    parsed = parse_sequence_text(">region example\n" + "ACGT" * 15)
    assert parsed.identifier == "region"
    assert parsed.description == "region example"
    assert parsed.sequence == "ACGU" * 15


def test_accepts_twenty_kb_but_rejects_larger_input():
    assert len(parse_sequence_text("A" * 20_000).sequence) == 20_000
    with pytest.raises(SequenceValidationError, match="20,000"):
        parse_sequence_text("A" * 20_001)


def test_rejects_multiple_records():
    with pytest.raises(SequenceValidationError):
        parse_sequence_text(">one\n" + "A" * 55 + "\n>two\n" + "C" * 55)


def test_reverse_complement_and_coordinates():
    assert reverse_complement_rna("AUGCN") == "NGCAU"
    assert reverse_hit_to_forward(10, 20, 100) == (81, 91)


def test_valid_segments_preserve_offsets():
    sequence = "A" * 60 + "NN" + "C" * 55
    assert valid_segments(sequence) == [(0, "A" * 60), (62, "C" * 55)]


def test_input_type_is_inferred_without_user_mode_selection():
    assert infer_input_type(">rna\n" + "ACGU" * 15) == "rna"
    assert infer_input_type(">dna\n" + "ACGT" * 15) == "genomic"
    assert infer_input_type(">ambiguous\n" + "ACGN" * 15) == "genomic"
