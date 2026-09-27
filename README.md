# miRacle

The new static browser interface lives in [`web/`](web/README.md). It runs the preserved trained model and ViennaRNA 2.7.2 locally in a Web Worker, exports a static site for Vercel, and keeps all five research workflows. The Python application below remains the scientific reference and local application.

miRacle is a human-trained prototype that turns a short DNA/RNA sequence or selected hg38 locus into an explainable ranked shortlist of **pre-miRNA-like hairpins**.

It is a candidate-triage tool, not a discovery claim. A score does not demonstrate transcription, precise Drosha/Dicer processing, RISC loading, gene targeting, disease association, or experimental validation.

## What is implemented

- One pasted or uploaded FASTA/text sequence, 55–20,000 nt.
- Direct hg38 locus input by chromosome and one-based inclusive start/end coordinates; bundled or downloaded regions work offline and other valid intervals use the UCSC sequence API.
- Coordinate-aware hg38 preprocessing: mask protein-coding CDS by default, optionally all exons, when a length-matched `chr:start-end hg38` FASTA header is supplied.
- Automatic strand handling: U-only RNA is scanned as supplied; DNA and ambiguous input are scanned on both strands.
- RNALfold local scanning when its binary is available.
- Automatic multi-scale ViennaRNA/RNAfold fallback at 60, 70, 90, and 110 nt.
- MFE, normalized MFE, sequence composition, pairing, stem, loop, internal-unpaired, branch, and pair-type features.
- A bundled supervised classifier trained on curated human precursors, candidate-like hg38 genomic negatives, and family-separated Rfam structural-RNA decoys.
- Nearest MirGeneDB precursor similarity as a separate, non-model evidence layer.
- Independent mouse, orangutan, chimpanzee, gorilla, and limited bottlenose-dolphin precursor matches; these do not change the score.
- Independent similarity warning against 3,279 candidate-like Rfam non-miRNA decoys.
- Overlap suppression, top-10 interactive results, top-25 CSV/FASTA export.
- Interactive ViennaRNA RNAplot/arc structure views with nucleotide coloring and SVG download, local one-feature sensitivity explanations, and explicit limitations.
- One-click positive-versus-negative control comparison with identical pipeline processing, side-by-side evidence signals, and folded structures.
- Held-out model comparison, normalized confusion matrix, and negative-subset stress tests.
- Curated mature-arm lookup and a DROSHA/DGCR8/XPO5/DICER1/TARBP2/AGO2/TNRC6A evidence table.
- Seven independent NCBI RefSeq controls with candidate-specific machinery experiments from primary studies.
- Separate GRCh38 versions of all seven external controls with the exact precursor plus 500 nt on each side.
- Manually curated, cited literature cards for strong matches to selected well-studied human miRNA families.
- Offline positive, genomic-negative, tRNA, rRNA, snoRNA, and ribozyme controls.

## Quick start

The repository already contains a workspace-local Python 3.12 virtual environment on the build machine. To reproduce elsewhere, use either conda or pip.

### Conda, recommended when RNALfold is required

```bash
conda env create -f environment.yml
conda activate miracle
streamlit run app.py
```

### Python 3.12 and pip

```bash
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/streamlit run app.py
```

The PyPI ViennaRNA wheel provides the folding library used by the app but may not install the `RNALfold` executable. In that case miRacle clearly reports and uses the planned RNAfold multi-scale fallback. Installing ViennaRNA through Bioconda supplies the command-line programs.

