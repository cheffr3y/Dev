# Reviewed ingredient measurements

On an ingredient's detail page, use the measurement editor to define its catalog cost unit, purchasing pack, named each, average purchased ounces per each, optional grams per milliliter and usable yield. Managers and admins can preview and apply settings; staff can inspect them.

Preview lists the affected recipes, including nested parents, and their current/proposed costs. Review the quantities and selected purchased/usable basis, then confirm and apply. A changed ingredient or affected recipe invalidates the preview. Unresolved conversions block application; an ingredient awaiting its first price can still receive valid measurements, with its recipe totals shown as pending. Repeat requests do not create duplicate changes.

The review gate belongs to the ingredient. Until applied, all its existing recipe costs retain their legacy interpretation. Applying the review activates the chosen basis across every recipe using that ingredient. Recipe quantities are preserved, so review their meaning before confirming. Later unit, pack and yield changes also go through the impact editor. Changing the catalog cost unit converts the existing rate only when the relationship is known.

For celery bought at $4/head, enter a 20 oz purchased average and 90% usable yield. Three heads weigh 60 purchased oz and yield 54 usable oz. A recipe requiring 9 usable oz consumes 10 purchased oz, or half a head, and costs $2. A recipe requesting three heads still requests three whole heads. Select purchased recipe quantities instead if existing quantities already include trim. Purchasing aggregates unrounded demand before rounding to supplier packs; consumption cost and buying commitment remain distinct.

Invoice approval normalizes purchased quantities and never applies usable yield. An optional received-weight override is labeled for this invoice only. Changing measurements requires refreshing ingredient data and verifying the invoice line again. Saved lines capture their conversion basis: changing a default later does not change historical normalized observations. Corrections retaining the same quantity, ingredient, pack and override retain that captured basis; changing those fields uses the current verified basis. Historical price comparisons bridge units only when their captured conversion supports it.

New prep snapshots capture measurements. Existing packet, accounting and export facts are preserved. Older frozen purchasing records without measurement metadata show a review warning instead of borrowing today's assumptions.

Invoice review completion records the exact line and recognition revisions. New evidence or corrections reopen review. Completion is independent of accounting confirmation and posting. A stored invoice with unreadable recognition can be entered manually; recognition warnings remain visible until resolved.

Deploy with the normal migration-first startup (`npm start`). Migration `20261103010000_inbox_ingredient_measurements` is additive; it backfills inbox metadata without changing purchases, prices, recipe quantities or accounting. Enable reviewed measurements deliberately, ingredient by ingredient. Implementation tests use a disposable database; no live records were migrated as part of development.
