from mirna_app.evidence import (
    literature_context,
    machinery_evidence,
    mature_arms,
    mirtarbase_names,
    validated_targets,
)
from mirna_app.types import CandidateResult, ReferenceMatch


def test_simple_mirgenedb_name_translation_is_conservative():
    assert mirtarbase_names([("Hsa-Mir-21_5p", "AUGC")]) == ["hsa-miR-21-5p"]
    assert mirtarbase_names([("Hsa-Mir-1-P1_3p", "AUGC")]) == []


def test_near_exact_mir21_match_enables_curated_arm_and_target_subset():
    candidate = CandidateResult(
        id="candidate-1",
        start=1,
        end=60,
        strand="+",
        sequence_rna="A" * 60,
        dot_bracket="." * 60,
        mfe_kcal_mol=-20.0,
        features={},
        nearest_reference=ReferenceMatch("Hsa-Mir-21_pre", 1.0, 1.0, 1.0),
    )
    assert [name for name, _ in mature_arms(candidate)] == ["Hsa-Mir-21_5p"]
    assert {target.target_gene for target in validated_targets(candidate)} == {"PDCD4", "PTEN", "RECK"}
    context = literature_context(candidate)
    assert context is not None
    assert "PDCD4" in context.summary
    assert "18372920" in context.source_url


def test_external_ncbi_control_maps_to_candidate_specific_ago2_evidence():
    candidate = CandidateResult(
        id="external-1",
        start=21,
        end=80,
        strand="+",
        sequence_rna="U" * 0 + "UGCUACCUCUUUGUAUCAUAUUUUGUUAUUCUGGUCACAGAAUGACCUAGUAUUCU",
        dot_bracket="." * 60,
        mfe_kcal_mol=-20.0,
        features={},
    )
    arms = mature_arms(candidate)
    interactions = machinery_evidence(candidate)
    assert arms == [("hsa-miR-630", "AGUAUUCUGUACCAGGGAAGGU")]
    assert len(interactions) == 1
    assert interactions[0].protein == "AGO2"
    assert interactions[0].result == "Supported interaction"
    assert interactions[0].source_url == "https://pubmed.ncbi.nlm.nih.gov/38991944/"


def test_external_simtron_control_exposes_positive_and_negative_dependency_results():
    candidate = CandidateResult(
        id="external-simtron",
        start=11,
        end=70,
        strand="+",
        sequence_rna="GCAGGUGUGUGGUGGGUGGUGGCCUGCGGUGAGCAGGGCCCUCACACCUGCCUCGCCCCC",
        dot_bracket="." * 60,
        mfe_kcal_mol=-20.0,
        features={},
    )
    interactions = {item.protein: item for item in machinery_evidence(candidate)}
    assert interactions["DROSHA"].result == "Supported binding and processing"
    assert interactions["DICER1"].result == "Tested — not required"
    assert interactions["DGCR8"].result == "Tested — not required"
    assert interactions["XPO5"].result == "Tested — not required"
