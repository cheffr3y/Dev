import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requirePrepUser } from "@/lib/auth/prep-session";
import { measurementSelect } from "@/lib/ingredients/measurements";
import { specialCostingSchema } from "@/lib/recipes/special-costing";
import { SpecialsWorkspace } from "./workspace";
import { getVenues } from "@/lib/venues/venue";
export default async function SpecialsPage({searchParams}:{searchParams:Promise<{id?:string}>}) {
  const user=await requirePrepUser("MANAGER"), {id}=await searchParams;
  const [items,recipes,venues,drafts]=await Promise.all([
    prisma.item.findMany({select:{id:true,name:true,unit:true,unitCost:true,...measurementSelect},orderBy:{name:"asc"}}),
    prisma.recipe.findMany({select:{id:true,name:true,yieldQty:true,yieldUnit:true,items:{select:{id:true,quantity:true,unit:true,item:{select:{id:true,name:true,unit:true,unitCost:true,...measurementSelect}}}},components:{select:{id:true,childId:true,quantity:true,unit:true,child:{select:{name:true}}}}},orderBy:{name:"asc"}}),
    getVenues(),prisma.specialCosting.findMany({where:{userId:user.id},orderBy:{updatedAt:"desc"}})
  ]);
  const saved=drafts.find(d=>d.id===id), parsed=specialCostingSchema.safeParse(saved?.payload);
  // Dates cross the client boundary as ISO strings.
  return <div className="space-y-4"><h1 className="text-2xl font-semibold">Specials costing</h1><p>Build a one-off dish with ingredients and nested recipes. Prices include reviewed edible yields. Save a private costing without adding recipes to the shared catalog.</p>
    <nav aria-label="Saved special costings" className="no-print flex flex-wrap gap-3"><Link href="/specials" className="text-blue-600 underline">New costing</Link>{drafts.map(d=><Link key={d.id} href={`/specials?id=${d.id}`} className="text-blue-600 underline">{d.name}</Link>)}</nav>
    <SpecialsWorkspace key={saved?.id??"new"} initial={parsed.success?parsed.data:null} savedId={saved?.id} savedRevision={saved?.revision} defaultVenueId={user.homeVenueId??""} items={JSON.parse(JSON.stringify(items))} recipes={JSON.parse(JSON.stringify(recipes))} venues={venues.map(v=>({id:v.id,name:v.name}))}/></div>;
}
