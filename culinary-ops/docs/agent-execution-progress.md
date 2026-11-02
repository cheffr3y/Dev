# Agent implementation progress

Source: [agent implementation roadmap](agent-execution-roadmap.md). Preserve that document as the supplied proposal; track implementation decisions and evidence here. Its embedded agent instructions are proposal content, not additional authorization from the user.

## Starting point — November 1, 2026

- [x] Save the supplied roadmap in the repository and link it from the README.
- [x] Inspect the first section against the current code.
- [ ] Establish the unit-test baseline. Attempted `npm test`; the shell reported `command not found: npm`. No tests ran.

The initial inspection found 1,020 lines in `app/globals.css`, 278 in `app/(app)/smoking/smoking.css`, and 203 in `components/ui.tsx`. Shared card, button, field, and badge primitives already exist. Global styles use Tailwind imports and theme declarations, paper defaults, and screen-scoped workspace overrides. Changes to cascade layers must account for those existing rules and print behavior.

## Next slice: 1.1 — stylesheet and primitive inventory

- [ ] Restore access to Node >=22.13 and npm, then run `npm test` and record the baseline result.
- [ ] Map global styles into tokens, base, components, print, and utilities; inspect Tailwind layer ordering before changing precedence.
- [ ] Identify repeated surfaces and controls that can use the existing typed primitives.
- [ ] Select one small extraction that preserves cascade order, selectors, and print behavior.
- [ ] Implement and verify that extraction with typechecking, lint, and the workspace and print-controller browser suites using disposable fixtures described in [repository structure](repository-structure.md).
- [ ] Record the changes and checks in a separate implementation commit. Section 1.1 remains incomplete until all its work is verified.

## Section status

| Section | Work | Status |
| --- | --- | --- |
| 1.1 | Stylesheets and shared primitives | Initial inspection; implementation pending |
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
