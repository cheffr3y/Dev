INSERT INTO "Venue" ("id", "name", "code", "createdAt", "updatedAt") VALUES
 ('venue-old-brew', 'Foxtown Brewing', 'FB', '2024-01-01', CURRENT_TIMESTAMP),
 ('venue-exact-brew', 'Foxtown Brewpub', 'FBP', '2025-01-01', CURRENT_TIMESTAMP),
 ('venue-old-meats', 'Heritage Meats', 'HM', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('venue-old-interurban', 'Interurban', 'INT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('venue-old-lounge', '11’s lounge', '11L', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('venue-old-renards', 'Renard''s', 'REN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('venue-old-opitz', 'Opitz Hall', 'OPI', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('venue-ambiguous-banquets', 'Banquets', 'BAN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('venue-ambiguous-landing', 'Foxtown Landing', 'FL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('venue-code-conflict', 'Unclassified legacy operation', 'STA', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO "User" ("id", "email", "name", "passwordHash", "homeVenueId", "updatedAt")
 VALUES ('venue-legacy-user', 'legacy@local.test', 'Legacy user', 'not-a-login-password', 'venue-old-brew', CURRENT_TIMESTAMP);
INSERT INTO "Item" ("id", "name", "category", "unit", "unitCost", "updatedAt")
 VALUES ('venue-stock-item', 'Legacy stock item', 'Other', 'lb', 4, CURRENT_TIMESTAMP);
INSERT INTO "InventoryItem" ("id", "venueId", "itemId", "quantity", "par", "unit", "updatedAt") VALUES
 ('venue-stock-old', 'venue-old-brew', 'venue-stock-item', 7, 10, 'lb', CURRENT_TIMESTAMP),
 ('venue-stock-exact', 'venue-exact-brew', 'venue-stock-item', 11, 12, 'lb', CURRENT_TIMESTAMP);
INSERT INTO "Event" ("id", "name", "venueId", "date", "updatedAt")
 VALUES ('venue-legacy-event', 'Historical event', 'venue-old-brew', '2026-10-01', CURRENT_TIMESTAMP);
INSERT INTO "ToGoRollup" ("id", "name", "venueId", "updatedAt")
 VALUES ('venue-legacy-rollup', 'Existing holiday plan', 'venue-ambiguous-banquets', CURRENT_TIMESTAMP);
INSERT INTO "PrepOrder" ("id", "submittedByUserId", "forDate", "destinationVenueId")
 VALUES ('venue-legacy-request', 'venue-legacy-user', '2026-10-20', 'venue-old-brew');
INSERT INTO "PrepPacketSnapshot" ("id", "scope", "contents", "authorId")
 VALUES ('venue-history-snapshot', 'venue-test-history', '{"venueId":"venue-old-brew","venueName":"Foxtown Brewing","cost":123.45}', 'venue-legacy-user');
