# Stylesheet architecture

`app/globals.css` declares the cascade once and imports focused stylesheets from `app/styles/`:

| Layer | Responsibility |
| --- | --- |
| `framework` | Tailwind's own theme, reset, and generated utilities, nested beneath application styles |
| `theme` | Tailwind theme registration emitted from the application's top-level `@theme` directives |
| `tokens` | Root paper palette and shared schedule variables |
| `base` | Body defaults and font rendering |
| `utilities` | Application typography helpers (`tabular-nums`, `font-display`) |
| `components` | Workspace colors, paper previews, operational tables, document components, inspectors, and calendar layouts |
| `print` | Print media rules and the default page margin |

Normal declarations in later layers win over earlier layers. Application component rules intentionally follow generated Tailwind utilities: before this refactor, the unlayered component rules also won over those utilities. Reversing that relationship would change dense table padding, paper previews, and recipe layouts. Typography helpers precede components so document-specific fonts retain priority.

CSS reverses layer priority for `!important`. Keep new important declarations rare and test competing rules in both media. Route-specific inline styles and `@page` settings remain unlayered; they can still supply document-specific orientation and settings. `@theme` directives remain top-level because they are Tailwind compiler input, while ordinary root variables live in `@layer tokens`.

`smoking/smoking.css` participates in `components`. All `.smoke-*` selectors are scoped under `:where(.smoking)`; the scope adds no specificity. This matters because Next.js may retain route styles after navigation. Existing `.smoking` element selectors already have a workspace boundary. Mobile controls retain their 16px input type and 44px button minimum.

Use the typed primitives in `components/ui.tsx` for shared surfaces, badges, table scroll regions, and form controls. `TableScroll` requires a region label and is keyboard focusable. `Input`, `Select`, and `Textarea` share their field styling; `StatCard` uses `Card` for its surface.

## Validation

Build production CSS first, then run browser suites through the disposable database harness documented in [repository structure](repository-structure.md):

```bash
npm run build
PREP_BROWSER_SMOKE=1 BROWSER_SUITES="style-cascade workspace" npm run test:transactions
PREP_BROWSER_SMOKE=1 BROWSER_SUITES="print-controller" npm run test:transactions
```

Use separate harness invocations: workspace changes a shared recipe's yield, while print-controller expects the original fixture value. The print-controller selection also runs recipe-costing.

`style-cascade` tests the built CSS at desktop and mobile widths, covering workspace and paper palettes, table density, sticky headers, smoking scoping and control sizes, and print resets. The workflow suites cover actual editing and printable documents. Run unit tests, TypeScript, and lint as well. Generated OCR vendor assets under `public/ocr/` are excluded from lint; their source is copied from dependencies by `scripts/prepare-ocr.mjs`.
