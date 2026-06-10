import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding culinary operations data...");

  // Wipe in dependency order so the seed is idempotent.
  await prisma.eventMenuItem.deleteMany();
  await prisma.event.deleteMany();
  await prisma.orderGuideLine.deleteMany();
  await prisma.orderGuide.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.recipeItem.deleteMany();
  await prisma.recipe.deleteMany();
  await prisma.item.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.user.deleteMany();
  await prisma.venue.deleteMany();

  // --- Venues ---
  const downtown = await prisma.venue.create({
    data: { name: "Downtown Kitchen", code: "DT", address: "120 Market St" },
  });
  const waterfront = await prisma.venue.create({
    data: { name: "Waterfront Grill", code: "WF", address: "8 Harbor Way" },
  });
  const catering = await prisma.venue.create({
    data: { name: "Catering Commissary", code: "CC", address: "44 Industrial Blvd" },
  });

  // --- Users ---
  const pw = await bcrypt.hash("password123", 10);
  await prisma.user.createMany({
    data: [
      { email: "admin@culinaryops.test", name: "Alex Admin", passwordHash: pw, role: "ADMIN", homeVenueId: downtown.id },
      { email: "manager@culinaryops.test", name: "Morgan Manager", passwordHash: pw, role: "MANAGER", homeVenueId: waterfront.id },
      { email: "cook@culinaryops.test", name: "Sam Cook", passwordHash: pw, role: "STAFF", homeVenueId: downtown.id },
    ],
  });

  // --- Vendors ---
  const sysco = await prisma.vendor.create({ data: { name: "Sysco", contact: "Pat Rep", phone: "555-0101" } });
  const produce = await prisma.vendor.create({ data: { name: "Green Valley Produce", contact: "Lee", phone: "555-0202" } });
  const seafood = await prisma.vendor.create({ data: { name: "Harbor Seafood Co.", contact: "Jordan", phone: "555-0303" } });
  const dairy = await prisma.vendor.create({ data: { name: "Hillside Dairy", contact: "Casey", phone: "555-0404" } });

  // --- Items (master catalog) ---
  const items = await Promise.all(
    [
      { name: "Yukon Gold Potatoes", category: "Produce", unit: "lb", unitCost: 0.85, vendorId: produce.id, packSize: "50 lb sack" },
      { name: "Yellow Onions", category: "Produce", unit: "lb", unitCost: 0.6, vendorId: produce.id, packSize: "25 lb bag" },
      { name: "Garlic, peeled", category: "Produce", unit: "lb", unitCost: 3.2, vendorId: produce.id },
      { name: "Roma Tomatoes", category: "Produce", unit: "lb", unitCost: 1.4, vendorId: produce.id },
      { name: "Romaine Hearts", category: "Produce", unit: "case", unitCost: 24.0, vendorId: produce.id, packSize: "12 ct" },
      { name: "Lemons", category: "Produce", unit: "each", unitCost: 0.45, vendorId: produce.id },
      { name: "Fresh Basil", category: "Produce", unit: "lb", unitCost: 9.0, vendorId: produce.id },
      { name: "Chicken Breast, boneless", category: "Protein", unit: "lb", unitCost: 3.75, vendorId: sysco.id },
      { name: "Ground Beef 80/20", category: "Protein", unit: "lb", unitCost: 4.25, vendorId: sysco.id },
      { name: "Salmon Fillet", category: "Protein", unit: "lb", unitCost: 11.5, vendorId: seafood.id },
      { name: "Shrimp 16/20", category: "Protein", unit: "lb", unitCost: 12.0, vendorId: seafood.id },
      { name: "Butter, unsalted", category: "Dairy", unit: "lb", unitCost: 3.6, vendorId: dairy.id },
      { name: "Heavy Cream", category: "Dairy", unit: "qt", unitCost: 4.2, vendorId: dairy.id },
      { name: "Parmesan, grated", category: "Dairy", unit: "lb", unitCost: 8.5, vendorId: dairy.id },
      { name: "Eggs, large", category: "Dairy", unit: "dozen", unitCost: 3.1, vendorId: dairy.id },
      { name: "All-Purpose Flour", category: "Dry Goods", unit: "lb", unitCost: 0.55, vendorId: sysco.id, packSize: "50 lb bag" },
      { name: "Olive Oil, EV", category: "Dry Goods", unit: "L", unitCost: 9.5, vendorId: sysco.id },
      { name: "Kosher Salt", category: "Dry Goods", unit: "lb", unitCost: 0.8, vendorId: sysco.id },
      { name: "Black Pepper, ground", category: "Dry Goods", unit: "lb", unitCost: 7.0, vendorId: sysco.id },
      { name: "Pasta, spaghetti", category: "Dry Goods", unit: "lb", unitCost: 1.1, vendorId: sysco.id },
      { name: "Burger Buns", category: "Bakery", unit: "each", unitCost: 0.35, vendorId: sysco.id, packSize: "8 ct pack" },
      { name: "House Red Wine", category: "Beverage", unit: "bottle", unitCost: 8.0, vendorId: sysco.id },
    ].map((d) => prisma.item.create({ data: d })),
  );

  const byName = (n: string) => {
    const it = items.find((i) => i.name === n);
    if (!it) throw new Error(`seed item not found: ${n}`);
    return it;
  };

  // --- Recipes / Builds ---
  const carbonara = await prisma.recipe.create({
    data: {
      name: "Spaghetti Carbonara",
      category: "Entrée",
      station: "Pasta",
      yieldQty: 4,
      yieldUnit: "servings",
      menuPrice: 19,
      instructions:
        "1. Cook spaghetti in salted water.\n2. Render guanciale (sub bacon).\n3. Whisk eggs + parmesan.\n4. Toss off-heat to emulsify. Finish with black pepper.",
      items: {
        create: [
          { itemId: byName("Pasta, spaghetti").id, quantity: 1, unit: "lb" },
          { itemId: byName("Eggs, large").id, quantity: 0.33, unit: "dozen" },
          { itemId: byName("Parmesan, grated").id, quantity: 0.25, unit: "lb" },
          { itemId: byName("Black Pepper, ground").id, quantity: 0.02, unit: "lb" },
          { itemId: byName("Kosher Salt").id, quantity: 0.02, unit: "lb" },
        ],
      },
    },
  });

  const burger = await prisma.recipe.create({
    data: {
      name: "Classic Smash Burger",
      category: "Entrée",
      station: "Grill",
      yieldQty: 1,
      yieldUnit: "servings",
      menuPrice: 14,
      instructions: "Smash 4oz ball on flat-top, season, flip, cheese, toast bun, build.",
      items: {
        create: [
          { itemId: byName("Ground Beef 80/20").id, quantity: 0.25, unit: "lb" },
          { itemId: byName("Burger Buns").id, quantity: 1, unit: "each" },
          { itemId: byName("Yellow Onions").id, quantity: 0.1, unit: "lb" },
          { itemId: byName("Kosher Salt").id, quantity: 0.01, unit: "lb" },
        ],
      },
    },
  });

  const salmon = await prisma.recipe.create({
    data: {
      name: "Pan-Seared Salmon",
      category: "Entrée",
      station: "Sauté",
      yieldQty: 1,
      yieldUnit: "servings",
      menuPrice: 28,
      instructions: "Season salmon, sear skin-side down in olive oil, baste with butter, finish with lemon.",
      items: {
        create: [
          { itemId: byName("Salmon Fillet").id, quantity: 0.4, unit: "lb" },
          { itemId: byName("Olive Oil, EV").id, quantity: 0.03, unit: "L" },
          { itemId: byName("Butter, unsalted").id, quantity: 0.05, unit: "lb" },
          { itemId: byName("Lemons").id, quantity: 0.5, unit: "each" },
          { itemId: byName("Kosher Salt").id, quantity: 0.01, unit: "lb" },
        ],
      },
    },
  });

  const caesar = await prisma.recipe.create({
    data: {
      name: "Caesar Salad",
      category: "Starter",
      station: "Garde Manger",
      yieldQty: 1,
      yieldUnit: "servings",
      menuPrice: 11,
      instructions: "Toss romaine with dressing, parmesan, croutons.",
      items: {
        create: [
          { itemId: byName("Romaine Hearts").id, quantity: 0.08, unit: "case" },
          { itemId: byName("Parmesan, grated").id, quantity: 0.05, unit: "lb" },
          { itemId: byName("Olive Oil, EV").id, quantity: 0.02, unit: "L" },
          { itemId: byName("Lemons").id, quantity: 0.25, unit: "each" },
        ],
      },
    },
  });

  // --- Inventory per venue (with par levels) ---
  const stockPlan: Array<[string, string, number, number]> = [
    // [venueId, itemName, quantity, par]
    [downtown.id, "Ground Beef 80/20", 12, 20],
    [downtown.id, "Burger Buns", 18, 48],
    [downtown.id, "Pasta, spaghetti", 8, 10],
    [downtown.id, "Parmesan, grated", 3, 4],
    [downtown.id, "Eggs, large", 6, 8],
    [downtown.id, "Kosher Salt", 9, 5],
    [waterfront.id, "Salmon Fillet", 14, 12],
    [waterfront.id, "Shrimp 16/20", 6, 10],
    [waterfront.id, "Lemons", 40, 60],
    [waterfront.id, "Butter, unsalted", 5, 6],
    [waterfront.id, "House Red Wine", 9, 24],
    [catering.id, "Romaine Hearts", 4, 8],
    [catering.id, "Chicken Breast, boneless", 30, 25],
    [catering.id, "Olive Oil, EV", 6, 8],
  ];
  for (const [venueId, name, quantity, par] of stockPlan) {
    const item = byName(name);
    await prisma.inventoryItem.create({
      data: { venueId, itemId: item.id, quantity, par, unit: item.unit },
    });
  }

  // --- Order Guides ---
  const dtSysco = await prisma.orderGuide.create({
    data: { name: "Downtown — Sysco Weekly", venueId: downtown.id, vendorId: sysco.id },
  });
  await prisma.orderGuideLine.createMany({
    data: [
      { orderGuideId: dtSysco.id, itemId: byName("Ground Beef 80/20").id, par: 20, unit: "lb", sortOrder: 1 },
      { orderGuideId: dtSysco.id, itemId: byName("Burger Buns").id, par: 48, unit: "each", sortOrder: 2 },
      { orderGuideId: dtSysco.id, itemId: byName("Pasta, spaghetti").id, par: 10, unit: "lb", sortOrder: 3 },
      { orderGuideId: dtSysco.id, itemId: byName("Olive Oil, EV").id, par: 6, unit: "L", sortOrder: 4 },
    ],
  });

  const wfSeafood = await prisma.orderGuide.create({
    data: { name: "Waterfront — Harbor Seafood", venueId: waterfront.id, vendorId: seafood.id },
  });
  await prisma.orderGuideLine.createMany({
    data: [
      { orderGuideId: wfSeafood.id, itemId: byName("Salmon Fillet").id, par: 12, unit: "lb", sortOrder: 1 },
      { orderGuideId: wfSeafood.id, itemId: byName("Shrimp 16/20").id, par: 10, unit: "lb", sortOrder: 2 },
    ],
  });

  // --- Events ---
  const gala = await prisma.event.create({
    data: {
      name: "Harbor Charity Gala",
      venueId: waterfront.id,
      date: new Date(Date.now() + 14 * 86400000),
      guestCount: 120,
      status: "CONFIRMED",
      location: "Waterfront Ballroom",
      notes: "Plated 3-course. Confirm dietary restrictions with client.",
      menuItems: {
        create: [
          { recipeId: caesar.id, plannedServings: 120 },
          { recipeId: salmon.id, plannedServings: 80 },
          { recipeId: carbonara.id, plannedServings: 40 },
        ],
      },
    },
  });

  await prisma.event.create({
    data: {
      name: "Corporate Lunch — Acme Co.",
      venueId: catering.id,
      date: new Date(Date.now() + 5 * 86400000),
      guestCount: 45,
      status: "PLANNED",
      location: "Offsite — Acme HQ",
      notes: "Drop-off buffet, 11:30 service.",
      menuItems: {
        create: [
          { recipeId: burger.id, plannedServings: 45 },
          { recipeId: caesar.id, plannedServings: 45 },
        ],
      },
    },
  });

  console.log(`Seeded: 3 venues, 3 users, ${items.length} items, 4 recipes, events incl. "${gala.name}".`);
  console.log("Login with admin@culinaryops.test / password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
