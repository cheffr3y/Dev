import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { launchBrowser, browserBaseUrl } from "../harness.mjs";

const db=new PrismaClient(),base=browserBaseUrl(),browser=await launchBrowser(),output="/tmp/invoice-workflow-review";
await mkdir(output,{recursive:true});
try {
  const vendor=await db.vendor.create({data:{name:"Spreadsheet QA Supplier"}});
  const roll=await db.item.create({data:{name:"Spreadsheet Diamond Rolls",unit:"oz",unitCost:.3,vendorId:vendor.id}});
  const pepper=await db.item.create({data:{name:"Spreadsheet White Pepper",unit:"oz",unitCost:1,vendorId:vendor.id}});
  for(const [item,code,description,packQty] of [[roll,"104028","PAR BAKED ASSORTED DIAMOND ROLL",136.5],[pepper,"SPP101","WHITE PEPPER",80]]) {
    await db.invoiceItemAlias.create({data:{vendorId:vendor.id,itemId:item.id,rawCode:code,normalizedOcrText:description,tokens:description.split(" "),defaultUnit:"cs",defaultPackQty:packQty,defaultPackUnit:"oz"}});
  }
  const context=await browser.newContext({viewport:{width:1600,height:1100}}),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(60000);page.on("pageerror",error=>errors.push(error.message));
  await page.goto(`${base}/login`);await page.getByLabel("Email").fill("admin@local.test");await page.getByLabel("Password").fill("local-smoke-only");await page.getByRole("button",{name:"Sign in",exact:true}).click();await page.waitForURL(`${base}/`);
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Courier),sheet=pdf.addPage([1000,600]);
  ["INVOICE DATE 11/02/2026","SHIP TO: Clipboard Kitchen","W. MEQUON RD ORDER TAKER 555.00","QUANTITY ITEM DESCRIPTION PRICE EXTENDED PRICE",
    "1 CS 1 CS 104028 PAR BAKED ASSORTED DIAMOND ROLL 52.44 CS 52.44","105/1.3OZ PK","1 CS 1 CS SPP101 WHITE PEPPER 49.89 CS 49.89","1/5 LB CS","FUEL SURCHARGE 7.00","TOTAL $109.33 USD"].forEach((text,index)=>sheet.drawText(text,{x:25,y:560-index*35,size:14,font}));
  const second=pdf.addPage([1000,600]);second.drawText("PAGE 2 OF 2",{x:25,y:560,size:14,font});
  await page.goto(`${base}/invoices`);await page.getByLabel("Invoice vendor",{exact:true}).selectOption(vendor.id);
  await page.getByLabel("Invoice PDF or photo",{exact:true}).setInputFiles({name:"spreadsheet-products.pdf",mimeType:"application/pdf",buffer:Buffer.from(await pdf.save())});
  await page.getByRole("button",{name:"Store invoice",exact:true}).click();await page.waitForURL(/\/invoices\?.*id=/);
  const id=new URL(page.url()).searchParams.get("id"),review=page.getByRole("region",{name:"Invoice purchase review",exact:true}),table=review.getByRole("table",{name:"Editable invoice lines"});
  const rows=table.locator("tbody tr"),rollRow=rows.filter({has:page.locator('input[value="104028"]')}),pepperRow=rows.filter({has:page.locator('input[value="SPP101"]')});
  await review.getByRole("button",{name:"Approve All Matched Lines (2)",exact:true}).waitFor();
  assert.equal(await rows.count(),2,"Fees and address garbage are hidden by default");
  assert.equal(await rollRow.getByLabel("OCR description",{exact:true}).inputValue(),"PAR BAKED ASSORTED DIAMOND ROLL");
  assert.equal(await rollRow.getByLabel("Line total ($)",{exact:true}).inputValue(),"52.44");
  assert.equal(await review.getByLabel("Invoice date",{exact:true}).inputValue(),"2026-11-02");
  assert.equal(await review.getByLabel("Invoice venue",{exact:true}).inputValue(),"clipboard-venue");
  assert.equal(await review.getByRole("checkbox",{name:/verified.*USD/i}).count(),0);
  await review.getByLabel("Invoice total ($)",{exact:true}).fill("102.33");await review.getByText("Matches invoice",{exact:true}).waitFor();
  await rollRow.getByLabel("Pack / unit size",{exact:true}).focus();await page.keyboard.press("Enter");
  assert.equal(await pepperRow.getByLabel("Pack / unit size",{exact:true}).evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press("ArrowUp");assert.equal(await rollRow.getByLabel("Pack / unit size",{exact:true}).evaluate(el=>el===document.activeElement),true);
  await rollRow.getByLabel("Pack / unit size",{exact:true}).fill("105/1.3 oz");
  await page.getByLabel("Invoice source page",{exact:true}).selectOption("2");
  await rollRow.getByLabel("Line total ($)",{exact:true}).focus();
  assert.equal(await page.getByLabel("Invoice source page",{exact:true}).inputValue(),"1");
  await page.getByLabel("Selected invoice line region",{exact:true}).waitFor();
  await review.getByLabel(/Show ignored rows/).check();assert.equal(await rows.count(),3);
  await review.getByLabel(/Show ignored rows/).uncheck();
  async function draftSaved(){await page.getByLabel("Invoice draft status",{exact:true}).getByText("Draft saved to your account",{exact:true}).waitFor();}
  await draftSaved();await page.reload();await rollRow.waitFor();
  assert.equal(await rollRow.getByLabel("Pack / unit size",{exact:true}).inputValue(),"105/1.3 oz");
  await rollRow.getByLabel("OCR description",{exact:true}).focus();
  await page.getByRole("region",{name:"Invoice source document",exact:true}).getByRole("status").waitFor({state:"hidden"});
  await page.screenshot({path:`${output}/inline-grid-desktop.png`,fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:`${output}/inline-grid-mobile.png`,fullPage:true});
  const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,elements:[...document.querySelectorAll("body *")].filter(el=>el.getBoundingClientRect().right>innerWidth+1&&!el.closest("[data-edit-grid]")).map(el=>({tag:el.tagName,cls:el.className,right:el.getBoundingClientRect().right,width:el.getBoundingClientRect().width})).slice(0,15)}));
  assert.equal(overflow.scroll<=overflow.width,true,JSON.stringify(overflow));
  await page.setViewportSize({width:1600,height:1100});
  // A lost response replays the same transaction, rather than inserting duplicate lines or learning twice.
  await page.route("**/api/invoice-purchases/batch",async route=>{await route.fetch();await route.abort();},{times:1});
  await review.getByRole("button",{name:"Approve All Matched Lines (2)",exact:true}).click();
  await review.getByRole("status").filter({hasText:/fetch|network|approval failed/i}).waitFor();
  await review.getByRole("button",{name:"Approve All Matched Lines (2)",exact:true}).click();
  await review.getByText("Invoice approved. Food spending and ingredient prices updated.",{exact:true}).waitFor();
  assert.equal(await db.invoicePurchaseLine.count({where:{invoiceDocumentId:id}}),2);
  assert.equal((await db.operatingFoodExpense.findUniqueOrThrow({where:{invoiceDocumentId:id}})).amountCents,10233);
  assert.equal((await db.invoiceDocument.findUniqueOrThrow({where:{id}})).reviewState,"COMPLETE");
  assert.equal((await db.invoiceItemAlias.findFirstOrThrow({where:{vendorId:vendor.id,rawCode:"104028"}})).hitCount,2);
  // Existing purchases and new manual entries use the same grid and header.
  await review.getByRole("button",{name:"+ Add Line",exact:true}).click();
  const manual=rows.last();
  await manual.getByLabel("OCR description",{exact:true}).fill("Extra rolls");
  const picker=manual.getByRole("combobox");await picker.fill(roll.name);await page.locator(`[data-option-id="${roll.id}"]`).click();
  assert.equal(await manual.getByLabel("Pack / unit size",{exact:true}).inputValue(),"case (136.5 oz)");
  await manual.getByLabel("Line total ($)",{exact:true}).fill("20");
  await draftSaved();await page.reload();
  const recovered=rows.last();await recovered.waitFor();
  assert.equal(await recovered.getByLabel("Line total ($)",{exact:true}).inputValue(),"20");
  await recovered.focus();await page.keyboard.press("Delete");assert.equal(await rows.count(),2);
  await pepperRow.getByLabel("Line total ($)",{exact:true}).fill("45");
  await review.getByRole("button",{name:"Approve All Matched Lines (2)",exact:true}).click();
  await review.getByText("Invoice approved. Food spending and ingredient prices updated.",{exact:true}).waitFor();
  assert.equal((await db.operatingFoodExpense.findUniqueOrThrow({where:{invoiceDocumentId:id}})).amountCents,9744);
  assert.equal(await db.invoicePurchaseLine.count({where:{invoiceDocumentId:id}}),2);
  assert.deepEqual(errors,[]);console.log(`Invoice spreadsheet browser checks passed. Screenshots: ${output}`);
} finally {await browser.close();await db.$disconnect();}
