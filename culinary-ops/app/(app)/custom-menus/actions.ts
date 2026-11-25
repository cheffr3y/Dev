"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireActiveUser } from "@/lib/auth/session";
import { CUSTOM_MENU_STATUSES } from "@/lib/menus/custom-menu";

// Writes check the account's current database role (requireActiveUser), not
// only the role captured at sign-in.

const optionalText = (max = 5000) => z.string().trim().max(max).transform((value) => value || null);
const blankToNull = (value: unknown) => (value === "" || value == null ? null : value);
const optionalNumber = z.preprocess(blankToNull, z.coerce.number().min(0).max(1_000_000).nullable());
const optionalUnit = z.preprocess(blankToNull, z.string().trim().max(40).nullable());

const headerSchema = z.object({
  name: z.string().trim().min(1, "Name the menu").max(200),
  subtitle: optionalText(200),
  date: z.preprocess(blankToNull, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date").nullable())
    .transform((value) => (value ? new Date(`${value}T00:00:00.000Z`) : null)),
  serviceTime: optionalText(100),
  venueId: optionalText(100),
  guestCount: z.coerce.number().int("Guests must be a whole number").min(0).max(100_000),
  pricePerGuest: optionalNumber,
  targetFcp: z.coerce.number().positive().max(100),
  status: z.enum(CUSTOM_MENU_STATUSES),
  notes: optionalText(),
  serviceNotes: optionalText(),
});

const lineSchema = z.object({
  recipeId: z.string().min(1, "Choose a recipe"),
  section: z.string().trim().min(1).max(100),
  menuTitle: optionalText(200),
  menuDescription: optionalText(2000),
  portionQty: optionalNumber,
  portionUnit: optionalUnit,
  totalQty: optionalNumber,
  totalUnit: optionalUnit,
  sortOrder: z.coerce.number().int().min(0).max(100_000),
});

export type CustomMenuFormState = { error: string; saved: boolean };

function message(error: unknown) {
  if (error instanceof z.ZodError) return error.issues.map((issue) => issue.message).join(" · ");
  if (error && typeof error === "object" && "code" in error && error.code === "P2003") return "That venue or recipe no longer exists. Refresh and try again.";
  return error instanceof Error ? error.message : "Could not save the custom menu.";
}

function refresh(id?: string) {
  revalidatePath("/custom-menus");
  if (id) {
    revalidatePath(`/custom-menus/${id}`);
    revalidatePath(`/custom-menus/${id}/packet`);
  }
}

function field(form: FormData, key: string) {
  return form.get(key) ?? "";
}

export async function saveCustomMenu(_previous: CustomMenuFormState, form: FormData): Promise<CustomMenuFormState> {
  await requireActiveUser("MANAGER");
  const id = String(form.get("id") || "");
  let savedId: string;
  try {
    const data = headerSchema.parse({
      name: field(form, "name"), subtitle: field(form, "subtitle"), date: field(form, "date"),
      serviceTime: field(form, "serviceTime"), venueId: field(form, "venueId"),
      guestCount: field(form, "guestCount") || 0, pricePerGuest: field(form, "pricePerGuest"),
      targetFcp: field(form, "targetFcp") || 30, status: form.get("status") || "DRAFT",
      notes: field(form, "notes"), serviceNotes: field(form, "serviceNotes"),
    });
    const menu = id
      ? await prisma.customMenu.update({ where: { id }, data })
      : await prisma.customMenu.create({ data });
    savedId = menu.id;
    refresh(savedId);
  } catch (error) {
    return { error: message(error), saved: false };
  }
  if (!id) redirect(`/custom-menus/${savedId}`);
  return { error: "", saved: true };
}

export async function saveCustomMenuItem(_previous: CustomMenuFormState, form: FormData): Promise<CustomMenuFormState> {
  await requireActiveUser("MANAGER");
  try {
    const customMenuId = z.string().min(1).parse(form.get("customMenuId"));
    const id = String(form.get("id") || "");
    const data = lineSchema.parse({
      recipeId: field(form, "recipeId"), section: field(form, "section") || "Mains",
      menuTitle: field(form, "menuTitle"), menuDescription: field(form, "menuDescription"),
      portionQty: field(form, "portionQty"), portionUnit: field(form, "portionUnit"),
      totalQty: field(form, "totalQty"), totalUnit: field(form, "totalUnit"),
      sortOrder: field(form, "sortOrder") || 0,
    });
    if (!(data.portionQty && data.portionQty > 0) && !(data.totalQty && data.totalQty > 0)) {
      return { error: "Enter a portion per guest or a fixed total.", saved: false };
    }
    await prisma.$transaction(async (tx) => {
      // Bind the dish to its actual menu rather than trusting a submitted id.
      if (id) {
        const existing = await tx.customMenuItem.findFirst({ where: { id, customMenuId } });
        if (!existing) throw new Error("This dish is no longer on the menu. Refresh the page.");
        await tx.customMenuItem.update({ where: { id }, data });
      } else {
        await tx.customMenuItem.create({ data: { ...data, customMenuId } });
      }
      await tx.customMenu.update({ where: { id: customMenuId }, data: { updatedAt: new Date() } });
    });
    refresh(customMenuId);
    return { error: "", saved: true };
  } catch (error) {
    return { error: message(error), saved: false };
  }
}

export async function removeCustomMenuItem(form: FormData) {
  await requireActiveUser("MANAGER");
  const customMenuId = z.string().min(1).parse(form.get("customMenuId"));
  const id = z.string().min(1).parse(form.get("id"));
  await prisma.$transaction([
    prisma.customMenuItem.deleteMany({ where: { id, customMenuId } }),
    prisma.customMenu.update({ where: { id: customMenuId }, data: { updatedAt: new Date() } }),
  ]);
  refresh(customMenuId);
}

// Start next year's version of a recurring one-off from this one.
export async function duplicateCustomMenu(form: FormData) {
  await requireActiveUser("MANAGER");
  const id = z.string().min(1).parse(form.get("id"));
  const source = await prisma.customMenu.findUnique({ where: { id }, include: { items: true } });
  if (!source) redirect("/custom-menus");
  const copy = await prisma.customMenu.create({
    data: {
      name: `${source.name} (copy)`.slice(0, 200), subtitle: source.subtitle, date: null, serviceTime: source.serviceTime,
      venueId: source.venueId, guestCount: source.guestCount, pricePerGuest: source.pricePerGuest, targetFcp: source.targetFcp,
      status: "DRAFT", notes: source.notes, serviceNotes: source.serviceNotes,
      items: {
        create: source.items.map((item) => ({
          recipeId: item.recipeId, section: item.section, menuTitle: item.menuTitle, menuDescription: item.menuDescription,
          portionQty: item.portionQty, portionUnit: item.portionUnit, totalQty: item.totalQty, totalUnit: item.totalUnit, sortOrder: item.sortOrder,
        })),
      },
    },
  });
  refresh();
  redirect(`/custom-menus/${copy.id}`);
}

export async function deleteCustomMenu(form: FormData) {
  await requireActiveUser("MANAGER");
  const id = z.string().min(1).parse(form.get("id"));
  if (form.get("confirm") !== "delete") throw new Error("Type delete to confirm.");
  await prisma.customMenu.deleteMany({ where: { id } });
  refresh();
  redirect("/custom-menus");
}
