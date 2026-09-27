# miRacle interface review

Branch: `feat/openai-research-ui`. The Python application and trained classifier remain unchanged. The application is a Next.js static export with a real ViennaRNA 2.7.2 WebAssembly worker. Deployment targets Vercel; no server-side analysis or database is needed.

## Local review

- Production export: http://127.0.0.1:3000
- Five OpenAI reference routes: http://127.0.0.1:3002
- Frontend/build instructions: [web/README.md](../../web/README.md)
- Reference source mapping and limitations: [REFERENCE-README.md](../../design-references/openai/REFERENCE-README.md)
- Current screenshots: [desktop](research-home-1440.png), [mobile](research-home-390.png), [loaded results](research-results-1440.png), [3D features](research-feature-3d-1440.png), [evaluation](research-evaluation-chromium-1440.png)

The reference library is separate from the production deployment. All five source pages were visually inspected in the user's working Safari session. Browser captures, measured styles, original pathnames, article content, interaction states, and 575 locally stored assets are retained. The final source asset manifest has no failed downloads. The exported reference pages pass all 15 combinations of five routes and 390/768/1440px widths, including image loading, browser errors, and horizontal overflow. Screenshots and machine-readable results are in `design-references/openai/docs/`.

Reference interactions were checked separately: all 12 research methods drawers and the MentalHealthBench attributes drawer work in Chromium, Firefox, and WebKit; 72 WebKit checks cover chart, voice, demo, and raw/plain tabs plus keyboard navigation. Shared Chromium checks cover testimonials, share/code copy, real audio playback, chart SVG downloads, mobile navigation, table of contents, timeline navigation, and conversation-map highlighting. The Hugging Face WebGL hero is an actual captured frame; remote live sessions and unavailable narration link to the source service. These are local design studies, not reimplementations of OpenAI's product backends.

## Scientific and workflow verification

See [VERIFICATION-science.md](VERIFICATION-science.md) for numerical tolerances, versions, full scope, runtime/memory measurements, and reproduction commands.

| Check | Verified result |
| --- | --- |
| Python reference plus export guards | 34 passed |
| Node parity and boundary cases | 70 passed |
| Scientific/workflow browser baseline | 30 passed across Chromium, Firefox, WebKit |
| Real browser/Python comparisons | 180, covering 20 controls × 3 masking modes × 3 browsers |
| Native structures, coordinates, ordering, matches | Exact agreement |
| Floating-point tolerances | Energy `1e-5`, scores `1e-7` |
| Real 20,000-nt analyses | 41–50 seconds on this machine |
| Longest main-thread timer gap during analysis | 77ms |

The wider pills, quieter input, and research figures passed **42 exported interface checks** across Chromium, Firefox, and WebKit. This includes real scans, exact downloaded CSV/FASTA payloads, comparison, saved-result matching, upload, cancellation, repeated scans, unavailable engine/reference assets, UCSC failure, keyboard navigation, reduced motion, and accessibility. The new figure checks compare displayed values against the Python fixture and benchmark, retain candidate selection across views, exercise disclosures, and verify the real Three.js renderer in all three browsers. Separate failure cases confirm usable 2D figures when WebGL is unavailable or the optional 3D download fails; the renderer chunk is not requested before choosing 3D.

All three research figure panels were checked at 390/768/1440px in all three browsers, including accessibility and horizontal overflow. Keyboard access to scrolling tables was corrected. Earlier dropdown placement and state checks remain in `polish-checks.json`. Lint, TypeScript, the production build, and `git diff --check` pass.

After the final label-spacing and identifier-truncation adjustments, all **18 focused figure checks passed again** against the rebuilt export. Current screenshots reflect those adjustments. The Three.js view remains optional and plots actual features rather than molecular coordinates.

The full scientific browser report is retained in `browser-science-results.json`; the 42-check interface report is in `browser-interface-results.json`. Focused reruns write `browser-results.json`. Reference verification lives in `design-references/openai/docs/verification.json`. Command logs and earlier screenshots remain in `artifacts/tmp/` pending cleanup approval.

## Deployment and retained material

`web/vercel.json` uses the `web` project root, Node 24, Bun, and static `out/` output, with immutable caching for versioned scientific data and workers. The verified export contains 882 assets totaling 52,176,818 bytes; its largest asset is 18,632,664 bytes. No asset exceeds the project's 25-MiB download budget. The optional Three.js chunks load only when requested. These figures are a project check, not a claim about a Cloudflare plan.

Vercel CLI reports this machine is logged out. No deployment was performed. No branch push or merge was performed by this implementation. The branch already has an upstream tracking entry; that entry was retained. The reference template is vendored for a complete reviewable diff; its original commit and retained Git metadata are documented in its README. Temporary clones, downloads, old configurations, and build scratch remain pending the user's requested approval before cleanup.

Automated desktop-browser tests do not establish mobile-device runtime, production network speed, or biological validation. Native RNALfold remains in Python; browser analysis uses the specified 60/70/90/110-nt RNAfold scan.
