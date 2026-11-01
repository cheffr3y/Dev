import { BanquetRevision, type BanquetRevisionData } from "./BanquetRevision";
import { aggregateSetup, CATEGORY_LABELS, readSetup, resolveSetup, setupWarnings, type BanquetSetup, type SetupMenuItem, type SetupResource } from "../lib/banquets/banquet-setup";

export type SetupEvent = {
  name: string; venue: string; date: string; guestCount: number; timeLabel: string | null;
  location: string | null; areas: string | null; setupNotes: string | null; specialInstructions: string | null;
};
export function BanquetSetupPacket({ banquet, menu, revisionData }: {
  banquet: Omit<SetupEvent, "venue" | "date"> & { venue: { name: string }; date: Date; setupPlan: unknown; setupRevision: number };
  menu: SetupMenuItem[]; revisionData?: BanquetRevisionData | null;
}) {
  const plan = readSetup(banquet.setupPlan);
  if (!plan.stations.length) return <BanquetRevision data={revisionData} />;
  return <div className="packet-setup-section">
    <BanquetSetupSheet revisionData={revisionData} plan={plan} menu={menu} revision={banquet.setupRevision}
      event={{ ...banquet, venue: banquet.venue.name, date: banquet.date.toLocaleDateString("en-US", { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" }) }} />
  </div>;
}
function ResourceText({ resources }: { resources: SetupResource[] }) {
  return <>{resources.map(r => `${r.qty} × ${r.name}`).join(" · ") || "—"}</>;
}
export function BanquetSetupSheet({ plan: rawPlan, menu, event, revision, draft = false, revisionData }: {
  plan: BanquetSetup; menu: SetupMenuItem[]; event: SetupEvent; revision: number; draft?: boolean; revisionData?: BanquetRevisionData | null;
}) {
  const plan = resolveSetup(rawPlan, menu);
  const pulls = aggregateSetup(plan);
  const warnings = setupWarnings(plan, menu);
  return <article className="banquet-setup-sheet atelier-paper">
    <header className="banquet-setup-heading">
      <div className="flex justify-between gap-3 text-xs uppercase tracking-widest"><span>Mise · Banquet setup</span><span>{draft ? "UNSAVED DRAFT" : `Revision ${revision}`}</span></div>
      <h2 className="mt-3 font-display text-3xl">{event.name}</h2>
      <p className="mt-2 text-sm">{event.date} · {event.guestCount} guests · {event.venue}</p>
      <p className="text-sm">{[event.location, event.areas, event.timeLabel].filter(Boolean).join(" · ") || "Service time / room to be confirmed"}</p>
      <p className="mt-2 text-xs">Setup & vessel pull sheet · Equipment quantities are entered separately from food ordered.</p>
    </header>
    <BanquetRevision data={revisionData} />
    {warnings.length > 0 && <div className="setup-review mt-4 border border-amber-400 p-3 text-xs">
      <strong>Setup review needed</strong><ul className="mt-1 list-disc pl-4">{warnings.map(w => <li key={w}>{w}</li>)}</ul>
    </div>}
    {!plan.stations.length && <p className="my-4 text-sm">No setup stations have been planned.</p>}
    {plan.stations.map(station => <section key={station.id} className="print-station-group mt-5">
      <h3 className="setup-station-heading bg-[#eaeee6] px-3 py-2 font-semibold">{station.name}{station.serviceTime && <span className="ml-3 text-sm font-normal">{station.serviceTime}</span>}</h3>
      {station.notes && <p className="my-2 whitespace-pre-wrap text-sm">{station.notes}</p>}
      <table className="setup-table">
        <thead><tr><th>Food / ordered amount</th><th>Vessels & pans</th><th>Equipment</th><th>Serving utensils</th></tr></thead>
        <tbody>{station.items.map(item => {
          const linked = menu.find(m => m.id === item.menuItemId);
          return <tr key={item.id}>
            <td><strong>{item.food}</strong>{linked && <div>{linked.orderedQty} {linked.unit} ordered</div>}{item.notes && <p className="mt-1 whitespace-pre-wrap">{item.notes}</p>}</td>
            {(["vessel", "equipment", "utensil"] as const).map(category => <td key={category}><ResourceText resources={item.resources.filter(r => r.category === category)} /></td>)}
          </tr>;
        })}</tbody>
      </table>
      {!!station.resources.length && <p className="mt-2 text-sm"><strong>Shared station equipment: </strong><ResourceText resources={station.resources} /></p>}
    </section>)}
    {(event.setupNotes || event.specialInstructions) && <div className="mt-5 border-t pt-3 text-sm">
      {event.setupNotes && <p className="whitespace-pre-wrap"><strong>Setup notes: </strong>{event.setupNotes}</p>}
      {event.specialInstructions && <p className="mt-2 whitespace-pre-wrap"><strong>Special instructions: </strong>{event.specialInstructions}</p>}
    </div>}
    <section className="setup-pull-section mt-6">
      <h3 className="text-lg font-semibold">Consolidated pull checklist</h3>
      <p className="mb-2 text-xs">Check each line after verifying its full quantity. Shared equipment is counted once where entered.</p>
      <table className="setup-table">
        <thead><tr><th className="w-16">Pulled</th><th>Item</th><th className="w-14">Qty</th><th>Station allocation</th></tr></thead>
        <tbody>{(["vessel", "equipment", "utensil"] as const).flatMap(category => {
          const rows = pulls.filter(p => p.category === category);
          return rows.length ? [
            <tr key={category}><th colSpan={4} className="bg-[#f4f1ea] text-left">{CATEGORY_LABELS[category]}</th></tr>,
            ...rows.map(p => <tr key={p.key}>
              <td className="print-write-in"><span className="setup-check">{plan.packed[p.key] === p.signature ? "✓" : "[  ]"}</span></td>
              <td>{p.name}</td><td className="font-semibold">{p.qty}</td><td>{p.allocations.join("; ")}</td>
            </tr>),
          ] : [];
        })}</tbody>
      </table>
      {!pulls.length && <p className="my-3 text-sm">No equipment quantities entered.</p>}
      <p className="print-write-in mt-4 text-xs">Pulled by: ____________________ &nbsp; Verified by: ____________________ &nbsp; Time: __________</p>
    </section>
  </article>;
}
