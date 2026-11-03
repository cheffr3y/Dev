import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../db/prisma";
import { applyMeasurements, measurementPreview } from "./measurement-data";
import { buildCostMap } from "../recipes/costing";
import { saveInvoicePurchase } from "../invoices/invoice-purchases-data";
import { completeInvoiceReview } from "../invoices/complete-review";
import { measurementVersion } from "./measurements";

const url=new URL(process.env.DATABASE_URL||"postgresql://invalid");
assert.equal(process.env.PREP_DISPOSABLE_DB,"1");assert.equal(url.hostname,"127.0.0.1");assert.equal(url.pathname,"/prep_workflow_test");
const actor=randomUUID(),staff=randomUUID(),itemId=randomUUID(),vendorId=randomUUID(),venueId=randomUUID(),recipeId=randomUUID(),parentId=randomUUID(),documentId=randomUUID();
const settings={unit:"oz",eachLabel:"head",eachWeightOz:20,densityGPerMl:null,yieldFactor:.9,usableCosting:true,packQty:3,packUnit:"each"};
before(async()=>{
  await prisma.user.createMany({data:[{id:actor,email:`${actor}@measurement.test`,name:"Measurement reviewer",passwordHash:"unused",role:"ADMIN"},{id:staff,email:`${staff}@measurement.test`,name:"Staff",passwordHash:"unused",role:"STAFF"}]});
  await prisma.vendor.create({data:{id:vendorId,name:"Measurement produce"}});await prisma.venue.create({data:{id:venueId,name:"Measurement kitchen",code:venueId}});
  await prisma.item.create({data:{id:itemId,name:"Measurement celery",unit:"each",unitCost:4,yieldFactor:.9,packQty:3,packUnit:"each",vendorId}});
  await prisma.recipe.create({data:{id:recipeId,name:"Measurement celery prep",prodCode:recipeId,yieldQty:1,yieldUnit:"each",items:{create:{itemId,quantity:9,unit:"oz"}}}});
  await prisma.recipe.create({data:{id:parentId,name:"Measurement celery parent",prodCode:parentId,yieldQty:1,yieldUnit:"each",components:{create:{childId:recipeId,quantity:2,unit:"each"}}}});
  await prisma.invoiceDocument.create({data:{id:documentId,fileHash:documentId,filename:"measurement-review.pdf",mime:"application/pdf",data:Buffer.from("test"),preview:Buffer.from("test"),pages:1,originalBytes:4,storedBytes:4,createdBy:actor,vendorId}});
});
after(()=>prisma.$disconnect());

test("measurement review previews legacy impact, rejects stale work, applies once and retains history",async()=>{
  const historical=JSON.stringify({packets:await prisma.prepPacketSnapshot.findMany(),transfers:await prisma.stockTransfer.findMany(),reports:await prisma.transferReportRun.findMany()});
  const preview=await prisma.$transaction(tx=>measurementPreview(tx,itemId,settings));
  assert.equal(preview.rows.find(row=>row.id===recipeId)!.before,36);assert.equal(preview.rows.find(row=>row.id===recipeId)!.after,2);assert.equal(preview.rows.find(row=>row.id===parentId)!.after,4);
  assert.equal((await prisma.item.findUniqueOrThrow({where:{id:itemId}})).measurementReviewedAt,null);
  await prisma.recipeItem.updateMany({where:{recipeId},data:{quantity:10}});
  const command={id:itemId,settings,token:preview.token,operationId:randomUUID(),confirmedBasis:true};
  await assert.rejects(applyMeasurements(prisma,actor,command),/changed/);
  await prisma.recipeItem.updateMany({where:{recipeId},data:{quantity:9}});
  const fresh=await prisma.$transaction(tx=>measurementPreview(tx,itemId,settings)),apply={...command,token:fresh.token,operationId:randomUUID()};
  await assert.rejects(applyMeasurements(prisma,staff,apply),/Manager/);
  await Promise.all([applyMeasurements(prisma,actor,apply),applyMeasurements(prisma,actor,apply)]);
  assert.equal(await prisma.ingredientMeasurementChange.count({where:{itemId}}),1);
  const current=await prisma.item.findUniqueOrThrow({where:{id:itemId}});assert.equal(current.unit,"oz");assert.equal(current.unitCost,.2);assert.equal(current.measurementRevision,1);
  const recipes=await prisma.recipe.findMany({include:{items:{include:{item:true}},components:true}});assert.equal(buildCostMap(recipes).get(recipeId),2);assert.equal(buildCostMap(recipes).get(parentId),4);
  assert.equal((await prisma.recipeItem.findFirstOrThrow({where:{recipeId}})).quantity,9);
  await assert.rejects(prisma.ingredientMeasurementChange.delete({where:{id:apply.operationId}}),/retained/);
  assert.equal(JSON.stringify({packets:await prisma.prepPacketSnapshot.findMany(),transfers:await prisma.stockTransfer.findMany(),reports:await prisma.transferReportRun.findMany()}),historical);
});

