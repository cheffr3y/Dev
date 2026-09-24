-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'STAFF');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('PLANNED', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ForecastConfidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ShiftKind" AS ENUM ('WORKING', 'OFF');

-- CreateEnum
CREATE TYPE "PrepLineStatus" AS ENUM ('REQUESTED', 'PRINTED', 'IN_PROGRESS', 'MADE', 'SHORT', 'NOT_MADE');

-- CreateEnum
CREATE TYPE "ProductionBatchStatus" AS ENUM ('OPEN', 'FINALIZED');

-- CreateEnum
CREATE TYPE "TransferSourceType" AS ENUM ('PLANNED', 'STOCK_PICKUP', 'CORRECTION');

-- CreateEnum
CREATE TYPE "SupplyTreatment" AS ENUM ('VENUE_SUPPLIED', 'BORROWED_OWED');

-- CreateEnum
CREATE TYPE "StockAdjustmentType" AS ENUM ('WASTE', 'RETURN', 'CORRECTION');

-- CreateEnum
CREATE TYPE "TriviaGameStatus" AS ENUM ('LOBBY', 'IN_QUESTION', 'REVEAL', 'FINISHED', 'ABANDONED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STAFF',
    "homeVenueId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Other',
    "unit" TEXT NOT NULL DEFAULT 'each',
    "packSize" TEXT,
    "packQty" DOUBLE PRECISION,
    "packUnit" TEXT,
    "yieldFactor" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "priceUpdatedAt" TIMESTAMP(3),
    "sku" TEXT,
    "gcode" TEXT,
    "vendorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Other',
    "station" TEXT,
    "yieldQty" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "yieldUnit" TEXT NOT NULL DEFAULT 'servings',
    "menuPrice" DOUBLE PRECISION,
    "instructions" TEXT,
    "photoUrl" TEXT,
    "prodCode" TEXT NOT NULL,
    "holdLifeDays" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "prepMinutes" INTEGER,
    "cookMinutes" INTEGER,
    "productionPersonMinutes" INTEGER,
    "shelfLife" TEXT,
    "storage" TEXT,
    "allergens" TEXT,
    "criticalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeComponent" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'serving',
    "note" TEXT,

    CONSTRAINT "RecipeComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeChange" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "detail" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "userId" TEXT,
    "userName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecipeChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeItem" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'each',
    "note" TEXT,

    CONSTRAINT "RecipeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "par" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'each',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderGuide" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "vendorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderGuide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderGuideLine" (
    "id" TEXT NOT NULL,
    "orderGuideId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "par" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'each',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderGuideLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "guestCount" INTEGER NOT NULL DEFAULT 0,
    "status" "EventStatus" NOT NULL DEFAULT 'PLANNED',
    "location" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventMenuItem" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "plannedServings" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "note" TEXT,

    CONSTRAINT "EventMenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Banquet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "timeLabel" TEXT,
    "guestCount" INTEGER NOT NULL DEFAULT 0,
    "status" "EventStatus" NOT NULL DEFAULT 'PLANNED',
    "location" TEXT,
    "areas" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "salesManager" TEXT,
    "specialInstructions" TEXT,
    "setupNotes" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Banquet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BanquetMenuItem" (
    "id" TEXT NOT NULL,
    "banquetId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "orderedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'servings',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BanquetMenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrepOrder" (
    "id" TEXT NOT NULL,
    "submittedByUserId" TEXT NOT NULL,
    "forDate" TIMESTAMP(3) NOT NULL,
    "destinationVenueId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrepOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrepOrderLine" (
    "id" TEXT NOT NULL,
    "prepOrderId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "recipeVersion" INTEGER NOT NULL DEFAULT 1,
    "destinationVenueId" TEXT NOT NULL,
    "requestedQty" DOUBLE PRECISION NOT NULL,
    "requestedUnit" TEXT NOT NULL,
    "status" "PrepLineStatus" NOT NULL DEFAULT 'REQUESTED',
    "lot" TEXT,
    "lotPrintedAt" TIMESTAMP(3),
    "actualQty" DOUBLE PRECISION,
    "actualUnit" TEXT,
    "madeByUserId" TEXT,
    "madeAt" TIMESTAMP(3),
    "enteredByUserId" TEXT,
    "enteredAt" TIMESTAMP(3),
    "unitCostSnapshot" DOUBLE PRECISION,
    "allocatedCost" DOUBLE PRECISION,
    "costBreakdownSnapshot" JSONB,
    "productionBatchId" TEXT,
    "notes" TEXT,

    CONSTRAINT "PrepOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionBatch" (
    "id" TEXT NOT NULL,
    "stableId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "lot" TEXT NOT NULL,
    "producedOn" TIMESTAMP(3) NOT NULL,
    "outputQty" DOUBLE PRECISION NOT NULL,
    "outputUnit" TEXT NOT NULL,
    "status" "ProductionBatchStatus" NOT NULL DEFAULT 'OPEN',
    "openingStock" BOOLEAN NOT NULL DEFAULT false,
    "estimatedOpeningCost" BOOLEAN NOT NULL DEFAULT false,
    "foodCostSnapshot" DOUBLE PRECISION,
    "foodCostDetailSnapshot" JSONB,
    "standardProductionMinutes" DOUBLE PRECISION,
    "actualProductionMinutes" DOUBLE PRECISION,
    "productionMinutesSource" TEXT NOT NULL DEFAULT 'STANDARD',
    "productionLaborRate" DOUBLE PRECISION NOT NULL DEFAULT 20.666666666666668,
    "productionLaborCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dishwasherMinutes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dishwasherLaborRate" DOUBLE PRECISION NOT NULL DEFAULT 18,
    "dishwasherLaborCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dishwasherAllocationMethod" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "notes" TEXT,
    "enteredByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransfer" (
    "id" TEXT NOT NULL,
    "stableId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "transferDate" TIMESTAMP(3) NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "sourceType" "TransferSourceType" NOT NULL,
    "foodCostBeforeExclusions" DOUBLE PRECISION NOT NULL,
    "excludedFoodCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netFoodCost" DOUBLE PRECISION NOT NULL,
    "productionLaborCost" DOUBLE PRECISION NOT NULL,
    "dishwasherLaborCost" DOUBLE PRECISION NOT NULL,
    "totalTransferCost" DOUBLE PRECISION NOT NULL,
    "productionMinutes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dishwasherMinutes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "finalizedAt" TIMESTAMP(3),
    "correctionOfId" TEXT,
    "notes" TEXT,
    "enteredByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferExclusion" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "itemId" TEXT,
    "itemName" TEXT NOT NULL,
    "gcode" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "capturedUnitPrice" DOUBLE PRECISION,
    "excludedFoodCost" DOUBLE PRECISION NOT NULL,
    "supplyingVenueId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "treatment" "SupplyTreatment" NOT NULL,
    "excludeFood" BOOLEAN NOT NULL DEFAULT true,
    "excludeProductionLabor" BOOLEAN NOT NULL DEFAULT false,
    "excludeDishwasherLabor" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransferExclusion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinishedStockAdjustment" (
    "id" TEXT NOT NULL,
    "stableId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" "StockAdjustmentType" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "correctionOfId" TEXT,
    "enteredByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinishedStockAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionCloseout" (
    "id" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "dishwasherMinutes" DOUBLE PRECISION,
    "dishwasherRate" DOUBLE PRECISION,
    "allocationBasisMinutes" DOUBLE PRECISION,
    "dishwasherCost" DOUBLE PRECISION,
    "allocationSnapshot" JSONB,
    "finalizedAt" TIMESTAMP(3),
    "finalizedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionCloseout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferReportRun" (
    "id" TEXT NOT NULL,
    "stableId" TEXT NOT NULL,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3) NOT NULL,
    "venueId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransferReportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferReportInclusion" (
    "reportRunId" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,

    CONSTRAINT "TransferReportInclusion_pkey" PRIMARY KEY ("reportRunId","transferId")
);

-- CreateTable
CREATE TABLE "Festival" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "venueId" TEXT,
    "expectedAttendance" INTEGER NOT NULL DEFAULT 0,
    "captureRate" DOUBLE PRECISION NOT NULL DEFAULT 0.35,
    "forecastConfidence" "ForecastConfidence" NOT NULL DEFAULT 'MEDIUM',
    "weatherNotes" TEXT,
    "bufferPct" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "laborHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "laborRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "boothFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "equipmentCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "disposablesCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "transportCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "salesFeePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "targetMarginPct" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "status" "EventStatus" NOT NULL DEFAULT 'PLANNED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Festival_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FestivalTent" (
    "id" TEXT NOT NULL,
    "festivalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FestivalTent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FestivalMenuItem" (
    "id" TEXT NOT NULL,
    "festivalId" TEXT NOT NULL,
    "tentId" TEXT NOT NULL,
    "recipeId" TEXT,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mixPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "chefOverride" DOUBLE PRECISION,
    "bufferPctOverride" DOUBLE PRECISION,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,

    CONSTRAINT "FestivalMenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FestivalOnHand" (
    "id" TEXT NOT NULL,
    "festivalId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'each',
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FestivalOnHand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cook" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "cookId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "kind" "ShiftKind" NOT NULL DEFAULT 'WORKING',
    "start" TEXT,
    "end" TEXT,
    "role" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DayNote" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "eventName" TEXT,
    "people" INTEGER,
    "time" TEXT,
    "location" TEXT,
    "body" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DayNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DayEvent" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "eventName" TEXT,
    "people" INTEGER,
    "time" TEXT,
    "location" TEXT,
    "body" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DayEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleNote" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "body" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TriviaGame" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "hostUserId" TEXT,
    "status" "TriviaGameStatus" NOT NULL DEFAULT 'LOBBY',
    "categoryId" INTEGER,
    "categoryName" TEXT,
    "difficulty" TEXT,
    "questionCount" INTEGER NOT NULL DEFAULT 10,
    "questionSecs" INTEGER NOT NULL DEFAULT 20,
    "currentIndex" INTEGER NOT NULL DEFAULT 0,
    "questionStartedAt" TIMESTAMP(3),
    "questionDeadline" TIMESTAMP(3),
    "revealDeadline" TIMESTAMP(3),
    "rematchCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TriviaGame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TriviaQuestion" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "answers" TEXT[],
    "correctIndex" INTEGER NOT NULL,

    CONSTRAINT "TriviaQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TriviaPlayer" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isHost" BOOLEAN NOT NULL DEFAULT false,
    "token" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TriviaPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TriviaAnswer" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answerIndex" INTEGER NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "elapsedMs" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TriviaAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Venue_code_key" ON "Venue"("code");

-- CreateIndex
CREATE INDEX "Item_category_idx" ON "Item"("category");

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_prodCode_key" ON "Recipe"("prodCode");

-- CreateIndex
CREATE INDEX "RecipeComponent_childId_idx" ON "RecipeComponent"("childId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeComponent_parentId_childId_key" ON "RecipeComponent"("parentId", "childId");

-- CreateIndex
CREATE INDEX "RecipeChange_recipeId_createdAt_idx" ON "RecipeChange"("recipeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeItem_recipeId_itemId_key" ON "RecipeItem"("recipeId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_venueId_itemId_key" ON "InventoryItem"("venueId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderGuideLine_orderGuideId_itemId_key" ON "OrderGuideLine"("orderGuideId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "EventMenuItem_eventId_recipeId_key" ON "EventMenuItem"("eventId", "recipeId");

-- CreateIndex
CREATE INDEX "Banquet_date_idx" ON "Banquet"("date");

-- CreateIndex
CREATE INDEX "BanquetMenuItem_banquetId_idx" ON "BanquetMenuItem"("banquetId");

-- CreateIndex
CREATE INDEX "PrepOrder_forDate_idx" ON "PrepOrder"("forDate");

-- CreateIndex
CREATE INDEX "PrepOrder_destinationVenueId_idx" ON "PrepOrder"("destinationVenueId");

-- CreateIndex
CREATE INDEX "PrepOrderLine_prepOrderId_idx" ON "PrepOrderLine"("prepOrderId");

-- CreateIndex
CREATE INDEX "PrepOrderLine_recipeId_idx" ON "PrepOrderLine"("recipeId");

-- CreateIndex
CREATE INDEX "PrepOrderLine_destinationVenueId_idx" ON "PrepOrderLine"("destinationVenueId");

-- CreateIndex
CREATE INDEX "PrepOrderLine_status_idx" ON "PrepOrderLine"("status");

-- CreateIndex
CREATE INDEX "PrepOrderLine_productionBatchId_idx" ON "PrepOrderLine"("productionBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionBatch_stableId_key" ON "ProductionBatch"("stableId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionBatch_lot_key" ON "ProductionBatch"("lot");

-- CreateIndex
CREATE INDEX "ProductionBatch_recipeId_producedOn_idx" ON "ProductionBatch"("recipeId", "producedOn");

-- CreateIndex
CREATE INDEX "ProductionBatch_producedOn_status_idx" ON "ProductionBatch"("producedOn", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StockTransfer_stableId_key" ON "StockTransfer"("stableId");

-- CreateIndex
CREATE INDEX "StockTransfer_transferDate_venueId_idx" ON "StockTransfer"("transferDate", "venueId");

-- CreateIndex
CREATE INDEX "StockTransfer_batchId_idx" ON "StockTransfer"("batchId");

-- CreateIndex
CREATE INDEX "StockTransfer_correctionOfId_idx" ON "StockTransfer"("correctionOfId");

-- CreateIndex
CREATE INDEX "TransferExclusion_transferId_idx" ON "TransferExclusion"("transferId");

-- CreateIndex
CREATE INDEX "TransferExclusion_treatment_resolvedAt_idx" ON "TransferExclusion"("treatment", "resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinishedStockAdjustment_stableId_key" ON "FinishedStockAdjustment"("stableId");

-- CreateIndex
CREATE INDEX "FinishedStockAdjustment_batchId_date_idx" ON "FinishedStockAdjustment"("batchId", "date");

-- CreateIndex
CREATE INDEX "FinishedStockAdjustment_correctionOfId_idx" ON "FinishedStockAdjustment"("correctionOfId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionCloseout_businessDate_key" ON "ProductionCloseout"("businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "TransferReportRun_stableId_key" ON "TransferReportRun"("stableId");

-- CreateIndex
CREATE INDEX "TransferReportRun_fromDate_toDate_idx" ON "TransferReportRun"("fromDate", "toDate");

-- CreateIndex
CREATE INDEX "TransferReportInclusion_transferId_idx" ON "TransferReportInclusion"("transferId");

-- CreateIndex
CREATE INDEX "Festival_date_idx" ON "Festival"("date");

-- CreateIndex
CREATE UNIQUE INDEX "FestivalTent_festivalId_name_key" ON "FestivalTent"("festivalId", "name");

-- CreateIndex
CREATE INDEX "FestivalMenuItem_festivalId_idx" ON "FestivalMenuItem"("festivalId");

-- CreateIndex
CREATE INDEX "FestivalMenuItem_tentId_idx" ON "FestivalMenuItem"("tentId");

-- CreateIndex
CREATE UNIQUE INDEX "FestivalOnHand_festivalId_itemId_key" ON "FestivalOnHand"("festivalId", "itemId");

-- CreateIndex
CREATE INDEX "Cook_venueId_idx" ON "Cook"("venueId");

-- CreateIndex
CREATE INDEX "Shift_date_idx" ON "Shift"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Shift_cookId_date_key" ON "Shift"("cookId", "date");

-- CreateIndex
CREATE INDEX "DayNote_venueId_date_idx" ON "DayNote"("venueId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DayNote_venueId_date_key" ON "DayNote"("venueId", "date");

-- CreateIndex
CREATE INDEX "DayEvent_venueId_date_idx" ON "DayEvent"("venueId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleNote_venueId_weekStart_key" ON "ScheduleNote"("venueId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "TriviaGame_code_key" ON "TriviaGame"("code");

-- CreateIndex
CREATE INDEX "TriviaGame_status_updatedAt_idx" ON "TriviaGame"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TriviaQuestion_gameId_index_key" ON "TriviaQuestion"("gameId", "index");

-- CreateIndex
CREATE UNIQUE INDEX "TriviaPlayer_token_key" ON "TriviaPlayer"("token");

-- CreateIndex
CREATE INDEX "TriviaPlayer_gameId_idx" ON "TriviaPlayer"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "TriviaAnswer_playerId_questionId_key" ON "TriviaAnswer"("playerId", "questionId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_homeVenueId_fkey" FOREIGN KEY ("homeVenueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeComponent" ADD CONSTRAINT "RecipeComponent_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeComponent" ADD CONSTRAINT "RecipeComponent_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeChange" ADD CONSTRAINT "RecipeChange_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeItem" ADD CONSTRAINT "RecipeItem_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeItem" ADD CONSTRAINT "RecipeItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderGuide" ADD CONSTRAINT "OrderGuide_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderGuide" ADD CONSTRAINT "OrderGuide_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderGuideLine" ADD CONSTRAINT "OrderGuideLine_orderGuideId_fkey" FOREIGN KEY ("orderGuideId") REFERENCES "OrderGuide"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderGuideLine" ADD CONSTRAINT "OrderGuideLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventMenuItem" ADD CONSTRAINT "EventMenuItem_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventMenuItem" ADD CONSTRAINT "EventMenuItem_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Banquet" ADD CONSTRAINT "Banquet_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BanquetMenuItem" ADD CONSTRAINT "BanquetMenuItem_banquetId_fkey" FOREIGN KEY ("banquetId") REFERENCES "Banquet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BanquetMenuItem" ADD CONSTRAINT "BanquetMenuItem_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepOrder" ADD CONSTRAINT "PrepOrder_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepOrder" ADD CONSTRAINT "PrepOrder_destinationVenueId_fkey" FOREIGN KEY ("destinationVenueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepOrderLine" ADD CONSTRAINT "PrepOrderLine_prepOrderId_fkey" FOREIGN KEY ("prepOrderId") REFERENCES "PrepOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepOrderLine" ADD CONSTRAINT "PrepOrderLine_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepOrderLine" ADD CONSTRAINT "PrepOrderLine_destinationVenueId_fkey" FOREIGN KEY ("destinationVenueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepOrderLine" ADD CONSTRAINT "PrepOrderLine_madeByUserId_fkey" FOREIGN KEY ("madeByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepOrderLine" ADD CONSTRAINT "PrepOrderLine_enteredByUserId_fkey" FOREIGN KEY ("enteredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepOrderLine" ADD CONSTRAINT "PrepOrderLine_productionBatchId_fkey" FOREIGN KEY ("productionBatchId") REFERENCES "ProductionBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBatch" ADD CONSTRAINT "ProductionBatch_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBatch" ADD CONSTRAINT "ProductionBatch_enteredByUserId_fkey" FOREIGN KEY ("enteredByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProductionBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_correctionOfId_fkey" FOREIGN KEY ("correctionOfId") REFERENCES "StockTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_enteredByUserId_fkey" FOREIGN KEY ("enteredByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferExclusion" ADD CONSTRAINT "TransferExclusion_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "StockTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferExclusion" ADD CONSTRAINT "TransferExclusion_supplyingVenueId_fkey" FOREIGN KEY ("supplyingVenueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinishedStockAdjustment" ADD CONSTRAINT "FinishedStockAdjustment_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProductionBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinishedStockAdjustment" ADD CONSTRAINT "FinishedStockAdjustment_correctionOfId_fkey" FOREIGN KEY ("correctionOfId") REFERENCES "FinishedStockAdjustment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinishedStockAdjustment" ADD CONSTRAINT "FinishedStockAdjustment_enteredByUserId_fkey" FOREIGN KEY ("enteredByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionCloseout" ADD CONSTRAINT "ProductionCloseout_finalizedByUserId_fkey" FOREIGN KEY ("finalizedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferReportInclusion" ADD CONSTRAINT "TransferReportInclusion_reportRunId_fkey" FOREIGN KEY ("reportRunId") REFERENCES "TransferReportRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferReportInclusion" ADD CONSTRAINT "TransferReportInclusion_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "StockTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Festival" ADD CONSTRAINT "Festival_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FestivalTent" ADD CONSTRAINT "FestivalTent_festivalId_fkey" FOREIGN KEY ("festivalId") REFERENCES "Festival"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FestivalMenuItem" ADD CONSTRAINT "FestivalMenuItem_festivalId_fkey" FOREIGN KEY ("festivalId") REFERENCES "Festival"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FestivalMenuItem" ADD CONSTRAINT "FestivalMenuItem_tentId_fkey" FOREIGN KEY ("tentId") REFERENCES "FestivalTent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FestivalMenuItem" ADD CONSTRAINT "FestivalMenuItem_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FestivalOnHand" ADD CONSTRAINT "FestivalOnHand_festivalId_fkey" FOREIGN KEY ("festivalId") REFERENCES "Festival"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FestivalOnHand" ADD CONSTRAINT "FestivalOnHand_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cook" ADD CONSTRAINT "Cook_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_cookId_fkey" FOREIGN KEY ("cookId") REFERENCES "Cook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayNote" ADD CONSTRAINT "DayNote_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayEvent" ADD CONSTRAINT "DayEvent_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleNote" ADD CONSTRAINT "ScheduleNote_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriviaGame" ADD CONSTRAINT "TriviaGame_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriviaQuestion" ADD CONSTRAINT "TriviaQuestion_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "TriviaGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriviaPlayer" ADD CONSTRAINT "TriviaPlayer_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "TriviaGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriviaAnswer" ADD CONSTRAINT "TriviaAnswer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "TriviaPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriviaAnswer" ADD CONSTRAINT "TriviaAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "TriviaQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

