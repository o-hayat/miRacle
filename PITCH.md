# MIR-NA demo and pitch notes

## One-sentence pitch

MIR-NA turns a short human genomic sequence into an explainable, ranked shortlist of precursor-miRNA-like hairpins, helping researchers decide which candidates are worth experimental follow-up first.

## Three-minute talk track

### 0:00–0:25 — Problem

Genomic regions can contain many sequences that fold into hairpins, but only a small fraction are credible microRNA precursor candidates. Experimental validation is slow, so researchers need a transparent way to decide which candidates to inspect first.

### 0:25–0:45 — Input

Load the bundled MIR21 control. Explain that MIR-NA receives only a 1,000-nucleotide sequence: it is not told the locus name or precursor coordinates. Choose genomic mode so both strands are scanned.

### 0:45–1:15 — Candidate generation

Run the analysis. Point to the scanner label, relative coordinate track, and ranked table. Explain that local folds must pass loose hairpin gates before the supervised model ranks them.

### 1:15–1:55 — Inspect the first result

Open candidate 1. On the checked-in control it spans the exact 501–560 precursor on the positive strand and receives a precursor-likeness score of 99.5/100. Show its structure, MFE, paired fraction, longest stem, and local feature sensitivities. Its exact MirGeneDB match and its Rfam non-miRNA conflict check are separate evidence and are not part of the model score.

### 1:55–2:20 — Be explicit about uncertainty

Read the missing-evidence panel. MIR-NA does not prove expression, precise Drosha/Dicer processing, RISC loading, targeting, function, or disease association. It ranks sequence-and-structure resemblance for follow-up.

### 2:20–2:40 — Evaluation

Show the held-out comparison. On 54 family-held-out precursors, 540 candidate-like chr21 negatives, and 108 held-out-family Rfam decoys, logistic regression reaches 0.912 PR-AUC and 0.828 F1, compared with 0.590 PR-AUC and 0.588 F1 for an MFE-per-nucleotide baseline. State that genomic negatives remain weak labels and Rfam decoys are multi-species.

### 2:40–3:00 — Contrast and close

Load the genomic negative control. Its top score is 0.048, versus 0.995 for the top MIR21-region candidate. Mention the additional held-out tRNA, rRNA, snoRNA, and ribozyme controls. Close with the supported decision: which few candidate loci should a researcher investigate experimentally first?

## Likely judge questions

### Does a high score mean you discovered a real miRNA?

No. It means the sequence resembles curated human precursors under sequence and predicted-structure features. Expression, precise processing, and function require small-RNA sequencing and laboratory validation.

### Why is this AI instead of a collection of thresholds?

Loose thresholds create a biologically plausible candidate set. Four supervised models learn how 36 continuous sequence and structure features combine. Logistic regression won on validation PR-AUC, so it remains the selected model even though another model may look better on one test metric. We compare every model directly with an MFE-only rule.

### How did you choose negatives?

They include hg38 sequences and Rfam tRNA, rRNA, snRNA, snoRNA, ribozyme, and riboswitch sequences that pass the same loose structural gate. chr22 supplies genomic training/validation negatives, chr21 supplies genomic test negatives, and Rfam families are kept in only one split. Genomic negatives remain weak labels.

### Why omit target genes, pathways, and disease claims?

The input does not reliably establish a mature arm or seed sequence. Predicting targets and then pathways would cascade uncertainty, so those layers were deliberately kept off the critical path.

### What would make this research-grade?

Small-RNA-seq evidence for precise mature/star processing, stronger negative annotations, coordinate-aware conservation, external species and tissue validation, calibrated scores, comparison with established discovery tools, and experimental confirmation.

## Emergency demo fallback

If live analysis fails, use the verified facts without inventing new values:

- MIR21 control candidate 1: positions 501–560 (+), score 0.9952, exact `Hsa-Mir-21_pre` reference match.
- Genomic negative control: top score 0.0477.
- Held-out selected model: precision 0.774, recall 0.889, F1 0.828, PR-AUC 0.912.
- MFE/nt baseline: precision 0.455, recall 0.833, F1 0.588, PR-AUC 0.590.

Use the application itself or `artifacts/evaluation/metrics.json` as the source of truth if the model is retrained.
