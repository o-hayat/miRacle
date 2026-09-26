from mirna_app.similarity import ReferenceMatcher, local_alignment_identity


def test_exact_local_alignment():
    identity, coverage = local_alignment_identity("CCAUGCAUGCGG", "AUGCAUGC")
    assert identity == 1.0
    assert coverage == 1.0


def test_reference_matcher_finds_exact_record():
    matcher = ReferenceMatcher([("one", "AUGCAUGCAUGC"), ("two", "CCCCAAAAGGGG")])
    result = matcher.match("AUGCAUGCAUGC")
    assert result.name == "one"
    assert result.identity == 1.0
    assert result.coverage == 1.0


def test_reference_match_preserves_species_and_source_metadata():
    matcher = ReferenceMatcher([("mouse-1", "AUGCAUGC")], "House mouse", "MirGeneDB 3.0")
    result = matcher.match("AUGCAUGC")
    assert result.species == "House mouse"
    assert result.source == "MirGeneDB 3.0"
