import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { getVenues } from "@/lib/venue";
import { Badge, Button, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { createUser, updateUser, deleteUser } from "./actions";

const ROLES = ["STAFF", "MANAGER", "ADMIN"] as const;
const ROLE_COLOR: Record<string, "gray" | "blue" | "green"> = {
  STAFF: "gray",
  MANAGER: "blue",
  ADMIN: "green",
};

export default async function UsersPage() {
  const me = await requireRole("ADMIN");
  const [users, venues] = await Promise.all([
    prisma.user.findMany({ include: { homeVenue: true }, orderBy: { name: "asc" } }),
    getVenues(),
  ]);

  return (
    <div>
      <PageHeader title="Users" subtitle="Team members and their access levels." />

      <details className="mb-5">
        <summary className="cursor-pointer text-sm font-medium text-blue-600">+ Add user</summary>
        <Card className="mt-2 p-4">
          <form action={createUser} className="space-y-3">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <Field label="Name">
                <Input name="name" required placeholder="Jamie Cook" />
              </Field>
              <Field label="Email">
                <Input name="email" type="email" required placeholder="jamie@restaurant.com" />
              </Field>
              <Field label="Temp password">
                <Input name="password" type="text" required placeholder="min 6 chars" />
              </Field>
              <Field label="Role">
                <Select name="role" defaultValue="STAFF">
                  {ROLES.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Home venue">
                <Select name="homeVenueId" defaultValue="">
                  <option value="">— none —</option>
                  {venues.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Button type="submit">Add user</Button>
          </form>
        </Card>
      </details>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 font-medium">Home venue</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {users.map((u) => (
              <tr key={u.id} className="align-top">
                <td className="px-4 py-2.5 font-medium text-zinc-800">
                  {u.name}
                  {u.id === me.id && <span className="ml-1 text-xs text-zinc-400">(you)</span>}
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-blue-600">edit</summary>
                    <form action={updateUser} className="mt-2 space-y-2 rounded-lg bg-zinc-50 p-3">
                      <input type="hidden" name="id" value={u.id} />
                      <Field label="Name">
                        <Input name="name" defaultValue={u.name} />
                      </Field>
                      <div className="grid grid-cols-2 gap-2">
                        <Field label="Role">
                          <Select name="role" defaultValue={u.role}>
                            {ROLES.map((r) => (
                              <option key={r}>{r}</option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Home venue">
                          <Select name="homeVenueId" defaultValue={u.homeVenueId ?? ""}>
                            <option value="">— none —</option>
                            {venues.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.name}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      </div>
                      <Field label="Reset password" hint="Leave blank to keep current">
                        <Input name="password" type="text" placeholder="new password" />
                      </Field>
                      <Button type="submit" variant="secondary">Save</Button>
                    </form>
                  </details>
                </td>
                <td className="px-4 py-2.5 text-zinc-600">{u.email}</td>
                <td className="px-4 py-2.5">
                  <Badge color={ROLE_COLOR[u.role]}>{u.role}</Badge>
                </td>
                <td className="px-4 py-2.5 text-zinc-600">{u.homeVenue?.name ?? "—"}</td>
                <td className="px-4 py-2.5 text-right">
                  {u.id !== me.id && (
                    <form action={deleteUser}>
                      <input type="hidden" name="id" value={u.id} />
                      <button className="text-xs text-red-500 hover:underline">delete</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
