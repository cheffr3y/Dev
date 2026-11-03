import test from "node:test";
import assert from "node:assert/strict";
import { convertIngredientQty, ingredientPurchaseQuantity, ingredientUnits, measurementSnapshot } from "./measurements";
import { buildCostMap, lineCost } from "../recipes/costing";
import { buildDependencyPlan } from "../recipes/recipe-dependencies";
import { normalizedInvoicePrice, invoiceNormalizationMeasure } from "../invoices/invoice-purchases";
import { buildPurchasingList, type PlanningSource } from "../production/production-planning";
import { buildFestivalOrderGuide } from "../menus/festival";
import { normalizedObservation } from "../invoices/price-trends";

const item = { id: "celery", name: "Celery", unit: "each", unitCost: 4, eachLabel: "head", eachWeightOz: 20, densityGPerMl: null, yieldFactor: .9, usableCosting: true, measurementReviewedAt: new Date("2026-11-03"), packQty: 3, packUnit: "each", packSize: "3 heads", sku: null, vendor: { id:"vendor",name: "Produce" }, category: "Produce", allergens: null, priceUpdatedAt: null };
const recipe = { id:"base", name:"Celery prep", yieldQty:1,yieldUnit:"each",allergens:null,items:[{itemId:item.id,quantity:9,unit:"oz",item}],components:[] };

test("celery purchased counts, usable weight and costs reconcile without double trim",()=>{
  assert.equal(convertIngredientQty(3,"ct","oz",item),60);
  assert.equal(convertIngredientQty(60,"oz","head",item),3);
  assert.equal(ingredientPurchaseQuantity(9,"oz",item),.5);
  assert.equal(ingredientPurchaseQuantity(3,"heads",item),3,"physical head count is not reduced by trimming");
  assert.equal(lineCost(recipe.items[0]).cost,2);
  const oz={...item,unit:"oz",unitCost:.2};
  assert.equal(lineCost({...recipe.items[0],item:oz}).cost,2);
  assert.equal(ingredientPurchaseQuantity(9,"oz",{...item,usableCosting:false}),.45);
  const parent={...recipe,id:"parent",items:[],components:[{childId:"base",quantity:2,unit:"each"}]};
  assert.equal(buildCostMap([recipe,parent]).get("parent"),4);
  const dependency=buildDependencyPlan("parent",[recipe,parent],1,"each")!;
  assert.equal(dependency.root.cost,4);assert.equal(dependency.ingredients[0].quantity,1);
  assert.ok(ingredientUnits(item).includes("oz"));
});

test("legacy costs remain unchanged until reviewed; missing reviewed conversions stay unknown",()=>{
  assert.equal(lineCost({...recipe.items[0],item:{...item,measurementReviewedAt:null,usableCosting:false}}).cost,36);
  assert.ok(Number.isNaN(lineCost({...recipe.items[0],item:{...item,eachWeightOz:null}}).cost));
  assert.equal(convertIngredientQty(1,"cup","lb",{unit:"lb"}),null);
  assert.equal(ingredientPurchaseQuantity(10,"oz",{...item,yieldFactor:0}),null);
  assert.equal(convertIngredientQty(1,"head","oz",{unit:"each"}),null);
  assert.equal(convertIngredientQty(1,"case","oz",{...item,unit:"case",packQty:3,packUnit:"each"}),60);
  const dense={...item,unit:"g",densityGPerMl:1.05};
  assert.ok(Math.abs(convertIngredientQty(100,"ml","g",dense)!-105)<1e-8);
});

test("invoice prices normalize purchased weight and retain their captured measurement basis",()=>{
  const catalog={...item,unit:"oz",unitCost:.2};
  assert.equal(normalizedInvoicePrice(1200,3,1,"each","oz",catalog),.2);
  const previous={itemId:"celery",quantity:3,packQty:1,packUnit:"each",normalizedUnit:"oz",measurementSnapshot:{...measurementSnapshot(catalog),eachWeightOverride:null}};
  const edit={itemId:"celery",quantity:3,packQty:1,packUnit:"each",eachWeightOz:null};
  const captured=invoiceNormalizationMeasure({...catalog,eachWeightOz:22},previous,edit);
  assert.equal(captured.sameBasis,true);
  assert.equal(normalizedInvoicePrice(1200,3,1,"each","oz",captured.measure),.2);
  const override=invoiceNormalizationMeasure(catalog,previous,{...edit,eachWeightOz:24});
  assert.equal(override.sameBasis,false);
  assert.equal(normalizedInvoicePrice(1200,3,1,"each","oz",override.measure),1/6);
  const observation={vendorId:"v",vendorName:"Produce",normalizedUnit:"each",normalizedUnitCost:4,amountCents:1200,invoiceDate:new Date(),measurementSnapshot:measurementSnapshot(item)};
  assert.equal(normalizedObservation(observation,"oz"),.2,"historical comparisons use the captured 20 oz head, without trim");
  assert.equal(normalizedObservation({...observation,measurementSnapshot:null},"oz"),null,"legacy records without a basis remain incomparable");
});

test("purchasing combines raw demand before pack rounding and agrees with festival ordering",()=>{
  const source=(id:string):PlanningSource=>({id,kind:"Event",name:id,date:null,dateLabel:"",time:"",destination:"Kitchen",venueId:null,notes:"",href:"/events",packetHref:"/events",lines:[{id,recipeId:"base",name:"Celery prep",quantity:1,unit:"each",notes:""}]});
  const recipes=[{id:"base",yieldQty:1,yieldUnit:"each",items:[{itemId:item.id,name:item.name,category:"Produce",quantity:9,unit:"oz"}],components:[]}];
  const plan=buildPurchasingList([source("a"),source("b")],recipes,[item]);
  assert.equal(plan.rows[0].quantity,1);assert.equal(plan.rows[0].suggestedPacks,1);assert.deepEqual(plan.warnings,[]);
  const guide=buildFestivalOrderGuide({categories:[{category:"Produce",items:[{itemId:item.id,name:item.name,category:"Produce",amounts:[{qty:18,unit:"oz"}]}]}],itemCount:1,unscaledRecipes:[]},new Map([[item.id,item]]),new Map());
  const row=guide.groups[0].rows[0];assert.equal(row.rawNeed,1);assert.equal(row.orderQty,3);assert.equal(row.estCost,12);
  const countGuide=buildFestivalOrderGuide({categories:[{category:"Produce",items:[{itemId:item.id,name:item.name,category:"Produce",amounts:[{qty:3,unit:"head"}]}]}],itemCount:1,unscaledRecipes:[]},new Map([[item.id,item]]),new Map());
  assert.equal(countGuide.groups[0].rows[0].rawNeed,3);
});
