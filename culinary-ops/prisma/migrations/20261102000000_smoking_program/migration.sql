-- CreateTable
CREATE TABLE "SmokeRun" (
    "id" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "venueId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmokeRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmokeLot" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmokeLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmokeReading" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmokeReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmokeProfile" (
    "id" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmokeProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmokePhoto" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "lotId" TEXT,
    "createdById" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "data" BYTEA NOT NULL,
    "preview" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmokePhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmokeAudit" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB NOT NULL,
    "operationId" TEXT,
    "requestHash" TEXT,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmokeAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SmokeRun_venueId_businessDate_idx" ON "SmokeRun"("venueId", "businessDate");

-- CreateIndex
CREATE INDEX "SmokeRun_businessDate_idx" ON "SmokeRun"("businessDate");

-- CreateIndex
CREATE INDEX "SmokeLot_runId_idx" ON "SmokeLot"("runId");

-- CreateIndex
CREATE INDEX "SmokeReading_lotId_createdAt_idx" ON "SmokeReading"("lotId", "createdAt");

-- CreateIndex
CREATE INDEX "SmokePhoto_lotId_idx" ON "SmokePhoto"("lotId");

-- CreateIndex
CREATE UNIQUE INDEX "SmokePhoto_runId_fileHash_key" ON "SmokePhoto"("runId", "fileHash");

-- CreateIndex
CREATE UNIQUE INDEX "SmokeAudit_operationId_key" ON "SmokeAudit"("operationId");

-- CreateIndex
CREATE INDEX "SmokeAudit_entityId_createdAt_idx" ON "SmokeAudit"("entityId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SmokeAudit_entityType_entityId_revision_key" ON "SmokeAudit"("entityType", "entityId", "revision");

-- AddForeignKey
ALTER TABLE "SmokeRun" ADD CONSTRAINT "SmokeRun_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmokeRun" ADD CONSTRAINT "SmokeRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmokeLot" ADD CONSTRAINT "SmokeLot_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SmokeRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmokeLot" ADD CONSTRAINT "SmokeLot_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmokeReading" ADD CONSTRAINT "SmokeReading_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "SmokeLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmokeReading" ADD CONSTRAINT "SmokeReading_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmokeProfile" ADD CONSTRAINT "SmokeProfile_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmokePhoto" ADD CONSTRAINT "SmokePhoto_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SmokeRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmokePhoto" ADD CONSTRAINT "SmokePhoto_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "SmokeLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmokePhoto" ADD CONSTRAINT "SmokePhoto_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmokeAudit" ADD CONSTRAINT "SmokeAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Append-only before/after facts protect source readings and review history.
CREATE FUNCTION smoke_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Smoking audit facts are immutable; append a correction';
END $$;
CREATE TRIGGER smoke_audit_immutable BEFORE UPDATE OR DELETE ON "SmokeAudit"
FOR EACH ROW EXECUTE FUNCTION smoke_audit_immutable();
ALTER TABLE "SmokeAudit" ADD CONSTRAINT smoke_audit_revision CHECK (revision >= 0 AND (revision = 0 OR length(reason) > 0));

CREATE FUNCTION smoke_record_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE kind text; fact "SmokeAudit"%ROWTYPE; actor_role "Role";
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Smoking records are retained; correct or void the entry'; END IF;
  kind := CASE TG_TABLE_NAME WHEN 'SmokeRun' THEN 'RUN' WHEN 'SmokeLot' THEN 'LOT' WHEN 'SmokeReading' THEN 'READING' WHEN 'SmokeProfile' THEN 'PROFILE' END;
  IF jsonb_typeof(NEW.data) <> 'object' OR NEW.revision < 0 THEN RAISE EXCEPTION 'Invalid smoking record'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.revision <> 0 THEN RAISE EXCEPTION 'New smoking records start at revision zero'; END IF;
  ELSE
    IF NEW.revision <> OLD.revision + 1 OR
       (to_jsonb(NEW) - ARRAY['data','revision','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['data','revision','updatedAt']) THEN
      RAISE EXCEPTION 'Smoking identities are fixed and revisions must advance once';
    END IF;
  END IF;
  SELECT * INTO fact FROM "SmokeAudit" WHERE "entityType" = kind AND "entityId" = NEW.id AND revision = NEW.revision;
  IF NOT FOUND OR fact.after IS DISTINCT FROM NEW.data THEN RAISE EXCEPTION 'Smoking changes require matching audit facts'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF fact.before IS NOT NULL OR fact."actorId" <> NEW."createdById" THEN RAISE EXCEPTION 'Smoking creation facts do not match'; END IF;
  ELSE
    IF fact.before IS DISTINCT FROM OLD.data THEN RAISE EXCEPTION 'Smoking corrections must preserve prior facts'; END IF;
  END IF;
  SELECT role INTO actor_role FROM "User" WHERE id = fact."actorId";
  IF kind = 'PROFILE' AND actor_role NOT IN ('ADMIN','MANAGER') THEN RAISE EXCEPTION 'Managers maintain smoking procedures'; END IF;
  IF kind = 'LOT' THEN
    IF NEW.data->>'status' NOT IN ('OPEN','SUBMITTED','REVIEWED','VOID') OR NEW.data#>>'{plan,mode}' NOT IN ('HOT','COLD') THEN RAISE EXCEPTION 'Invalid smoking lot state'; END IF;
    IF NEW.data->>'status' = 'REVIEWED' AND (actor_role NOT IN ('ADMIN','MANAGER') OR NEW.data->'review' = 'null'::jsonb) THEN RAISE EXCEPTION 'Smoking review requires a manager and review facts'; END IF;
    IF NEW.data#>'{actual,summary}' <> 'null'::jsonb AND NEW.data#>>'{actual,summary,confirmed}' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Smoking transcription must be confirmed'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER smoke_run_guard BEFORE INSERT OR UPDATE OR DELETE ON "SmokeRun" FOR EACH ROW EXECUTE FUNCTION smoke_record_guard();
CREATE TRIGGER smoke_lot_guard BEFORE INSERT OR UPDATE OR DELETE ON "SmokeLot" FOR EACH ROW EXECUTE FUNCTION smoke_record_guard();
CREATE TRIGGER smoke_reading_guard BEFORE INSERT OR UPDATE OR DELETE ON "SmokeReading" FOR EACH ROW EXECUTE FUNCTION smoke_record_guard();
CREATE TRIGGER smoke_profile_guard BEFORE INSERT OR UPDATE OR DELETE ON "SmokeProfile" FOR EACH ROW EXECUTE FUNCTION smoke_record_guard();

CREATE FUNCTION smoke_photo_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Smoking source photos are immutable'; END IF;
  IF NEW."lotId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "SmokeLot" WHERE id = NEW."lotId" AND "runId" = NEW."runId") THEN RAISE EXCEPTION 'Photo lot must belong to its run'; END IF;
  IF NEW.metadata->>'mime' NOT IN ('image/png','image/jpeg','application/pdf') OR
     (NEW.metadata->>'storedBytes')::integer <> octet_length(NEW.data) OR
     octet_length(NEW.data) > 8388608 OR octet_length(NEW.data) < 1 OR
     NEW."fileHash" !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid smoking source document'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "SmokeAudit" WHERE "entityType" = 'PHOTO' AND "entityId" = NEW.id AND revision = 0 AND "actorId" = NEW."createdById" AND after = NEW.metadata AND before IS NULL) THEN RAISE EXCEPTION 'Photo creation requires matching audit facts'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER smoke_photo_guard BEFORE INSERT OR UPDATE OR DELETE ON "SmokePhoto" FOR EACH ROW EXECUTE FUNCTION smoke_photo_guard();
CREATE INDEX "SmokeLot_plan_gin" ON "SmokeLot" USING gin (data jsonb_path_ops);
