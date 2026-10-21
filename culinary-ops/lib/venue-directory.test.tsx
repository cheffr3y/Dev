import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { VenueOptions } from "../components/VenueOptions";
import { directoryEntry, groupedVenueChoices, standardLocationText, VENUE_DIRECTORY, type VenueChoice } from "./venue-directory";

const venues: VenueChoice[] = VENUE_DIRECTORY.map((entry, sortOrder) => ({
  id: entry.key, name: entry.name, standardKey: entry.key, parentId: entry.parentKey, sortOrder,
  parent: entry.parentKey ? { name: VENUE_DIRECTORY.find(parent => parent.key === entry.parentKey)!.name } : null,
}));

test("the shared directory has five venues and the seven confirmed rooms", () => {
  assert.equal(venues.length, 12);
  const groups = groupedVenueChoices(venues);
  assert.equal(groups.length, 5);
  assert.deepEqual(groups.find(group => group.label === "The Annex")!.options.map(venue => venue.name), ["The Annex", "Renard's", "11's Lounge"]);
  assert.deepEqual(groups.find(group => group.label === "The Station")!.options.map(venue => venue.name), ["The Station", "Zimmerman", "Foxyard", "Opitz", "Ice House", "Ice House Mezzanine"]);
  const html = renderToStaticMarkup(<select><VenueOptions venues={venues} /></select>);
  assert.match(html, /<optgroup label="The Station">/);
  assert.doesNotMatch(html, /<span/);
  assert.equal((html.match(/<option /g) ?? []).length, 12);
});

test("known punctuation and spelling aliases normalize, ambiguous departments do not", () => {
  assert.equal(directoryEntry(" Foxtown Brewing ")?.name, "Foxtown Brewpub");
  assert.equal(directoryEntry("11’s lounge")?.name, "11's Lounge");
  assert.equal(directoryEntry("Interurban Coffeeshop")?.name, "Interurban Coffee Shop");
  assert.equal(directoryEntry("Heritage Meats")?.name, "Foxtown Heritage Meats");
  assert.equal(directoryEntry("Banquets"), undefined);
  assert.equal(directoryEntry("Foxtown Landing"), undefined);
  assert.equal(standardLocationText("Opitz Hall; Zimmerman Room"), "Opitz; Zimmerman");
  assert.equal(standardLocationText("Foxtown Station"), "The Station");
  assert.equal(standardLocationText("Offsite — 123 Main St / South entrance"), "Offsite — 123 Main St / South entrance");
  assert.equal(standardLocationText(""), null);
});

test("legacy records appear only for the current selection or history reporting", () => {
  const old = { id: "legacy", name: "Banquets", standardKey: null };
  assert.equal(groupedVenueChoices([...venues, old]).flatMap(group => group.options).length, 12);
  const current = groupedVenueChoices(venues, old);
  assert.equal(current.at(-1)!.options[0].id, old.id);
  assert.equal(current.at(-1)!.label, "Legacy locations — existing records");
  assert.equal(groupedVenueChoices([...venues, old], null, true).at(-1)!.options[0].id, old.id);
  const html = renderToStaticMarkup(<select defaultValue="legacy"><VenueOptions venues={venues} current={old} /></select>);
  assert.match(html, /value="legacy" selected="">Banquets \(legacy\)/);
});

test("a restricted room picker retains its parent label without broadening permissions", () => {
  const room = venues.find(venue => venue.id === "zimmerman")!;
  const groups = groupedVenueChoices([room]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, "The Station");
  assert.deepEqual(groups[0].options.map(venue => venue.id), [room.id]);
});
