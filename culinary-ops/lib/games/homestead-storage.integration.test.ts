import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { hash } from "bcryptjs";
import { prisma } from "../db/prisma";
import { createHomestead } from "./homestead";
import { readHomestead, writeHomestead } from "./homestead-storage";

const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid");
if (process.env.HOMESTEAD_DISPOSABLE_DB !== "1" || url.hostname !== "127.0.0.1" || url.pathname !== "/homestead_test") throw new Error("Use the disposable homestead harness.");

before(async () => {
  const passwordHash = await hash("local-homestead-only", 10);
  for (const role of ["STAFF", "ADMIN"] as const) await prisma.user.create({ data: {
    id: `homestead-${role.toLowerCase()}`, email: `${role.toLowerCase()}@homestead.test`, name: `Garden ${role}`, role, passwordHash,
  } });
});
after(async () => { await prisma.homesteadSave.deleteMany(); await prisma.$disconnect(); });

test("personal saves, concurrent updates and stale creates preserve account isolation", async () => {
  const state = createHomestead();
  assert.equal(await readHomestead("homestead-staff"), null);
  assert.deepEqual(await writeHomestead("homestead-staff", state, 0), { ok: true, revision: 1 });
  assert.equal(await readHomestead("homestead-admin"), null);
  const other = createHomestead(); other.resources.coins = 99;
  await writeHomestead("homestead-admin", other, 0);
  assert.equal((await readHomestead("homestead-staff"))?.state.resources.coins, 55);
  assert.equal((await readHomestead("homestead-admin"))?.state.resources.coins, 99);
  assert.deepEqual(await writeHomestead("homestead-staff", other, 0), { ok: false, reason: "conflict" });
  const updates = await Promise.all([writeHomestead("homestead-staff", state, 1), writeHomestead("homestead-staff", other, 1)]);
  assert.equal(updates.filter(r => r.ok).length, 1);
  assert.equal(updates.filter(r => !r.ok).length, 1);
  assert.equal((await readHomestead("homestead-staff"))?.revision, 2);
  assert.deepEqual(await writeHomestead("homestead-staff", other, 1), { ok: false, reason: "conflict" });
  await assert.rejects(() => writeHomestead("homestead-staff", { ...state, grid: [] }, 2));
  assert.equal((await readHomestead("homestead-staff"))?.revision, 2);
  assert.equal(await prisma.item.count(), 0);
  assert.equal(await prisma.recipe.count(), 0);
});
