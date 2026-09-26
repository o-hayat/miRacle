# Seven independent NCBI RefSeq controls with miRNA-machinery evidence

These seven human precursor records were downloaded from NCBI Nucleotide/RefSeq
on 2026-09-26. None was used to train, validate, test, select a model, or select
the score threshold.

## Independence checks

For every record, both orientations were checked against all 514 MirGeneDB
reference precursors and all 3,279 Rfam decoys. No exact match was found. The
complete sequences were also absent from the hg38 chromosome 21 and chromosome
22 FASTAs used to create genomic negatives. Their NCBI loci are on chromosomes
1, 8, 12, 15, 16, 17, and 20.

## Candidate-specific protein evidence

Five controls have anti-AGO2 RNA-immunoprecipitation evidence showing enrichment
of the named mature miRNA over an IgG control. MIR1225 and MIR1228 were examined
in a mechanistic simtron study that reported DROSHA binding and in-vitro
processing, while testing DGCR8, DICER1, XPO5, and AGO2 dependency. Exact
experiments, biological contexts, and PubMed sources are stored in
`assets/references/external_machinery_interactions.csv`.

| NCBI precursor | Mature miRNA | Machinery evidence | PMID |
|---|---|---|---:|
| NR_030359.1 | hsa-miR-630 | AGO2 RIP | 38991944 |
| NR_030362.1 | hsa-miR-632 | AGO2 RIP | 32024815 |
| NR_030386.1 | hsa-miR-663a | AGO2 RIP | 32514244 |
| NR_031612.1 | hsa-miR-1207-5p | AGO2 RIP | 33294297 |
| NR_031622.1 | hsa-miR-1290 | AGO2 RIP | 35411716 |
| NR_030646.1 | hsa-miR-1225 | DROSHA binding/processing; pathway perturbations | 22270084 |
| NR_031597.1 | hsa-miR-1228 | DROSHA binding/processing; pathway perturbations | 22270084 |

## Interpretation

“Supported interaction” means the cited experiment recovered the mature miRNA
with the named protein or demonstrated biochemical binding/processing. “Tested
— not required” is a functional dependency result and must not be misread as
proof that physical contact never occurs. Blank machinery rows mean no
candidate-specific evidence is bundled, not that the interaction is absent.

NCBI labels all seven precursor records `PROVISIONAL REFSEQ`. The panel is an
external challenge set, and only one record currently exceeds the model's
validation-selected 0.8117 threshold. It must not be used to tune the model.
