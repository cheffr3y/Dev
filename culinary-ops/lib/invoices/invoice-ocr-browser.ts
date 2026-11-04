import { recognizeLocalCanvas } from "../ocr/browser";
import { preprocessInvoicePixels } from "./invoice-preprocess";
import { positionedInvoiceRows, type PositionedWord } from "../ocr/text-layout";
import { parseInvoiceText, type LocalInvoiceDraft } from "./invoice-parser";
type Progress = (message: string, fraction?: number) => void;
const check=(signal:AbortSignal)=>{if(signal.aborted)throw new DOMException("Cancelled","AbortError");};
function prepare(source: CanvasImageSource, width: number, height: number, threshold=true) {
  if(width*height>60_000_000)throw new Error("Use a smaller invoice photo.");
  const scale=Math.min(Math.max(1,1600/width),3200/Math.max(width,height));
  const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
  const context=canvas.getContext("2d",{willReadFrequently:true});if(!context)throw new Error("Local canvas processing is unavailable.");
  context.fillStyle="white";context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(source,0,0,canvas.width,canvas.height);
  if(threshold){const image=context.getImageData(0,0,canvas.width,canvas.height);preprocessInvoicePixels(image.data,canvas.width,canvas.height);context.putImageData(image,0,0);}return canvas;
}
export async function recognizeInvoice(file: Blob, progress: Progress, signal: AbortSignal) {
  check(signal);
  const pages:LocalInvoiceDraft["pages"]=[];
  if(file.type!=="application/pdf") {
    if(!file.type.startsWith("image/"))throw new Error("Choose a PDF or still invoice photo.");
    progress("Preprocessing invoice on this device");const bitmap=await createImageBitmap(file);
    try {const canvas=prepare(bitmap,bitmap.width,bitmap.height);check(signal);const result=await recognizeLocalCanvas(canvas,"invoice",progress,signal);pages.push({page:1,text:result.text,regions:result.invoiceRows});}finally{bitmap.close();}
  } else {
    const pdfjs=await import("pdfjs-dist/build/pdf.mjs");pdfjs.GlobalWorkerOptions.workerSrc="/ocr/pdf.worker.min.mjs";
    const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),useSystemFonts:true,standardFontDataUrl:"/ocr/pdf/standard_fonts/",wasmUrl:"/ocr/pdf/wasm/",maxImageSize:60_000_000});
    const abort=()=>{void task.destroy();};signal.addEventListener("abort",abort);
    try {const pdfDocument=await task.promise;if(pdfDocument.numPages>20)throw new Error("Use at most 20 invoice pages.");
      for(let number=1;number<=pdfDocument.numPages;number++) {check(signal);progress(`Reading page ${number} of ${pdfDocument.numPages}`, (number-1)/pdfDocument.numPages);const page=await pdfDocument.getPage(number);let text="";
        const content=await page.getTextContent(), baseViewport=page.getViewport({scale:1});
        const words:PositionedWord[]=[];
        for(const item of content.items) if("str" in item && item.str.trim()) {
          const [x,y]=baseViewport.convertToViewportPoint(item.transform[4],item.transform[5]);
          words.push({text:item.str,bbox:{x0:x,y0:Math.max(0,y-item.height),x1:Math.min(baseViewport.width,x+item.width),y1:Math.min(baseViewport.height,y)}});
        }
        let regions=positionedInvoiceRows(words,baseViewport.width,baseViewport.height);
        text=regions.map(row=>row.text).join("\n");
        if(!text.trim() || !parseInvoiceText([{page:number,text}]).lines.length) {progress(`Local OCR: page ${number} of ${pdfDocument.numPages}`);const base=page.getViewport({scale:1}), viewport=page.getViewport({scale:Math.min(2.5,3200/Math.max(base.width,base.height))});const canvas=document.createElement("canvas");canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);const context=canvas.getContext("2d");if(!context)throw new Error("PDF canvas unavailable.");const render=page.render({canvas,canvasContext:context,viewport,background:"white"});const cancel=()=>render.cancel();signal.addEventListener("abort",cancel);try{await render.promise;}finally{signal.removeEventListener("abort",cancel);}const recognized=await recognizeLocalCanvas(prepare(canvas,canvas.width,canvas.height,false),"invoice",message=>progress(`Page ${number}: ${message}`),signal);text=recognized.text;regions=recognized.invoiceRows;canvas.width=canvas.height=1;}
        pages.push({page:number,text,regions});page.cleanup();
      }
    }finally{signal.removeEventListener("abort",abort);await task.destroy();}
  }
  check(signal);progress("Preparing local draft for review",1);return parseInvoiceText(pages);
}
