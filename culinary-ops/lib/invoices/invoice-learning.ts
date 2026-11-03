export type InvoiceAlias = { id: string; vendorId: string | null; rawCode: string | null; normalizedOcrText: string; tokens: string[]; itemId: string | null; isIgnored: boolean; defaultUnit: string | null; defaultPackQty: number | null; defaultPackUnit: string | null; hitCount: number };
export type InvoiceCatalogItem = { id: string; name: string; unit: string; unitCost: number; sku?: string | null; vendorId?: string | null };
export type LocalMatch = { confidence: "learned-exact" | "learned-fuzzy" | "catalog-fuzzy" | "unmatched"; itemId: string | null; isIgnored: boolean; score: number; candidates: { id: string; name: string; score: number }[]; defaultUnit: string | null; defaultPackQty: number | null; defaultPackUnit: string | null };
export const normalizeInvoiceText = (text: string) => text.toUpperCase().normalize("NFKD").replace(/[^A-Z0-9]+/g, " ").trim().replace(/\s+/g, " ");
export const normalizeInvoiceCode = (code: string | null) => code ? normalizeInvoiceText(code).replace(/ /g, "") || null : null;
const expansions: Record<string,string> = { BNLS:"BONELESS", SKLS:"SKINLESS", CHK:"CHICKEN", CHX:"CHICKEN", HVY:"HEAVY", CRM:"CREAM", GRLC:"GARLIC", GRLIC:"GARLIC", PEELED:"PEELED", IQF:"FROZEN" };
export function invoiceTokens(text: string) { return [...new Set(normalizeInvoiceText(text).split(" ").map(token => expansions[token] ?? token).filter(token => token && !/^\d+$/.test(token) && !["CS","CASE","LB","LBS","OZ","KG","EA","PK","PACK"].includes(token)))]; }
export function textSimilarity(a: string, b: string) {
  if (!a || !b) return 0;
  let previous = Array.from({length:b.length+1}, (_,i)=>i);
  for(let i=1;i<=a.length;i++) { const row=[i]; for(let j=1;j<=b.length;j++) row[j]=Math.min(row[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1)); previous=row; }
  return 1-previous[b.length]/Math.max(a.length,b.length);
}
const overlap = (a: string[], b: string[]) => { const intersection=a.filter(token=>b.includes(token)).length; return { jaccard:intersection/Math.max(1,new Set([...a,...b]).size), coverage:intersection/Math.max(1,Math.min(a.length,b.length)) }; };
export function matchInvoiceLine(rawCode: string | null, description: string, vendorId: string | null, aliases: InvoiceAlias[], items: InvoiceCatalogItem[]): LocalMatch {
  const code=normalizeInvoiceCode(rawCode), normalized=normalizeInvoiceText(description), tokens=invoiceTokens(description), existing=new Map(items.map(item=>[item.id,item]));
  const scoped=aliases.filter(alias=>(alias.vendorId===vendorId || alias.vendorId===null) && (alias.isIgnored || alias.itemId && existing.has(alias.itemId)));
  const empty:Omit<LocalMatch,"confidence">={itemId:null,isIgnored:false,score:0,candidates:[],defaultUnit:null,defaultPackQty:null,defaultPackUnit:null};
  // Most repeat invoices finish here; don't run a catalog-wide edit-distance
  // search before checking a known supplier SKU or exact learned description.
  for(const scope of [vendorId,null].filter((value,index,array)=>array.indexOf(value)===index)) {
    const group=scoped.filter(alias=>alias.vendorId===scope);
    const exact=(code ? group.find(alias=>alias.rawCode===code) : null) ?? group.find(alias=>alias.normalizedOcrText===normalized);
    if(exact) { const item=exact.itemId?existing.get(exact.itemId):null;return {...empty,confidence:"learned-exact",itemId:exact.isIgnored?null:exact.itemId,isIgnored:exact.isIgnored,score:1,candidates:item?[{id:item.id,name:item.name,score:1}]:[],defaultUnit:exact.defaultUnit,defaultPackQty:exact.defaultPackQty,defaultPackUnit:exact.defaultPackUnit}; }
  }
  const fuzzy=scoped.flatMap(alias=>{
    const jac=overlap(tokens,alias.tokens).jaccard, maxEdit=1-Math.abs(normalized.length-alias.normalizedOcrText.length)/Math.max(1,normalized.length,alias.normalizedOcrText.length);
    if(maxEdit*.7+jac*.3<=.82)return [];
    return [{alias,score:textSimilarity(normalized,alias.normalizedOcrText)*.7+jac*.3}];
  }).filter(row=>row.score>.82).sort((a,b)=>b.score-a.score || Number(b.alias.vendorId===vendorId)-Number(a.alias.vendorId===vendorId)||b.alias.hitCount-a.alias.hitCount)[0];
  if(fuzzy && !fuzzy.alias.isIgnored) {const item=existing.get(fuzzy.alias.itemId!)!;return {...empty,confidence:"learned-fuzzy",itemId:item.id,score:fuzzy.score,candidates:[{id:item.id,name:item.name,score:fuzzy.score}],defaultUnit:fuzzy.alias.defaultUnit,defaultPackQty:fuzzy.alias.defaultPackQty,defaultPackUnit:fuzzy.alias.defaultPackUnit};}
  const candidates=items.flatMap(item=> {
    if(code && item.vendorId===vendorId && normalizeInvoiceCode(item.sku??null)===code)return [{id:item.id,name:item.name,score:1}];
    const target=invoiceTokens(item.name), match=overlap(tokens,target), base=match.coverage*.65+match.jaccard*.2;
    if(base+.15<=.2)return [];
    return [{id:item.id,name:item.name,score:base+textSimilarity(tokens.join(" "),target.join(" "))*.15}];
  }).filter(item=>item.score>.2).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)).slice(0,5);
  return candidates[0]?.score>.45 ? {...empty,candidates,confidence:"catalog-fuzzy",itemId:candidates[0].id,score:candidates[0].score} : {...empty,candidates,confidence:"unmatched"};
}
