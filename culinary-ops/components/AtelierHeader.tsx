import { LocalTime } from "./LocalTime";

export function AtelierHeader({ title, venue, date, guests, runTime, kicker = "Culinary Operations" }: {
  title: string; venue: string; date?: Date; guests: number; runTime?: string | null; kicker?: string;
}) {
  return <header className="atelier-header mb-6 border-t-4 border-[#2C3E35] pt-3">
    <div className="flex justify-between gap-4 border-b border-[#E2DDD5] pb-2 font-mono text-[9px] uppercase tracking-widest text-zinc-500"><span>MISE // CULINARY ARCHIVE</span><span>{venue}</span></div>
    <p className="mt-4 font-display text-lg italic text-gold">{kicker}</p>
    <h1 className="mt-1 font-display text-4xl leading-tight text-[#2C3E35]">{title}</h1>
    <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-y border-[#E2DDD5] py-3 font-mono text-[10px] text-zinc-600"><span>{date ? <>Service <LocalTime date={date} mode="date" /></> : "Menu launch"}</span><span>{guests} {date ? "guests" : "baseline covers"}</span><span>Run time: {runTime || "To be confirmed"}</span></div>
  </header>;
}
