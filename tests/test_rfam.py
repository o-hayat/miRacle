import gzip

from mirna_app.rfam import load_structured_decoys


def test_rfam_parser_selects_non_mirna_structured_rnas(tmp_path):
    archive = tmp_path / "seed.gz"
    content = """# STOCKHOLM 1.0
#=GF AC   RF00005
#=GF ID   tRNA
#=GF TP   Gene; tRNA;
seq1 ACGUACGUACGUACGUACGUACGUACGUAC

seq1 ACGUACGUACGUACGUACGUACGUACGUAC
//
# STOCKHOLM 1.0
#=GF AC   RF99999
#=GF ID   miRNA_test
#=GF TP   Gene; miRNA;
mir1 ACGUACGUACGUACGUACGUACGUACGUACGUACGUACGUACGUACGUACGUACG
//
"""
    with gzip.open(archive, "wt") as handle:
        handle.write(content)
    records = load_structured_decoys(archive)
    assert len(records) == 1
    assert records[0].accession == "RF00005"
    assert len(records[0].sequence) == 60
