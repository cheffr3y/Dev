import test from "node:test";
import assert from "node:assert/strict";
import { invoiceCost, invoiceMatches, type InvoiceLine } from "./invoice-options";
import { invoiceFileType } from "./invoice-parser";
const line: InvoiceLine = {description:"Butter unsalted",sku:"123",gcode:null,packSize:"40 lb",quantity:2,unitPrice:160,priceUnit:"case",packQuantity:40,packUnit:"lb",extendedTotal:320,notes:null};
test("invoice prices convert per-case and per-weight costs; unknown conversions and credits require review",()=>{
  assert.equal(invoiceCost(line,"lb"),4); assert.equal(invoiceCost(line,"oz"),0.25);
  assert.equal(invoiceCost({...line,priceUnit:"lb",unitPrice:4},"oz"),0.25);
  assert.equal(invoiceCost({...line,packQuantity:null},"lb"),null);
  assert.equal(invoiceCost(line,"gal"),null); assert.equal(invoiceCost({...line,unitPrice:-4},"lb"),null);
});
test("SKU matches are vendor-specific; cross-vendor names and shared GCODE remain review suggestions",()=>{
  const items=[{id:"other",name:"Paper towels",sku:"123",gcode:null,vendor:{name:"Other"}},{id:"butter",name:"Unsalted butter",sku:"456",gcode:null,vendor:{name:"Other"}}];
  assert.equal(invoiceMatches(line,"Supplier",items)[0].id,"butter");
  assert.equal(invoiceMatches(line,"Other",items)[0].id,"other");
});
test("invoice file validation checks content signatures instead of trusting filenames",()=>{
  assert.equal(invoiceFileType(Buffer.from("%PDF-1.7")),"application/pdf");
  assert.throws(()=>invoiceFileType(Buffer.from("not an invoice")),/Choose a PDF/);
});

test("PDF parsing sends bounded structured input and rejects incomplete output",async()=>{
  const {parseInvoice}=await import("./invoice-parser");
  const fixture={vendorName:"Supplier",invoiceNumber:"INV1",invoiceDate:null,currency:"USD",lines:[line]};
  const request:typeof fetch=async(_url,init)=>{
    const body=JSON.parse(String(init?.body));assert.equal(body.store,false);assert.equal(body.text.format.type,"json_schema");assert.equal(body.text.format.strict,true);assert.equal(body.input[0].content[0].type,"input_file");assert.match(body.input[0].content[0].file_data,/^data:application\/pdf;base64,/);
    return Response.json({status:"completed",output:[{content:[{type:"output_text",text:JSON.stringify(fixture)}]}]});
  };
  assert.deepEqual(await parseInvoice(Buffer.from("%PDF-test"),"invoice.pdf","application/pdf",{apiKey:"fixture-only",request}),fixture);
  await assert.rejects(parseInvoice(Buffer.from("%PDF-test"),"invoice.pdf","application/pdf",{apiKey:"fixture-only",request:async()=>Response.json({status:"incomplete"})}),/incomplete/);
});
