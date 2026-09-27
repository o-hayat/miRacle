# Provenance and third-party notices

## Interface foundation

JCodesMore's [ai-website-cloner-template](https://github.com/JCodesMore/ai-website-cloner-template), commit `0fc4dca34fcfcfd32108fb67118aa897a6045414`, supplied the Next.js 16 / React 19 / Tailwind 4 / shadcn base. Its MIT license is retained in `TEMPLATE-LICENSE`. The review clone is vendored at `../design-references/openai`.

The generated shadcn components use Base UI and were installed with shadcn 4.21.0. Local adjustments fix registry utility imports and apply the research typography, colors, and control states. All dependency versions are recorded in `bun.lock`.

Inter (Rasmus Andersson) and IBM Plex Mono (IBM) are self-hosted through Fontsource. OFL notices are in `public/licenses/`.

The GitHub button uses Primer Octicons' `mark-github-16` SVG, copyright GitHub Inc., under the MIT license. The source is linked in `src/components/github-mark.tsx`; its notice is retained in `public/licenses/Octicons-MIT.txt`.

The optional 3D candidate feature plot uses Three.js 0.186.1 and OrbitControls, copyright the Three.js authors, under the MIT license. Its notice is retained in `public/licenses/Three-MIT.txt`. It plots measured energy, ranking score, and paired fraction; it does not provide molecular tertiary coordinates. Three.js loads only when the visitor chooses 3D.

Theme persistence, early theme application, and system appearance changes use next-themes 0.4.6, copyright Paco Coursey, under the MIT license. The notice is retained in `public/licenses/Next-Themes-MIT.txt`. The footer menu uses shadcn's Base UI dropdown component.

## Scientific implementation

The scientific reference is the unchanged `mirna_app/` Python implementation. The original trained model is retained without retraining. `scripts/export_browser_assets.py` verifies sklearn's StandardScaler + binary LogisticRegression schema before exporting.

ViennaRNA 2.7.2 is by the ViennaRNA authors and the Institute for Theoretical Chemistry, University of Vienna. Source archive:
https://www.tbi.univie.ac.at/RNA/download/sourcecode/2_7_x/ViennaRNA-2.7.2.tar.gz

SHA256: `1ab5f4a4f76fc85a2243546088e45f5d85f2d7a56cc656e969b005cce9bfab5f`.

Compiled with Emscripten 4.0.20, single-threaded, using native folding and NAVIEW layout routines. The ViennaRNA and NAVIEW notices are distributed in `public/wasm/`. NAVIEW is copyright 1988 Robert E. Bruccoleri; copying here is by permission in the supplied notice. It carries a separate noncommercial copying condition. Preserve both notices with redistributed binaries.

NumPy 1.26.4's indirect quicksort ordering is reproduced in `similarity.ts` so equal similarity values retain the pinned Python reference's shortlist behavior. The NumPy BSD notice is in `public/licenses/NumPy-BSD.txt`. Source: https://github.com/numpy/numpy/blob/v1.26.4/numpy/core/src/npysort/quicksort.cpp

Data provenance, database versions, and scientific limitations remain documented in the repository's `DATA_SOURCES.md`. Each generated release includes SHA256 digests of the model, indexes, annotations, evidence, examples, source code, and WASM build. Saved results bind normalized sequence, genomic context, identifier, strand mode, masking mode, engine version, and data release.

## Design references

The five supplied OpenAI research articles were visually inspected and captured in the user-opened browser. Their original URLs, separate local routes, saved CSS/DOM, screenshots, and asset sources are recorded in `../design-references/openai/docs/output-plan.json` and `asset-provenance.json`. The reference directory is a local review artifact and is excluded from the production application's static export. OpenAI's logos, article content, images, and OpenAI Sans fonts remain in that reference directory. Production uses miRacle branding, the project's scientific data, Inter, and IBM Plex Mono.
