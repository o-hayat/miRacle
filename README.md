# miRacle

> Explainable triage of human microRNA precursor candidates.

![Python 3.12](https://img.shields.io/badge/Python-3.12-3776AB?style=flat-square&logo=python&logoColor=white)
![Next.js 16](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs&logoColor=white)
![ViennaRNA 2.7](https://img.shields.io/badge/ViennaRNA-2.7-111111?style=flat-square)
[![MIT License](https://img.shields.io/badge/license-MIT-d7ff64?style=flat-square)](LICENSE)

![miRacle demo](web/public/miracle.mp4)

miRacle turns a short DNA or RNA sequence, or a selected hg38 locus, into an
explainable ranked shortlist of pre-miRNA-like hairpins. Fold candidates with
ViennaRNA, score them with a human-trained classifier, and inspect independent
evidence before deciding what to take into the lab.

It is a candidate-triage tool, not a discovery claim. A score does not
demonstrate transcription, precise Drosha or Dicer processing, RISC loading,
gene targeting, disease association, or experimental validation.

**Live site:** [miracle-vienna.tech](https://miracle-vienna.tech)

## Workspace

| Area | Responsibility |
| --- | --- |
| [web/](web) | Next.js research interface, Web Worker, WASM fold, static Vercel export |
| [mirna_app/](mirna_app) | Python analysis library and scientific reference pipeline |
| [app.py](app.py) | Streamlit local application |
| [scripts/](scripts) | Data fetch, training, WASM build, browser asset export |
| [wasm/](wasm) | ViennaRNA WebAssembly bridge sources |
| [assets/](assets) | Examples, references, and curated controls |
| [artifacts/](artifacts) | Trained model and evaluation metrics |
| [tests/](tests) | Python unit and pipeline tests |

## Development setup

miRacle is a dual-runtime research system. The browser app runs the preserved
model and ViennaRNA 2.7.2 locally in a Web Worker. The Python app remains the
scientific reference and the path that trains and exports the shared artifacts.

### Prerequisites

| Requirement | Used for |
| --- | --- |
| Node 24 and [Bun 1.3.11](https://bun.sh/) | Browser app install, build, and checks |
| Python 3.12 and uv | Scientific pipeline, exporter, and Streamlit app |
| Optional conda with ViennaRNA CLI tools | RNALfold binary for local scanning |

Install the browser workspace, then bring up the experience you need:

| Order | Component | Runbook |
| ---: | --- | --- |
| 1 | Browser app | `cd web && bun install --frozen-lockfile && bun run build && bun run preview` |
| 2 | Streamlit app | `conda env create -f environment.yml && conda activate miracle && streamlit run app.py` |
| 3 | Artifact rebuild | `make fetch && make train` |
| 4 | Checks | `make test` then `cd web && bun run check` |

Open [http://127.0.0.1:3000](http://127.0.0.1:3000) for the browser build, or
[http://localhost:8501](http://localhost:8501) for Streamlit. Load the MIR21
positive control and run a candidate scan.

Python-only install without conda:

```sh
uv venv --python 3.12 .venv
uv pip sync --python .venv/bin/python requirements-reference.lock
.venv/bin/streamlit run app.py
```

The PyPI ViennaRNA wheel may omit the `RNALfold` executable. In that case
miRacle reports the gap and uses the RNAfold multi-scale fallback. Bioconda
ViennaRNA supplies the command-line programs.

## Benchmark

The checked-in model is logistic regression, selected for highest validation
PR-AUC. Test-set performance was not used to switch models.

| Held-out method | Precision | Recall | F1 | PR-AUC | False positives / 100 negatives |
| --- | ---: | ---: | ---: | ---: | ---: |
| Logistic regression | 0.774 | 0.889 | 0.828 | 0.912 | 2.160 |
| Random Forest | 0.824 | 0.778 | 0.800 | 0.877 | 1.389 |
| Extra Trees | 0.778 | 0.778 | 0.778 | 0.870 | 1.852 |
| Histogram gradient boosting | 0.828 | 0.889 | 0.857 | 0.902 | 1.543 |
| MFE/nt baseline | 0.455 | 0.833 | 0.588 | 0.590 | 8.333 |

Test composition: 54 held-out positive precursors, 540 candidate-like chr21
negatives, and 108 decoys from Rfam families excluded from training and
validation. See [DATA_SOURCES.md](DATA_SOURCES.md) for provenance.

## Stack

| Layer | Technology |
| --- | --- |
| Browser | Next.js 16, React 19, Bun, Web Worker, Three.js |
| Folding | ViennaRNA 2.7.2 via WebAssembly |
| Model | scikit-learn logistic regression, content-addressed export |
| Reference app | Python 3.12, Streamlit, ViennaRNA |
| Deploy | Static export on Vercel |

## Design principles

- Analysis runs in the browser. No server-side sequence processing is required.
- The precursor-likeness score is separate from reference, Rfam, and literature evidence.
- The browser never retrains or invents a fallback heuristic when assets are wrong.
- Released data is content-addressed with source and asset hashes.
- The Python library remains the scientific reference for parity checks.

## License

miRacle is available under the [MIT License](LICENSE).

Data provenance lives in [DATA_SOURCES.md](DATA_SOURCES.md). Demo notes live in
[PITCH.md](PITCH.md).

<p align="center">
  <a href="https://github.com/o-hayat"><img src="https://github.com/o-hayat.png?size=104" width="52" height="52" alt="Hayat" style="border-radius: 50%;" /></a>
  <a href="https://github.com/halinamai"><img src="https://github.com/halinamai.png?size=104" width="52" height="52" alt="Helena" style="border-radius: 50%;" /></a>
  <a href="https://github.com/julian-at"><img src="https://github.com/julian-at.png?size=104" width="52" height="52" alt="Julian" style="border-radius: 50%;" /></a>
</p>
