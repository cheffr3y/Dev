import { prisma } from "./prisma";
import { homesteadSchema, type HomesteadSave, type HomesteadState } from "./homestead";

export async function readHomestead(userId: string): Promise<HomesteadSave | null> {
  const row = await prisma.homesteadSave.findUnique({ where: { userId } });
  return row ? { state: homesteadSchema.parse(row.state), revision: row.revision } : null;
}

// Compare-and-swap prevents an old browser tab/device from overwriting a newer save.
// userId must come from the authenticated session, never from client input.
export async function writeHomestead(userId: string, state: HomesteadState, revision: number) {
  const data = homesteadSchema.parse(state);
  const result = revision === 0
    ? await prisma.homesteadSave.createMany({ data: [{ userId, state: data, revision: 1 }], skipDuplicates: true })
    : await prisma.homesteadSave.updateMany({ where: { userId, revision }, data: { state: data, revision: { increment: 1 } } });
  return result.count === 1
    ? { ok: true as const, revision: revision + 1 }
    : { ok: false as const, reason: "conflict" as const };
}
