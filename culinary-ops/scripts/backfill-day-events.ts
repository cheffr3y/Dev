// One-time backfill: copy each existing DayNote (the old one-event-per-day
// model) into a DayEvent row so no scheduled event is lost when the app moves
// to the multi-event DayEvent table.
//
// Run once after `npm run db:push` adds the DayEvent table:
//   npm run db:backfill-day-events
//
// Idempotent: skips any (venue, date) that already has DayEvents, so re-running
// is safe and it never duplicates events a manager has already re-saved.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const notes = await prisma.dayNote.findMany({
    select: {
      venueId: true,
      date: true,
      eventName: true,
      people: true,
      time: true,
      location: true,
      body: true,
    },
  });

  let created = 0;
  let skipped = 0;

  for (const n of notes) {
    const existing = await prisma.dayEvent.count({ where: { venueId: n.venueId, date: n.date } });
    if (existing > 0) {
      skipped += 1;
      continue;
    }
    // Skip fully-empty notes — they carry no event.
    if (!n.eventName && n.people === null && !n.time && !n.location && !n.body) {
      skipped += 1;
      continue;
    }
    await prisma.dayEvent.create({
      data: {
        venueId: n.venueId,
        date: n.date,
        eventName: n.eventName,
        people: n.people,
        time: n.time,
        location: n.location,
        body: n.body,
        sortOrder: 0,
      },
    });
    created += 1;
  }

  console.log(`Backfill complete: ${created} DayEvent(s) created, ${skipped} skipped (already migrated or empty).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
