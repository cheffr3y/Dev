CREATE TABLE "SpecialCosting" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "name" TEXT NOT NULL, "payload" JSONB NOT NULL, "revision" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "SpecialCosting_userId_updatedAt_idx" ON "SpecialCosting"("userId", "updatedAt");