test("purchased invoice normalization freezes its basis and rejects unseen conversion revisions",async()=>{
  const item=await prisma.item.findUniqueOrThrow({where:{id:itemId}});
  const input={id:randomUUID(),invoiceDocumentId:documentId,revision:null,itemId,vendorId,venueId,invoiceDate:"2026-11-03",description:"Three celery heads",amount:"12",quantity:3,purchaseUnit:"ct",packQty:1,packUnit:"each",countsAsFood:true};
  assert.equal((await saveInvoicePurchase(prisma,actor,{...input,expectedMeasurementVersion:0})).ok,false);
  assert.equal(await prisma.invoicePurchaseLine.count({where:{invoiceDocumentId:documentId}}),0);
  assert.ok((await saveInvoicePurchase(prisma,actor,{...input,expectedMeasurementVersion:measurementVersion(item)})).ok);
  const saved=await prisma.invoicePurchaseLine.findUniqueOrThrow({where:{id:input.id}});assert.equal(saved.normalizedUnitCost,.2);assert.equal((saved.measurementSnapshot as {eachWeightOz:number}).eachWeightOz,20);
  const preview=await prisma.$transaction(tx=>measurementPreview(tx,itemId,{...settings,eachWeightOz:22}));
  await applyMeasurements(prisma,actor,{id:itemId,settings:{...settings,eachWeightOz:22},operationId:randomUUID(),token:preview.token,confirmedBasis:true});
  assert.ok((await saveInvoicePurchase(prisma,actor,{...input,revision:0,description:"Corrected description",reason:"Supplier clarification",expectedMeasurementVersion:0})).ok,"unchanged pack basis retains its captured measurement");
  const corrected=await prisma.invoicePurchaseLine.findUniqueOrThrow({where:{id:input.id}});assert.equal(corrected.normalizedUnitCost,.2);assert.equal((corrected.measurementSnapshot as {eachWeightOz:number}).eachWeightOz,20);
  const oldCount=await prisma.invoicePurchaseLine.count();
  assert.equal((await saveInvoicePurchase(prisma,actor,{...input,id:randomUUID(),expectedMeasurementVersion:1})).ok,false);
  assert.equal(await prisma.invoicePurchaseLine.count(),oldCount);
});

test("invoice completion is explicit, retry-safe, independent of accounting, and reopened by corrections",async()=>{
  const doc=await prisma.invoiceDocument.findUniqueOrThrow({where:{id:documentId}});assert.equal(doc.reviewState,"READY");
  const before=JSON.stringify({prices:await prisma.invoicePriceChange.findMany(),expenses:await prisma.operatingFoodExpense.findMany()});
  await assert.rejects(completeInvoiceReview(prisma,staff,documentId,doc.lineRevision,doc.ocrRevision),/Manager/);
  await completeInvoiceReview(prisma,actor,documentId,doc.lineRevision,doc.ocrRevision);
  const finished=await prisma.invoiceDocument.findUniqueOrThrow({where:{id:documentId}});assert.equal(finished.reviewState,"COMPLETE");
  await completeInvoiceReview(prisma,actor,documentId,doc.lineRevision,doc.ocrRevision);
  assert.equal((await prisma.invoiceDocument.findUniqueOrThrow({where:{id:documentId}})).reviewCompletedAt!.getTime(),finished.reviewCompletedAt!.getTime());
  assert.equal(JSON.stringify({prices:await prisma.invoicePriceChange.findMany(),expenses:await prisma.operatingFoodExpense.findMany()}),before);
  const line=await prisma.invoicePurchaseLine.findFirstOrThrow({where:{invoiceDocumentId:documentId}});
  assert.ok((await saveInvoicePurchase(prisma,actor,{...line,invoiceDate:"2026-11-03",revision:line.revision,amount:"13.20",reason:"Adjusted line total",expectedMeasurementVersion:2})).ok);
  assert.equal((await prisma.invoiceDocument.findUniqueOrThrow({where:{id:documentId}})).reviewState,"READY");
  await assert.rejects(completeInvoiceReview(prisma,actor,documentId,doc.lineRevision,doc.ocrRevision),/changed/);
});
