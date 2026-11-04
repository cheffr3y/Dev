import assert from "node:assert/strict";
import { mkdir,writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PDFDocument,StandardFonts } from "pdf-lib";
import { launchBrowser,browserBaseUrl } from "../harness.mjs";

const db=new PrismaClient(),base=browserBaseUrl(),browser=await launchBrowser(),output="/tmp/soigne-inbox-conversions",errors=[];
await mkdir(output,{recursive:true});let page;
try {
  const vendor=await db.vendor.create({data:{name:"Soigne produce"}});
  const celery=await db.item.create({data:{name:"Soigne celery",unit:"each",unitCost:4,sku:"99010",vendorId:vendor.id,yieldFactor:.9,packQty:3,packUnit:"each"}});
  const recipe=await db.recipe.create({data:{name:"Soigne celery prep",prodCode:randomUUID(),yieldQty:1,yieldUnit:"each",menuPrice:10,items:{create:{itemId:celery.id,quantity:9,unit:"oz"}}}});
  const parent=await db.recipe.create({data:{name:"Soigne celery parent",prodCode:randomUUID(),yieldQty:1,yieldUnit:"each",menuPrice:10,components:{create:{childId:recipe.id,quantity:2,unit:"each"}}}});
  const menu=await db.menuRollout.create({data:{name:"Soigne conversion menu",status:"ACTIVE",items:{create:{recipeId:parent.id}}}});
  const historyBefore=JSON.stringify({packets:await db.prepPacketSnapshot.findMany(),transfers:await db.stockTransfer.findMany(),reports:await db.transferReportRun.findMany()});
  const context=await browser.newContext({viewport:{width:1440,height:1050}});page=await context.newPage();page.setDefaultTimeout(60000);page.on("pageerror",error=>errors.push(error.message));
  async function login(target,role="admin") {await target.goto(`${base}/login`);await target.getByLabel("Email").fill(`${role}@local.test`);await target.getByLabel("Password").fill("local-smoke-only");await target.getByRole("button",{name:"Sign in",exact:true}).click();await target.waitForURL(`${base}/`);}
  await login(page);await page.goto(`${base}/items/${celery.id}`);
  const panel=page.getByLabel("Ingredient conversions and yield",{exact:true});
  await panel.getByLabel("Reviewed cost unit",{exact:true}).fill("oz");await panel.getByLabel("Each label",{exact:true}).fill("head");await panel.getByLabel("Average purchased weight",{exact:true}).fill("20");await panel.getByLabel("Reviewed usable yield",{exact:true}).fill("90");
  assert.match(await panel.innerText(),/3 head → 60 oz purchased → 54 oz usable/);
  await panel.getByRole("button",{name:"Preview recipe cost impact",exact:true}).click();
  await panel.getByRole("heading",{name:"Review 2 affected recipes",exact:true}).waitFor();
  const row=panel.getByRole("row").filter({hasText:"Soigne celery prep"});assert.match(await row.innerText(),/\$36.00.*\$2.00/s);
  assert.equal((await db.item.findUniqueOrThrow({where:{id:celery.id}})).unit,"each");
  await db.recipeItem.updateMany({where:{recipeId:recipe.id},data:{quantity:10}});
  await panel.getByRole("checkbox").check();await panel.getByRole("button",{name:"Apply reviewed measurements",exact:true}).click();await panel.getByRole("status").filter({hasText:"changed"}).waitFor();
  assert.equal((await db.item.findUniqueOrThrow({where:{id:celery.id}})).measurementRevision,0);
  await db.recipeItem.updateMany({where:{recipeId:recipe.id},data:{quantity:9}});
  await panel.getByRole("button",{name:"Preview recipe cost impact",exact:true}).click();await panel.getByRole("heading",{name:"Review 2 affected recipes",exact:true}).waitFor();
  assert.equal(await panel.getByRole("checkbox").isChecked(),false);await panel.getByRole("checkbox").check();
  await panel.getByRole("button",{name:"Apply reviewed measurements",exact:true}).click();await panel.getByRole("status").filter({hasText:"Measurements applied"}).waitFor();
  const reviewed=await db.item.findUniqueOrThrow({where:{id:celery.id}});assert.equal(reviewed.unit,"oz");assert.equal(reviewed.unitCost,.2);assert.equal(await db.ingredientMeasurementChange.count({where:{itemId:celery.id}}),1);
  await page.screenshot({path:`${output}/measurements.png`,fullPage:true});
  await page.goto(`${base}/recipes/${recipe.id}`);await page.getByText("Purchased: 10 oz",{exact:true}).waitFor();
  await page.goto(`${base}/recipes/${recipe.id}/print?costs=1`);const costs=page.getByRole("region",{name:"Recipe Costing",exact:true});assert.match(await costs.innerText(),/Purchased: 10 oz/);assert.match(await costs.innerText(),/\$2.00/);
  await page.goto(`${base}/menus/${menu.id}`);await page.getByRole("img",{name:/Food cost 40.0%/}).waitFor();
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Courier),sheet=pdf.addPage([1000,800]);
  for(let i=0;i<10;i++)sheet.drawText("99010 CELERY HEAD 1/1EA 3 EA 4.40 13.20",{x:35,y:750-i*55,size:16,font});
  const bytes=Buffer.from(await pdf.save());
  await page.goto(`${base}/invoices`);await page.getByLabel("Invoice vendor",{exact:true}).selectOption(vendor.id);await page.getByLabel("Invoice PDF or photo",{exact:true}).setInputFiles({name:"soigne-ten-lines.pdf",mimeType:"application/pdf",buffer:bytes});await page.getByRole("button",{name:"Store invoice",exact:true}).click();await page.waitForURL(/\/invoices\?.*id=/);
  const documentId=new URL(page.url()).searchParams.get("id"),review=page.getByRole("region",{name:"Local invoice OCR review",exact:true});await review.getByRole("heading",{name:"Line 1 of 10",exact:true}).waitFor();
  await review.getByLabel("OCR invoice date",{exact:true}).fill("2026-11-03");await review.getByLabel("OCR venue",{exact:true}).selectOption("clipboard-venue");await review.getByLabel("Invoice currency",{exact:true}).selectOption("USD");
  const settings={unit:"oz",eachLabel:"head",eachWeightOz:20,densityGPerMl:null,yieldFactor:.9,usableCosting:true,packQty:3,packUnit:"each"};
  async function applyWeight(weight){const settings2={...settings,eachWeightOz:weight};const response=await page.request.post(`${base}/api/ingredient-measurements`,{data:{action:"preview",id:celery.id,settings:settings2}});assert.equal(response.status(),200);const result=await response.json();const applied=await page.request.post(`${base}/api/ingredient-measurements`,{data:{action:"apply",id:celery.id,settings:settings2,token:result.token,operationId:randomUUID(),confirmedBasis:true}});assert.equal(applied.status(),200);}
  await applyWeight(22);await applyWeight(20);
  let active=review.getByRole("form");await active.getByRole("button",{name:"Approve invoice price",exact:true}).click();await active.getByRole("status").filter({hasText:"conversions changed"}).waitFor();
  assert.equal(await db.invoicePurchaseLine.count({where:{invoiceDocumentId:documentId}}),0);await review.getByRole("button",{name:"Refresh ingredient data",exact:true}).click();await review.getByRole("status").filter({hasText:"Ingredient data refreshed"}).waitFor();
  const start=performance.now();let scrollTravel=0,lastY=await page.evaluate(()=>scrollY);
  for(let i=1;i<=10;i++){
    active=review.getByRole("form");await active.getByRole("button",{name:"Approve invoice price",exact:true}).click();
    await page.waitForFunction(value=>document.querySelector('[aria-label="Invoice review progress"]')?.getAttribute("aria-valuenow")===String(value),i);
    const nextY=await page.evaluate(()=>scrollY);scrollTravel+=Math.abs(nextY-lastY);lastY=nextY;
  }
  await writeFile(`${output}/workflow-metrics.json`,JSON.stringify({lines:10,approvalClicks:10,verificationChecks:10,automatedReviewMs:Math.round(performance.now()-start),scrollTravelPx:scrollTravel,note:"Automated Chromium run, excludes capture/setup. Not a human-time baseline or proof of 30% improvement."},null,2));
  const summary=page.getByLabel("Invoice completion summary",{exact:true});await summary.getByRole("heading",{name:"Ready to finish review",exact:true}).waitFor();assert.match(await summary.innerText(),/\$132.00/);assert.match(await summary.innerText(),/Accounting total not yet confirmed/);
  assert.equal(await db.operatingFoodExpense.count({where:{invoiceDocumentId:documentId}}),0);
  await summary.getByText("1 ingredient price changed · 2 affected recipes",{exact:true}).click();await summary.getByRole("link",{name:parent.name,exact:true}).waitFor();
  const nextResponse=await page.request.post(`${base}/api/invoices`,{multipart:{file:{name:"soigne-next.pdf",mimeType:"application/pdf",buffer:Buffer.concat([bytes,Buffer.from("\n% next")])}}});const nextId=(await nextResponse.json()).id;
  await summary.getByRole("button",{name:"Finish invoice review",exact:true}).click();await summary.getByRole("heading",{name:"Invoice review complete",exact:true}).waitFor();
  assert.equal((await db.invoiceDocument.findUniqueOrThrow({where:{id:documentId}})).reviewState,"COMPLETE");assert.equal(await db.operatingFoodExpense.count({where:{invoiceDocumentId:documentId}}),0);
  await page.screenshot({path:`${output}/complete-desktop.png`,fullPage:true});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:`${output}/complete-mobile.png`,fullPage:true});
  await summary.getByRole("link",{name:"Review next invoice →",exact:true}).click();await page.waitForURL(url=>url.searchParams.get("id")===nextId);
  await page.goto(`${base}/invoices?state=COMPLETE`);const inbox=page.getByRole("region",{name:"Invoice inbox",exact:true});await inbox.getByRole("link",{name:"soigne-ten-lines.pdf",exact:true}).waitFor();assert.equal(await inbox.getByRole("link",{name:"soigne-next.pdf",exact:true}).count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:`${output}/inbox-mobile.png`,fullPage:true});
  const staffContext=await browser.newContext(),staff=await staffContext.newPage();await login(staff,"staff");
  assert.equal((await staff.request.post(`${base}/api/ingredient-measurements`,{data:{}})).status(),403);assert.equal((await staff.request.post(`${base}/api/invoice-review-complete`,{data:{}})).status(),403);await staffContext.close();
  assert.equal(JSON.stringify({packets:await db.prepPacketSnapshot.findMany(),transfers:await db.stockTransfer.findMany(),reports:await db.transferReportRun.findMany()}),historyBefore);assert.deepEqual(errors,[]);
  console.log(`Reviewed celery conversions, stale previews and normalization, recipe/print/menu reconciliation, ten-line review, completion without accounting posting, next invoice, status filtering, mobile and role checks passed. Review: ${output}`);
} catch(error) {if(page)await page.screenshot({path:`${output}/failure.png`,fullPage:true});throw error;} finally {await browser.close();await db.$disconnect();}
