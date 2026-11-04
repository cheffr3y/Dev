import test from "node:test";
import assert from "node:assert/strict";
import { parseInvoiceText } from "./invoice-parser";
import { formatInvoicePack, parseInvoicePack } from "./invoice-workflow";
import { positionedInvoiceRows } from "../ocr/text-layout";
import { invoiceBatchSchema } from "./invoice-batch";

test("table headers reject address metadata; a roll keeps its full description, right-side total and sub-line pack",()=>{
  const text=["W. MEQUON RD 12345 ORDER TAKER 25.00","WI 53092 12.00","QUANTITY ITEM DESCRIPTION PRICE EXTENDED PRICE",
    "1 CS 1 CS 104028 PAR BAKED ASSORTED DIAMOND ROLL 52.44 CS 52.44","105/1.3OZ PK","FUEL SURCHARGE 7.00","SUBTOTAL 59.44","TOTAL $59.44 USD","PAGE 1 OF 1"].join("\n");
  const rows=parseInvoiceText([{page:1,text}]).lines;
  assert.equal(rows.filter(row=>!row.ignored).length,1);
  const row=rows[0];
  assert.equal(row.rawCode,"104028");assert.equal(row.rawDescription,"PAR BAKED ASSORTED DIAMOND ROLL");
  assert.equal(row.extendedPrice,52.44);assert.equal(row.unitPrice,52.44);assert.equal(row.packQty,136.5);assert.equal(row.packUnit,"oz");
  assert.equal(rows.find(row=>row.rawDescription==="FUEL SURCHARGE")?.ignored,true);
});

test("pack continuations merge even without a multi-column table header",()=>{
  const rows=parseInvoiceText([{page:1,text:"1 CS 104028 DIAMOND ROLLS 52.44 CS 52.44\n105/1.3OZ PK\n2 CS 881100 TOMATO 24.00 48.00\n30 LB CS"}]).lines;
  assert.equal(rows.length,2);assert.equal(rows[0].packQty,136.5);assert.equal(rows[1].packQty,30);
});

test("shorthand packs normalize multiplicative sizes and round-trip saved defaults",()=>{
  for(const text of ["16 oz x 16","16/16 OZ","256 oz","1 cs (256 oz)","case of 256 oz"]){
    const pack=parseInvoicePack(text);assert.equal(pack?.packQty,256,text);assert.equal(pack?.packUnit,"oz",text);
    assert.deepEqual(parseInvoicePack(formatInvoicePack(pack!)),pack);
  }
  assert.deepEqual(parseInvoicePack("105/1.3OZ PK"),{unit:"case",packQty:136.5,packUnit:"oz"});
  assert.deepEqual(parseInvoicePack("30 LB CS"),{unit:"cs",packQty:30,packUnit:"lb"});
  assert.equal(parseInvoicePack("0 oz"),null);assert.equal(parseInvoicePack("case"),null);assert.equal(parseInvoicePack("16 oz x"),null);
});

test("physical row reconstruction joins out-of-order columns and preserves normalized regions",()=>{
  const word=(text:string,x:number,y:number)=>({text,bbox:{x0:x,y0:y,x1:x+50,y1:y+10}});
  const regions=positionedInvoiceRows([word("52.44",900,100),word("ROLL",300,101),word("1CS",10,100),word("104028",100,100),word("105/1.3OZ",300,120)],1000,1000);
  assert.equal(regions[0].text,"1CS 104028 ROLL 52.44");
  assert.deepEqual(regions[0].bbox,{x0:.01,y0:.1,x1:.95,y1:.111});
  const row=parseInvoiceText([{page:2,text:regions.map(row=>row.text).join("\n"),regions}]).lines[0];
  assert.equal(row.page,2);assert.equal(row.extendedPrice,52.44);assert.equal(row.packQty,136.5);
  assert.deepEqual(row.bbox,{x0:.01,y0:.1,x1:.95,y1:.13});
});

test("batch approval rejects duplicate purchases and cross-invoice edits",()=>{
  const line={id:"one",invoiceDocumentId:"invoice",revision:null,itemId:"item",vendorId:"supplier",venueId:"venue",invoiceDate:"2026-11-02",description:"Rolls",amount:"52.44",quantity:1,purchaseUnit:"cs",packQty:136.5,packUnit:"oz",countsAsFood:true};
  const batch={operationId:"e4f7d649-a1e4-4c7c-883a-3035c298d333",documentId:"invoice",expectedLineRevision:0,lines:[line],ignoredKeys:[],commit:true,expenseId:"expense",expenseRevision:null};
  assert.equal(invoiceBatchSchema.safeParse(batch).success,true);
  assert.equal(invoiceBatchSchema.safeParse({...batch,lines:[line,line]}).success,false);
  assert.equal(invoiceBatchSchema.safeParse({...batch,lines:[{...line,invoiceDocumentId:"different"}]}).success,false);
});

test("case units followed by five-digit SKUs are not mistaken for state ZIP addresses",()=>{
  const rows=parseInvoiceText([{page:1,text:"QUANTITY ITEM DESCRIPTION PRICE\n1 CS 77412 GARLIC 40.00 40.00\n4/5 LB CS"}]).lines;
  assert.equal(rows.length,1);assert.equal(rows[0].rawCode,"77412");assert.equal(rows[0].ignored,false);assert.equal(rows[0].packQty,20);
});
