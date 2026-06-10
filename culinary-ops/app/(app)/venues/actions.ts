"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  code: z.string().trim().min(1, "Code is required").max(6),
  address: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

function parse(formData: FormData) {
  const d = schema.parse({
    name: formData.get("name"),
    code: formData.get("code"),
    address: formData.get("address") || undefined,
    notes: formData.get("notes") || undefined,
  });
  return {
    name: d.name,
    code: d.code.toUpperCase(),
    address: d.address || null,
    notes: d.notes || null,
  };
}

export async function createVenue(formData: FormData) {
  await requireRole("MANAGER");
  await prisma.venue.create({ data: parse(formData) });
  revalidatePath("/venues");
}

export async function updateVenue(formData: FormData) {
  await requireRole("MANAGER");
  const id = String(formData.get("id"));
  await prisma.venue.update({ where: { id }, data: parse(formData) });
  revalidatePath("/venues");
}

export async function deleteVenue(formData: FormData) {
  await requireRole("ADMIN");
  const id = String(formData.get("id"));
  await prisma.venue.delete({ where: { id } });
  revalidatePath("/venues");
}
