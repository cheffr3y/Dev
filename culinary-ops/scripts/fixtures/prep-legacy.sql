-- Synthetic pre-rollout records used only in the disposable test cluster.
INSERT INTO "User" (id,email,name,"passwordHash",role,"updatedAt") VALUES ('legacy-user','legacy@local.test','Legacy','unused','MANAGER',now());
INSERT INTO "Venue" (id,name,code,"updatedAt") VALUES ('legacy-venue','Legacy venue','LEG',now());
INSERT INTO "Recipe" (id,name,"prodCode","yieldQty","yieldUnit","updatedAt") VALUES ('legacy-recipe','Legacy sauce','LEG',10,'qt',now());
INSERT INTO "PrepOrder" (id,"submittedByUserId","forDate","destinationVenueId") VALUES ('legacy-order','legacy-user','2025-01-01','legacy-venue');
INSERT INTO "PrepOrderLine" (id,"prepOrderId","recipeId","destinationVenueId","requestedQty","requestedUnit",status,"actualQty","actualUnit","allocatedCost","enteredAt") VALUES ('legacy-line','legacy-order','legacy-recipe','legacy-venue',2,'qt','MADE',2,'qt',4.1234567,now());
INSERT INTO "ProductionBatch" (id,"stableId","recipeId",lot,"producedOn","outputQty","outputUnit","foodCostSnapshot","enteredByUserId","updatedAt") VALUES ('legacy-batch','legacy-batch-stable','legacy-recipe','OLD-LOT','2025-01-01',10,'qt',20.1234567,'legacy-user',now());
INSERT INTO "StockTransfer" (id,"stableId","batchId","venueId","transferDate",quantity,unit,"sourceType","foodCostBeforeExclusions","netFoodCost","productionLaborCost","dishwasherLaborCost","totalTransferCost","enteredByUserId","finalizedAt") VALUES ('legacy-transfer','legacy-transfer-stable','legacy-batch','legacy-venue','2025-01-01',2,'qt','STOCK_PICKUP',4.1234567,4.1234567,1.1111111,0.2222222,5.45679,'legacy-user',now());
