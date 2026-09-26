from pathlib import Path

from mirna_app.exon_mask import mask_hg38_coding_exons, parse_hg38_interval


ROOT = Path(__file__).resolve().parent.parent


def test_coordinate_header_must_match_sequence_length_and_assembly():
    interval = parse_hg38_interval("sample chr17:101-200 GRCh38", 100)
    assert interval is not None
    assert (interval.chrom, interval.start, interval.end) == ("chr17", 101, 200)
    assert parse_hg38_interval("sample chr17:101-200 GRCh38", 99) is None
    assert parse_hg38_interval("sample chr17:101-200", 100) is None


def test_mir21_control_gets_coordinate_aware_mask_result():
    text = (ROOT / "assets" / "examples" / "mir21_region.fa").read_text()
    header, *sequence_lines = text.splitlines()
    sequence = "".join(sequence_lines).replace("T", "U")
    result = mask_hg38_coding_exons(sequence, header[1:], mode="cds")
    assert result.interval is not None
    assert len(result.sequence) == len(sequence)
    assert result.status.startswith("applied")


def test_no_coordinates_never_guesses_exons_from_sequence():
    sequence = "A" * 100
    result = mask_hg38_coding_exons(sequence, "raw_sequence", mode="cds")
    assert result.sequence == sequence
    assert result.interval is None
    assert result.masked_nt == 0
    assert result.status.startswith("not applied")