Open [http://localhost:8501](http://localhost:8501), load the MIR21 positive control, and select **Run candidate scan**.

## Tests

```bash
make test
```

The test suite covers parsing, automatic strand handling, strand coordinates, dot-bracket features, candidate gates, Rfam selection, mature-arm evidence, candidate-specific machinery evidence, similarity, external-control exclusion, and full application analyses.

## Rebuild data and model

The complete analysis and evidence display run offline. To reproduce the preparation artifacts:

```bash
make fetch
make train
```

Training uses:

- MirGeneDB 3.0 human precursors as positives.
- hg38 chr22 candidate-like hairpins for training and validation.
- hg38 chr21 candidate-like hairpins for the held-out negative test set.
- Rfam seed tRNA, rRNA, snRNA, snoRNA, ribozyme, and riboswitch sequences that pass the same candidate gate.
- Family-grouped positive and Rfam splits. The final test contains 54 positives, 540 genomic negatives, and 108 held-out-family Rfam negatives.

See [DATA_SOURCES.md](DATA_SOURCES.md) for exact provenance.

## Current benchmark

The checked-in artifact selected logistic regression because it had the highest validation PR-AUC. Test-set performance was not used to switch models.

| Held-out method | Precision | Recall | F1 | PR-AUC | False positives / 100 negatives |
|---|---:|---:|---:|---:|---:|
| Logistic regression | 0.774 | 0.889 | 0.828 | 0.912 | 2.160 |
| Random Forest | 0.824 | 0.778 | 0.800 | 0.877 | 1.389 |
| Extra Trees | 0.778 | 0.778 | 0.778 | 0.870 | 1.852 |
| Histogram gradient boosting | 0.828 | 0.889 | 0.857 | 0.902 | 1.543 |
| MFE/nt baseline | 0.455 | 0.833 | 0.588 | 0.590 | 8.333 |

Test composition: 54 held-out positive precursors, 540 candidate-like chr21 negatives, and 108 decoys from Rfam families excluded from training and validation. Genomic negatives remain weak labels, and the Rfam set is multi-species rather than population-matched human background.

## Verified demo checks

- MIR21 control: the exact 501–560 (+) precursor ranks first at 0.9952; nearest-reference identity and coverage are both 100%.
- Genomic negative control: highest candidate score 0.0477.
- Held-out Rfam controls: tRNA 0.7348, rRNA 0.2784, snoRNA 0.0014, and ribozyme 0.0145 at their highest-scoring window. The validation-selected prioritization threshold is 0.8117.
- A 20,000-nt non-`N` benchmark completed in 37.5 seconds on the build laptop with the RNAfold-window fallback and all comparison layers enabled. A 10,000-nt input completed in 23.1 seconds. Runtime depends on sequence, scanner availability, and hardware, so the one-minute target is a measured prototype target rather than a guarantee.
- The automated test suite passes.

## Independent NCBI miRNA controls

Seven NCBI RefSeq precursor FASTAs absent from every modeling source are
available in [`assets/examples/external_ncbi_mirnas`](assets/examples/external_ncbi_mirnas).
Neither orientation occurs in the MirGeneDB positives, Rfam decoys, or hg38
chromosomes 21/22 used for genomic negatives. Five controls have candidate-
specific anti-AGO2 RNA-immunoprecipitation evidence. MIR1225 and MIR1228 have
DROSHA binding/processing evidence plus experiments testing dependence on
DGCR8, DICER1, XPO5, and AGO2. The Evidence tab shows both supported interactions
and “tested—not required” results with PubMed links. NCBI marks the precursor
records `PROVISIONAL REFSEQ`. See the folder's `manifest.csv` for accessions,
exclusion checks, evidence, and current results. The panel is never used to tune
the model; one of seven currently exceeds the validation-selected threshold.

The corresponding precursor-centered genomic regions are in
[`assets/examples/external_ncbi_mirnas_flanked`](assets/examples/external_ncbi_mirnas_flanked).
Each is reference-forward GRCh38 sequence and contains the verified RefSeq
precursor at bases 501 onward, with 500 nt of authentic genomic context on both
sides. The originals are intentionally retained for direct precursor tests.

Exact runtime varies by machine. The displayed score is a ranking value and must not be interpreted as a validated biological probability.

## Architecture

```text
FASTA/text or hg38 chromosome:start-end
  → optional bundled/local/UCSC sequence retrieval
  → validation and strand handling
  → optional coordinate-aware hg38 CDS/exon masking
  → RNALfold or RNAfold-window candidate generation
  → structural gates and feature extraction
  → supervised precursor-likeness score
  → overlap suppression and ranking
  → independent human + cross-species precursor matches + Rfam conflict check
  → evidence ladder, curated literature, mature-arm lookup, protein context
  → local sensitivity explanation and SVG
  → Streamlit results, evaluation, CSV, and FASTA
```

The public Python entry point is:

```python
from mirna_app import analyze

result = analyze(sequence_text, input_type="genomic", input_id="region_1")
```

Coordinates are 1-based, inclusive, and relative to the submitted sequence.

## Three-minute demo

1. Explain that genomic regions contain many incidental hairpins and experimental follow-up is expensive.
2. Load the bundled MIR21 genomic region; its hg38 header enables auditable CDS masking.
3. Run the scan and show that the annotated locus ranks first.
4. Inspect its fold, MFE, feature influences, and near-exact curated-reference match.
5. Open **Compare controls** and run MIR21 against the genomic negative to show the two folds and evidence layers side by side.
6. Show the held-out benchmark against MFE alone to distinguish the demo contrast from formal evaluation.
7. Close with the intended decision: which few loci should a researcher investigate experimentally first?

The complete talk track and judge answers are in [PITCH.md](PITCH.md).
