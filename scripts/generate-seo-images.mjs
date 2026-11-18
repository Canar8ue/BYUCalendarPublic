// Generates the SEO/social raster assets in public/ (OG uses Sharp):
// og-image.png (1200x630), apple-touch-icon.png (180), icon-192.png, icon-512.png,
// favicon-32.png. Run: node scripts/generate-seo-images.mjs
import {writeFileSync,mkdirSync} from 'node:fs';
import {deflateSync} from 'node:zlib';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {generateOgImage} from './generate-og-image.mjs';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const outDir=join(root,'public');
mkdirSync(outDir,{recursive:true});

// Palette mirrors app/globals.css.
const INK=[32,33,36],GREY=[95,99,104],LINE=[218,220,224],BLUE=[26,115,232],BLUE_DARK=[23,78,166],WHITE=[255,255,255],SURFACE=[248,249,250],CREAM=[255,248,229];
const TONES={blue:BLUE,green:[24,128,56],purple:[118,39,187],orange:[232,113,10],teal:[0,121,107]};

// --- minimal raster helpers -------------------------------------------------
function makeCanvas(w,h,fill){const data=Buffer.alloc(w*h*4);for(let i=0;i<w*h;i++){data[i*4]=fill[0];data[i*4+1]=fill[1];data[i*4+2]=fill[2];data[i*4+3]=255;}return {w,h,data};}
function blend(cv,px,py,c,alpha=1){const x=Math.floor(px),y=Math.floor(py);if(x<0||y<0||x>=cv.w||y>=cv.h)return;const i=(y*cv.w+x)*4,a=alpha*255;const da=cv.data[i+3];const sa=a/255;const outA=sa+da/255*(1-sa);if(outA<=0){cv.data[i+3]=0;return;}cv.data[i]=(c[0]*sa+cv.data[i]*(da/255)*(1-sa))/outA;cv.data[i+1]=(c[1]*sa+cv.data[i+1]*(da/255)*(1-sa))/outA;cv.data[i+2]=(c[2]*sa+cv.data[i+2]*(da/255)*(1-sa))/outA;cv.data[i+3]=outA*255;}
function fillRect(cv,x0,y0,w,h,c,alpha=1){const fx=Math.floor(x0),fy=Math.floor(y0),fw=Math.ceil(w),fh=Math.ceil(h);const x1=Math.min(fx+fw,cv.w),y1=Math.min(fy+fh,cv.h);for(let y=Math.max(fy,0);y<y1;y++)for(let x=Math.max(fx,0);x<x1;x++)blend(cv,x,y,c,alpha);}
function roundCorners(cv,x0,y0,w,h,r,cut=[LINE]){ // "erase" corner triangles to fake small radii
  for(let dy=0;dy<r;dy++)for(let dx=0;dx<r;dx++){if(dx+dy>=r)continue;const corners=[[x0+dx,y0+dy],[x0+w-1-dx,y0+dy],[x0+dx,y0+h-1-dy],[x0+w-1-dx,y0+h-1-dy]];for(const [x,y] of corners)blend(cv,x,y,cut[0],1);}}

// --- 5x7 bitmap font --------------------------------------------------------
const FONT={
A:[14,17,17,31,17,17,17],B:[30,17,17,30,17,17,30],C:[14,17,16,16,16,17,14],D:[28,18,17,17,17,18,28],E:[31,16,16,30,16,16,31],F:[31,16,16,30,16,16,16],G:[14,17,16,23,17,17,15],H:[17,17,17,31,17,17,17],I:[14,4,4,4,4,4,14],J:[7,2,2,2,2,18,12],K:[17,18,20,24,20,18,17],L:[16,16,16,16,16,16,31],M:[17,27,21,21,17,17,17],N:[17,25,21,19,17,17,17],O:[14,17,17,17,17,17,14],P:[30,17,17,30,16,16,16],Q:[14,17,17,17,21,18,13],R:[30,17,17,30,20,18,17],S:[15,16,16,14,1,1,30],T:[31,4,4,4,4,4,4],U:[17,17,17,17,17,17,14],V:[17,17,17,17,17,10,4],W:[17,17,17,21,21,21,10],X:[17,17,10,4,10,17,17],Y:[17,17,17,10,4,4,4],Z:[31,1,2,4,8,16,31],
'0':[14,17,19,21,25,17,14],'1':[4,12,4,4,4,4,14],'2':[14,17,1,2,4,8,31],'3':[31,2,4,2,1,17,14],'4':[2,6,10,18,31,2,2],'5':[31,16,30,1,1,17,14],'6':[6,8,16,30,17,17,14],'7':[31,1,2,4,8,8,8],'8':[14,17,17,14,17,17,14],'9':[14,17,17,15,1,2,12],
' ':[0,0,0,0,0,0,0],'.':[0,0,0,0,0,12,12],'!':[4,4,4,4,4,0,4],'&':[12,18,20,8,21,18,13],'-':[0,0,0,31,0,0,0],'/':[1,1,2,4,8,16,16],':':[0,12,12,0,12,12,0],"'":[4,4,8,0,0,0,0],',':[0,0,0,0,12,4,8],'·':[0,0,12,12,0,0,0]};
function measure(text,scale){return text.length*6*scale-scale;}
function drawText(cv,text,x,y,scale,c,alpha=1){let cx=x;for(const ch of text){const glyph=FONT[ch]||FONT[ch.toUpperCase()]||FONT[' '];for(let row=0;row<7;row++)for(let col=0;col<5;col++)if(glyph[row]>>(4-col)&1)fillRect(cv,cx+col*scale,y+row*scale,scale,scale,c,alpha);cx+=6*scale;}return cx;}

