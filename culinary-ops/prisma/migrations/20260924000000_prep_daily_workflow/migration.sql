-- AlterTable
ALTER TABLE "ProductionBatch" ADD COLUMN     "cookName" TEXT,
ADD COLUMN     "costingSnapshot" JSONB,
ADD COLUMN     "productionWasteQty" DOUBLE PRECISION,
ADD COLUMN     "retainedQty" DOUBLE PRECISION,
ALTER COLUMN "productionLaborCost" DROP NOT NULL,
ALTER COLUMN "dishwasherMinutes" DROP NOT NULL,
ALTER COLUMN "dishwasherLaborCost" DROP NOT NULL;

-- AlterTable
ALTER TABLE "StockTransfer" ADD COLUMN     "accountingState" TEXT NOT NULL DEFAULT 'LEGACY',
ADD COLUMN     "costingSnapshot" JSONB,
ADD COLUMN     "recipeId" TEXT,
ADD COLUMN     "requestLineId" TEXT,
ALTER COLUMN "batchId" DROP NOT NULL,
ALTER COLUMN "foodCostBeforeExclusions" DROP NOT NULL,
ALTER COLUMN "excludedFoodCost" DROP NOT NULL,
ALTER COLUMN "netFoodCost" DROP NOT NULL,
ALTER COLUMN "productionLaborCost" DROP NOT NULL,
ALTER COLUMN "dishwasherLaborCost" DROP NOT NULL,
ALTER COLUMN "totalTransferCost" DROP NOT NULL,
ALTER COLUMN "productionMinutes" DROP NOT NULL,
ALTER COLUMN "dishwasherMinutes" DROP NOT NULL;

-- AlterTable
ALTER TABLE "FinishedStockAdjustment" ADD COLUMN     "amendmentId" TEXT,
ADD COLUMN     "recipeId" TEXT,
ADD COLUMN     "transferId" TEXT,
ALTER COLUMN "batchId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "TransferReportRun" ADD COLUMN     "snapshot" JSONB;

-- CreateTable
CREATE TABLE "PrepOperation" (
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrepOperation_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "PrepBusinessDay" (
    "date" TIMESTAMP(3) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PrepBusinessDay_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "PrepPacketSnapshot" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "contents" JSONB NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrepPacketSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrepAmendment" (
    "revision" INTEGER NOT NULL,
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "adjustmentDate" TIMESTAMP(3) NOT NULL,
    "quantity" DOUBLE PRECISION,
    "costingSnapshot" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrepAmendment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PrepPacketSnapshot_scope_key" ON "PrepPacketSnapshot"("scope");

-- CreateIndex
CREATE INDEX "PrepAmendment_transferId_createdAt_idx" ON "PrepAmendment"("transferId", "createdAt");

-- CreateIndex
CREATE INDEX "PrepAmendment_adjustmentDate_idx" ON "PrepAmendment"("adjustmentDate");

-- CreateIndex
CREATE UNIQUE INDEX "FinishedStockAdjustment_amendmentId_key" ON "FinishedStockAdjustment"("amendmentId");

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_requestLineId_fkey" FOREIGN KEY ("requestLineId") REFERENCES "PrepOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinishedStockAdjustment" ADD CONSTRAINT "FinishedStockAdjustment_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "StockTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinishedStockAdjustment" ADD CONSTRAINT "FinishedStockAdjustment_amendmentId_fkey" FOREIGN KEY ("amendmentId") REFERENCES "PrepAmendment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepAmendment" ADD CONSTRAINT "PrepAmendment_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "StockTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Audit artifacts are append-only, including for privileged application callers.
CREATE FUNCTION prep_reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Prep audit records are immutable; create a linked amendment';
END;
$$;
CREATE TRIGGER prep_operation_immutable BEFORE UPDATE OR DELETE ON "PrepOperation"
FOR EACH ROW EXECUTE FUNCTION prep_reject_audit_mutation();
CREATE TRIGGER prep_packet_immutable BEFORE UPDATE OR DELETE ON "PrepPacketSnapshot"
FOR EACH ROW EXECUTE FUNCTION prep_reject_audit_mutation();
CREATE TRIGGER prep_amendment_immutable BEFORE UPDATE OR DELETE ON "PrepAmendment"
FOR EACH ROW EXECUTE FUNCTION prep_reject_audit_mutation();
CREATE TRIGGER prep_export_immutable BEFORE UPDATE OR DELETE ON "TransferReportRun"
FOR EACH ROW WHEN (OLD.snapshot IS NOT NULL) EXECUTE FUNCTION prep_reject_audit_mutation();
CREATE TRIGGER prep_closed_transfer_immutable BEFORE UPDATE OR DELETE ON "StockTransfer"
FOR EACH ROW WHEN (OLD."finalizedAt" IS NOT NULL) EXECUTE FUNCTION prep_reject_audit_mutation();
CREATE TRIGGER prep_closed_production_immutable BEFORE UPDATE OR DELETE ON "ProductionBatch"
FOR EACH ROW WHEN (OLD."finalizedAt" IS NOT NULL) EXECUTE FUNCTION prep_reject_audit_mutation();
CREATE TRIGGER prep_completed_request_immutable BEFORE UPDATE OR DELETE ON "PrepOrderLine"
FOR EACH ROW WHEN (OLD.status IN ('MADE', 'SHORT', 'NOT_MADE')) EXECUTE FUNCTION prep_reject_audit_mutation();

CREATE UNIQUE INDEX "StockTransfer_requestLineId_key" ON "StockTransfer"("requestLineId");
CREATE TRIGGER prep_closed_day_immutable BEFORE UPDATE OR DELETE ON "ProductionCloseout"
FOR EACH ROW WHEN (OLD."finalizedAt" IS NOT NULL) EXECUTE FUNCTION prep_reject_audit_mutation();

CREATE UNIQUE INDEX "PrepAmendment_transferId_revision_key" ON "PrepAmendment"("transferId", "revision");
