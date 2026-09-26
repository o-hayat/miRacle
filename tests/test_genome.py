from pathlib import Path

import pytest

from mirna_app.genome import fetch_hg38_region, normalize_chromosome, validate_hg38_region
from mirna_app.sequence import SequenceValidationError, parse_sequence_text


ROOT = Path(__file__).resolve().parent.parent


def test_bundled_mir21_interval_can_be_loaded_by_coordinates():
    coordinate_record = parse_sequence_text(
        fetch_hg38_region("17", 59_840_773, 59_841_772)
    )
    bundled_record = parse_sequence_text(
        (ROOT / "assets" / "examples" / "mir21_region.fa").read_text()
    )

    assert coordinate_record.sequence == bundled_record.sequence
    assert coordinate_record.description.endswith(
        "chr17:59840773-59841772 hg38"
    )


def test_coordinate_validation_uses_one_based_inclusive_limits():
    assert normalize_chromosome("x") == "chrX"
    assert validate_hg38_region("chr21", 100, 154) == ("chr21", 100, 154)
    with pytest.raises(SequenceValidationError, match="at least 55"):
        validate_hg38_region("chr21", 100, 153)
    with pytest.raises(SequenceValidationError, match="interactive limit"):
        validate_hg38_region("chr21", 100, 20_100)
    with pytest.raises(SequenceValidationError, match="greater than or equal"):
        validate_hg38_region("chr21", 200, 100)
