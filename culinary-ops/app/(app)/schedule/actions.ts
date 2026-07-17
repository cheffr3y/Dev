"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { addDays, isoDate, startOfUtcWeek } from "@/lib/schedule";

// A shift/note change ripples to the week grid and its print view. Derive the
// week from the affected day so we revalidate exactly the page that shows it.
function revalidateWeekOf(date: Date) {
  const week = isoDate(startOfUtcWeek(date));
  revalidatePath(`/schedule/${week}`);
  revalidatePath(`/schedule/${week}/print`);
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/; // 24h "HH:MM"
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function dayToDate(raw: unknown): Date {
  const s = String(raw ?? "");
  if (!DAY.test(s)) throw new Error("Invalid date.");
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date.");
  return d;
}

// --- Cooks (roster) -------------------------------------------------------

const cookSchema = z.object({
  venueId: z.string().min(1),
  name: z.string().trim().min(1, "Name is required"),
  role: z.string().trim().optional(),
  phone: z.string().trim().optional(),
});

export async function createCook(formData: FormData) {
  await requireRole("MANAGER");
  const d = cookSchema.parse({
    venueId: formData.get("venueId"),
    name: formData.get("name"),
    role: formData.get("role") || undefined,
    phone: formData.get("phone") || undefined,
  });
  // Append below the existing roster.
  const count = await prisma.cook.count({ where: { venueId: d.venueId } });
  await prisma.cook.create({
    data: {
      venueId: d.venueId,
      name: d.name,
      role: d.role || null,
      phone: d.phone || null,
      sortOrder: count,
    },
  });
  revalidatePath("/schedule/cooks");
}

const updateCookSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, "Name is required"),
  role: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  active: z.coerce.boolean().default(true),
});

export async function updateCook(formData: FormData) {
  await requireRole("MANAGER");
  const d = updateCookSchema.parse({
    id: formData.get("id"),
    name: formData.get("name"),
    role: formData.get("role") || undefined,
    phone: formData.get("phone") || undefined,
    // Unchecked checkboxes are absent from FormData → false.
    active: formData.get("active") != null,
  });
  await prisma.cook.update({
    where: { id: d.id },
    data: { name: d.name, role: d.role || null, phone: d.phone || null, active: d.active },
  });
  revalidatePath("/schedule/cooks");
}

// Toggle a cook on/off the active roster without losing their shift history.
export async function setCookActive(formData: FormData) {
  await requireRole("MANAGER");
  const id = String(formData.get("id"));
  const active = String(formData.get("active")) === "true";
  await prisma.cook.update({ where: { id }, data: { active } });
  revalidatePath("/schedule/cooks");
}

// Deleting a cook removes their shifts (cascade). History goes with them, so
// prefer deactivating; delete is for roster mistakes.
export async function deleteCook(formData: FormData) {
  await requireRole("MANAGER");
  const id = String(formData.get("id"));
  await prisma.cook.delete({ where: { id } });
  revalidatePath("/schedule/cooks");
}

// --- Shifts ---------------------------------------------------------------

const shiftSchema = z.object({
  cookId: z.string().min(1),
  date: z.string().regex(DAY, "Invalid date"),
  kind: z.enum(["WORKING", "OFF"]).default("WORKING"),
  start: z.string().trim().optional(),
  end: z.string().trim().optional(),
  role: z.string().trim().optional(),
  note: z.string().trim().optional(),
});

// Create/update one cook's shift for one day. A WORKING save with no times,
// role, or note is treated as "clear this cell" and deletes the shift, so the
// grid never accumulates empty rows.
export async function upsertShift(formData: FormData) {
  await requireRole("MANAGER");
  const d = shiftSchema.parse({
    cookId: formData.get("cookId"),
    date: formData.get("date"),
    kind: formData.get("kind") || "WORKING",
    start: formData.get("start") || undefined,
    end: formData.get("end") || undefined,
    role: formData.get("role") || undefined,
    note: formData.get("note") || undefined,
  });

  const date = dayToDate(d.date);
  const cook = await prisma.cook.findUnique({ where: { id: d.cookId }, select: { id: true } });
  if (!cook) throw new Error("Cook not found.");

  if (d.kind === "OFF") {
    await prisma.shift.upsert({
      where: { cookId_date: { cookId: d.cookId, date } },
      create: { cookId: d.cookId, date, kind: "OFF", note: d.note || null },
      update: { kind: "OFF", start: null, end: null, role: null, note: d.note || null },
    });
    revalidateWeekOf(date);
    return;
  }

  const start = d.start || null;
  const end = d.end || null;
  if (start && !HHMM.test(start)) throw new Error("Start time must be HH:MM.");
  if (end && !HHMM.test(end)) throw new Error("End time must be HH:MM.");

  // Nothing entered → clear the cell.
  if (!start && !end && !d.role && !d.note) {
    await prisma.shift.deleteMany({ where: { cookId: d.cookId, date } });
    revalidateWeekOf(date);
    return;
  }

  await prisma.shift.upsert({
    where: { cookId_date: { cookId: d.cookId, date } },
    create: { cookId: d.cookId, date, kind: "WORKING", start, end, role: d.role || null, note: d.note || null },
    update: { kind: "WORKING", start, end, role: d.role || null, note: d.note || null },
  });
  revalidateWeekOf(date);
}

