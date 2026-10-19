CREATE TABLE "HomesteadSave" (
    "userId" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HomesteadSave_pkey" PRIMARY KEY ("userId"),
    CONSTRAINT "HomesteadSave_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
