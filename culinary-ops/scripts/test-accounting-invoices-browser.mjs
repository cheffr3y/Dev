import assert from "node:assert/strict";
import {mkdir,readFile} from "node:fs/promises";
import {PrismaClient} from "@prisma/client";
const {chromium}=await import(process.env.PREP_PLAYWRIGHT_MODULE||"playwright");
const db=new PrismaClient(),base="http://localhost:3107",output="/tmp/invoice-archive-review";
const url=new URL(process.env.DATABASE_URL);assert.equal(process.env.PREP_DISPOSABLE_DB,"1");assert.equal(url.hostname,"127.0.0.1");assert.equal(url.pathname,"/prep_workflow_test");
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.PREP_BROWSER_EXECUTABLE?{executablePath:process.env.PREP_BROWSER_EXECUTABLE}:{})});
const errors=[];let page;
async function login(role){const context=await browser.newContext({viewport:{width:1440,height:1000}});const p=await context.newPage();p.on("pageerror",e=>errors.push(e.message));await p.goto(`${base}/login`);await p.getByLabel("Email").fill(`${role}@local.test`);await p.getByLabel("Password").fill("local-smoke-only");await p.getByRole("button",{name:"Sign in",exact:true}).click();await p.waitForURL(`${base}/`);return p;}
try{
 page=await login("admin");
 await page.goto(`${base}/prep-orders/report/mappings`);await page.getByLabel("Code for Dairy",{exact:true}).fill("FOOD-DAIRY");await page.getByRole("button",{name:"Save accounting codes",exact:true}).click();
 await page.waitForTimeout(300);assert.equal((await db.accountingMapping.findUniqueOrThrow({where:{kind_sourceKey:{kind:"CATEGORY",sourceKey:"Dairy"}}})).code,"FOOD-DAIRY");
 const xlsx=await page.request.get(`${base}/prep-orders/report/export-xlsx?from=2026-12-01&to=2026-12-31`);assert.equal(xlsx.status(),200);for(const name of ["Executive Summary","Inter-Venue Transfers","Line-Item Detail"])assert.ok((await xlsx.body()).includes(Buffer.from(name)));
 const csv=await page.request.get(`${base}/prep-orders/report/export?from=2026-12-01&to=2026-12-31&table=Inter-Venue%20Transfers`);assert.ok((await csv.text()).startsWith('"Record ID","Date"'));
 const beforeBatches=await db.productionBatch.count(),beforePrices=JSON.stringify(await db.item.findMany({select:{id:true,unitCost:true},orderBy:{id:"asc"}}));
 await page.goto(`${base}/vendors/invoices`);
 assert.equal(await page.getByText(/OPENAI_API_KEY/).count(),0);assert.equal(await page.getByRole("button",{name:"Preview selected price changes",exact:true}).count(),0);
 await page.getByLabel("Invoice PDF or photo",{exact:true}).setInputFiles(`${output}/invoice-scan.pdf`);await page.getByRole("button",{name:"Store invoice",exact:true}).click();await page.getByRole("status").filter({hasText:"Stored"}).waitFor();
 const pdf=await db.invoiceDocument.findFirstOrThrow({where:{filename:"invoice-scan.pdf"}});assert.equal(pdf.pages,2);assert.ok(pdf.storedBytes<pdf.originalBytes);
 const image=page.getByRole("img",{name:"First page of invoice-scan.pdf",exact:true});await image.waitFor();assert.ok(await image.evaluate(element=>element.complete&&element.naturalWidth>0));
 await page.screenshot({path:`${output}/desktop-archive.png`,fullPage:true});
 const download=await page.request.get(`${base}/api/invoices/file?id=${pdf.id}&download=1`);assert.equal(download.status(),200);assert.match(download.headers()["content-disposition"],/^attachment/);assert.equal((await download.body()).length,pdf.storedBytes);
 // Identical upload returns the same stored document even with another filename.
 const duplicate=await page.request.post(`${base}/api/invoices`,{multipart:{file:{name:"duplicate.pdf",mimeType:"application/pdf",buffer:await readFile(`${output}/invoice-scan.pdf`)}}});assert.equal((await duplicate.json()).id,pdf.id);assert.equal(await db.invoiceDocument.count(),1);
 const imageUpload=await page.request.post(`${base}/api/invoices`,{multipart:{file:{name:"invoice-photo.jpg",mimeType:"image/jpeg",buffer:await readFile(`${output}/invoice-photo.jpg`)}}});assert.equal(imageUpload.status(),200);const photo=await db.invoiceDocument.findUniqueOrThrow({where:{id:(await imageUpload.json()).id}});assert.equal(photo.mime,"image/jpeg");assert.ok(photo.storedBytes<photo.originalBytes);
 const fake=await page.request.post(`${base}/api/invoices`,{multipart:{file:{name:"bad.pdf",mimeType:"application/pdf",buffer:Buffer.from("not a real PDF")}}});assert.equal(fake.status(),400);
 const disabled=await page.request.post(`${base}/api/invoices`,{data:{operation:"preview",id:pdf.id}});assert.equal(disabled.status(),410);
 assert.equal(await db.productionBatch.count(),beforeBatches);assert.equal(JSON.stringify(await db.item.findMany({select:{id:true,unitCost:true},orderBy:{id:"asc"}})),beforePrices);
 const staff=await login("staff");assert.equal((await staff.request.get(`${base}/api/invoices/file?id=${pdf.id}`)).status(),403);assert.equal((await staff.request.get(`${base}/api/invoices?id=${pdf.id}`)).status(),403);
 const anon=await browser.newContext();assert.equal((await anon.request.get(`${base}/api/invoices/file?id=${pdf.id}`)).status(),401);
 const mobile=await browser.newContext({viewport:{width:390,height:844},storageState:await page.context().storageState()});const phone=await mobile.newPage();await phone.goto(`${base}/vendors/invoices?id=${pdf.id}`);await phone.getByRole("img",{name:"First page of invoice-scan.pdf",exact:true}).waitFor();await phone.screenshot({path:`${output}/mobile-archive.png`,fullPage:true});assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);console.log(`Compressed photo/PDF uploads, stored preview/download, duplicate detection, no-AI boundary, unchanged prices/ledger, role restrictions, mobile layout and accounting exports passed. Review: ${output}`);
}catch(error){if(page)await page.screenshot({path:`${output}/failure.png`,fullPage:true});throw error;}finally{await browser.close();await db.$disconnect();}
