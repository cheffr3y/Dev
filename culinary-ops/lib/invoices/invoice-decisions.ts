export function isRemovedInvoiceDecision(facts: unknown): boolean {
  return !!facts && typeof facts === "object" && "action" in facts && facts.action === "remove";
}
