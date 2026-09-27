# miRacle browser application

Next.js static export with a dedicated Web Worker running ViennaRNA 2.7.2 in WebAssembly. No server-side analysis, database, or paid compute is required. The native Python/Streamlit application remains intact.

## Review locally

From the repository root, use Node 24.15.0 (`nvm use`) and Bun 1.3.11:

```sh
cd web
bun install --frozen-lockfile
bun run build
bun run preview
```

Open http://127.0.0.1:3000. `bun run dev` is also available. The production preview serves `out/`; it does not run a Next.js server. Fonts, models, reference indexes, evidence, bundled controls, and annotations are self-hosted. Computational assets download on the first analysis. Unbundled hg38 intervals use UCSC directly.

The footer offers Light, Dark, and System themes. System is the initial default; the selected preference is saved in this browser. System follows the device appearance, including changes while the page is open. Interface controls and scientific figures share theme tokens, while downloaded SVGs keep a light document background.

## Reproduce the scientific artifacts

Python 3.12.13, `make`, a C/C++ build environment, `pkg-config`, Git, curl, and tar are required. macOS can install the missing pkg-config tool with `brew install pkgconf`; Linux distributions provide it through their package manager.

```sh
# From the repository root
uv venv --python 3.12.13 .venv
uv pip sync --python .venv/bin/python requirements-reference.lock
bash scripts/build_wasm.sh
.venv/bin/python scripts/export_browser_assets.py --fixtures --jobs 4
.venv/bin/python scripts/export_edge_cases.py
cd web
bun run build
```

The WASM script installs Emscripten 4.0.20 under the ignored `artifacts/tmp/emsdk` directory if needed, verifies the ViennaRNA source archive digest, builds a single-threaded library, and exports folding plus native NAVIEW coordinates. Set `EMSDK` to use an existing matching toolchain; `BUILD_JOBS` controls build parallelism.

The exporter requires scikit-learn 1.5.0, NumPy 1.26.4, and ViennaRNA 2.7.2. It rejects unsupported model types, scaling, feature order, dimensions, non-finite parameters, or class order. It never retrains or falls back to a heuristic. `--fixtures` produces all 20 bundled controls under CDS, all-exon, and no masking, as well as explicitly labelled saved examples.

Data releases are content-addressed and contain source hashes, asset hashes, and versioned WASM files. The frontend build refuses scientific sources that differ from the exported release. Changed scientific sources therefore require a fresh export. Initial page content includes only the introduction, true MIR21 figure, examples, and benchmark; the classifier and reference indexes are loaded by the worker on demand.

## Verify

```sh
# Repository root: original Python tests plus exporter guards
.venv/bin/python -m pytest

cd web
bun run lint
bun run typecheck
bun run test
bun run build
bunx playwright install chromium firefox webkit
bun run test:browser
```

Node parity tests compare every candidate, rank, structure, coordinate, feature, reference match, local sensitivity, evidence classification, and CSV/FASTA output. Energy tolerance is `1e-5`, score tolerance is `1e-7`, and native plot coordinates must match exactly. Python-compatible decimal rounding is preserved for formatted exports.

Browser tests run against `out/` in Chromium, Firefox, and WebKit. They cover the 60 reference cases, scans, repeated scans, stale results, cancellation, candidate selection across tabs, control comparisons, all download types, uploaded inputs, UCSC errors, asset errors, accessibility, reduced motion, and 390/768/1440 px layouts. A real 20,000 nt benchmark records runtime, main-thread responsiveness, WASM heap, and sampled browser-process RSS. Measurements are machine-specific.

Discover keeps reference controls and preprocessing in expandable shadcn sections. The research figures use the displayed shortlist and the exported benchmark: candidate intervals, energy versus score, cross-species identity/coverage, and a confusion matrix with exact counts and row percentages. The optional Three.js view adds paired fraction as a third feature axis; it is not a molecular 3D model. It loads on demand, renders only during interaction, and offers a 2D fallback when WebGL is unavailable. `tests/browser/research-figures.spec.ts` checks the figure values, selection, disclosure state, keyboard controls, WebGL fallback, accessibility, and review widths.

Screenshots and parity/performance JSON are saved under `test-results/`, and the run summary under `playwright-report/results.json`. Both are gitignored. A passing test report does not turn a candidate score into biological validation.

## Vercel

Set the Vercel project Root Directory to `web`, Node.js version to 24.x, and leave the framework preset as Other. `vercel.json` builds and serves the Next.js static export in `out/`. No Functions, server-side analysis, or database are provisioned. Versioned data and workers receive immutable cache headers. Uploaded sequences remain in the visitor’s browser.

```sh
bun run build
# Preview deployment, after authenticating with your Vercel account:
bunx vercel login
bun run deploy
# Publish the reviewed deployment with the Vercel dashboard.
```

The default deploy command creates a preview; it does not publish to production. Keep credentials outside source control.

## Boundaries

The five workflows retain their original labels/defaults and candidate state. Browser analysis uses the 60/70/90/110 nt RNAfold scanning path; RNALfold remains available in Python. RNA containing U and no T scans only its submitted strand. Genomic input scans both strands. `N` divides foldable segments while preserving full-input coordinates. Coding-region exclusion requires trustworthy length-matched genomic coordinates.

Cancelling terminates the worker. Request IDs and UI generations prevent late results or downloads from replacing newer inputs. The previous result remains explicitly marked if inputs change. Discover uses the live scan action; the separate saved-example action was removed after interface review. Bundled analyses remain in the scientific release for reproducibility and parity checks.

See [THIRD_PARTY.md](THIRD_PARTY.md) for the template, fonts, NumPy, ViennaRNA, and NAVIEW notices, and the repository's [DATA_SOURCES.md](../DATA_SOURCES.md) for scientific data provenance.
