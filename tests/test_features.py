from mirna_app.features import FEATURE_NAMES, extract_features, passes_candidate_gate
from mirna_app.types import FoldHit


def test_feature_schema_and_candidate_gate():
    structure = "(" * 20 + "." * 20 + ")" * 20
    sequence = "G" * 20 + "A" * 20 + "C" * 20
    features = extract_features(FoldHit(1, 60, "+", sequence, structure, -25.0))
    assert tuple(features) == FEATURE_NAMES
    assert features["pair_count"] == 20
    assert features["terminal_loop_size"] == 20
    assert passes_candidate_gate(features)
