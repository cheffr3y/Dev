"use server";
// The former stock-ledger actions are deliberately retired, including old form replays.
// All current writes pass through prep-orders/workflow-actions.ts.
export async function retiredStockAction() {
  throw new Error("This action has been replaced. Open Prep Orders → Today.");
}
