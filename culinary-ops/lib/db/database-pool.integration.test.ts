import test, { after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";
import { applicationDatabaseUrl } from "./database-url";
const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid");
if (process.env.PREP_DISPOSABLE_DB !== "1" || url.hostname !== "127.0.0.1" || url.pathname !== "/prep_workflow_test") throw new Error("Disposable local database required.");
after(() => prisma.$disconnect());
test("the real Prisma web pool stays within three connections under concurrent queries", async () => {
  await prisma.$executeRawUnsafe('CREATE ROLE culinary_pool_limit_test LOGIN');
  const limited = new URL(url);
  limited.username = "culinary_pool_limit_test"; limited.password = "";
  limited.searchParams.delete("connection_limit");
  const client = new PrismaClient({ datasourceUrl: applicationDatabaseUrl(limited.toString()) });
  try {
    await client.$connect();
    const pending = Promise.all(Array.from({ length: 15 }, () => client.$queryRaw<Array<{ value: number }>>`SELECT 1 AS value FROM pg_sleep(0.1)`));
    const samples: number[] = [];
    for (let index = 0; index < 4; index++) {
      await new Promise(resolve => setTimeout(resolve, 30));
      const [row] = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM pg_stat_activity WHERE usename = 'culinary_pool_limit_test'`;
      samples.push(Number(row.count));
    }
    assert.ok(samples.every(count => count > 0 && count <= 3), `Pool samples: ${samples.join(", ")}`);
    assert.equal(Math.max(...samples), 3, "Concurrent queries exercise the full configured pool");
    assert.equal((await pending).length, 15);
  } finally { await client.$disconnect(); }
});
