import { splitStep, joinStep } from "../../lib/recipes/method";

// Reviewed Annex pickup specs. Timing is estimated per order; pesto timing is
// for one standard batch. Existing authored methods are never overwritten.
export const ANNEX_METHODS = {
  BSA: { name: "Plated, Lobster Louie", prepMinutes: 3, cookMinutes: 6, steps: [
    ["Bake Dauphine tots", "Retherm Pommes Dauphine tots at 425°F convection until hot throughout and crisp."],
    ["Dress lobster", "Drain the chilled lobster claw and knuckle meat well and fold gently with Louie Dressing."],
    ["Plate Louie", "Swoosh Green Goddess on a chilled plate and arrange the dressed lobster over it."],
    ["Finish pickup", "Top with the hot crispy tots, garnish with thinly sliced chives, and send immediately."],
  ] },
  PPF: { name: "Plated, 6 piece", prepMinutes: 2, cookMinutes: 6, steps: [
    ["Fry frozen nuggets", "Fry frozen Breaded Chicken Nuggets at 350°F until golden brown and at least 165°F internal; verify the center with a clean probe."],
    ["Drain and season", "Drain on a rack and lightly season while hot."],
    ["Plate six pieces", "Arrange 6 nuggets with 2 oz cultured buttermilk Ranch in a ramekin or swoosh."],
    ["Finish with caviar", "Distribute approximately 3.5 g Paddlefish Caviar across the six nuggets and send immediately."],
  ] },
  PB6: { name: "Plated, Blistered Carrot", prepMinutes: 2, cookMinutes: 5, steps: [
    ["Sear carrots", "Sear Sous Vide Carrots with their bag butter over high heat or open coals until hot, blistered, and glazed."],
    ["Plate pesto", "Spread 2 fl oz Carrot Top Pesto across the plate."],
    ["Arrange carrots", "Arrange the hot glazed carrots over the pesto."],
    ["Finish pickup", "Finish with Rye Sumac Crunch and send immediately while the carrots are hot and the crunch stays crisp."],
  ] },
  PCB: { name: "Plated, Corned Beef Steak Frites", prepMinutes: 3, cookMinutes: 6, steps: [
    ["Season beef", "Season the portioned, previously cooked Corned Beef Chuck Flap / Boneless Short Rib with Montreal Steak Rub."],
    ["Sear beef", "Sear and retherm for immediate service until hot and tender with a charred exterior; follow the cooked component's validated process for the medium-rare service target."],
    ["Fry fries", "Finish Triple Cooked Fries at 355°F for 3–5 min until golden and crisp; drain briefly and salt immediately."],
    ["Warm mustard cream", "Warm 1 fl oz Whole Grain Mustard Cream gently, stirring until smooth."],
    ["Plate steak frites", "Plate the beef and hot fries with Mustard Cream and 0.5 oz drained Pickled Red Cabbage; send immediately."],
  ] },
  CAW: { name: "Carrot Top Pesto", prepMinutes: 15, cookMinutes: 5, steps: [
    ["Prep herbs", "Wash carrot tops and parsley thoroughly, removing coarse stems and any grit."],
    ["Blanch herbs", "Blanch the herbs briefly until bright green, shock in an ice bath, then drain and squeeze dry."],
    ["Toast hazelnuts", "Toast hazelnuts until fragrant and lightly golden; cool before processing."],
    ["Pulse pesto", "Pulse garlic, hazelnuts, lemon zest and juice, and the prepared herbs in a food processor to a coarse paste."],
    ["Emulsify oil", "Stream in olive oil while pulsing; add water as needed for a spoonable texture."],
    ["Season pesto", "Season with Diamond Crystal kosher salt, taste, and transfer to a clean, covered container."],
  ] },
} as const;

export const ANNEX_SERVICE_COPY = {
  PPF: "Luxury chicken pâté nuggets with caviar and cultured buttermilk ranch.",
  PCB: "Corned Beef Steak Frites featuring Foxtown Heritage Meats Corned Beef Chuck Flap / Boneless Short Rib, triple-cooked fries, mustard cream, and pickled red cabbage.",
} as const;

export function cleanedAnnexInstructions(code: string, instructions: string | null) {
  const lines = (instructions ?? "").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (code === "GCS" || code === "SVC") {
    const clean = lines.filter(line => !/^(?:\d+[.)]\s*)?(?:[—–-]\s*)?Migrated notes(?:\s*[—–-])?$/i.test(line)
      && !/^(?:\d+[.)]\s*)?Recipe type:\s*batch$/i.test(line));
    if (code === "GCS") return clean.join("\n");
    const headings = ["Prep Carrots", "Bag Carrots", "Bag & Season", "Seal Bags", "Prepare Water Bath", "Sous Vide", "Sous Vide", "Chill Carrots", "Prepare for Service", "Transfer to Pan", "Glaze for Service", "Season & Serve"];
    return clean.map((line, index) => {
      const parsed = splitStep(line.replace(/^\d+[.)]\s*/, ""));
      return joinStep(parsed.action && !/^Step \d+$/i.test(parsed.action) ? parsed.action : headings[index] ?? "Prepare Carrots", parsed.detail);
    }).join("\n");
  }
  if (code === "GRG") return (instructions ?? "").replace(/crème fraîche/gi, "sour cream");
  return instructions ?? "";
}

export function missingAnnexMethod(code: string, instructions: string | null) {
  if ((instructions ?? "").trim() && instructions?.trim() !== "No method recorded.") return null;
  const spec = ANNEX_METHODS[code as keyof typeof ANNEX_METHODS];
  return spec ? { instructions: spec.steps.map(([action, detail]) => joinStep(action, detail)).join("\n"), prepMinutes: spec.prepMinutes, cookMinutes: spec.cookMinutes } : null;
}
