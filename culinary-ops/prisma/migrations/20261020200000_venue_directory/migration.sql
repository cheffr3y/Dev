-- Preserve every existing venue ID, code and operational/history link.
-- Known names are normalized in place; ambiguous and duplicate records are
-- retained outside the standard directory, never merged or deleted.
ALTER TABLE "Venue" ADD COLUMN "standardKey" TEXT,
  ADD COLUMN "parentId" TEXT,
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "Venue_standardKey_key" ON "Venue"("standardKey");
ALTER TABLE "Venue" ADD CONSTRAINT "Venue_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Venue" ADD CONSTRAINT "Venue_not_own_parent" CHECK ("parentId" IS NULL OR "parentId" <> "id");

DO $$
DECLARE
  entry RECORD;
  existing_id TEXT;
  parent_id TEXT;
  chosen_code TEXT;
  suffix INTEGER;
BEGIN
  FOR entry IN SELECT * FROM (VALUES
    ('foxtown-brewpub', 'Foxtown Brewpub', 'FBP', NULL, 0, ARRAY['foxtownbrewpub','foxtownbrewing','brewpub']),
    ('annex', 'The Annex', 'ANX', NULL, 1, ARRAY['theannex','annex']),
    ('renards', 'Renard''s', 'REN', 'annex', 2, ARRAY['renards']),
    ('11s-lounge', '11''s Lounge', '11S', 'annex', 3, ARRAY['11slounge','11lounge']),
    ('station', 'The Station', 'STA', NULL, 4, ARRAY['thestation','station','foxtownstation']),
    ('zimmerman', 'Zimmerman', 'ZIM', 'station', 5, ARRAY['zimmerman','zimmermanroom']),
    ('foxyard', 'Foxyard', 'FOX', 'station', 6, ARRAY['foxyard']),
    ('opitz', 'Opitz', 'OPI', 'station', 7, ARRAY['opitz','opitzhall','opitzroom']),
    ('ice-house', 'Ice House', 'ICE', 'station', 8, ARRAY['icehouse']),
    ('ice-house-mezzanine', 'Ice House Mezzanine', 'ICEM', 'station', 9, ARRAY['icehousemezzanine','icehousemezz','mezzanine']),
    ('foxtown-heritage-meats', 'Foxtown Heritage Meats', 'FHM', NULL, 10, ARRAY['foxtownheritagemeats','heritagemeats']),
    ('interurban-coffee-shop', 'Interurban Coffee Shop', 'ICS', NULL, 11, ARRAY['interurbancoffeeshop','interurban','interurbancoffee'])
  ) AS directory(key, name, code, parent_key, sort_order, aliases)
  ORDER BY sort_order
  LOOP
    SELECT "id" INTO existing_id FROM "Venue"
      WHERE "standardKey" IS NULL
        AND regexp_replace(lower("name"), '[^a-z0-9]', '', 'g') = ANY(entry.aliases)
      ORDER BY (regexp_replace(lower("name"), '[^a-z0-9]', '', 'g') = regexp_replace(lower(entry.name), '[^a-z0-9]', '', 'g')) DESC,
        "createdAt", "id"
      LIMIT 1;
    SELECT "id" INTO parent_id FROM "Venue" WHERE "standardKey" = entry.parent_key;
    IF existing_id IS NULL THEN
      chosen_code := entry.code;
      suffix := 2;
      WHILE EXISTS (SELECT 1 FROM "Venue" WHERE "code" = chosen_code) LOOP
        chosen_code := left(entry.code, 3) || suffix::text;
        suffix := suffix + 1;
      END LOOP;
      INSERT INTO "Venue" ("id", "name", "code", "standardKey", "parentId", "sortOrder", "updatedAt")
        VALUES ('venue-standard-' || entry.key, entry.name, chosen_code, entry.key, parent_id, entry.sort_order, CURRENT_TIMESTAMP);
    ELSE
      UPDATE "Venue" SET "name" = entry.name, "standardKey" = entry.key,
        "parentId" = parent_id, "sortOrder" = entry.sort_order, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = existing_id;
    END IF;
    -- Duplicate aliases retain distinct IDs and all their original references.
    -- Standardize their labels without guessing how to merge stock or history.
    UPDATE "Venue" SET "name" = entry.name, "parentId" = parent_id, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "standardKey" IS NULL
        AND regexp_replace(lower("name"), '[^a-z0-9]', '', 'g') = ANY(entry.aliases);
  END LOOP;
END $$;
