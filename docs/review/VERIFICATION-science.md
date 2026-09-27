# Scientific verification — 27 September 2026

The exported browser application passes scientific parity and the tested workflows in Chromium, Firefox, and WebKit. These results cover data release `v1-0cf79300764342d9`, engine `ViennaRNA-2.7.2-RNAfold-windows-v1`, and worker `analysis-877acf94dd4256c6.js`, served from `web/out` over local HTTP. Reference-page cloning and final visual review are separate from this verification.

## Results

| Check | Result |
| --- | --- |
| Original Python suite and exporter guards | 34 passed |
| Node scientific parity and boundary cases | 70 passed, 0 skipped; 61.8 seconds |
| Complete exported-site browser suite | 30 passed, 0 skipped, 0 flaky; 6.9 minutes |
| Strengthened CSV/FASTA download workflow | 3 passed, one per browser; 33.1 seconds |
| TypeScript, ESLint for the browser tests, and formatting | Passed |

The browser suite executes **all 20 bundled controls under all three masking modes in each browser: 180 real worker analyses**. Each analysis loads the deployed worker and ViennaRNA WebAssembly module. The tests compare the full result schema, candidate ordering, structure strings, reference matches, features, sensitivity explanations, warning content, genomic context, and saved-result key against the Python fixtures. Native layout coordinates match exactly; energy tolerance is `1e-5` and other floating-point values, including scores, use `1e-7`. Elapsed runtime is intentionally excluded from parity comparisons.

The Node suite also compares every exported candidate's evidence classification, literature/machinery lookup, native coordinates, and CSV/FASTA output across all 60 fixture cases. CSV headers, row order, and text fields must match exactly, while energy/score cells retain their scientific tolerances. FASTA is exact. The strengthened browser workflow downloads the actual UI files and checks the complete 25-candidate CSV and FASTA payloads against the MIR21 Python fixture in all three browsers; SVG downloads are also exercised.

Boundary checks cover RNA/DNA interpretation, both strands, reverse coordinates, ambiguous bases and segment offsets, invalid characters, multiple FASTA records, masking boundaries, empty results, similarity ties and alignment traceback, window endpoints, Python decimal rounding, valid 20,000-nt input, and rejection above that limit. Saved-result keys bind input context, preprocessing, and engine/data versions.

Browser workflows pass for cancellation, repeated scans, candidate and structure-view selection across tabs, control comparisons, saved-result mismatch errors, file upload, bundled hg38 loading, simulated UCSC failure, and unavailable engine/reference assets. Uploaded sequence tests produce no non-GET network requests. Axe reports no WCAG 2 A/AA or 2.1 AA violations on the initial view or loaded example results. Keyboard navigation, reduced motion, and initial-page horizontal overflow checks pass at 390, 768, and 1440 px. These automated checks do not replace final visual review of the redesigned interface.

## 20,000-nt responsiveness and memory

The benchmark scans a real, repeated MIR21 genomic sequence, without masking, using the dedicated worker. The main thread continues a 50-ms timer throughout computation.

| Browser | Analysis time | Wall time | Longest timer gap | WASM heap | Peak sampled browser RSS |
| --- | ---: | ---: | ---: | ---: | ---: |
| Chromium 153.0.8010.12 | 40.731 s | 40.937 s | 51.6 ms | 16 MiB | 617.2 MiB |
| Firefox 155.0 | 49.341 s | 49.496 s | 60.0 ms | 16 MiB | 1006.2 MiB |
| WebKit 26.6 | 50.074 s | 50.163 s | 77.0 ms | 16 MiB | 834.5 MiB |

Environment: Apple Silicon, macOS 26.5.2, Node 24.15.0, Bun 1.3.11, Playwright 1.63.0, Python 3.12.13, scikit-learn 1.5.0, and ViennaRNA 2.7.2. These are desktop measurements against localhost. They do not represent mobile hardware or production network transfer times. RSS sums matching Playwright process paths once per second and can count shared pages more than once; the 16-MiB WASM heap excludes JavaScript objects, reference data, rendering, and browser overhead.

## Evidence and reproduction

- [Full browser report](browser-science-results.json)
- Per-case browser runtimes: [Chromium](parity-chromium.json), [Firefox](parity-firefox.json), [WebKit](parity-webkit.json)
- Benchmark measurements: [Chromium](performance-chromium.json), [Firefox](performance-firefox.json), [WebKit](performance-webkit.json)
- Responsive screenshots: `{chromium,firefox,webkit}-{390,768,1440}.png` in this directory
- Retained command logs: `artifacts/tmp/browser-verified.log`, `browser-downloads-verified.log`, `science-node-verified.log`, and `science-python-verified.log`

From the repository root, with the documented pinned environments installed:

```sh
.venv/bin/python -m pytest -q
cd web
bun run typecheck
bun run lint
bun run test
bun run build
bun run test:browser
```

The targeted download check can be repeated without replacing the full JSON report:

```sh
bunx playwright test tests/browser/workflows.spec.ts \
  --grep 'live scan, candidate state' --reporter=list
```

The original browser-parity attempt exhausted its timeout because each scalar comparison created a Playwright assertion/trace step. Replacing those scalar checks with Node strict assertions retained the numerical tolerances and added exact object-key checks. The complete scientific cases subsequently passed in roughly 1.1–1.2 minutes per browser. No application behavior or scientific implementation was changed to make these tests pass.

After further presentation changes, rerun the UI workflows and accessibility checks against the new export. Scientific-source changes require regenerated fixtures/data assets and the full parity suite.
