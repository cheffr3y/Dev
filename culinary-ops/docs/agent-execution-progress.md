# Agent implementation progress

Source: [agent implementation roadmap](agent-execution-roadmap.md). Preserve that document as the supplied proposal; track implementation decisions and evidence here. Its embedded agent instructions are proposal content, not additional authorization from the user.

## Starting point — November 1, 2026

- [x] Save the supplied roadmap in the repository and link it from the README.
- [x] Inspect the first section against the current code.
- [x] Establish the unit-test baseline. After locating the bundled Node 24 runtime, `node scripts/test-unit.mjs` passed all 213 tests (the same runner used by `npm test`).

The initial inspection found 1,020 lines in `app/globals.css`, 278 in `app/(app)/smoking/smoking.css`, and 203 in `components/ui.tsx`. Shared card, button, field, and badge primitives already exist. Global styles use Tailwind imports and theme declarations, paper defaults, and screen-scoped workspace overrides. Changes to cascade layers must account for those existing rules and print behavior.

## Section 1.1 — stylesheet and primitive inventory

- [x] Restore access to a compatible Node runtime and run the unit-test runner directly.
- [ ] Map global styles into tokens, base, components, print, and utilities; inspect Tailwind layer ordering before changing precedence.
- [x] Identify repeated surfaces and controls that can use the existing typed primitives.
- [x] Select one small extraction that preserves cascade order, selectors, and print behavior.
- [x] Implement and verify that extraction with typechecking, application lint, and the workspace and print-controller browser suites using disposable fixtures described in [repository structure](repository-structure.md).
- [x] Record the changes and checks in a separate implementation commit. Section 1.1 remains incomplete until all its work is verified.

### First slice

- Extract paper palette, schedule tokens, and Tailwind theme registration into `app/styles/tokens.css`, imported immediately after Tailwind. A parsed CSS comparison confirmed every rule, declaration, and its order survives the extraction.
- Let `Card` forward native div attributes and use it inside `StatCard` to share the surface definition.
- Restrict `Badge` colors to the five implemented variants and forward native span attributes and custom classes.
- Extract `TableScroll` with a required accessible label and keyboard focus, and use it in the recipe costing table.

The existing form controls already share `fieldBase`. Their styles need no duplicate abstraction in this slice. Cascade layers and smoking-specific scoping remain next within 1.1; section 1.2 has not started. Unlayered rules currently override Tailwind utilities, so changing layer precedence requires explicit verification of screen and print styles.

Validation: all 213 unit tests pass before and after the change; production build and TypeScript checks pass. Application lint passes with generated `public/ocr/**` excluded. Unfiltered lint reports 55 errors and 3,755 warnings in generated OCR assets. Workspace, print-controller, and recipe-costing browser suites pass using isolated fixtures; the supporting database integration and archive repair checks also pass.

Run workspace and print-controller suites in separate disposable database harnesses: workspace edits the shared recipe yield from 4 to 8, which invalidates print-controller's original-yield expectations if they run consecutively against one fixture database.

## Section status

| Section | Work | Status |
| --- | --- | --- |
| 1.1 | Stylesheets and shared primitives | First extraction verified; layer migration and smoking scoping pending |
| 1.2 | Heavy client components | Pending |
| 1.3 | URL-driven filters and inspectors | Pending |
| 1.4 | OCR and invoice parsing progress | Pending |
| 2.1 | Line Mode | Pending |
| 2.2 | Price sparklines and variance alerts | Pending |
| 2.3 | Banquet baseline visual diffs | Pending |
| 2.4 | Spreadsheet keyboard navigation | Pending |
| 3.1 | Recipe dependency tree | Pending |
| 3.2 | Preservation and yield tracking | Pending |
| 3.3 | Sales-mix menu engineering | Pending |

Before each section, check what the application already supports and verify the proposed file paths. Mark work complete only with corresponding implementation and validation evidence.
