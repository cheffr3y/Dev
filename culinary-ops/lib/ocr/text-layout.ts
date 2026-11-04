type Word = { text: string; bbox: { x0:number; y0:number; x1:number; y1:number } };
type Block = { paragraphs: { lines: { words: Word[] }[] }[] };

/** Sparse OCR recognizes columns separately; rebuild physical reading rows. */
export function textFromPositionedWords(blocks: Block[] | null, fallback: string) {
  const words=blocks?.flatMap(block=>block.paragraphs.flatMap(paragraph=>paragraph.lines.flatMap(line=>line.words))).filter(word=>word.text.trim()&&word.bbox.y1>word.bbox.y0)??[];
  if(!words.length)return fallback;
  const heights=words.map(word=>word.bbox.y1-word.bbox.y0).sort((a,b)=>a-b),median=heights[Math.floor(heights.length/2)];
  const rows:{y:number;words:Word[]}[]=[];
  for(const word of words.sort((a,b)=>(a.bbox.y0+a.bbox.y1)/2-(b.bbox.y0+b.bbox.y1)/2||a.bbox.x0-b.bbox.x0)) {
    const y=(word.bbox.y0+word.bbox.y1)/2,tolerance=Math.max(3,Math.min(median,word.bbox.y1-word.bbox.y0)*.65);
    const row=rows.slice(-3).find(row=>Math.abs(row.y-y)<=tolerance);
    if(row){row.y=(row.y*row.words.length+y)/(row.words.length+1);row.words.push(word);}
    else rows.push({y,words:[word]});
  }
  return rows.sort((a,b)=>a.y-b.y).map(row=>row.words.sort((a,b)=>a.bbox.x0-b.bbox.x0).map(word=>word.text).join(" ")).join("\n");
}
