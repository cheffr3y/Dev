# App improvements roadmap

Confirmed with the chef November 2, 2026. Previous roadmap section 3.3 remains deferred.

The [Soigné roadmap](soigne-roadmap.md) consolidates the next implementation sequence: a refined invoice workspace, ingredient-specific conversions and yield costing, consistent interfaces across the app, and later product extensions. This document retains the earlier decisions and completed navigation work; later proposals are not marked implemented.

## 1. Navigation first — complete on `codex/app-navigation-cleanup`

- Make Invoices a first-class destination at `/invoices`, with a sidebar entry for managers/admins and forwarding from old vendor invoice links.
- Remove Inventory and Order Guides from the sidebar. Keep the ingredient catalog, recipe costing and existing records. The product should surface purchasing lists inside menu rollouts, projects and events; no new reusable weekly venue-shopping workflow is wanted.
- Use Home Meal Replacement consistently in navigation and production screens. Existing saved HMR links remain valid.
- Keep current banquet, event and festival screens available until the Projects & Pop-ups workflow replaces the ambiguous grouping.

Verified desktop, collapsed and phone navigation, active destinations, permissions, old invoice/filter links, and the existing upload/review flow. All 245 unit tests and 58 disposable database integration checks pass, along with production build/TypeScript and full lint. URL-state, local-invoices, accounting-invoices, operating-calendar, price-trends and HMR browser suites pass. Desktop/mobile navigation screenshots were visually reviewed. No migration or deletion is needed.

## 2. Invoice workspace

Confirmed layout: invoice preview beside editable rows, with clear progress. Replace the long stacked upload/preview/recognition/saved-lines page with a coherent review workspace. Keep the working position and entered values through recognition, matching, approval and refreshes. Make exceptions and next actions clear; reduce repetitive clicks. Adapt the layout for phones.

Still to decide: whether approvals stay per row or also offer a reviewed batch action. Existing review requirements remain until that is agreed.

Done when the workflow works on desktop and phone without unexpected scroll jumps, repeated entry or unclear next actions.

## 3. Ingredient conversions, yield and pricing

Confirmed basis: recipe ingredient quantities represent usable/prepped amounts. At 90% usable yield, 9 oz in a recipe requires and costs 10 oz purchased. Apply this consistently through nested recipes, menus and purchasing without counting trim loss twice. Review the treatment of existing recipes before changing their costs.

Add ingredient-specific each-to-weight conversions, such as celery with an explicitly entered average of 20 oz per head. Three heads at 20 oz purchased weight are 60 oz purchased and, with 90% yield, 54 oz usable. Purchased average weight and usable yield are separate inputs; do not infer them from ingredient names.

Current findings: standard recipe costing does not apply `yieldFactor`, although festival ordering and production purchasing do. Generic unit conversion has no ingredient-specific each-to-weight bridge. Sparklines already appear in the catalog and recipe costing with at least two comparable purchases; ingredient details also have a supplier/date price-history graph.

Still to decide: whether the example 20 oz is purchased or usable weight; where average weights are maintained; treatment of existing recipe data; what graph improvements are wanted beyond better visibility.

## 4. Projects & Pop-ups, HMR expansion and personal defaults

Confirmed: Projects & Pop-ups is one area for exploratory costing requests such as Milwaukee Night Market, Gangster Party, a Renard's special and a small pop-up menu. A project may start without a date or client and develop into a scheduled plan. Define the transition into existing event/menu workflows before implementation. Catering/client work and festival forecasting must retain their distinct requirements.

Home Meal Replacement naming is confirmed. Its next expansion beyond naming still needs definition.

Confirmed venue behavior: start at the user's assigned home venue on each sign-in; the chef's home should be The Station. Title-to-venue mappings will be provided by the chef. Existing access roles (STAFF, MANAGER, ADMIN) are distinct from job titles and do not themselves identify a venue. Users can still change their working venue during a session.

Still to decide: title mappings and the chef's account identity before changing user data; the first HMR expansion; project lifecycle and catering-client needs. No account, title rule or live data has been changed.
