#!/usr/bin/env python3
"""Download and pin the small reference files needed by the offline demo."""

from __future__ import annotations

import argparse
import gzip
import json
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
REFERENCE_DIR = ROOT / "assets" / "references"
EXAMPLE_DIR = ROOT / "assets" / "examples"
RAW_DIR = ROOT / "artifacts" / "raw"

URLS = {
    "precursors": "https://www.mirgenedb.org/fasta/hsa?pre=1",
    "mature": "https://www.mirgenedb.org/fasta/hsa?mat=1",
    "gff": "https://www.mirgenedb.org/gff/hsa?all=1&sort=pos",
    "chr21": "https://hgdownload.soe.ucsc.edu/goldenpath/hg38/chromosomes/chr21.fa.gz",
    "chr22": "https://hgdownload.soe.ucsc.edu/goldenpath/hg38/chromosomes/chr22.fa.gz",
    "rfam_seed": "https://ftp.ebi.ac.uk/pub/databases/Rfam/CURRENT/Rfam.seed.gz",
}


def download(url: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": "MIR-NA-hackathon/0.1"})
    with urllib.request.urlopen(request, timeout=120) as response:
        destination.write_bytes(response.read())


def fetch_ucsc_interval(chrom: str, start: int, end: int, identifier: str, destination: Path) -> None:
    url = (
        "https://api.genome.ucsc.edu/getData/sequence"
        f"?genome=hg38;chrom={chrom};start={start};end={end}"
    )
    request = urllib.request.Request(url, headers={"User-Agent": "MIR-NA-hackathon/0.1"})
    with urllib.request.urlopen(request, timeout=60) as response:
        payload = json.loads(response.read().decode("utf-8"))
    dna = payload["dna"].upper()
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(f">{identifier} {chrom}:{start + 1}-{end} hg38\n{dna}\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--with-genome", action="store_true", help="Also fetch chr21/chr22 for training")
    parser.add_argument(
        "--with-rfam",
        action="store_true",
        help="Also fetch the Rfam seed archive used for structured non-miRNA negatives",
    )
    args = parser.parse_args()

    download(URLS["precursors"], REFERENCE_DIR / "hsa_precursors.fa")
    download(URLS["mature"], REFERENCE_DIR / "hsa_mature.fa")
    download(URLS["gff"], REFERENCE_DIR / "hsa_mirgenedb.gff3")

    # 1,000 nt with Hsa-Mir-21_pre at relative bases 501–560.
    fetch_ucsc_interval(
        "chr17",
        59_840_772,
        59_841_772,
        "MIR21_positive_control",
        EXAMPLE_DIR / "mir21_region.fa",
    )
    fetch_ucsc_interval(
        "chr21",
        20_000_000,
        20_001_000,
        "chr21_negative_control",
        EXAMPLE_DIR / "negative_control.fa",
    )

    if args.with_genome:
        for chromosome in ("chr21", "chr22"):
            compressed = RAW_DIR / f"{chromosome}.fa.gz"
            uncompressed = RAW_DIR / f"{chromosome}.fa"
            download(URLS[chromosome], compressed)
            with gzip.open(compressed, "rb") as source:
                uncompressed.write_bytes(source.read())

    if args.with_rfam:
        download(URLS["rfam_seed"], RAW_DIR / "Rfam.seed.gz")

    print("Reference and example data downloaded successfully.")


if __name__ == "__main__":
    main()
