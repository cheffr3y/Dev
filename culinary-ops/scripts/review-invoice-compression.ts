// Local QA helper. Uses only fictional fixture files under /tmp.
import { readFile,writeFile } from "node:fs/promises";
import {PDFDocument} from "pdf-lib";
import sharp from "sharp";
import {compactInvoice} from "../lib/invoices/invoice-storage";
async function main(){
 const directory="/tmp/invoice-archive-review";
 const scan=await PDFDocument.create();
 for(let index=1;index<=2;index++){
  const pixels=await sharp(await readFile(`${directory}/source-${index}.png`)).removeAlpha().raw().toBuffer({resolveWithObject:true});
  // Deterministic paper texture gives a realistic scanned image size.
  for(let i=0;i<pixels.data.length;i++)pixels.data[i]=Math.max(0,pixels.data[i]-(i*17%6));
  const png=await sharp(pixels.data,{raw:{width:pixels.info.width,height:pixels.info.height,channels:3}}).png({compressionLevel:3}).toBuffer();
  const image=await scan.embedPng(png);scan.addPage([612,792]).drawImage(image,{x:0,y:0,width:612,height:792});
 }
 await writeFile(`${directory}/invoice-scan.pdf`,await scan.save());
 for(const name of ["invoice-digital","invoice-scan"]){
  const source=await readFile(`${directory}/${name}.pdf`),result=await compactInvoice(source);
  await writeFile(`${directory}/${name}-stored.pdf`,result.data);await writeFile(`${directory}/${name}-preview.jpg`,result.preview);
  console.log(JSON.stringify({name,input:source.length,stored:result.storedBytes,pages:result.pages}));
 }
 const photo=await sharp(await readFile(`${directory}/source-1.png`)).jpeg({quality:100}).toBuffer();await writeFile(`${directory}/invoice-photo.jpg`,photo);
 const result=await compactInvoice(photo);await writeFile(`${directory}/invoice-photo-stored.jpg`,result.data);
 console.log(JSON.stringify({name:"photo",input:photo.length,stored:result.storedBytes}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
