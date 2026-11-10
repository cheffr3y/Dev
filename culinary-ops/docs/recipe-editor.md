# Recipe editor UI

The recipe detail loader remains a server component. Its Prisma reads, auth checks,
price-trend/dependency loaders, server actions, validation, and print routes are unchanged.
The client workspace owns the segmented tabs and preview multiplier.

## Existing components and mutations

| Component/form | Existing local state | Existing submission |
| --- | --- | --- |
| Recipe details (`recipeForm`) | Uncontrolled identity, yield, timing, safety and storage fields | `updateRecipe(FormData)` |
| `MethodEditor` | `steps` (action/detail/id), `dragIndex`, `overIndex` | Repeated hidden `step` inputs associated with `recipeForm` |
| `AllergenPicker` | Uncontrolled manual checkboxes; inherited selections disabled | Repeated `allergen` fields in `recipeForm` |
| `AddIngredientForm` | `picked`, `state`, `pending`, `pickerKey`, form/submission refs | `addRecipeIngredientWithState` |
| `RecipeIngredientEditor` | `picked`, `useActionState` result/pending | `updateRecipeIngredient` |
| Raw row removal | Hidden `id` and `recipeId` | `removeRecipeItem` |
| `SubRecipeForm` | `childId`, `unit`, memoized options/unit groups | `addSubRecipe` (also updates an existing child) |
| Sub-recipe removal | Hidden `id` and `parentId` | `removeSubRecipe` |
| Delete form | Added client confirmation checkbox (no submitted name) | `deleteRecipe` |
| `RecipeDependencyTree` | Local quantity/unit fallback, expanded branches | Read-only `buildDependencyPlan` |

Other children: `ComboPicker`, `AllergenBadges`, `PriceTrend`, `InspectorLink`,
`WorkspaceInspector`, `LocalTime`, and shared card, field, input, table and badge
primitives. The changelog continues to group changes by recipe version. There
are no client query/mutation hooks beyond the existing action-state hook.

## Saving and mounted panels

Both original save buttons already targeted `recipeForm`. The single header
button targets that same form and calls the same `updateRecipe` action once with
complete `FormData`. Every detail/HACCP control now explicitly associates with
`recipeForm`; method steps retain their existing association. Menu price appears
once, as the editable KPI input. Tabs and quick-add modes use `hidden` and remain
mounted. Ingredient and sub-recipe line forms keep their independent handlers.

Before submitting, the workspace reveals the first invalid field's tab and runs
native validation. During submission it preserves input values and compares the
submitted values with current form data, so new edits aren't reported as saved.
Failure leaves edits intact and shows a retry message.

Preview multipliers never enter any mutation payload. Formula quantities,
line/batch costs, yield display and the dependency plan share the preview scale;
unit rates, menu price and saved yield controls stay at their original basis.
The stale-price pill opens and highlights a matching input in the dependency tree,
including prices inherited through sub-recipes. Editor CSS is scoped to
`.recipe-editor-workspace`, separate from the print dossier's `.recipe-workspace`.

## Validation

Run `node scripts/browser/recipe-workspace.mjs` with Playwright installed, or set
`PREP_PLAYWRIGHT_MODULE` to its module path. Set `PREP_BROWSER_EXECUTABLE` when using
an installed Chrome executable. The harness uses the existing esbuild and Tailwind
packages to render the actual page and client components with in-memory fixtures.
It never reads database credentials or connects to a database.

Coverage includes the complete save field set, edits across hidden tabs, inherited
versus manual allergens, native validation, save failures and edits during saving,
method reordering, raw/sub-recipe Tab+Enter entry, shared scaling without writes,
stale navigation, print routes, mobile overflow and staff access. Screenshots are
written to `RECIPE_REVIEW_DIR` (default `/tmp/recipe-workspace-review`). The existing
database-backed browser suites also follow the new controls; they still require
their disposable database harness.
