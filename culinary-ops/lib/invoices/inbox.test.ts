import test from "node:test";
import assert from "node:assert/strict";
import { invoiceReviewFacts } from "./inbox";
import { parseInvoiceText } from "./invoice-parser";

const draft=parseInvoiceText([{page:1,text:"77412 CELERY 3 EA 4.00 12.00\n77413 CARROTS 1 EA 5.00 5.00"}]);
const base={ocrDraft:draft,ocrRevision:1,lineRevision:0,reviewedLineRevision:null,reviewedOcrRevision:null,reviewCompletedAt:null,purchaseLines:[] as {ocrLineKey:string|null;voided:boolean}[],ocrDecisions:[] as {lineKey:string}[]};
test("invoice states separate candidate resolution, explicit completion and accounting",()=>{
  assert.equal(invoiceReviewFacts(base).reviewState,"NEEDS_REVIEW");
  const partial={...base,purchaseLines:[{ocrLineKey:draft.lines[0].key,voided:false}],lineRevision:1};
  assert.equal(invoiceReviewFacts(partial).reviewState,"IN_PROGRESS");
  const ready={...partial,ocrDecisions:[{lineKey:draft.lines[1].key}]};
  assert.equal(invoiceReviewFacts(ready).reviewState,"READY");
  const complete={...ready,reviewCompletedAt:new Date(),reviewedLineRevision:1,reviewedOcrRevision:1};
  assert.equal(invoiceReviewFacts(complete).reviewState,"COMPLETE");
  assert.equal(invoiceReviewFacts({...complete,lineRevision:2}).reviewState,"READY");
});
test("empty, failed and unreadable recognition cannot imply a complete review",()=>{
  assert.equal(invoiceReviewFacts({...base,ocrDraft:null}).reviewState,"NEEDS_REVIEW");
  assert.equal(invoiceReviewFacts({...base,ocrDraft:{bad:true}}).reviewState,"NEEDS_ATTENTION");
  assert.equal(invoiceReviewFacts({...base,ocrDraft:parseInvoiceText([{page:1,text:"77412 CELERY"}])}).reviewState,"NEEDS_ATTENTION");
  assert.equal(invoiceReviewFacts({...base,ocrDraft:null,purchaseLines:[{ocrLineKey:null,voided:false}]}).reviewState,"READY");
  assert.equal(invoiceReviewFacts({...base,ocrDraft:null,purchaseLines:[{ocrLineKey:null,voided:true}]}).reviewState,"READY","a manually entered invoice can finish after its duplicate lines are voided");
});
