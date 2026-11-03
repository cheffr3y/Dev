import type { Prisma } from "@prisma/client";
import { convertQty } from "../recipes/units";
import { normalizedInvoicePrice } from "./invoice-purchases";
// Costs are derived live by buildCostMap/menu rollouts; no saved recipe totals
// need rewriting. Frozen packet/accounting snapshots are deliberately excluded.
export async function cascadeInvoiceCost(tx: Prisma.TransactionClient, itemId: string, triggerLineId: string, invoiceDocumentId: string, actorId: string, approving: boolean) {
  const item=await tx.item.findUnique({where:{id:itemId}});
  if(!item) return;
  const previous=await tx.invoiceCatalogState.findUnique({where:{itemId}});
  const candidates=await tx.invoicePurchaseLine.findMany({where:{itemId,voided:false,countsAsFood:true,amountCents:{gt:0},normalizedUnitCost:{gt:0}},orderBy:[{invoiceDate:"desc"},{createdAt:"desc"},{id:"desc"}],select:{id:true,revision:true,amountCents:true,quantity:true,packQty:true,packUnit:true}});
  const latest=candidates.find(line=>{try{return normalizedInvoicePrice(line.amountCents,line.quantity,line.packQty,line.packUnit,item.unit)>0;}catch{return false;}});
  if(!previous && !latest) return;
  if(!previous && latest?.id!==triggerLineId) return;
  if(latest && previous?.lineId===latest.id && previous.lineRevision===latest.revision) return;
  const explicitApproval=approving && latest?.id===triggerLineId;
  if(previous && !explicitApproval && (item.unitCost!==previous.appliedCost || item.unit!==previous.appliedUnit)) return; // Keep a later manual catalog correction.
  const manualReset=previous && explicitApproval && (item.unitCost!==previous.appliedCost || item.unit!==previous.appliedUnit);
  const baselineCost=manualReset?item.unitCost:previous?.baselineCost??item.unitCost, baselineUnit=manualReset?item.unit:previous?.baselineUnit??item.unit;
  const baselineQty=convertQty(1,baselineUnit,item.unit);
  if(!latest && (baselineQty===null || baselineQty<=0)) return;
  const cost=latest ? normalizedInvoicePrice(latest.amountCents,latest.quantity,latest.packQty,latest.packUnit,item.unit) : baselineCost/baselineQty!;
  if(!Number.isFinite(cost) || cost<0 || cost>1e8) throw new Error("Normalized price is outside the catalog range. Verify the invoice pack and amount.");
  // An older purchase can establish history without overriding a newer source.
  if(latest && previous?.lineId===latest.id && cost===previous.appliedCost && item.unitCost===cost) {
    await tx.invoiceCatalogState.update({where:{itemId},data:{lineRevision:latest.revision}}); return;
  }
  await tx.item.update({where:{id:itemId},data:{unitCost:cost,...(cost!==item.unitCost?{priceUpdatedAt:new Date()}: {})}});
  await tx.invoiceCatalogState.upsert({where:{itemId},create:{itemId,baselineCost,baselineUnit,lineId:latest?.id??null,lineRevision:latest?.revision??null,appliedCost:cost,appliedUnit:item.unit},update:{baselineCost,baselineUnit,lineId:latest?.id??null,lineRevision:latest?.revision??null,appliedCost:cost,appliedUnit:item.unit}});
  await tx.invoicePriceChange.create({data:{itemId,invoiceDocumentId,triggerLineId,sourceLineId:latest?.id??null,beforeCost:item.unitCost,afterCost:cost,unit:item.unit,actorId,reason:latest?"Latest approved positive food purchase":"No eligible purchase remains; restore pre-invoice cost"}});
}
