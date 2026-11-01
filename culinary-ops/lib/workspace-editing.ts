import { Prisma, type PrismaClient } from "@prisma/client";
import { editSchema, parseCellValue, type EditResult } from "./workspace-options";

// Compare only the edited field, so concurrent changes to other fields survive.
export async function saveWorkspaceCell(db: PrismaClient, actorId: string, input: unknown): Promise<EditResult> {
  const parsed = editSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid edit. Refresh and try again." };
  const edit = parsed.data;
  try {
    const value = parseCellValue(edit.entity, edit.field, edit.value);
    return await db.$transaction(async tx => {
      const actor = await tx.user.findUnique({ where: { id: actorId } });
      if (!actor || !["ADMIN", "MANAGER"].includes(actor.role)) return { ok: false, error: "Manager access is required to edit." };
      const row = edit.entity === "item" ? await tx.item.findUnique({ where: { id: edit.id } }) : edit.entity === "recipe" ? await tx.recipe.findUnique({ where: { id: edit.id } }) : await tx.orderGuideLine.findUnique({ where: { id: edit.id } });
      if (!row) return { ok: false, error: "This record was removed. Refresh the page." };
      const current = (row as unknown as Record<string, string | number | null>)[edit.field];
      // A retry after a lost response must not overwrite or duplicate an audit entry.
      if (current === value) return { ok: true, value };
      if (current !== edit.expected) return { ok: false, error: "Someone changed this field. Your entry is kept below; use the latest value or retry your edit.", current };
      if (edit.entity === "item") {
        if (edit.field === "vendorId" && value && !await tx.vendor.findUnique({ where: { id: String(value) } })) return { ok: false, error: "That vendor no longer exists." };
        await tx.item.update({ where: { id: edit.id }, data: { [edit.field]: value, ...(["unitCost", "unit"].includes(edit.field) ? { priceUpdatedAt: new Date() } : {}) } });
      } else if (edit.entity === "guideLine") {
        await tx.orderGuideLine.update({ where: { id: edit.id }, data: { [edit.field]: value } });
      } else {
        const recipe = await tx.recipe.update({ where: { id: edit.id }, data: { [edit.field]: value, version: { increment: 1 } } });
        await tx.recipeChange.create({ data: { recipeId: recipe.id, version: recipe.version, summary: "Edited yield", detail: `${edit.field}: ${current ?? "—"} → ${value}`, userId: actor.id, userName: actor.name } });
      }
      return { ok: true, value };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return { ok: false, error: "Another edit arrived at the same time. Your entry is kept; retry to save it." };
    return { ok: false, error: error instanceof Prisma.PrismaClientKnownRequestError ? "Could not save this edit. Refresh the record and try again." : error instanceof Error ? error.message : "Could not save this edit." };
  }
}
