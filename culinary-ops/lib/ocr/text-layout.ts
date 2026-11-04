export type PositionedWord = { text: string; bbox: { x0:number; y0:number; x1:number; y1:number } };
type Block = { paragraphs: { lines: { words: PositionedWord[] }[] }[] };

/** Sparse OCR recognizes columns separately; rebuild physical reading rows. */
export function positionedInvoiceRows(input: PositionedWord[], width: number, height: number) {
  const words = input.filter(word=>word.text.trim() && word.bbox.y1>word.bbox.y0);
  if (!words.length) return [];

  const heights=words.map(word=>word.bbox.y1-word.bbox.y0).sort((a,b)=>a-b),median=heights[Math.floor(heights.length/2)];
  const rows:{y:number;words:PositionedWord[]}[]=[];
  for(const word of words.sort((a,b)=>(a.bbox.y0+a.bbox.y1)/2-(b.bbox.y0+b.bbox.y1)/2||a.bbox.x0-b.bbox.x0)) {
    const y=(word.bbox.y0+word.bbox.y1)/2,tolerance=Math.max(3,Math.min(median,word.bbox.y1-word.bbox.y0)*.65);
    const row=rows.slice(-3).find(row=>Math.abs(row.y-y)<=tolerance);
    if(row){row.y=(row.y*row.words.length+y)/(row.words.length+1);row.words.push(word);}
    else rows.push({y,words:[word]});
  }
  const clamp=(value:number)=>Math.max(0,Math.min(1,value));
  return rows.sort((a,b)=>a.y-b.y).map((row,index)=>({
    lineNumber:index+1, text:row.words.sort((a,b)=>a.bbox.x0-b.bbox.x0).map(word=>word.text).join(" "),
    bbox:{x0:clamp(Math.min(...row.words.map(word=>word.bbox.x0))/width), y0:clamp(Math.min(...row.words.map(word=>word.bbox.y0))/height),
      x1:clamp(Math.max(...row.words.map(word=>word.bbox.x1))/width),y1:clamp(Math.max(...row.words.map(word=>word.bbox.y1))/height)}
  }));
}

export function invoiceRowsFromBlocks(blocks: Block[] | null, width: number, height: number) {
  return positionedInvoiceRows(blocks?.flatMap(block=>block.paragraphs.flatMap(paragraph=>paragraph.lines.flatMap(line=>line.words)))??[],width,height);
}
export function textFromPositionedWords(blocks: Block[] | null, fallback: string) {
  return invoiceRowsFromBlocks(blocks,1,1).map(row=>row.text).join("\n") || fallback;
}
