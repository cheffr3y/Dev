import { pulseDates } from "../dashboard/morning-pulse";
import { defaultPrepReportRange } from "../prep/prep-report";

export type CommandAction = {
  kind: "action"; id: string; name: string; meta: string; href: string;
  behavior?: "download"; keywords: string;
};

export function commandActions(role: "ADMIN" | "MANAGER" | "STAFF", now = new Date()): CommandAction[] {
  const { day, week } = pulseDates(now);
  const accountingFrom = defaultPrepReportRange(now).from;
  const actions: CommandAction[] = [{
    kind: "action", id: "print-banquet-week", name: "Print This Week’s Banquet Packet", meta: "Print · Mon–Sun",
    href: `/banquets/week/${week}/packet?print=1`, keywords: "beo weekly kitchen clipboard",
  }];
  if (role === "ADMIN") actions.push({
    kind: "action", id: "export-accounting", name: "Export Prep Accounting XLSX", meta: "Download · Sun–today",
    href: `/prep-orders/report/export-xlsx?from=${accountingFrom}&to=${day}`, behavior: "download", keywords: "excel spreadsheet transfers accounting week",
  }, {
    kind: "action", id: "daily-closeout", name: "Open Daily Closeout", meta: "Today",
    href: `/prep-orders/closeout?date=${day}`, keywords: "prep worksheet finish day",
  });
  if (role !== "STAFF") actions.push({
    kind: "action", id: "merge-items", name: "Merge Duplicate Items", meta: "Review & compare",
    href: "/items/cleanup", keywords: "ingredients cleanup consolidation",
  }, {
    kind: "action", id: "new-recipe", name: "New Recipe", meta: "Create",
    href: "/recipes?new=1#new-recipe", keywords: "add build dish",
  });
  actions.push({
    kind: "action", id: "daily-prep", name: "Open Daily Prep", meta: "Today",
    href: `/prep-orders?date=${day}`, keywords: "orders production",
  });
  return actions;
}