export async function clearShift(formData: FormData) {
  await requireRole("MANAGER");
  const cookId = String(formData.get("cookId"));
  const date = dayToDate(formData.get("date"));
  await prisma.shift.deleteMany({ where: { cookId, date } });
  revalidateWeekOf(date);
}

// Copy the previous week's shifts into this week for the venue's active cooks.
// Uses the (cookId, date) unique constraint to skip any cell already filled, so
// it never overwrites edits you've already made this week.
export async function copyPreviousWeek(formData: FormData) {
  await requireRole("MANAGER");
  const venueId = String(formData.get("venueId"));
  const weekStart = dayToDate(formData.get("weekStart"));
  const prevStart = addDays(weekStart, -7);
  const prevEnd = addDays(prevStart, 7);

  const prior = await prisma.shift.findMany({
    where: {
      date: { gte: prevStart, lt: prevEnd },
      cook: { venueId, active: true },
    },
  });

  if (prior.length > 0) {
    await prisma.shift.createMany({
      data: prior.map((s) => ({
        cookId: s.cookId,
        date: addDays(s.date, 7),
        kind: s.kind,
        start: s.start,
        end: s.end,
        role: s.role,
        note: s.note,
      })),
      skipDuplicates: true,
    });
  }
  revalidateWeekOf(weekStart);
}

// --- Notes ----------------------------------------------------------------

const dayNoteSchema = z.object({
  venueId: z.string().min(1),
  date: z.string().regex(DAY, "Invalid date"),
  eventName: z.string().trim().optional(),
  people: z.coerce.number().int().nonnegative().optional(),
  time: z.string().trim().optional(),
  location: z.string().trim().optional(),
  body: z.string().trim().optional(),
});

// Upsert a day's structured event/note; clearing every field removes it.
export async function upsertDayNote(formData: FormData) {
  await requireRole("MANAGER");
  const d = dayNoteSchema.parse({
    venueId: formData.get("venueId"),
    date: formData.get("date"),
    eventName: formData.get("eventName") || undefined,
    people: formData.get("people") || undefined,
    time: formData.get("time") || undefined,
    location: formData.get("location") || undefined,
    body: formData.get("body") || undefined,
  });
  const date = dayToDate(d.date);
  const isEmpty = !d.eventName && d.people === undefined && !d.time && !d.location && !d.body;
  if (isEmpty) {
    await prisma.dayNote.deleteMany({ where: { venueId: d.venueId, date } });
  } else {
    const data = {
      eventName: d.eventName || null,
      people: d.people ?? null,
      time: d.time || null,
      location: d.location || null,
      body: d.body || null,
    };
    await prisma.dayNote.upsert({
      where: { venueId_date: { venueId: d.venueId, date } },
      create: { venueId: d.venueId, date, ...data },
      update: data,
    });
  }
  revalidateWeekOf(date);
}

const weekNoteSchema = z.object({
  venueId: z.string().min(1),
  weekStart: z.string().regex(DAY, "Invalid date"),
  body: z.string().trim().optional(),
});

// Upsert the week's announcement block; an empty body clears it.
export async function upsertWeekNote(formData: FormData) {
  await requireRole("MANAGER");
  const d = weekNoteSchema.parse({
    venueId: formData.get("venueId"),
    weekStart: formData.get("weekStart"),
    body: formData.get("body") || undefined,
  });
  const weekStart = dayToDate(d.weekStart);
  if (!d.body) {
    await prisma.scheduleNote.deleteMany({ where: { venueId: d.venueId, weekStart } });
  } else {
    await prisma.scheduleNote.upsert({
      where: { venueId_weekStart: { venueId: d.venueId, weekStart } },
      create: { venueId: d.venueId, weekStart, body: d.body },
      update: { body: d.body },
    });
  }
  revalidateWeekOf(weekStart);
}
