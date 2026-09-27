# Production refinement — user review

The user requested stronger OpenAI styling after reviewing the current implementation: a top-right GitHub pill, soft-gray secondary actions, clean spacing, attractive selected tabs, and readable dropdowns. Use the existing Base UI shadcn foundation and keep scientific behavior/state identical.

## Controls and tokens

Keep Inter and white backgrounds. Central tokens: foreground/primary #000; secondary/muted #f5f5f5; secondary hover #e0e0e0; accent #ebebeb; border #e5e5e5; body-muted #666; neutral focus outline. Scientific figure colors remain meaningful and isolated.
Buttons are native shadcn variants configured in button.tsx: 40px default height, 20px inset, full-pill radius, 14px medium, 200ms color/background transitions. Primary black/white; secondary soft gray/darker hover; outline white with subtle gray border; ghost transparent with soft-gray hover. Use the buttonVariants helper for semantic anchor links as current shadcn docs require. Header GitHub stays visible at mobile widths, with its GitHub icon. Explore a sequence uses secondary button styling.

Workflow tabs use the default shadcn segmented model: muted rounded rail, 4px inset and spacing, 40px tabs, white selected pill with a fine edge and quiet shadow, muted inactive labels, no underline indicator. Preserve tab keyboard behavior and mounted panels. Mobile rail scrolls horizontally, never expands the page.

Select triggers have a 40px minimum height, 12px radius, 14px type, 14px horizontal inset. Values can wrap rather than clip long masking labels. All dropdowns open below the trigger, white with 16px radius, subtle border/shadow, 6px inset, at least 40px option targets and wrapped labels; selected check mark and neutral hover/focus remain visible.

Normalize Field, Input, Textarea, ToggleGroup, Table and Badge styles within their existing components, removing global styles that fight component variants. Keep form and panel layout styles in globals.css. Retain all labels/defaults, IDs, information, event handlers and state.

## Layout

Keep the centered 64px/32px research introduction and native MIR21 signature. Reduce empty padding between figure, workflow controls and form; use a consistent 8px spacing rhythm. Desktop form sidebar 344px with 48px gap. Keep examples and their load button grouped together in tablet layout. Form actions wrap cleanly as one group with no isolated far-right saved action. Other panels share heading and section rhythm. Use no decorative cards or simulated 3D molecule.

## Verification

Lint and typecheck; browser review at 390/768/1440, initial + saved results, all five tab selections, open dropdown geometry and long-option readability, keyboard selection, control colors/heights. Save screenshots under docs/review/polish-*. No export rebuild or deployment in this worker.
