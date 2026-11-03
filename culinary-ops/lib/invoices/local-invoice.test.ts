import test from "node:test";
import assert from "node:assert/strict";
import { parseInvoiceText } from "./invoice-parser";
import { matchInvoiceLine, invoiceTokens, normalizeInvoiceText, type InvoiceAlias } from "./invoice-learning";
import { preprocessInvoicePixels } from "./invoice-preprocess";
const items=[{id:"garlic",name:"Garlic, Peeled",unit:"lb",unitCost:2},{id:"cream",name:"Heavy Cream",unit:"qt",unitCost:3}];
const alias=(patch:Partial<InvoiceAlias>={}):InvoiceAlias=>({id:"alias",vendorId:"vendor",rawCode:"77412",normalizedOcrText:normalizeInvoiceText("SYS IMP PEELED GRLC 4/5LB"),tokens:invoiceTokens("SYS IMP PEELED GRLC 4/5LB"),itemId:"garlic",isIgnored:false,defaultUnit:"cs",defaultPackQty:20,defaultPackUnit:"lb",hitCount:3,...patch});
test("noisy invoice columns recover numeric swaps using line math and retain raw provenance and pack contents",()=>{
 const draft=parseInvoiceText([{page:1,text:"INVOICE TOTAL 25.00\nPAGE 1 OF 1\n77412 SYS IMP PEELED GRLC 4/5LB 2 CS S12.50 25.OO\n77500 HVY CRM 1 CS 10.00 50.00\nFUEL SURCHARGE 5.00"}]);
 assert.equal(draft.lines.length,3);const row=draft.lines[0];assert.equal(row.rawCode,"77412");assert.equal(row.quantity,2);assert.equal(row.unitPrice,12.5);assert.equal(row.extendedPrice,25);assert.equal(row.packQty,20);assert.equal(row.packUnit,"lb");assert.match(row.warnings.join(" "),/corrected/);assert.match(row.rawText,/S12.50/);assert.match(draft.lines[1].warnings.join(" "),/does not match/);
 assert.equal(parseInvoiceText([{page:1,text:"77412 SYS IMP PEELED GRLC 4/5LB"}]).lines[0].extendedPrice,null);
 const weight=parseInvoiceText([{page:1,text:"123 BEEF 12 LB 2.00 24.00"}]).lines[0];assert.equal(weight.quantity,12);assert.equal(weight.packQty,1);assert.equal(weight.packUnit,"lb");
 const leading=parseInvoiceText([{page:1,text:"2 CS 77412 SYS IMP PEELED GRLC 4/5LB 60.00 120.00"}]).lines[0];assert.equal(leading.rawCode,"77412");assert.equal(leading.quantity,2);
});
test("learned exact and noisy aliases outrank catalog suggestions without crossing supplier boundaries",()=>{
 assert.equal(matchInvoiceLine("77412","SYS IMP PEELED GRLC 4/5LB","vendor",[alias()],items).confidence,"learned-exact");
 const noisy=matchInvoiceLine(null,"SYS IMP PEELED GRLIC 4/5LB","vendor",[alias()],items);assert.equal(noisy.itemId,"garlic");assert.equal(noisy.confidence,"learned-fuzzy");assert.ok(noisy.score>.82);
 assert.notEqual(matchInvoiceLine("77412","SYS IMP PEELED GRLC 4/5LB","other",[alias()],items).confidence,"learned-exact");
 assert.equal(matchInvoiceLine(null,"HVY CRM","vendor",[],items).itemId,"cream");assert.equal(matchInvoiceLine(null,"UNKNOWN WIDGET","vendor",[],items).confidence,"unmatched");
 assert.equal(matchInvoiceLine("77412","different text","other",[alias({vendorId:null})],items).confidence,"learned-exact");
});
test("exact learned non-food memory auto-marks ignored but fuzzy ignored descriptions never silently suppress food",()=>{
 const ignored=alias({rawCode:null,normalizedOcrText:"FUEL SURCHARGE",tokens:invoiceTokens("FUEL SURCHARGE"),itemId:null,isIgnored:true});
 assert.equal(matchInvoiceLine(null,"Fuel surcharge","vendor",[ignored],items).isIgnored,true);
 assert.equal(matchInvoiceLine(null,"Fuel surcharg","vendor",[ignored],items).isIgnored,false);
 assert.equal(matchInvoiceLine(null,"Linen bag","vendor",[alias({...ignored,normalizedOcrText:"LINEN BAG",tokens:invoiceTokens("LINEN BAG")})],items).isIgnored,true);
});
test("adaptive thresholding retains dark text under a shadow and makes page backgrounds white",()=>{
 const width=100,height=60,data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;const value=x===30&&y>10&&y<40?20:130+x;data[i]=data[i+1]=data[i+2]=value;data[i+3]=255;}
 preprocessInvoicePixels(data,width,height);assert.equal(data[(20*width+30)*4],0);assert.equal(data[(20*width+70)*4],255);assert.throws(()=>preprocessInvoicePixels(data,0,60));
});
