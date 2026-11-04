import test from "node:test";
import assert from "node:assert/strict";
import { specialGraphProblems, specialCostingSchema } from "./special-costing";
import { recipeCostSheet } from "./recipe-cost-sheet";
test("nested specials use yield-adjusted purchases and disclose AP and EP rates",()=>{
 const item={name:"Trimmed carrots",unit:"lb",unitCost:2,measurementReviewedAt:"2026-11-03",usableCosting:true,yieldFactor:.5};
 const base={id:"base",name:"Base",yieldQty:2,yieldUnit:"qt",items:[{id:"carrot",quantity:1,unit:"lb",item}],components:[]};
 const sauce={id:"sauce",name:"Sauce",yieldQty:1,yieldUnit:"qt",items:[],components:[{id:"b",childId:"base",quantity:1,unit:"qt",child:{name:"Base"}}]};
 const dish={id:"dish",name:"Special",yieldQty:4,yieldUnit:"servings",menuPrice:10,items:[],components:[{id:"s",childId:"sauce",quantity:1,unit:"qt",child:{name:"Sauce"}}]};
 const sheet=recipeCostSheet(base,[base,sauce,dish],1);assert.equal(sheet.totalCost,4);assert.equal(sheet.ingredients[0].unitCost,2);assert.equal(sheet.ingredients[0].edibleUnitCost,4);assert.equal(sheet.ingredients[0].purchasedQuantity,2);assert.equal(sheet.ingredients[0].yieldPercent,50);
 const nested=recipeCostSheet(dish,[base,sauce,dish],1);assert.equal(nested.totalCost,2);assert.equal(nested.perUnit,.5);assert.equal(nested.foodCostPercent,5);
 assert.deepEqual(specialGraphProblems([dish,sauce,base]),[]);
 assert.ok(specialGraphProblems([{id:"a",components:[{childId:"b"}]},{id:"b",components:[{childId:"a"}]}]).length);
 assert.ok(specialGraphProblems([{id:"a",components:[{childId:"gone"}]}]).length);
 assert.equal(specialCostingSchema.safeParse({name:"Invalid",venueId:"",menuPrice:0,nodes:[]}).success,false);
});
