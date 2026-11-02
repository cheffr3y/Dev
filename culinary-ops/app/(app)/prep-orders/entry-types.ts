export type Recipe = {
  id: string;
  name: string;
  prodCode: string;
  yieldQty: number;
  yieldUnit: string;
  productionPersonMinutes: number | null;
};
export type Venue = { id: string; name: string };
export type Item = { id: string; name: string; unit: string };
export type Request = {
  id: string;
  recipeId: string;
  venueId: string;
  venueName: string;
  quantity: number;
  unit: string;
};
