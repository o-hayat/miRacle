# Measured reference translation — miRacle

Reference sources: all five URLs listed in design-references/openai/docs/output-plan.json.
Saved measured CSS lives in each page's capture-light-1440.json (some are gzipped).
Production intentionally retains self-hosted Inter and IBM Plex Mono and miRacle branding.

## Component: introduction, global controls and scientific figure

Target files: web/src/app/globals.css, web/src/components/workspace.tsx (presentation only), web/src/components/structure-figure.tsx (presentation only).
Reference screenshot: design-references/openai/docs/design-references/openai-com-2387c885/index--introducing-gpt-live-1-in-the-api-1bc53d2a/viewport-1440.jpg and ../index--research-acceleration-view-inside-openai-edcd988a/desktop-1440.jpg.
Interaction model: five persistent click-driven workflow tabs; hero action scrolls to workspace. No scroll-driven switching of scientific workflow state.

## Measured CSS

Desktop source h1: OpenAI Sans 64px, weight500, line-height64px, letter-spacing-1.92px, centered, max-width1000px. Translate to Inter400 preserving scale and centered composition.
Source research h2:30px, weight500,line-height39.6px,letter-spacing-0.3px. Source prose17px,line-height28px; article column676px. Keep approximately680px production prose measure and wider scientific workspace.
Source navigation:64px high,32px horizontal padding at desktop. miRacle branding and useful app links replace corporate navigation.
Source buttons:height40px,padding-inline20px,border-radius40px,font14px,weight500; transitioncolor/background200ms linear. Neutral secondary #0000000a,hover#0000001f; primary black on white. Preserve full disabled/loading/focus states and accessible colors.
Source page: white,black text,muted#0009,border#0000001f. Source author uses large uninterrupted whitespace; avoid boxed dashboard framing.
Source mobile at390px:24px gutters, headline32px approximately, line-height1.05; centered intro, full-width meaningful scientific figure. No horizontal overflow except intentional table/tab/sequence scrolling.
Reference chart controls are pills; charts remain unboxed or lightly bordered and captions quiet. Keep scientific tool labels readable rather than reducing dense controls to tiny type.

## Content and scientific constraints

Keep existing miRacle title, concise research introduction, all five tab names/defaults and state, actual native MIR21 coordinates, all legends and honest fold caption. Preserve the scientific pipeline, model, asset loading, selection/cancellation behavior and every export.
Make the native MIR21 fold the signature graphic with purposeful whitespace, clear base-pair/loop/stem annotations, and a stronger blue/teal/orange figure treatment informed by Navier–Stokes. Do not invent 3D molecular coordinates or change structures to produce aesthetics. Stable static scientific figure; honor reduced motion. Preserve keyboard nucleotide inspection and SVG download.
All controls share centralized typography, spacing, radii and color states. Light theme stays default.

## Verification

Inspect exported app at390/768/1440px. Run lint and typecheck. Avoid touching tests or analysis sources, which another worker verifies. Report final visual choices and any limitations. Do not deploy or push.
