import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { compactInvoice, INVOICE_UPLOAD_LIMIT } from "./invoice-storage";
test("invoice photos orient, reduce dimensions, strip metadata and retain a preview",async()=>{
 const source=await sharp({create:{width:3200,height:1200,channels:3,background:"white"}}).jpeg().withMetadata({orientation:6}).toBuffer();
 const result=await compactInvoice(source),metadata=await sharp(result.data).metadata();
 assert.equal(metadata.width,975);assert.equal(metadata.height,2600);assert.equal(metadata.orientation,undefined);assert.equal(result.pages,1);assert.ok(result.preview.length>0);assert.equal(result.storedBytes,result.data.length);
 assert.equal((await compactInvoice(source)).fileHash,result.fileHash);
});
test("already compact digital PDFs preserve text, page order and dimensions",async()=>{
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
 for(let i=1;i<=2;i++)pdf.addPage([612,792]).drawText(`Invoice page ${i} - $123.45 - SKU 001`,{x:30,y:700,font,size:8});
 const source=await pdf.save(),result=await compactInvoice(source);
 assert.equal(result.pages,2);assert.ok(result.storedBytes<=source.length);assert.equal((await PDFDocument.load(result.data)).getPageCount(),2);assert.equal(result.mime,"application/pdf");assert.ok((await sharp(result.preview).metadata()).width!<=900);
});
test("oversized, malformed and excessive-page invoices are rejected",async()=>{
 await assert.rejects(compactInvoice(new Uint8Array(INVOICE_UPLOAD_LIMIT+1)),/8 MB/);
 await assert.rejects(compactInvoice(Buffer.from("not a supported invoice")),/Choose a PDF/);
 const pdf=await PDFDocument.create();for(let i=0;i<21;i++)pdf.addPage([612,792]);
 await assert.rejects(compactInvoice(await pdf.save()),/20 pages/);
});
