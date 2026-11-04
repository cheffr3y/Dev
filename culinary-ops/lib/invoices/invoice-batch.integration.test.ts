import test, {before,after} from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../db/prisma";
import { parseInvoiceText } from "./invoice-parser";
import { saveInvoiceBatch } from "./invoice-batch-data";

const url=new URL(process.env.DATABASE_URL??"postgresql://invalid");
if(process.env.PREP_DISPOSABLE_DB!=="1"||url.hostname!=="127.0.0.1"||url.pathname!=="/prep_workflow_test")throw new Error("Disposable database required.");
let admin:string,staff:string,vendorId:string,venueId:string,itemId:string;
before(async()=>{
  admin=(await prisma.user.findFirstOrThrow({where:{role:"ADMIN"}})).id;
  staff=(await prisma.user.findFirstOrThrow({where:{role:"STAFF"}})).id;
  vendorId=(await prisma.vendor.create({data:{name:"Batch invoice test supplier"}})).id;
  venueId=(await prisma.venue.create({data:{name:"Batch invoice test kitchen",code:"BATCH"}})).id;
  itemId=(await prisma.item.create({data:{name:"Batch rolls",unit:"oz",unitCost:.1,vendorId}})).id;
});
after(()=>prisma.$disconnect());
async function fixture() {
  const id=randomUUID(),draft=parseInvoiceText([{page:1,text:"1 CS 104028 DIAMOND ROLL 52.44 52.44\n105/1.3OZ PK\nFUEL SURCHARGE 7.00"}]);
  await prisma.invoiceDocument.create({data:{id,fileHash:id,filename:"batch.pdf",mime:"application/pdf",data:new Uint8Array([1]),preview:new Uint8Array([1]),originalBytes:1,storedBytes:1,pages:1,createdBy:admin,vendorId,ocrDraft:draft,ocrRevision:1}});
  const line={id:randomUUID(),invoiceDocumentId:id,revision:null,itemId,vendorId,venueId,invoiceDate:"2026-11-02",description:"DIAMOND ROLL",rawCode:"104028",ocrLineKey:draft.lines[0].key,ocrReviewed:true,remember:true,quantity:1,purchaseUnit:"cs",packQty:136.5,packUnit:"oz",amount:"52.44",countsAsFood:true};
  return {operationId:randomUUID(),documentId:id,expectedLineRevision:0,lines:[line],ignoredKeys:[draft.lines[1].key],commit:true,expenseId:randomUUID(),expenseRevision:null};
}

test("batch saves purchases, learned packs, ignored rows, spending and completion atomically; retry is idempotent",async()=>{
  const batch=await fixture();
  const result=await saveInvoiceBatch(prisma,admin,batch);
  assert.deepEqual(await saveInvoiceBatch(prisma,admin,batch),result);
  assert.equal(await prisma.invoicePurchaseLine.count({where:{invoiceDocumentId:batch.documentId}}),1);
  const expense=await prisma.operatingFoodExpense.findUniqueOrThrow({where:{invoiceDocumentId:batch.documentId}});
  assert.equal(expense.amountCents,5244);assert.equal(expense.invoiceLineRevision,1);
  const doc=await prisma.invoiceDocument.findUniqueOrThrow({where:{id:batch.documentId}});
  assert.equal(doc.reviewState,"COMPLETE");assert.equal(doc.reviewedCandidateCount,2);
  const alias=await prisma.invoiceItemAlias.findFirstOrThrow({where:{vendorId,rawCode:"104028"}});
  assert.equal(alias.defaultPackQty,136.5);assert.equal(alias.hitCount,1);
});

test("a later invalid line rolls back earlier purchases, learned aliases, prices and ignored decisions",async()=>{
  const batch=await fixture(),before=(await prisma.item.findUniqueOrThrow({where:{id:itemId}})).unitCost;
  batch.lines.push({...batch.lines[0],id:randomUUID(),ocrLineKey:"",itemId:"missing-item",description:"Invalid ingredient",rawCode:"invalid"});
  await assert.rejects(saveInvoiceBatch(prisma,admin,batch),/existing/);
  assert.equal(await prisma.invoicePurchaseLine.count({where:{invoiceDocumentId:batch.documentId}}),0);
  assert.equal(await prisma.invoiceOcrDecision.count({where:{documentId:batch.documentId}}),0);
  assert.equal(await prisma.operatingFoodExpense.count({where:{invoiceDocumentId:batch.documentId}}),0);
  assert.equal((await prisma.item.findUniqueOrThrow({where:{id:itemId}})).unitCost,before);
  assert.equal(await prisma.invoiceLearningEvent.count({where:{id:batch.operationId}}),0);
});

test("staff and stale invoice revisions cannot approve a batch",async()=>{
  const batch=await fixture();
  await assert.rejects(saveInvoiceBatch(prisma,staff,batch),/Manager/);
  await assert.rejects(saveInvoiceBatch(prisma,admin,{...batch,expectedLineRevision:1}),/changed/);
  assert.equal(await prisma.invoicePurchaseLine.count({where:{invoiceDocumentId:batch.documentId}}),0);
});
