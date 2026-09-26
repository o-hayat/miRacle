import csv
from pathlib import Path

from mirna_app.similarity import read_fasta


ROOT = Path(__file__).resolve().parent.parent
PANEL = ROOT / "assets" / "examples" / "external_ncbi_mirnas"
FLANKED_PANEL = ROOT / "assets" / "examples" / "external_ncbi_mirnas_flanked"
MIRGENEDB = ROOT / "assets" / "references" / "hsa_precursors.fa"
RFAM = ROOT / "assets" / "references" / "rfam_ncrna_decoys.fa"


def reverse_complement(sequence: str) -> str:
    return sequence.translate(str.maketrans("ACGU", "UGCA"))[::-1]


def test_external_ncbi_panel_has_no_exact_model_source_matches():
    model_sequences = {
        sequence
        for path in (MIRGENEDB, RFAM)
        for _, sequence in read_fasta(path)
    }
    fasta_paths = sorted(PANEL.glob("*.fa"))

    assert len(fasta_paths) == 7
    for fasta_path in fasta_paths:
        records = read_fasta(fasta_path)
        assert len(records) == 1
        accession, sequence = records[0]
        assert accession.startswith("NR_") and "." in accession
        assert 55 <= len(sequence) <= 120
        assert sequence not in model_sequences
        assert reverse_complement(sequence) not in model_sequences


def test_external_ncbi_panel_is_absent_from_genomic_negative_chromosomes_when_available():
    chromosome_paths = [
        ROOT / "artifacts" / "raw" / "chr21.fa",
        ROOT / "artifacts" / "raw" / "chr22.fa",
    ]
    chromosome_sequences = [
        "".join(
            line.strip()
            for line in path.read_text().splitlines()
            if not line.startswith(">")
        ).upper().replace("T", "U")
        for path in chromosome_paths
        if path.exists()
    ]

    for fasta_path in PANEL.glob("*.fa"):
        _, sequence = read_fasta(fasta_path)[0]
        reverse = reverse_complement(sequence)
        assert all(sequence not in chromosome for chromosome in chromosome_sequences)
        assert all(reverse not in chromosome for chromosome in chromosome_sequences)


def test_external_ncbi_manifest_covers_all_seven_fastas():
    with (PANEL / "manifest.csv").open(newline="") as handle:
        rows = list(csv.DictReader(handle))

    assert len(rows) == 7
    assert {row["file"] for row in rows} == {
        path.name for path in PANEL.glob("*.fa")
    }
    assert {row["exact_or_reverse_match_in_model_sources"] for row in rows} == {"no"}
    assert not ({row["chromosome"] for row in rows} & {"21", "22"})


def test_flanked_panel_contains_each_precursor_and_exactly_500_nt_per_side():
    with (FLANKED_PANEL / "manifest.csv").open(newline="") as handle:
        rows = list(csv.DictReader(handle))
    assert len(rows) == 7
    for row in rows:
        _, genomic = read_fasta(FLANKED_PANEL / row["file"])[0]
        _, precursor = read_fasta(PANEL / row["source_precursor_file"])[0]
        expected = precursor if row["precursor_strand"] == "+" else reverse_complement(precursor)
        assert len(genomic) == len(precursor) + 1_000
        assert genomic[500 : 500 + len(precursor)] == expected
        assert row["assembly"] == "GRCh38/hg38"
