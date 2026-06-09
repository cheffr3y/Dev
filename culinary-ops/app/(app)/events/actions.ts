"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const eventSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  venueId: z.string().min(1),
  date: z.string().min(1, "Date is required"),
  guestCount: z.coerce.number().int().min(0).default(0),
  status: z.enum(["PLANNED", "CONFIRMED", "COMPLETED", "CANCELLED"]).default("PLANNED"),
  location: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

function parseEvent(formData: FormData) {
  const d = eventSchema.parse({
    name: formData.get("name"),
    venueId: formData.get("venueId"),
    date: formData.get("date"),
    guestCount: formData.get("guestCount") || 0,
    status: formData.get("status") || "PLANNED",
    location: formData.get("location") || undefined,
    notes: formData.get("notes") || undefined,
  });
  return {
    name: d.name,
    venueId: d.venueId,
    date: new Date(d.date),
    guestCount: d.guestCount,
    status: d.status,
    location: d.location || null,
    notes: d.notes || null,
  };
}

export async function createEvent(formData: FormData) {
  await requireRole("MANAGER");
  const event = await prisma.event.create({ data: parseEvent(formData) });
  revalidatePath("/events");
  redirect(`/events/${event.id}`);
}

export async function updateEvent(formData: FormData) {
  await requireRole("MANAGER");
  const id = String(formData.get("id"));
  await prisma.event.update({ where: { id }, data: parseEvent(formData) });
  revalidatePath(`/events/${id}`);
}

export async function deleteEvent(formData: FormData) {
  await requireRole("MANAGER");
  const id = String(formData.get("id"));
  await prisma.event.delete({ where: { id } });
  revalidatePath("/events");
  redirect("/events");
}

const menuSchema = z.object({
  eventId: z.string().min(1),
  recipeId: z.string().min(1, "Pick a recipe"),
  plannedServings: z.coerce.number().min(0).default(0),
});

export async function addEventMenuItem(formData: FormData) {
  await requireRole("MANAGER");
  const d = menuSchema.parse({
    eventId: formData.get("eventId"),
    recipeId: formData.get("recipeId"),
    plannedServings: formData.get("plannedServings") || 0,
  });
  await prisma.eventMenuItem.upsert({
    where: { eventId_recipeId: { eventId: d.eventId, recipeId: d.recipeId } },
    create: d,
    update: { plannedServings: d.plannedServings },
  });
  revalidatePath(`/events/${d.eventId}`);
}

export async function updateEventMenuItem(formData: FormData) {
  await requireRole("MANAGER");
  const id = String(formData.get("id"));
  const eventId = String(formData.get("eventId"));
  const plannedServings = z.coerce.number().min(0).parse(formData.get("plannedServings"));
  await prisma.eventMenuItem.update({ where: { id }, data: { plannedServings } });
  revalidatePath(`/events/${eventId}`);
}

export async function removeEventMenuItem(formData: FormData) {
  await requireRole("MANAGER");
  const id = String(formData.get("id"));
  const eventId = String(formData.get("eventId"));
  await prisma.eventMenuItem.delete({ where: { id } });
  revalidatePath(`/events/${eventId}`);
}
