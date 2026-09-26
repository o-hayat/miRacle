#!/usr/bin/env python3
"""Fetch hg38 genomic ±500-nt contexts for the seven external RefSeq controls."""

from __future__ import annotations

import csv
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
ORIGINAL_DIR = ROOT / "assets" / "examples" / "external_ncbi_mirnas"
OUTPUT_DIR = ROOT / "assets" / "examples" / "external_ncbi_mirnas_flanked"
COMBINED_PATH = ROOT / "assets" / "ncbi_external_machinery_mirnas_flanked.fa"
API = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
USER_AGENT = "miRacle-hackathon/0.3 (offline-reference-builder)"


def request_text(endpoint: str, params: dict[str, str]) -> str:
    url = f"{API}/{endpoint}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=90) as response:
        text = response.read().decode("utf-8")
    time.sleep(0.36)
    return text


def read_one_fasta(path: Path) -> tuple[str, str]:
    lines = [line.strip() for line in path.read_text().splitlines() if line.strip()]
    return lines[0][1:].split()[0], "".join(lines[1:]).upper().replace("U", "T")


def reverse_complement(sequence: str) -> str:
    return sequence.translate(str.maketrans("ACGTN", "TGCAN"))[::-1]


def gene_id(symbol: str) -> str:
    payload = json.loads(
        request_text(
            "esearch.fcgi",
            {
                "db": "gene",
                "term": f"{symbol}[Gene Name] AND Homo sapiens[Organism]",
                "retmode": "json",
                "retmax": "5",
            },
        )
    )
    identifiers = payload["esearchresult"]["idlist"]
    if not identifiers:
        raise RuntimeError(f"No NCBI Gene record found for {symbol}")
    return identifiers[0]


def genomic_anchor(symbol: str, chromosome: str) -> tuple[str, int, int]:
    identifier = gene_id(symbol)
    payload = json.loads(
        request_text(
            "esummary.fcgi",
            {"db": "gene", "id": identifier, "retmode": "json"},
        )
    )
    record = payload["result"][identifier]
    candidates = record.get("genomicinfo", [])
    for item in candidates:
        accession = item.get("chraccver", "")
        if accession.startswith("NC_") and str(item.get("chrloc", "")) == chromosome:
            low = min(int(item["chrstart"]), int(item["chrstop"]))
            high = max(int(item["chrstart"]), int(item["chrstop"]))
            return accession, low, high
    raise RuntimeError(f"No primary-assembly genomic position found for {symbol} on chr{chromosome}")


def fetch_interval(accession: str, start_1: int, end_1: int) -> str:
    fasta = request_text(
        "efetch.fcgi",
        {
            "db": "nuccore",
            "id": accession,
            "rettype": "fasta",
            "retmode": "text",
            "strand": "1",
            "seq_start": str(start_1),
            "seq_stop": str(end_1),
        },
    )
    return "".join(line.strip() for line in fasta.splitlines() if not line.startswith(">"))


def main() -> None:
    with (ORIGINAL_DIR / "manifest.csv").open(newline="") as handle:
        rows = list(csv.DictReader(handle))
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    outputs: list[tuple[str, str]] = []
    manifest_rows: list[dict[str, str]] = []
    for row in rows:
        source_path = ORIGINAL_DIR / row["file"]
        precursor_id, precursor = read_one_fasta(source_path)
        chromosome = row["chromosome"]
        accession, low_0, high_0 = genomic_anchor(row["gene_symbol"], chromosome)

        search_start_1 = max(1, low_0 + 1 - 2_000)
        search_end_1 = high_0 + 1 + 2_000
        neighborhood = fetch_interval(accession, search_start_1, search_end_1).upper()
        orientation = "+"
        offset = neighborhood.find(precursor)
        if offset < 0:
            orientation = "-"
            offset = neighborhood.find(reverse_complement(precursor))
        if offset < 0:
            raise RuntimeError(
                f"The exact {precursor_id} sequence was not found near NCBI Gene {row['gene_symbol']}"
            )
        precursor_start_1 = search_start_1 + offset
        precursor_end_1 = precursor_start_1 + len(precursor) - 1
        flank_start_1 = max(1, precursor_start_1 - 500)
        flank_end_1 = precursor_end_1 + 500
        sequence = fetch_interval(accession, flank_start_1, flank_end_1).upper()
        expected = len(precursor) + 1_000
        if flank_start_1 > 1 and len(sequence) != expected:
            raise RuntimeError(f"Unexpected flanked length for {precursor_id}: {len(sequence)} != {expected}")

        output_name = source_path.stem + "_plusminus500.fa"
        header = (
            f"{precursor_id}_plusminus500 {accession}:{flank_start_1}-{flank_end_1} "
            f"chr{chromosome}:{flank_start_1}-{flank_end_1} hg38 gene={row['gene_symbol']} "
            f"precursor={precursor_start_1}-{precursor_end_1}({orientation}) source=NCBI"
        )
        text = f">{header}\n{sequence}\n"
        (OUTPUT_DIR / output_name).write_text(text)
        outputs.append((header, sequence))
        manifest_rows.append(
            {
                "file": output_name,
                "source_precursor_file": row["file"],
                "refseq_accession": precursor_id,
                "gene_symbol": row["gene_symbol"],
                "assembly": "GRCh38/hg38",
                "chromosome_accession": accession,
                "genomic_interval_1_based": f"chr{chromosome}:{flank_start_1}-{flank_end_1}",
                "precursor_interval_1_based": f"chr{chromosome}:{precursor_start_1}-{precursor_end_1}",
                "precursor_strand": orientation,
                "flank_each_side_nt": "500",
                "sequence_length_nt": str(len(sequence)),
                "ncbi_gene_source": f"https://www.ncbi.nlm.nih.gov/gene/?term={urllib.parse.quote(row['gene_symbol'] + '[sym] AND human[orgn]')}",
                "ncbi_sequence_source": f"https://www.ncbi.nlm.nih.gov/nuccore/{accession}",
            }
        )

    COMBINED_PATH.write_text("".join(f">{header}\n{sequence}\n" for header, sequence in outputs))
    fieldnames = list(manifest_rows[0])
    with (OUTPUT_DIR / "manifest.csv").open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(manifest_rows)
    print(f"Fetched {len(outputs)} exact precursor-centered GRCh38 regions into {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
