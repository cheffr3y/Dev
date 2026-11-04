import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { invoiceBatchSchema } from "./invoice-batch";
import { saveInvoicePurchase } from "./invoice-purchases-data";
import { saveOperatingRecord } from "../accounting/operating-calendar-data";
import { localInvoiceDraftSchema } from "./invoice-parser";
import { refreshInvoiceReview } from "./inbox-data";

export async function saveInvoiceBatch(db: PrismaClient, userId: string, input: unknown) {
  const batch = invoiceBatchSchema.parse(input);
  const requestHash = createHash("sha256").update(JSON.stringify(batch)).digest("hex");
  return db.$transaction(async tx => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!user || user.role === "STAFF") throw new Error("Manager access required.");
    const receipt = await tx.invoiceLearningEvent.findUnique({ where: { id: batch.operationId } });
    if (receipt) {
      if (receipt.actorId !== userId || receipt.requestHash !== requestHash) throw new Error("This approval key belongs to a different edit.");
      return receipt.result;
    }
    const doc = await tx.invoiceDocument.findUniqueOrThrow({ where: { id: batch.documentId } });
    if (doc.reviewState === "DISCARDED") throw new Error("This invoice was discarded.");
    if (doc.lineRevision !== batch.expectedLineRevision) throw new Error("Invoice lines changed. Reload before approving; your draft is kept.");
    const source = doc.ocrDraft ? localInvoiceDraftSchema.parse(doc.ocrDraft) : null;
    const validKeys = new Set(source?.lines.map(line=>line.key));
    for (const key of batch.ignoredKeys) {
      if (!validKeys.has(key)) throw new Error("Recognition row not found.");
      if (batch.lines.some(line=>line.ocrLineKey===key)) throw new Error("A line cannot be approved and ignored together.");
      if (await tx.invoicePurchaseLine.findFirst({where:{invoiceDocumentId:doc.id,ocrLineKey:key}})) throw new Error("Exclude the saved line instead of removing it.");
      await tx.invoiceOcrDecision.upsert({where:{documentId_lineKey:{documentId:doc.id,lineKey:key}},create:{documentId:doc.id,lineKey:key,actorId:userId,facts:{action:"remove"}},update:{facts:{action:"remove"}}});
    }
    const revisions: Record<string, number> = {};
    for (const line of batch.lines) {
      // Restoring an excluded OCR row and approving it is one atomic operation.
      if (line.ocrLineKey) await tx.invoiceOcrDecision.deleteMany({where:{documentId:doc.id,lineKey:line.ocrLineKey}});
      const result = await saveInvoicePurchase(db, userId, line, tx);
      if (!result.ok) throw new Error(`${line.description}: ${result.error}`);
      revisions[line.id] = result.revision;
    }
    const updated = await tx.invoiceDocument.findUniqueOrThrow({where:{id:doc.id},include:{purchaseLines:{where:{voided:false}},ocrDecisions:true}});
    let expenseRevision: number | null = null;
    if (batch.commit) {
      const resolved = new Set([...updated.purchaseLines.flatMap(line=>line.ocrLineKey?[line.ocrLineKey]:[]),...updated.ocrDecisions.map(row=>row.lineKey)]);
      if (source?.lines.some(line=>!resolved.has(line.key))) throw new Error("Review or ignore every remaining OCR row before committing the invoice.");
      const first = updated.purchaseLines[0];
      if (first) {
      const amount = updated.purchaseLines.filter(line=>line.countsAsFood).reduce((sum,line)=>sum+line.amountCents,0);
      const result = await saveOperatingRecord(db,userId,{kind:"expense",id:batch.expenseId,revision:batch.expenseRevision,venueId:first.venueId,invoiceDate:first.invoiceDate.toISOString().slice(0,10),amount:(amount/100).toFixed(2),description:doc.invoiceNumber||"Reviewed invoice",invoiceDocumentId:doc.id,invoiceLineRevision:updated.lineRevision,voided:false,reason:"Confirmed invoice grid and food-line total"},tx);
      if (!result.ok) throw new Error(result.error);
      expenseRevision = result.revision;
      }
      await tx.invoiceDocument.update({where:{id:doc.id},data:{reviewState:"COMPLETE",reviewCompletedAt:new Date(),reviewedBy:userId,reviewedLineRevision:updated.lineRevision,reviewedOcrRevision:updated.ocrRevision}});
    }
    await refreshInvoiceReview(tx,doc.id);
    const result = {ok:true,revisions,lineRevision:updated.lineRevision,expenseRevision,committed:batch.commit};
    await tx.invoiceLearningEvent.create({data:{id:batch.operationId,actorId:userId,requestHash,result:result as Prisma.InputJsonValue}});
    return result;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:60000});
}
