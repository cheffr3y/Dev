import type { Prisma } from "@prisma/client";
import { invoiceTokens, normalizeInvoiceCode, normalizeInvoiceText } from "./invoice-learning";
type Tx = Prisma.TransactionClient;
export async function rememberInvoiceAlias(tx: Tx, data: { vendorId: string; rawCode: string | null; description: string; itemId: string | null; isIgnored: boolean; defaultUnit?: string | null; defaultPackQty?: number | null; defaultPackUnit?: string | null }) {
  const normalizedOcrText=normalizeInvoiceText(data.description), rawCode=normalizeInvoiceCode(data.rawCode);
  if(!normalizedOcrText || !data.isIgnored && !data.itemId) throw new Error("Choose an ingredient or mark the line ignored before remembering it.");
  const matches=await tx.invoiceItemAlias.findMany({where:{vendorId:data.vendorId,OR:[{normalizedOcrText},...(rawCode?[{rawCode}]:[])]},orderBy:{createdAt:"asc"}});
  const primary=matches.find(row=>rawCode && row.rawCode===rawCode) ?? matches[0];
  // An explicit correction may unify two earlier aliases, while other vendors
  // and global memory remain independent. This executes inside the save's tx.
  const duplicates=matches.filter(row=>row.id!==primary?.id);
  if(duplicates.length) await tx.invoiceItemAlias.deleteMany({where:{id:{in:duplicates.map(row=>row.id)}}});
  const fields={vendorId:data.vendorId,rawCode:rawCode??primary?.rawCode??null,normalizedOcrText,tokens:invoiceTokens(data.description),itemId:data.isIgnored?null:data.itemId,isIgnored:data.isIgnored,
    defaultUnit:data.defaultUnit??primary?.defaultUnit??null,defaultPackQty:data.defaultPackQty??primary?.defaultPackQty??null,defaultPackUnit:data.defaultPackUnit??primary?.defaultPackUnit??null};
  return primary ? tx.invoiceItemAlias.update({where:{id:primary.id},data:{...fields,hitCount:primary.hitCount+duplicates.reduce((sum,row)=>sum+row.hitCount,0)+1}}) : tx.invoiceItemAlias.create({data:fields});
}
