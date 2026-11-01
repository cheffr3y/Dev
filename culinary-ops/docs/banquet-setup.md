# Banquet setup & vessel pull

Open a banquet → **Setup & vessel pull**. Managers and admins edit the plan;
all signed-in staff can view, print and check off the saved packing list.

1. Choose **Add unassigned BEO food lines** to bring in the banquet's dishes,
   or add stations and select food lines individually. Manual rows support
   sauces, garnishes and items that do not need a recipe.
2. Name stations and enter ready/service times, layout and refill notes.
3. Add vessels, equipment and utensils with their actual piece counts.
   Food ordered remains separate and comes from the BEO.
4. Put a heatlamp, chafer support or other equipment shared by multiple dishes
   under **Shared station equipment**, once. Enter fuel cans, water pans and
   spare utensils explicitly; no kit contents or burn times are assumed.
5. **Save setup**, then use **Pack & pull**. A check verifies the entire line.
   Changing its quantities or allocations clears that line's check. Reordering
   unchanged rows retains checks.
6. **Print preview** or **Print setup sheet** prints a kitchen copy with
   station assignments, notes, consolidated allocations and sign-off lines.
   Individual and weekly cook packets include saved setup sheets before recipes.
   Events without a saved station plan retain their existing packet layout.

Names merge within a category ignoring case and repeated spaces. Sizes remain
distinct. Use the suggested names or type a custom name; custom entries are
suggested again within this banquet. “On table” belongs in a service note when
there is no physical vessel to pull.

Warnings identify unassigned food lines, removed BEO links and rows with no
pull items or explanation. Missing data is not filled in automatically.
Setup notes and special instructions come from the banquet header. Linked food
names and ordered counts reflect the current BEO on printed sheets.

The UI distinguishes saved revisions from unsaved edits, warns before browser
unload, and disables packing and the print button until edits are saved.
Browser printing via keyboard still labels unsaved output as a draft.
Concurrent writes are rejected instead of overwriting another user's edits.
Packets are live views of saved banquet data, not historical frozen snapshots.

## Release and checks

Apply `20261020000000_banquet_setup` with `prisma migrate deploy` before serving
this version (normal `npm start` already does this). It adds nullable
`Banquet.setupPlan` JSON and `setupRevision` with a zero default; existing events
and recipes are preserved.

`node --import tsx --test lib/banquets/banquet-setup.test.tsx` covers aggregation, independent
counts, packing invalidation, validation, missing links and printed content.
The disposable PostgreSQL browser harness can run
`node scripts/browser/run.mjs banquet-setup` after the production build.
