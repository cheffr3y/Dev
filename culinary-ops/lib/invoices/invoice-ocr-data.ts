import { measurementSelect } from "@/lib/ingredients/measurements";
import { refreshInvoiceReview } from "./inbox-data";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { serializable, json } from "../prep/prep-workflow";
import { localInvoiceDraftSchema, parseInvoiceText } from "./invoice-parser";
import { matchInvoiceLine } from "./invoice-learning";
import { rememberInvoiceAlias } from "./invoice-learning-data";
import { isRemovedInvoiceDecision } from "./invoice-decisions";

const text=z.string().trim().min(1).max(500), id=z.string().min(1).max(150);
const lineFields={documentId:id,vendorId:id,key:z.string().min(1).max(100),rawCode:z.string().max(100).nullable(),description:text,itemId:id.nullable(),isIgnored:z.boolean(),defaultUnit:z.string().max(40).nullable().optional(),defaultPackQty:z.number().finite().positive().max(1e8).nullable().optional(),defaultPackUnit:z.string().max(40).nullable().optional()};
export const ocrCommandSchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("draft"),documentId:id,expectedRevision:z.number().int().nonnegative(),pages:localInvoiceDraftSchema.shape.pages}).strict(),
  z.object({action:z.literal("remove"),operationId:z.string().uuid(),documentId:id,key:lineFields.key}).strict(),
  z.object({action:z.literal("restore"),operationId:z.string().uuid(),documentId:id,key:lineFields.key}).strict(),
  z.object({action:z.literal("remember"),operationId:z.string().uuid(),...lineFields}).strict(),
  z.object({action:z.literal("ignore"),operationId:z.string().uuid(),...lineFields,remember:z.boolean()}).strict(),
  z.object({action:z.literal("createItem"),operationId:z.string().uuid(),...lineFields,name:text,unit:z.string().trim().min(1).max(40),remember:z.boolean()}).strict(),
]);
export async function loadLocalInvoice(id:string,vendorOverride?:string) {
  const doc=await prisma.invoiceDocument.findUniqueOrThrow({where:{id},select:{id:true,reviewState:true,vendorId:true,ocrDraft:true,ocrRevision:true,purchaseLines:{select:{ocrLineKey:true}},ocrDecisions:{select:{lineKey:true,facts:true}}}});
  if(doc.reviewState==="DISCARDED")throw new Error("This invoice was discarded. Upload it again to start over.");
  const vendorId=doc.vendorId??vendorOverride??null;
  const [aliases,items]=await Promise.all([
    prisma.invoiceItemAlias.findMany({where:{OR:[{vendorId:null},...(vendorId?[{vendorId}]:[])]},orderBy:{hitCount:"desc"}}),
    prisma.item.findMany({select:{id:true,name:true,unit:true,...measurementSelect,unitCost:true,sku:true,vendorId:true},orderBy:{name:"asc"}}),
  ]);
  const draft=doc.ocrDraft?localInvoiceDraftSchema.parse(doc.ocrDraft):null;
  const decisions=doc.ocrDecisions.filter(row=>!doc.purchaseLines.some(line=>line.ocrLineKey===row.lineKey));
  return {ok:true as const,revision:doc.ocrRevision,draft,items,aliases,vendorId,approved:doc.purchaseLines.flatMap(row=>row.ocrLineKey?[row.ocrLineKey]:[]),ignored:decisions.map(row=>row.lineKey),removed:decisions.filter(row=>isRemovedInvoiceDecision(row.facts)).map(row=>row.lineKey),matches:draft?.lines.map(line=>({key:line.key,...matchInvoiceLine(line.rawCode,line.rawDescription,vendorId,aliases,items)}))??[]};
}
export async function mutateLocalInvoice(actorId:string,raw:unknown) {
  const command=ocrCommandSchema.parse(raw);
  return serializable(async tx=>{
    const actor=await tx.user.findUnique({where:{id:actorId},select:{role:true}});
    if(!actor || actor.role==="STAFF")throw new Error("Manager access required.");
    const doc=await tx.invoiceDocument.findUniqueOrThrow({where:{id:command.documentId}});
    if(doc.reviewState==="DISCARDED")throw new Error("This invoice was discarded. Upload it again to start over.");
    if(command.action==="draft") {
      if(doc.ocrDraft)return {ok:true,id:doc.id}; // Reuse saved recognition; never reprocess approvals.
      if(doc.ocrRevision!==command.expectedRevision)throw new Error("Recognition draft changed. Reload the invoice.");
      const draft=parseInvoiceText(command.pages);
      await tx.invoiceDocument.update({where:{id:doc.id},data:{ocrDraft:json(draft),ocrRevision:{increment:1}}});await refreshInvoiceReview(tx,doc.id);return {ok:true,id:doc.id};
    }
    const requestHash=createHash("sha256").update(JSON.stringify(command)).digest("hex");
    const receipt=await tx.invoiceLearningEvent.findUnique({where:{id:command.operationId}});
    if(receipt){if(receipt.actorId!==actorId||receipt.requestHash!==requestHash)throw new Error("This operation key belongs to a different edit.");return receipt.result;}
    const draft=doc.ocrDraft?localInvoiceDraftSchema.parse(doc.ocrDraft):null;
    if(!draft?.lines.some(line=>line.key===command.key))throw new Error("Recognition row not found. Reload the invoice.");
    const decisionWhere={documentId_lineKey:{documentId:doc.id,lineKey:command.key}};
    const decision=await tx.invoiceOcrDecision.findUnique({where:decisionWhere});
    if(command.action==="remove" || command.action==="restore") {
      if(await tx.invoicePurchaseLine.findFirst({where:{invoiceDocumentId:doc.id,ocrLineKey:command.key}}))throw new Error("This row is approved. Edit or void its saved invoice line instead.");
      if(decision && !isRemovedInvoiceDecision(decision.facts))throw new Error("This row is saved as ignored. Open it for correction instead.");
      if(command.action==="remove") {
        await tx.invoiceOcrDecision.upsert({where:decisionWhere,create:{documentId:doc.id,lineKey:command.key,facts:json(command),actorId},update:{}});
      } else if(decision) {
        await tx.invoiceOcrDecision.delete({where:decisionWhere});
      }
      await refreshInvoiceReview(tx,doc.id);
      const result={ok:true,key:command.key,removed:command.action==="remove"};
      await tx.invoiceLearningEvent.create({data:{id:command.operationId,actorId,requestHash,result:json(result)}});
      return result;
    }
    if(isRemovedInvoiceDecision(decision?.facts))throw new Error("This row was removed. Restore it before editing or approving it.");
    if(doc.vendorId && doc.vendorId!==command.vendorId)throw new Error("Use the invoice's recorded supplier.");
    if(!await tx.vendor.findUnique({where:{id:command.vendorId}}))throw new Error("Choose an existing supplier first.");
    let itemId=command.itemId;
    let created:null|{id:string;name:string;unit:string;unitCost:number}=null;
    if(command.action==="createItem") {
      if(command.isIgnored)throw new Error("Uncheck ignored before creating an ingredient.");
      created=await tx.item.create({data:{name:command.name,unit:command.unit,unitCost:0,sku:command.rawCode,category:"Other",vendorId:command.vendorId},select:{id:true,name:true,unit:true,...measurementSelect,unitCost:true}});itemId=created.id;
    }else if(itemId && !await tx.item.findUnique({where:{id:itemId}}))throw new Error("That ingredient was removed.");
    const alias=command.action==="remember" || command.remember ? await rememberInvoiceAlias(tx,{...command,itemId,isIgnored:command.action==="ignore"?true:command.isIgnored}) : null;
    if(command.action==="ignore") {
      if(await tx.invoicePurchaseLine.findFirst({where:{invoiceDocumentId:doc.id,ocrLineKey:command.key}}))throw new Error("This row is approved. Edit or void its saved invoice line instead.");
      await tx.invoiceOcrDecision.upsert({where:{documentId_lineKey:{documentId:doc.id,lineKey:command.key}},create:{documentId:doc.id,lineKey:command.key,facts:json(command),actorId},update:{}});
    }
    if(command.action==="ignore")await refreshInvoiceReview(tx,doc.id);
    const result={ok:true,item:created,alias};
    await tx.invoiceLearningEvent.create({data:{id:command.operationId,actorId,requestHash,result:json(result)}});return result;
  });
}
