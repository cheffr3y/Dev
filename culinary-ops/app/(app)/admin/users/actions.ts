"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Valid email required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["ADMIN", "MANAGER", "STAFF"]).default("STAFF"),
  homeVenueId: z.string().trim().optional(),
});

export async function createUser(formData: FormData) {
  await requireRole("ADMIN");
  const d = createSchema.parse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role") || "STAFF",
    homeVenueId: formData.get("homeVenueId") || undefined,
  });
  const existing = await prisma.user.findUnique({ where: { email: d.email.toLowerCase() } });
  if (existing) throw new Error("A user with that email already exists.");
  await prisma.user.create({
    data: {
      name: d.name,
      email: d.email.toLowerCase(),
      passwordHash: await bcrypt.hash(d.password, 10),
      role: d.role,
      homeVenueId: d.homeVenueId || null,
    },
  });
  revalidatePath("/admin/users");
}

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  role: z.enum(["ADMIN", "MANAGER", "STAFF"]),
  homeVenueId: z.string().trim().optional(),
  password: z.string().optional(),
});

export async function updateUser(formData: FormData) {
  await requireRole("ADMIN");
  const d = updateSchema.parse({
    id: formData.get("id"),
    name: formData.get("name"),
    role: formData.get("role"),
    homeVenueId: formData.get("homeVenueId") || undefined,
    password: formData.get("password") || undefined,
  });
  const data: Record<string, unknown> = {
    name: d.name,
    role: d.role,
    homeVenueId: d.homeVenueId || null,
  };
  if (d.password && d.password.length >= 6) {
    data.passwordHash = await bcrypt.hash(d.password, 10);
  }
  await prisma.user.update({ where: { id: d.id }, data });
  revalidatePath("/admin/users");
}

export async function deleteUser(formData: FormData) {
  const me = await requireRole("ADMIN");
  const id = String(formData.get("id"));
  if (id === me.id) throw new Error("You cannot delete your own account.");
  await prisma.user.delete({ where: { id } });
  revalidatePath("/admin/users");
}
