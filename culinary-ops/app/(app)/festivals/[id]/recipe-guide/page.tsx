import { RecipePrintSettings } from "@/components/RecipeDossier";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { buildForecast } from "@/lib/menus/festival";
import { PrintButton } from "@/components/PrintButton";
import { buildRecipeTree, recipeTreeSelect } from "@/components/RecipeBuild";
import { FestivalTabs } from "../FestivalTabs";
import { FestivalRecipeGuide } from "../FestivalRecipeGuide";

export default async function FestivalRecipeGuidePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser();

  const [festival, recipeRows] = await Promise.all([
    prisma.festival.findUnique({
      where: { id },
      include: {
        menuItems: {
          include: {
            tent: { select: { name: true } },
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    }),
    prisma.recipe.findMany({ select: recipeTreeSelect }),
  ]);
  if (!festival) notFound();

  const forecast = buildForecast(
    { attendance: festival.expectedAttendance, captureRate: festival.captureRate, bufferPct: festival.bufferPct },
    festival.menuItems.map((mi) => ({
      id: mi.id,
      mixPct: mi.mixPct,
      price: mi.price,
      chefOverride: mi.chefOverride,
      bufferPctOverride: mi.bufferPctOverride,
    })),
  );
  const rowById = new Map(forecast.rows.map((r) => [r.id, r]));

  const byId = buildRecipeTree(recipeRows);
  return (
    <div className="recipe-print recipe-packet mx-auto max-w-[8.5in]">
      <RecipePrintSettings />
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href={`/festivals/${festival.id}`} className="text-sm text-blue-600 hover:underline">
          ← {festival.name}
        </Link>
        <PrintButton label="Print recipe guide" />
      </div>

      <div className="no-print">
        <FestivalTabs festivalId={festival.id} />
      </div>

      <FestivalRecipeGuide festival={festival} byId={byId} rowById={rowById} />
    </div>
  );
}
