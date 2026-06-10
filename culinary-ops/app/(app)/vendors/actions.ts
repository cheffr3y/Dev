"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  contact: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

function parse(formData: FormData) {
  const d = schema.parse({
    name: formData.get("name"),
    contact: formData.get("contact") || undefined,
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || undefined,
    notes: formData.get("notes") || undefined,
  });
  return {
    name: d.name,
    contact: d.contact || null,
    phone: d.phone || null,
    email: d.email || null,
    notes: d.notes || null,
  };
}

export async function createVendor(formData: FormData) {
  await requireRole("MANAGER");
  await prisma.vendor.create({ data: parse(formData) });
  revalidatePath("/vendors");
}

export async function updateVendor(formData: FormData) {
  await requireRole("MANAGER");
  const id = String(formData.get("id"));
  await prisma.vendor.update({ where: { id }, data: parse(formData) });
  revalidatePath("/vendors");
}

export async function deleteVendor(formData: FormData) {
  await requireRole("MANAGER");
  const id = String(formData.get("id"));
  await prisma.vendor.delete({ where: { id } });
  revalidatePath("/vendors");
}
