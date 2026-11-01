import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { saveWorkspaceCell } from "@/lib/workspace-editing";
import { buildCostMap } from "@/lib/costing";
import { effectiveAllergens } from "@/lib/allergens";

async function actor() {
  const session = await getCurrentUser();
  return session ? prisma.user.findUnique({ where: { id: session.id }, select: { id: true, role: true } }) : null;
}
export async function PATCH(request: Request) {
  const user = await actor();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in again before saving." }, { status: 401 });
  if (user.role === "STAFF") return NextResponse.json({ ok: false, error: "Manager access is required to edit." }, { status: 403 });
  // Cookie auth must not accept cross-origin writes.
  const origin = request.headers.get("origin");
  if (origin) {
    let host: string;
    try { host = new URL(origin).host; } catch { return NextResponse.json({ ok: false, error: "Invalid request origin." }, { status: 403 }); }
    if (origin !== new URL(request.url).origin && host !== request.headers.get("x-forwarded-host") && host !== request.headers.get("host")) return NextResponse.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
  }
  let input: unknown;
  try { input = await request.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid edit." }, { status: 400 }); }
  const result = await saveWorkspaceCell(prisma, user.id, input);
  // Route-handler invalidation refreshes future visits without stealing grid focus.
  if (result.ok) revalidatePath("/", "layout");
  return NextResponse.json(result, { status: result.ok ? 200 : "current" in result ? 409 : 400 });
}
export async function GET(request: Request) {
  const user = await actor();
  if (!user) return NextResponse.json({ error: "Sign in again to inspect this record." }, { status: 401 });
  const params = new URL(request.url).searchParams, id = params.get("id") ?? "";
  if (params.get("kind") === "item") {
    const [item, vendors] = await Promise.all([prisma.item.findUnique({ where: { id }, include: { vendor: true } }), prisma.vendor.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })]);
    return item ? NextResponse.json({ kind: "item", item, vendors, canEdit: user.role !== "STAFF" }) : NextResponse.json({ error: "Ingredient no longer exists." }, { status: 404 });
  }
  if (params.get("kind") !== "recipe") return NextResponse.json({ error: "Choose a recipe or ingredient." }, { status: 400 });
  const recipes = await prisma.recipe.findMany({ include: { items: { include: { item: true }, orderBy: [{ sortOrder: "asc" }, { item: { name: "asc" } }] }, components: { include: { child: { select: { name: true } } } } } });
  const recipe = recipes.find(row => row.id === id);
  if (!recipe) return NextResponse.json({ error: "Recipe no longer exists." }, { status: 404 });
  const costs = buildCostMap(recipes);
  return NextResponse.json({ kind: "recipe", recipe, totalCost: costs.get(id) ?? 0, allergenKeys: effectiveAllergens(id, new Map(recipes.map(row => [row.id, row]))), canEdit: user.role !== "STAFF" });
}
