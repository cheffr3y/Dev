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

export const invoiceTableHeader = /(?:\bORDERED\b.*\bSHIPPED\b|\b(?:QUANTITY|QTY)\b.*\b(?:ITEM|DESCRIPTION|PRICE)\b|\bDESCRIPTION\b.*\b(?:PRICE|EXTENDED)\b)/i;
export const invoiceGarbage = /\b(?:MEQUON\s+RD|(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\s+\d{5}(?:-\d{4})?|CUSTOMER COPY|ORDER TAKER|PAGE\s+\d+\s+OF\s+\d+|PAYMENT TERMS|TERMS(?:\s*:)?|SUB\s*TOTAL|FUEL SURCHARGE|PRODUCE ACT|PERISHABLE\s+AGRICULTUR(?:AL|E))\b/i;
const packContinuation = /^(?:\d+(?:\.\d+)?\s*[\/x]\s*)?\d+(?:\.\d+)?\s*(?:OZ|LB|KG|GR|G|GAL|QT|ML|EA|EACH)\b/i;

/** Join physical table rows without swallowing addresses or the next product. */
export function invoiceSourceRows(text: string) {
  const sources = text.split(/\r?\n/).map((rawText, index) => ({ rawText: rawText.trim(), lineNumber: index + 1 }));
  const header = sources.findIndex(source => invoiceTableHeader.test(source.rawText));
  const table = header >= 0 || sources.filter(line => repeatedQuantity.test(line.rawText)).length >= 2;
  const result: typeof sources = [];
  let current: (typeof sources)[number] | null = null;
  const flush = () => { if (current) result.push(current); current = null; };
  for (const source of sources) {
    const line = normalizeInvoiceLine(source.rawText);
    if (header >= 0 && source.lineNumber <= header + 1) continue;
    if (invoiceTableHeader.test(line)) { flush(); continue; }
    if (table && endOfItems.test(line)) { flush(); break; }
    if (invoiceGarbage.test(line)) { flush(); result.push(source); continue; }
    const product = invoiceProductStart.test(line) || /^[A-Z0-9-]{3,30}\s+[A-Z].*\s-?\d+\.\d{2}\s*$/i.test(line) && /\d/.test(line.split(/\s/)[0]);
    if (product) { flush(); current = { ...source }; }
    else if (current && line && (packContinuation.test(line) || table && !/\b(?:INVOICE|BILL TO|SHIP TO|PHONE|TERMS|TOTAL)\b/i.test(line)) && current.rawText.length + line.length < 1500) {
      current.rawText += `\n${source.rawText}`;
    } else { flush(); if (line) result.push(source); }
  }
  flush();
  return result;
}
