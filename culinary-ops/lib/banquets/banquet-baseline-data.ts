import { prisma } from "../db/prisma";
import { baselineInclude, baselineSchema, captureBaseline } from "./banquet-baseline";
import type { BanquetRevisionData } from "../../components/BanquetRevision";

export async function loadBanquetRevision(id: string): Promise<BanquetRevisionData | null> {
  const event = await prisma.banquet.findUnique({ where: { id }, include: baselineInclude });
  if (!event?.baseline) return null;
  return { snapshot: baselineSchema.parse(event.baseline.snapshot), createdAt: event.baseline.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(), current: captureBaseline(event) };
}

export async function lockBaselineForUser(userId: string, id: string, expected: string): Promise<{ error?: string }> {
  // Validate authority again inside the same transaction that captures the facts.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user || user.role === "STAFF") return { error: "Manager access is required." };
        const event = await tx.banquet.findUnique({ where: { id }, include: baselineInclude });
        if (!event) return { error: "Banquet not found." };
        if (event.baseline) return {};
        const snapshot = captureBaseline(event);
        if (JSON.stringify(snapshot) !== expected) return { error: "The saved BEO or setup changed. Reload and review it before locking." };
        await tx.banquetBaseline.create({ data: { banquetId: id, snapshot, createdBy: user.id } });
        return {};
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (attempt < 2 && error && typeof error === "object" && "code" in error && ["P2034", "P2002"].includes(String(error.code))) continue;
      throw error;
    }
  }
  throw new Error("Unable to lock baseline. Reload and try again.");
}
