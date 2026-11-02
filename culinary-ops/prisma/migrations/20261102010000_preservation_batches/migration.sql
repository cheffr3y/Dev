CREATE TABLE "PreservationBatch" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "venueId" TEXT NOT NULL REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdById" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'RUNNING' CHECK ("status" IN ('RUNNING','FINISHED','VOID')),
  "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" > 0),
  "facts" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "PreservationBatch_venueId_createdAt_idx" ON "PreservationBatch"("venueId","createdAt");
CREATE INDEX "PreservationBatch_status_createdAt_idx" ON "PreservationBatch"("status","createdAt");
CREATE TABLE "PreservationAudit" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "batchId" TEXT NOT NULL REFERENCES "PreservationBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "actorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "actorName" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "detail" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PreservationAudit_batchId_createdAt_idx" ON "PreservationAudit"("batchId","createdAt");
CREATE FUNCTION preservation_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Preservation audit history cannot be changed'; END;
$$;
CREATE TRIGGER preservation_audit_immutable BEFORE UPDATE OR DELETE ON "PreservationAudit"
FOR EACH ROW EXECUTE FUNCTION preservation_audit_immutable();
