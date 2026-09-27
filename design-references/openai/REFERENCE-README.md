# OpenAI reference library

This review directory starts from [JCodesMore/ai-website-cloner-template](https://github.com/JCodesMore/ai-website-cloner-template/tree/master), commit `0fc4dca34fcfcfd32108fb67118aa897a6045414`. It is vendored so the reference routes, captures, assets, and modifications are visible in the main branch diff. The original template license and scaffolding remain. Original Git metadata is retained locally under `artifacts/tmp/retained-template-git/` and the parent repository's `.git/modules/` until cleanup approval.

Use Node 24 and Bun 1.3.11:

```sh
cd design-references/openai
bun install --frozen-lockfile
bun run build
python3 -m http.server 3002 --bind 127.0.0.1 --directory out
```

The gallery at http://127.0.0.1:3002 links to each original pathname:

| Article | Local route |
| --- | --- |
| MentalHealthBench | `/index/introducing-mentalhealthbench/` |
| GPT Live 1 | `/index/introducing-gpt-live-1-in-the-api/` |
| Research acceleration | `/index/research-acceleration-view-inside-openai/` |
| Navier–Stokes | `/index/navier-stokes-solution/` |
| Hugging Face incident | `/index/hugging-face-incident-and-the-road-ahead/` |

The build includes a checked post-export correction for Next.js 16.3.5's `/index/...` filename normalization. It restores the HTML and full navigation payload to each public pathname while preserving the generated segment payloads. Run `node scripts/verify_references.mjs` from the repository root against port 3002 to check every exported route at 390/768/1440px and refresh the local screenshots.

`docs/output-plan.json` maps every source URL to its separate research, screenshot, component, and public-asset namespace. `docs/asset-provenance.json` records original asset URLs, local paths, and sizes. The source CSS, DOM, measured typography, and captured interaction states are retained in `docs/research/`. OpenAI article content and brand assets belong to their respective owners and are used here only as the requested local design references.

Safari capture tools are in the parent repository's `scripts/`. They read only the user-opened public page. `python3 scripts/materialize_references.py` from the repository root regenerates sanitized local content and downloads observed public assets. Human verification must be completed by the user if requested; the tools do not solve or bypass it. No cookies, authentication storage, or source application scripts are exported.

The references preserve real chart SVGs, all chart/demo/voice tab states, testimonial content, methods drawers, images, and measured styles. The Hugging Face WebGL hero uses a frame of the actual rendered animation; the original animation is not reimplemented. Live voice sessions and unavailable article narration link to the original website. Vimeo-hosted demonstrations require a network connection. Source search, accounts, and product backends remain external services. The production application in `../../web/` uses its own branding, fonts, scientific assets, and functional browser engine.

Some early Chrome screenshots are dark and have a 500px minimum viewport despite their old filename. Later Safari capture JSON records the actual viewport dimensions; use those dimensions as the authority. Local exported-page screenshots are named `local-{width}.png`. Temporary captures and template files remain pending the user's cleanup approval.
