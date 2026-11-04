const quantityUnit = "(?:CS|CASE|PC|EA|EACH|LB|LBS|OZ|KG|BAG|BOX|PK|PACK)";
const billed = `(?:\\d+(?:[.]\\d+)?|[Il])\\s*${quantityUnit}`;
export const invoiceProductStart = new RegExp(`^(?:${billed}\\s+){1,2}[A-Z0-9-]{3,30}\\s+[A-Z]`, "i");
const repeatedQuantity = new RegExp(`^${billed}\\s+${billed}\\s+`, "i");
const endOfItems = /^(?:[WN]E ARE QUOTING|[T\[]?HE FULL PRICE|TOTALS?\s*:|(?:THE\s+)?PERISHABLE\s+AGRICULTUR|SUB\s*TOTAL|GRAND\s+TOTAL|SUBJECT TO TERMS)/i;
export function normalizeInvoiceLine(text:string) {
  return text.replace(/\s+/g," ").trim().replace(/(^|\s)(\d+(?:[.]\d+)?)\s*P{2,}C\b/gi,"$1$2 PC")
    .replace(/(^|\s)(\d+(?:[.]\d+)?)\s*C+S+\b/gi,"$1$2 CS")
    .replace(/^(?:CS|PC|S|C)\s+(?=\d+\s*(?:CS|PC)\b)/i,"").replace(/\b0Z\b/g,"OZ");
}

/** Join the description/pack/price continuation lines of a supplier table. */
export function invoiceSourceRows(text: string) {
  const sources = text.split(/\r?\n/).map((rawText, index) => ({ rawText: rawText.trim(), lineNumber: index + 1 }));
  const table = /\bORDERED\b/i.test(text) && /\bSHIPPED\b/i.test(text) || sources.filter(line => repeatedQuantity.test(line.rawText)).length >= 2;
  if (!table) return sources;
  const result: typeof sources = [];
  let current: (typeof sources)[number] | null = null;
  for (const source of sources) {
    const line = normalizeInvoiceLine(source.rawText);
    if (endOfItems.test(line)) break;
    if (invoiceProductStart.test(line)) {
      if (current) result.push(current);
      current = { ...source };
    } else if (current && line && current.rawText.length + line.length < 1500) {
      current.rawText += `\n${source.rawText}`;
    }
  }
  if (current) result.push(current);
  return result.length ? result : sources;
}
