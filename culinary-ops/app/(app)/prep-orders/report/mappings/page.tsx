import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePrepUser } from "@/lib/prep-session";
import { ACCOUNTING_CATEGORIES } from "@/lib/categories";
import { Button, Input, PageHeader, Card } from "@/components/ui";
import { saveMappings } from "./actions";
export default async function MappingsPage() {
  await requirePrepUser("ADMIN");
  const [mappings, venues] = await Promise.all([prisma.accountingMapping.findMany(), prisma.venue.findMany({ orderBy: { name: "asc" } })]);
  const fields = [...ACCOUNTING_CATEGORIES.map(category => ({ kind: "CATEGORY", key: category, name: category })), ...["Production labor", "Dishwasher labor"].map(name => ({ kind: "LABOR", key: name, name })), ...[{ id: "PRODUCTION", name: "Production source" }, ...venues].map(venue => ({ kind: "VENUE", key: venue.id, name: venue.name }))];
  return <div><Link href="/prep-orders/report" className="text-blue-600">← Accounting</Link><PageHeader title="Accounting codes" subtitle="Optional account numbers and venue cost centers supplied by accounting. Blank codes are flagged as unmapped in exports." /><Card className="p-4"><form action={saveMappings} className="space-y-3">{fields.map(field => <label key={`${field.kind}:${field.key}`} className="grid grid-cols-2 items-center gap-4 text-sm"><span>{field.kind === "VENUE" ? "Venue / cost center" : "GL account"} · {field.name}</span><Input aria-label={`Code for ${field.name}`} name={`${field.kind}:${field.key}`} defaultValue={mappings.find(mapping => mapping.kind === field.kind && mapping.sourceKey === field.key)?.code ?? ""} maxLength={60} /></label>)}<Button>Save accounting codes</Button></form></Card></div>;
}
