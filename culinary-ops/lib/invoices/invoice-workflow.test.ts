import test from "node:test";
import assert from "node:assert/strict";
import { parseInvoiceText } from "./invoice-parser";
import { invoiceDetailsFromText, invoicePackDefaults } from "./invoice-workflow";
import { textFromPositionedWords } from "../ocr/text-layout";

test("supplier tables keep description, pack and price continuations in one product row",()=>{
  const draft=parseInvoiceText([{page:1,text:[
    "INVOICE No. 12345", "INV DATE 11/02/2026", "FOX TOWN STATION AND EVENTS",
    "ORDERED SHIPPED ITEM#", "QTY UOM QTY UOM CUSTOMER ITEM# DESCRIPTION INFO PRICE UOM EXTENDED",
    "2 PC 1 PC SPN100 SPC NUTMEG GROUND", "1/16 OZ PC Plt#: 7 13.84 PC 13.84",
    "1PC 1PC TAH100 TAHINI", "12/1 LB BC Plt#: 7 100.72 CS 8.39",
    "2CS 2CS SUG100 SUGAR DARK BROWN", "24/1 LB BOX BC Plt#: 7 59.73 CS 119.46",
    "WE ARE QUOTING YOU A CASH DISCOUNTED PRICE", "TOTALS: CASES 4.000 PIECES 2.000 WEIGHT 50.00",
    "The seller of these commodities retains a trust claim FUEL 8.95", "TOTAL 150.64 USD",
  ].join("\n")}]);
  assert.equal(draft.lines.length,3);
  const [nutmeg,tahini,sugar]=draft.lines;
  assert.equal(nutmeg.rawCode,"SPN100");assert.equal(nutmeg.rawDescription,"SPC NUTMEG GROUND");
  assert.equal(nutmeg.quantity,1,"Shipped quantity, not ordered quantity, is billed");
  assert.equal(nutmeg.extendedPrice,13.84);assert.equal(nutmeg.packQty,16);assert.equal(nutmeg.packUnit,"oz");
  assert.match(nutmeg.rawText,/\n1\/16 OZ/);
  assert.equal(tahini.packQty,1,"A broken-case piece contains the inner pack, not the full case");
  assert.equal(tahini.packUnit,"lb");assert.equal(tahini.extendedPrice,8.39);
  assert.equal(sugar.quantity,2);assert.equal(sugar.packQty,24);assert.equal(sugar.extendedPrice,119.46);
});

test("invoice metadata recognizes a unique invoice date and venue, excluding payment due dates",()=>{
  const venues=[{id:"station",name:"The Station"},{id:"brewpub",name:"Foxtown Brewpub"}];
  const suggested=invoiceDetailsFromText([{text:"INV DATE 11/02/2026\nFOX TOWN STATION AND EVENTS\nTOTAL $100.00 USD\nNET DUE DATE 11/16/2026"}],venues);
  assert.deepEqual(suggested,{date:"2026-11-02",venueId:"station",currency:"USD"});
  assert.equal(invoiceDetailsFromText([{text:"INV DATE 11/02/2026\nINVOICE DATE 11/03/2026"}],venues).date,"");
  assert.equal(invoiceDetailsFromText([{text:"NET DUE DATE 11/16/2026"}],venues).date,"");
  assert.equal(invoiceDetailsFromText([{text:"INV DATE 2/31/2026"}],venues).date,"");
  assert.equal(invoiceDetailsFromText([{text:"11/02/2026\nInvoice No. 12345 INV DATE"}],venues).date,"2026-11-02");
  assert.equal(invoiceDetailsFromText([{text:"TOTAL 100.00 CAD"}],venues).currency,"USD");
});

test("pack defaults prefer explicit billed contents, then supplier memory, then the catalog",()=>{
  const item={unit:"oz",packQty:5,packUnit:"lb"},learned={unit:"pc",packQty:16,packUnit:"oz"};
  assert.deepEqual(invoicePackDefaults("16oz",item,learned),{unit:"16oz",packQty:16,packUnit:"oz"});
  assert.deepEqual(invoicePackDefaults("",item,learned),{unit:"pc",packQty:16,packUnit:"oz"});
  assert.deepEqual(invoicePackDefaults("",item),{unit:"case",packQty:5,packUnit:"lb"});
  assert.deepEqual(invoicePackDefaults("lb",{unit:"lb"}),{unit:"lb",packQty:1,packUnit:"lb"});
  assert.deepEqual(invoicePackDefaults("",{unit:"oz"}),{unit:"",packQty:null,packUnit:"oz"},"Unknown purchased packs still need a real size");
});

test("OCR words from separate columns are rebuilt into physical product rows",()=>{
  const word=(text:string,x:number,y:number)=>({text,bbox:{x0:x,y0:y,x1:x+30,y1:y+12}});
  const blocks=[{paragraphs:[{lines:[{words:[word("13.84",300,30),word("13.84",400,30)]}]}]},
    {paragraphs:[{lines:[{words:[word("1PC",10,10),word("1PC",60,10),word("SPN101",120,10),word("NUTMEG",200,10)]},{words:[word("1/16",200,30),word("OZ",250,30)]}]}]}];
  const text=textFromPositionedWords(blocks,"");
  assert.equal(text,"1PC 1PC SPN101 NUTMEG\n1/16 OZ 13.84 13.84");
  const row=parseInvoiceText([{page:1,text:`ORDERED SHIPPED\n${text}`}]).lines[0];
  assert.equal(row.rawCode,"SPN101");assert.equal(row.extendedPrice,13.84);assert.equal(row.packQty,16);
});

test("noisy shipped units remain product boundaries and quoted case/weight prices normalize to billed packs",()=>{
  const lines=parseInvoiceText([{page:1,text:["ORDERED SHIPPED ITEM#",
    "1CS 1CS ROL100 ROLLS 100/50 GR CS 62.44 CS 62.44",
    "1CSs 1cs BUT100 BUTTER 36/1 LB CS 104.31 CS 104.31",
    "iCs ics NUT100 WALNUT PIECES 1/5 LB BOX CS 5.73 LB 28.65",
    "1PC 1pPC KEL100 SEAWEED 10/2.2 LBBC 425.66 CS 42.57",
    "2Cs 2cCs SUG100 SUGAR 24/1 LB BOX BC 59.73 CS 119.46",
  ].join("\n")}]).lines;
  assert.deepEqual(lines.map(row=>row.rawCode),["ROL100","BUT100","NUT100","KEL100","SUG100"]);
  assert.deepEqual(lines.map(row=>row.quantity),[1,1,1,1,2]);
  assert.equal(lines[2].unitPrice,28.65);assert.equal(lines[2].packQty,5);
  assert.equal(lines[3].packQty,2.2);assert.equal(lines[3].unitPrice,42.566);assert.equal(lines[3].extendedPrice,42.57);
  assert.equal(lines[4].packQty,24);
});
