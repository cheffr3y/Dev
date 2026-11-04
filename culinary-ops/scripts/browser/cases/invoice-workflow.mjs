import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { launchBrowser, browserBaseUrl } from "../harness.mjs";

const db=new PrismaClient(),browser=await launchBrowser(),base=browserBaseUrl(),output="/tmp/invoice-workflow-review";
await mkdir(output,{recursive:true});let page;
try {
  const vendor=await db.vendor.create({data:{name:"Workflow QA Supplier"}});
  const nutmeg=await db.item.create({data:{name:"Workflow Ground Nutmeg",unit:"oz",unitCost:1,vendorId:vendor.id}});
  const pepper=await db.item.create({data:{name:"Workflow White Pepper",unit:"oz",unitCost:1,vendorId:vendor.id}});
  for(const [item,code,description,packQty] of [[nutmeg,"SPN101","GROUND NUTMEG",16],[pepper,"SPP101","WHITE PEPPER",80]]) {
    await db.invoiceItemAlias.create({data:{vendorId:vendor.id,itemId:item.id,rawCode:code,normalizedOcrText:description,tokens:description.split(" "),defaultUnit:"pc",defaultPackQty:packQty,defaultPackUnit:"oz"}});
  }
  const context=await browser.newContext({viewport:{width:1440,height:1100}});page=await context.newPage();page.setDefaultTimeout(30000);
  const errors=[];page.on("pageerror",error=>errors.push(error.message));
  await page.goto(`${base}/login`);await page.getByLabel("Email").fill("admin@local.test");await page.getByLabel("Password").fill("local-smoke-only");await page.getByRole("button",{name:"Sign in",exact:true}).click();await page.waitForURL(`${base}/`);
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Courier),sheet=pdf.addPage([1000,600]);
  const text=["INVOICE DATE 11/02/2026","SHIP TO: Clipboard Kitchen","ORDERED SHIPPED ITEM# DESCRIPTION INFO PRICE UOM EXTENDED",
    "2PC 1PC SPN101 GROUND NUTMEG","1/16 OZ PC Plt#: 7 13.84 PC 13.84",
    "1PC 1PC SPP101 WHITE PEPPER","1/5 LB PC Plt#: 7 49.89 PC 49.89","TOTALS: PIECES 2","TOTAL $63.73 USD"];
  text.forEach((line,index)=>sheet.drawText(line,{x:25,y:560-index*35,size:14,font}));
  await page.goto(`${base}/invoices`);await page.getByLabel("Invoice vendor",{exact:true}).selectOption(vendor.id);
  await page.getByLabel("Invoice PDF or photo",{exact:true}).setInputFiles({name:"workflow-two-line-products.pdf",mimeType:"application/pdf",buffer:Buffer.from(await pdf.save())});
  await page.getByRole("button",{name:"Store invoice",exact:true}).click();await page.waitForURL(/\/invoices\?.*id=/);
  const documentId=new URL(page.url()).searchParams.get("id"),review=page.getByRole("region",{name:"Local invoice OCR review",exact:true});
  await review.getByRole("button",{name:"Review 2 ready lines together",exact:true}).waitFor();
  assert.equal(await review.getByLabel("OCR invoice date",{exact:true}).inputValue(),"2026-11-02");
  assert.equal(await review.getByLabel("OCR venue",{exact:true}).inputValue(),"clipboard-venue");
  assert.equal(await review.getByLabel("Invoice currency",{exact:true}).inputValue(),"USD");
  assert.equal(await review.getByRole("navigation",{name:"Invoice review lines"}).getByRole("button").count(),2);
  assert.equal(await review.getByRole("form").getByLabel("OCR pack quantity",{exact:true}).inputValue(),"16");
  assert.equal(await review.getByRole("button",{name:"Approve invoice price",exact:true}).isEnabled(),true,"The confirm action itself reviews the row");
  assert.equal(await db.invoicePurchaseLine.count({where:{invoiceDocumentId:documentId}}),0,"Opening review never approves costs");
  await review.getByRole("button",{name:"Review 2 ready lines together",exact:true}).click();
  await review.getByRole("table",{name:"Ready invoice lines"}).waitFor();
  await page.screenshot({path:`${output}/ready-lines-desktop.png`});
  await review.getByRole("button",{name:"Confirm 2 reviewed lines",exact:true}).click();await review.getByText(/2 approved/).waitFor();
  const purchases=await db.invoicePurchaseLine.findMany({where:{invoiceDocumentId:documentId},orderBy:{amountCents:"asc"}});
  assert.equal(purchases.length,2);assert.equal(purchases[0].amountCents,1384);assert.equal(purchases[0].packQty,16);assert.equal(purchases[1].packQty,5);assert.equal(purchases[1].packUnit,"lb");
  await page.getByText(/Saved lines & food spending ·/).click();await page.getByRole("button",{name:"Add invoice line",exact:true}).click();
  const manual=page.getByRole("form",{name:"Invoice line entry",exact:true});
  assert.equal(await manual.getByLabel("Invoice date",{exact:true}).inputValue(),"2026-11-02");
  assert.equal(await manual.getByLabel("Venue",{exact:true}).inputValue(),"clipboard-venue");
  await manual.getByLabel("Invoice date",{exact:true}).fill("2026-11-03");
  assert.equal(await review.getByLabel("OCR invoice date",{exact:true}).inputValue(),"2026-11-03","Both entry paths use the same invoice details");
  await manual.getByLabel("Invoice date",{exact:true}).fill("2026-11-02");
  const picker=manual.getByRole("combobox",{name:"Match invoice ingredient",exact:true});
  await picker.fill(pepper.name);await manual.getByRole("option").filter({hasText:pepper.name}).click();
  await picker.fill(nutmeg.name);await manual.getByRole("option").filter({hasText:nutmeg.name}).click();
  assert.equal(await manual.getByLabel("Invoice line description",{exact:true}).inputValue(),nutmeg.name);
  assert.equal(await manual.getByLabel("Vendor item code",{exact:true}).inputValue(),"SPN101");
  assert.equal(await manual.getByLabel("Quantity billed",{exact:true}).inputValue(),"1");
  assert.equal(await manual.getByLabel("Contents per billed unit",{exact:true}).inputValue(),"16");
  await manual.getByLabel("Unit price ($)",{exact:true}).fill("13.84");
  assert.equal(await manual.getByLabel("Paid line total ($)",{exact:true}).inputValue(),"13.84");
  await manual.getByLabel("Quantity billed",{exact:true}).fill("2");assert.equal(await manual.getByLabel("Paid line total ($)",{exact:true}).inputValue(),"27.68");
  await manual.getByLabel("Paid line total ($)",{exact:true}).fill("25");await manual.getByLabel("Quantity billed",{exact:true}).fill("3");assert.equal(await manual.getByLabel("Paid line total ($)",{exact:true}).inputValue(),"25");
  await page.getByLabel("Invoice draft status",{exact:true}).getByText("Draft saved to your account",{exact:true}).waitFor();await page.reload();await manual.waitFor();
  assert.equal(await manual.getByLabel("Paid line total ($)",{exact:true}).inputValue(),"25");
  await manual.getByRole("button",{name:"Calculate total from quantity and unit price",exact:true}).click();assert.equal(await manual.getByLabel("Paid line total ($)",{exact:true}).inputValue(),"41.52");
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await manual.getByLabel("Unit price ($)",{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:`${output}/manual-entry-mobile.png`});
  await manual.getByRole("button",{name:"Save invoice line",exact:true}).click();await page.getByText("Invoice line saved.",{exact:true}).waitFor();
  const added=await db.invoicePurchaseLine.findFirstOrThrow({where:{invoiceDocumentId:documentId,ocrLineKey:null}});
  assert.equal(added.amountCents,4152);assert.equal(added.billedUnitPrice,13.84);assert.equal(added.packQty,16);
  if(process.env.INVOICE_WORKFLOW_SOURCE) {
    await page.setViewportSize({width:1440,height:1100});await page.goto(`${base}/invoices`);
    await page.getByLabel("Invoice vendor",{exact:true}).selectOption(vendor.id);
    await page.getByLabel("Invoice PDF or photo",{exact:true}).setInputFiles({name:"source-layout-review.pdf",mimeType:"application/pdf",buffer:await readFile(process.env.INVOICE_WORKFLOW_SOURCE)});
    await page.getByRole("button",{name:"Store invoice",exact:true}).click();await page.waitForURL(/\/invoices\?.*id=/,{timeout:120000});
    const source=await db.invoiceDocument.findUniqueOrThrow({where:{id:new URL(page.url()).searchParams.get("id")}});
    await writeFile(`${output}/actual-source-recognition.json`,JSON.stringify(source.ocrDraft,null,2));
    assert.equal(source.ocrDraft.lines.length,14,"The source invoice has fourteen products, not separate pack/footer rows");
    console.log(`Actual source: ${source.ocrDraft.lines.length} product rows; ${source.ocrDraft.lines.filter(row=>row.quantity!==null&&row.extendedPrice!==null).length} quantities/totals recognized.`);
  }
  assert.deepEqual(errors,[]);console.log(`Two-line OCR rows, metadata defaults, pack reuse, batch review, manual calculations and draft recovery passed. Screenshots: ${output}`);
} catch(error) {if(page)await page.screenshot({path:`${output}/workflow-failure.png`,fullPage:true});throw error;}
finally {await browser.close();await db.$disconnect();}
