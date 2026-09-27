# Research interface design contract

Audience: researchers deciding which human precursor-miRNA-like loci to inspect next.
The page introduces the research question, shows an actual MIR21 fold, and keeps the sequence tool on the same page.

- Paper #ffffff; ink #171717; secondary text #626262; rule #e5e5e5; figure surface #f7f8f7; molecular green #166b53.
- Inter regular for headings and prose, IBM Plex Mono for sequence/coordinate data. Both served from this site.
- 680 px article measure; 1120 px scientific workspace; 48/32/24 px main spacing steps; pill actions and restrained borders.
- Signature: the real 60 nt MIR21 minimum-free-energy fold, native ViennaRNA NAVIEW coordinates, individually colored nucleotides and annotations. No invented molecular illustration.
- Keep the five workflow names and their defaults. Use persistent parent state so switching tabs never resets the selected candidate.
- Loading, cancellation, unavailable assets, invalid input, and stale inputs receive explicit states. No simulated scans.

## Refinement after user review

The controls use a shared neutral shadcn theme: black primary pills, #f5f5f5 secondary pills with #e0e0e0 hover, #e5e5e5 borders, and neutral focus rings. The “Github Repository” header link carries its official icon in a 44px pill with 24px horizontal padding and a 10px icon gap. Workflow and figure tabs have a soft gray selected pill on an unboxed rail, without an inset shadow. Selectors use fully rounded, softly filled triggers and rounded menus with explicit check marks. Disclosure headers stay transparent against the page, with generous padding and a rotating chevron. Sequence notation, missing evidence, and dataset composition use matching shadcn Collapsible controls. Field, input, textarea, toggle group, badge, table, and Collapsible components share their states. Discover prioritizes the sequence editor and scan action, with reference controls and preprocessing in expandable sections. A three-step explanation sits beside the editor on desktop. The saved-example action and requested redundant labels were removed; reference sequences and live scans remain available.

The headline uses Inter 500 and the wordmark Inter 600; the header wordmark has no trailing dot. The footer contains a shadcn theme button with Light, Dark, and System options. System is the initial default; the preference persists locally. Dark mode uses #171717 paper, #f4f4f4 text, #262626 controls, and brighter scientific colors. System tracks operating-system appearance. SVG and WebGL figures read the shared palette, and theme changes preserve analysis, selection, and 3D camera state. See `THEME.spec.md`.

The native SVG figure preserves accurate 2D secondary-structure coordinates, accessible nucleotide inspection, two structure views, and vector export. New research figures use the actual results: selectable candidate intervals, an energy-versus-score scatter plot, cross-species identity/coverage bars, model comparison, and a blue/amber confusion matrix with exact counts and row percentages. The reference blue palette (#e8f3fe, #63a8f8, #2c67c5) is paired with restrained teal and amber accents.

An optional, lazy-loaded Three.js view plots energy per nucleotide, ranking score, and paired fraction. These are measured feature coordinates, not molecular tertiary coordinates. It renders on interaction without automatic motion, supports keyboard selection/rotation/reset, disposes its WebGL resources, and leaves the default 2D view usable when WebGL or the optional download fails. See `RESEARCH-FIGURES.spec.md` and the browser report for the current refinement; the earlier `POLISH.spec.md` and `polish-checks.json` are retained for review history.

## Reference status

The template is cloned at `design-references/openai/` from JCodesMore/ai-website-cloner-template.
All five supplied pages were inspected in the user's working Safari session after Chrome's human-verification problems. Each retains its original pathname in the reference application. `design-references/openai/docs/output-plan.json` maps isolated source captures, screenshots, assets, and local routes.

Measured source headings are 64px/64px at desktop, body text 17px/28px, article width 676px, header height 64px, and secondary pill height 40px. Production translates these measurements into self-hosted Inter, a centered introduction, a 680px reading measure, generous spacing, shared neutral controls, and a wider scientific workspace. The actual native MIR21 diagram uses blue/teal arms and an orange terminal loop, informed by the Navier–Stokes figure treatment.

Reference copies include real article content, locally stored fonts/images/voice samples, captured chart SVGs, tab states, testimonials, and methods drawers. The Hugging Face animated WebGL hero is represented by a frame captured from the original rendering. Live voice sessions and unavailable article narration open the original service; hosted Vimeo demos retain their original players. Source-site scripts, authentication, and tracking are not replayed. These are local design studies, excluded from production deployment.