// --- PNG encoding -----------------------------------------------------------
const CRC_TABLE=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^c>>>1:c>>>1;return c>>>0;});
function crc32(buf){let c=0xffffffff;for(const b of buf)c=CRC_TABLE[(c^b)&0xff]^c>>>8;return (c^0xffffffff)>>>0;}
function chunk(type,data){const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const body=Buffer.concat([Buffer.from(type,'ascii'),data]);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(body));return Buffer.concat([len,body,crc]);}
function encodePNG(cv){
  const raw=Buffer.alloc((cv.w*4+1)*cv.h);
  for(let y=0;y<cv.h;y++){raw[y*(cv.w*4+1)]=0;cv.data.copy(raw,y*(cv.w*4+1)+1,y*cv.w*4,(y+1)*cv.w*4);}
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(cv.w,0);ihdr.writeUInt32BE(cv.h,4);ihdr[8]=8;ihdr[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
function save(cv,name){writeFileSync(join(outDir,name),encodePNG(cv));console.log('wrote public/'+name,cv.w+'x'+cv.h);}

// --- artwork ----------------------------------------------------------------
// Brand mark (September 15, 2026): the standalone "Big Y" — hollow outline in the
// header, solid blue fill for favicon/icons. The committed hi-fi icons in public/
// are rendered from the vector masters in logos/source/ (real Archivo/Roboto
// glyphs, antialiased); this script is the dependency-free fallback that
// reproduces the icon design with hard-edged polygon fills. The OG uses its SVG.
const Y_POLY=[[310.4,422.34],[203.54,422.34],[203.54,293.23],[71.52,89.65],[194.35,89.65],[258.18,200.39],[260.11,200.39],[323.94,89.65],[440.48,89.65],[310.4,293.23]];
function fillPoly(cv,pts,color){ // even-odd scanline fill, no antialiasing
  const ys=pts.map(p=>p[1]),y0=Math.floor(Math.min(...ys)),y1=Math.ceil(Math.max(...ys));
  for(let y=y0;y<=y1;y++){const xs=[];
    for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];
      if((a[1]<=y&&b[1]>y)||(b[1]<=y&&a[1]>y))xs.push(a[0]+(y-a[1])/(b[1]-a[1])*(b[0]-a[0]));}
    xs.sort((p,q)=>p-q);
    for(let k=0;k+1<xs.length;k+=2)for(let x=Math.ceil(xs[k]);x<=Math.floor(xs[k+1]);x++)blend(cv,x,y,color);}
}
function drawY(cv,cx,cy,height,color){ // cx,cy = center of the glyph's box
  const s=height/332.69,w=368.96*s,x0=cx-w/2,y0=cy-height/2;
  fillPoly(cv,Y_POLY.map(([px,py])=>[x0+(px-71.52)*s,y0+(py-89.65)*s]),color);
}
function makeCanvasT(w,h){const data=Buffer.alloc(w*h*4);return {w,h,data};} // transparent

// App/PWA icons: standalone solid-blue Y on transparent (no tile).
function buildIcon(size){
  const cv=makeCanvasT(size,size);
  drawY(cv,size/2,size/2,size*0.65,BLUE);
  return cv;
}
// iOS home screen: transparency renders black, so use a white field.
function buildAppleTouch(size){
  const cv=makeCanvas(size,size,WHITE);
  drawY(cv,size/2,size/2,size*0.46,BLUE);
  return cv;
}
// Favicon raster fallback: same standalone blue Y.
function buildFavicon32(){
  const cv=makeCanvasT(32,32);
  drawY(cv,16,16,21,BLUE);
  return cv;
}

await generateOgImage();
save(buildAppleTouch(180),'apple-touch-icon.png');
save(buildIcon(192),'icon-192.png');
save(buildIcon(512),'icon-512.png');
save(buildFavicon32(),'favicon-32.png');
