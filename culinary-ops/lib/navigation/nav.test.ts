import assert from "node:assert/strict";
import test from "node:test";
import { activePage, navFor } from "./nav";

test("staff see no admin group or manager-only pages", () => {
  const staff = navFor("STAFF");
  assert.deepEqual(staff.map((group) => group.key), ["today", "kitchen", "recipes", "events", "ordering", "cleanup"]);
  assert.deepEqual(staff.find((group) => group.key === "ordering")!.pages.map((page) => page.label), ["Ingredients", "Vendors"]);
  assert.equal(staff.find((group) => group.key === "kitchen")!.pages.some((page) => page.href === "/prep-orders/report"), false);
});

test("managers see venues but not users; admins see both", () => {
  assert.deepEqual(navFor("MANAGER").find((group) => group.key === "admin")!.pages.map((page) => page.href), ["/venues"]);
  assert.deepEqual(navFor("ADMIN").find((group) => group.key === "admin")!.pages.map((page) => page.href), ["/venues", "/admin/users"]);
});

test("the most specific page is active, and detail pages light their group", () => {
  const nav = navFor("ADMIN");
  assert.equal(activePage(nav, "/prep-orders/report")?.page.label, "Prep reports");
  assert.equal(activePage(nav, "/prep-orders")?.page.label, "Daily prep");
  assert.equal(activePage(nav, "/banquets/abc/prep-sheet")?.group.key, "events");
  assert.equal(activePage(nav, "/items/cleanup")?.group.key, "ordering");
  assert.equal(activePage(nav, "/")?.group.key, "today");
  assert.equal(activePage(nav, "/recipes-old"), null);
});
