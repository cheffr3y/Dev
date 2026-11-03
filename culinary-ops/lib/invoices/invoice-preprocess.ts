// Integral-image local thresholding removes uneven kitchen-photo backgrounds.
// Pure pixel processing also makes shadow/contrast behavior testable off-browser.
export function preprocessInvoicePixels(data: Uint8ClampedArray, width: number, height: number) {
  if(width<1 || height<1 || width*height>11_000_000 || data.length!==width*height*4) throw new Error("Invoice image exceeds the local processing limit.");
  const gray=new Uint8Array(width*height), histogram=new Uint32Array(256);
  for(let i=0;i<gray.length;i++) { const value=Math.round(data[i*4]*.299+data[i*4+1]*.587+data[i*4+2]*.114); gray[i]=value; histogram[value]++; }
  const quantile=(fraction:number)=>{let count=0;for(let i=0;i<256;i++){count+=histogram[i];if(count>=gray.length*fraction)return i;}return 255;};
  const low=quantile(.02), high=quantile(.98), stride=width+1, integral=new Float64Array((width+1)*(height+1));
  for(let y=0;y<height;y++) { let sum=0;for(let x=0;x<width;x++) { const index=y*width+x;gray[index]=high>low?Math.max(0,Math.min(255,Math.round((gray[index]-low)*255/(high-low)))):gray[index];sum+=gray[index];integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+sum; } }
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) { const left=Math.max(0,x-24),right=Math.min(width,x+25),top=Math.max(0,y-24),bottom=Math.min(height,y+25);const mean=(integral[bottom*stride+right]-integral[top*stride+right]-integral[bottom*stride+left]+integral[top*stride+left])/((right-left)*(bottom-top));const value=gray[y*width+x]<mean-12?0:255;const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=value;data[i+3]=255; }
  return data;
}
