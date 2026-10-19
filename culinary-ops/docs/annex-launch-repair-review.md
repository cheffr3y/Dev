# Annex launch record corrections

Destination: the live Culinary Ops database at foxtownhq.thecatmeows.com, Annex Small Plates.

The generator source changes are local. The user approved all listed live record corrections, and they were saved through the live app. Verification confirms all five methods, the 3.5 g caviar spec, Green Goddess sour cream wording, removed migration artifacts, updated service copy, and Tree Nuts inheritance into the plated carrot matrix.

The live editor reset two legacy categories to Starter during saves. A local fix now preserves unknown saved categories. The original categories were restored atomically through the production console, with recipe history entries: Golden Chicken Stock → Stocks; Sous Vide Carrots → Vegetable Cooked.

## Catalog and text corrections

- Add Tree Nuts to Nut, Hazelnut (06481 / G000000512), preserving all existing allergen tags. Verify inheritance into Carrot Top Pesto and the plated carrot matrix.
- Remove only the Migrated notes and Recipe type: batch lines from Golden Chicken Stock and Sous Vide Carrots.
- Give the twelve Sous Vide Carrots steps action headers while preserving the existing instructions, times, temperatures, and ratios.
- Replace crème fraîche with sour cream in Green Goddess.
- Six-piece caviar: change 2.1 g per order to 3.5 g per order and update its prep note to match the requested method. This changes food costing.
- The live carrot code is PBG, although the task identifies PB6; match the exact recipe name and accept either code.

## Service copy

- PPF: Luxury chicken pâté nuggets with caviar and cultured buttermilk ranch.
- PCB: Corned Beef Steak Frites featuring Foxtown Heritage Meats Corned Beef Chuck Flap / Boneless Short Rib, triple-cooked fries, mustard cream, and pickled red cabbage.

## Methods and estimated timing

### Plated, Lobster Louie (BSA)

Prep 3 min / Cook 6 min.

- Bake Dauphine tots — Retherm Pommes Dauphine tots at 425°F convection until hot throughout and crisp.
- Dress lobster — Drain the chilled lobster claw and knuckle meat well and fold gently with Louie Dressing.
- Plate Louie — Swoosh Green Goddess on a chilled plate and arrange the dressed lobster over it.
- Finish pickup — Top with the hot crispy tots, garnish with thinly sliced chives, and send immediately.

### Plated, 6 piece (PPF)

Prep 2 min / Cook 6 min.

- Fry frozen nuggets — Fry frozen Breaded Chicken Nuggets at 350°F until golden brown and at least 165°F internal; verify the center with a clean probe.
- Drain and season — Drain on a rack and lightly season while hot.
- Plate six pieces — Arrange 6 nuggets with 2 oz cultured buttermilk Ranch in a ramekin or swoosh.
- Finish with caviar — Distribute approximately 3.5 g Paddlefish Caviar across the six nuggets and send immediately.

### Plated, Blistered Carrot (PB6)

Prep 2 min / Cook 5 min.

- Sear carrots — Sear Sous Vide Carrots with their bag butter over high heat or open coals until hot, blistered, and glazed.
- Plate pesto — Spread 2 fl oz Carrot Top Pesto across the plate.
- Arrange carrots — Arrange the hot glazed carrots over the pesto.
- Finish pickup — Finish with Rye Sumac Crunch and send immediately while the carrots are hot and the crunch stays crisp.

### Plated, Corned Beef Steak Frites (PCB)

Prep 3 min / Cook 6 min.

- Season beef — Season the portioned, previously cooked Corned Beef Chuck Flap / Boneless Short Rib with Montreal Steak Rub.
- Sear beef — Sear and retherm for immediate service until hot and tender with a charred exterior; follow the cooked component's validated process for the medium-rare service target.
- Fry fries — Finish Triple Cooked Fries at 355°F for 3–5 min until golden and crisp; drain briefly and salt immediately.
- Warm mustard cream — Warm 1 fl oz Whole Grain Mustard Cream gently, stirring until smooth.
- Plate steak frites — Plate the beef and hot fries with Mustard Cream and 0.5 oz drained Pickled Red Cabbage; send immediately.

### Carrot Top Pesto (CAW)

Prep 15 min / Cook 5 min.

- Prep herbs — Wash carrot tops and parsley thoroughly, removing coarse stems and any grit.
- Blanch herbs — Blanch the herbs briefly until bright green, shock in an ice bath, then drain and squeeze dry.
- Toast hazelnuts — Toast hazelnuts until fragrant and lightly golden; cool before processing.
- Pulse pesto — Pulse garlic, hazelnuts, lemon zest and juice, and the prepared herbs in a food processor to a coarse paste.
- Emulsify oil — Stream in olive oil while pulsing; add water as needed for a spoonable texture.
- Season pesto — Season with Diamond Crystal kosher salt, taste, and transfer to a clean, covered container.

## Applying the prepared script

The script previews changes by default and preserves existing nonempty methods and recorded timings. Applying requires an explicit new snapshot path, writes original target records to that file, rejects concurrent edits, writes recipe version history, and verifies Tree Nuts inheritance within the transaction. It does not run during startup or deployment.

Preview: `npm run db:repair-annex-launch`

Apply after approval in the intended environment: `npm run db:repair-annex-launch -- --apply --snapshot=/absolute/new-file.json`
