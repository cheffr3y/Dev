import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser, hasRole } from "@/lib/session";
import { getActiveVenue } from "@/lib/venue";
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader } from "@/components/ui";
import { createCook, deleteCook, setCookActive, updateCook } from "../actions";

export default async function CooksPage() {
  const user = await requireUser();
  const canEdit = hasRole(user, "MANAGER");
  const { active: venue } = await getActiveVenue(user.homeVenueId);

  if (!venue) {
    return (
      <div>
        <PageHeader title="Kitchen Roster" />
        <EmptyState title="No venue yet" hint="Create a venue before adding cooks." />
      </div>
    );
  }

  const cooks = await prisma.cook.findMany({
    where: { venueId: venue.id },
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { shifts: true } } },
  });

  const activeCooks = cooks.filter((c) => c.active);
  const inactiveCooks = cooks.filter((c) => !c.active);

  return (
    <div>
      <div className="mb-4">
        <Link href="/schedule" className="text-sm text-blue-600 hover:underline">
          ← Back to schedule
        </Link>
      </div>

      <PageHeader
        title="Kitchen Roster"
        subtitle={`${venue.name} · ${activeCooks.length} active cook${activeCooks.length === 1 ? "" : "s"}`}
      />

      {canEdit && (
        <Card className="mb-6 p-4">
          <form action={createCook} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
            <input type="hidden" name="venueId" value={venue.id} />
            <Field label="Name">
              <Input name="name" required placeholder="Jordan Rivera" />
            </Field>
            <Field label="Default station (optional)">
              <Input name="role" placeholder="Line, Prep, Grill…" />
            </Field>
            <Field label="Phone (optional)">
              <Input name="phone" placeholder="555-0100" />
            </Field>
            <Button type="submit">Add cook</Button>
          </form>
        </Card>
      )}

      {cooks.length === 0 ? (
        <EmptyState title="No cooks yet" hint={canEdit ? "Add your first cook above." : "A manager needs to add cooks."} />
      ) : (
        <div className="space-y-6">
          <RosterList cooks={activeCooks} canEdit={canEdit} />
          {inactiveCooks.length > 0 && (
            <div>
              <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.02em] text-zinc-500">Inactive</h2>
              <RosterList cooks={inactiveCooks} canEdit={canEdit} muted />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type CookRow = {
  id: string;
  name: string;
  role: string | null;
  phone: string | null;
  active: boolean;
  _count: { shifts: number };
};

function RosterList({ cooks, canEdit, muted }: { cooks: CookRow[]; canEdit: boolean; muted?: boolean }) {
  return (
    <div className="space-y-3">
      {cooks.map((cook) => (
        <Card key={cook.id} className={muted ? "p-4 opacity-70" : "p-4"}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-ink">{cook.name}</h3>
                {!cook.active && <Badge color="gray">inactive</Badge>}
              </div>
              <p className="mt-0.5 text-sm text-zinc-500">
                {cook.role ?? "No default station"}
                {cook.phone ? ` · ${cook.phone}` : ""}
                {` · ${cook._count.shifts} shift${cook._count.shifts === 1 ? "" : "s"} on file`}
              </p>
            </div>

            {canEdit && (
              <div className="flex items-center gap-2">
                <form action={setCookActive}>
                  <input type="hidden" name="id" value={cook.id} />
                  <input type="hidden" name="active" value={cook.active ? "false" : "true"} />
                  <button type="submit" className="rounded-full border border-hairline px-3 py-1.5 text-sm text-zinc-600 transition-colors hover:border-ink hover:text-ink">
                    {cook.active ? "Deactivate" : "Reactivate"}
                  </button>
                </form>
                <form action={deleteCook}>
                  <input type="hidden" name="id" value={cook.id} />
                  <button type="submit" className="rounded-full border border-red-200 px-3 py-1.5 text-sm text-red-600 transition-colors hover:border-red-600">
                    Delete
                  </button>
                </form>
              </div>
            )}
          </div>

          {canEdit && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-blue-600">Edit details</summary>
              <form action={updateCook} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <input type="hidden" name="id" value={cook.id} />
                <Field label="Name">
                  <Input name="name" required defaultValue={cook.name} />
                </Field>
                <Field label="Default station">
                  <Input name="role" defaultValue={cook.role ?? ""} placeholder="Line, Prep, Grill…" />
                </Field>
                <Field label="Phone">
                  <Input name="phone" defaultValue={cook.phone ?? ""} placeholder="555-0100" />
                </Field>
                <label className="flex items-center gap-2 text-sm text-zinc-700">
                  <input type="checkbox" name="active" defaultChecked={cook.active} className="h-4 w-4 rounded border-zinc-300" />
                  Active on the roster
                </label>
                <div className="sm:col-span-3">
                  <Button type="submit" variant="secondary">
                    Save changes
                  </Button>
                </div>
              </form>
            </details>
          )}

          {cook._count.shifts > 0 && !cook.active && (
            <p className="mt-2 text-xs text-zinc-400">Deleting removes this cook and their {cook._count.shifts} shift record(s).</p>
          )}
        </Card>
      ))}
    </div>
  );
}
