#!/usr/bin/env python3
"""Build compact offline comparative-miRNA and hg38 exon assets from pinned downloads."""

from __future__ import annotations

import argparse
import gzip
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
REFERENCES = ROOT / "assets" / "references"


def copy_text(source: Path, destination: Path) -> None:
    destination.write_text(source.read_text())


def filter_mirbase(source: Path, prefix: str, destination: Path) -> None:
    records: list[str] = []
    with gzip.open(source, "rt", encoding="utf-8") as handle:
        header = ""
        sequence: list[str] = []
        for raw in handle:
            line = raw.strip()
            if line.startswith(">"):
                if header.startswith(">" + prefix):
                    records.extend([header, "".join(sequence)])
                header, sequence = line, []
            elif line:
                sequence.append(line)
        if header.startswith(">" + prefix):
            records.extend([header, "".join(sequence)])
    destination.write_text("\n".join(records) + "\n")


def build_coding_exons(source: Path, destination: Path, cds_only: bool = False) -> int:
    """Collapse hg38 NM_ RefSeq transcript exons or their coding portions into BED."""
    exact: dict[tuple[str, int, int], set[str]] = {}
    with gzip.open(source, "rt", encoding="utf-8") as handle:
        for raw in handle:
            fields = raw.rstrip("\n").split("\t")
            if len(fields) < 13:
                continue
            accession, chrom = fields[1], fields[2]
            cds_start, cds_end = int(fields[6]), int(fields[7])
            if not accession.startswith("NM_") or cds_start >= cds_end:
                continue
            starts = [int(value) for value in fields[9].rstrip(",").split(",")]
            ends = [int(value) for value in fields[10].rstrip(",").split(",")]
            gene = fields[12]
            for start, end in zip(starts, ends):
                if cds_only:
                    start = max(start, cds_start)
                    end = min(end, cds_end)
                    if start >= end:
                        continue
                exact.setdefault((chrom, start, end), set()).add(gene)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(destination, "wt", encoding="utf-8") as handle:
        label = "CDS segments" if cds_only else "protein-coding transcript exons"
        handle.write(f"# hg38 ncbiRefSeqCurated {label}; BED coordinates\n")
        for (chrom, start, end), genes in sorted(exact.items()):
            handle.write(f"{chrom}\t{start}\t{end}\t{','.join(sorted(genes))}\n")
    return len(exact)


def write_dolphin_panel(destination: Path) -> None:
    # Small Tursiops truncatus panel frozen from RNAcentral/Ensembl Metazoa records.
    records = {
        "URS000075A8AA_9739|ENSTTRG00000021579.1|mir-148b": "UUAGCAUUUGAGGUGAAGUUCUGUUAUACACUCAGGCUGUGGCUCUCUGAAAGUCAGUGCAUCACAGAACUUUGUCUCGAAAGCUUUCUA",
        "URS00007E379A_9739|ENSTTRG00000022744.1|mir-181a-1": "AACAUUCAACGCUGUCGGUGAGUUUGGAAUUAAAAUCAAAACCAUCGACCGUUGAUUGUACC",
        "URS000075C54E_9739|ENSTTRG00000022795.1|mir-9-1": "CGGGGUUGGUUGUUAUCUUUGGUUAUCUAGCUGUAUGAGUGGUGUGGAGUCUUCAUAAAGCUAGAUAACCGAAAGUAAAAAUAACCCCA",
        "URS000075BCF9_9739|Rfam|mir-375": "CCCCGCGACGAGCCCCUCGCACAAACCGGACCUGAGCGUUUUGUUCGUUCGGCUCGCGUGAGGC",
        "URS00002D9CBA_9739|ENSTTRG00000022240.1|mir-128-1": "UGAGCUGUUGGAUUCGGGGCCGUAGCACUGUCUGAGAGGUUUACAUUUCUCACAGUGAACCGGUCUCUUUUUCAGCUGCUUC",
        "URS00003A9237_9739|ENSTTRG00000024082.1|mir-24-1": "CUCCGGUGCCUACUGAGCUGAUAUCAGUUCUCAUUUUACACACUGGCUCAGUUCAGCAGGAACAGGAG",
    }
    destination.write_text("".join(f">{name}\n{sequence}\n" for name, sequence in records.items()))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mouse", type=Path, required=True)
    parser.add_argument("--orangutan", type=Path, required=True)
    parser.add_argument("--mirbase", type=Path, required=True)
    parser.add_argument("--refseq-table", type=Path, required=True)
    args = parser.parse_args()
    REFERENCES.mkdir(parents=True, exist_ok=True)
    copy_text(args.mouse, REFERENCES / "mmu_precursors_mirgenedb.fa")
    copy_text(args.orangutan, REFERENCES / "pab_precursors_mirgenedb.fa")
    filter_mirbase(args.mirbase, "ptr-", REFERENCES / "ptr_precursors_mirbase22.fa")
    filter_mirbase(args.mirbase, "ggo-", REFERENCES / "ggo_precursors_mirbase22.fa")
    write_dolphin_panel(REFERENCES / "ttr_precursors_rnacentral.fa")
    exon_count = build_coding_exons(
        args.refseq_table,
        REFERENCES / "hg38_refseq_coding_exons.bed.gz",
    )
    cds_count = build_coding_exons(
        args.refseq_table,
        REFERENCES / "hg38_refseq_cds_segments.bed.gz",
        cds_only=True,
    )
    print(
        f"Built comparative panels, {exon_count:,} exon intervals, "
        f"and {cds_count:,} CDS segments."
    )


if __name__ == "__main__":
    main()
