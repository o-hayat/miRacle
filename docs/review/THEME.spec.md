# Theme and control refinement

User request: save the current state, soften the selected tabs, round dropdowns like buttons, add a shadcn Light/Dark/System footer button, strengthen the top typography slightly, and remove the header logo dot. Subsequent review requested transparent disclosure headers, consistent expandable research details, and fewer secondary labels/actions.

Checkpoint: `f3019ba` preserves the previous complete research interface, scientific migration, references, and verification.

- Selected workflow and figure tabs use a soft gray pill, without a white inset or shadow. Dropdown triggers use the same full radius and neutral fill; menus keep rounded corners and keyboard selection.
- Reference controls and Analysis settings have transparent headers with consistent padding and rotating chevrons. Sequence notation, missing evidence, and dataset composition use the same shadcn Collapsible interaction. Scrollable sequence and dataset content are keyboard accessible.
- The headline uses Inter 500; the wordmark uses Inter 600. The header dot is removed.
- The header action reads “Github Repository,” with its icon, a 44px height, and 24px horizontal padding (20px on phones). The narrow header prioritizes the wordmark and repository action; the hero retains the sequence navigation link.
- A shadcn/Base UI dropdown in the footer offers checked Light, Dark, and System options, with icons. System is the initial default; next-themes remembers the choice and tracks the operating system in System mode. Selection closes the menu. SSR hydration is guarded, and the theme script applies a saved theme before paint.
- Semantic tokens cover the whole interface, chart labels, matrices, nucleotide colors, and WebGL figures. The 3D palette updates in place to preserve camera and candidate state. Exported SVG files remain suitable for a light document background.
- Removed the four requested notices below Evaluation's dataset disclosure. Benchmark values and scientific assets are unchanged.
- Removed the saved-example action, the export-count caption, and the Known-like evidence callout. The main scan action computes in the worker; reference controls still load their source sequences. Browser interface tests now use real scans to reach results.
- Verify persistence, system changes, hydration, keyboard operation, selection/disclosure preservation, dark-theme contrast across all five workflows, and narrow layouts. Re-run the existing workflow/figure checks against the static export. Retain references and scratch pending approval.

Implementation references: [shadcn Next.js dark mode](https://ui.shadcn.com/docs/dark-mode/next), [Base UI dropdown menu](https://ui.shadcn.com/docs/components/base/dropdown-menu), and the installed Next.js layout/hydration guides. Library documentation was checked with Context7.
