// Pixel checks for the new ink renderer. These do not judge the painting's quality.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { loadPuppeteer, findChromeExecutable } from '../scripts/server-util.mjs';
const source = name => fs.readFileSync(new URL('../resources/vendor/zxart/'+name, import.meta.url),'utf8');
const puppeteer=await loadPuppeteer();
const browser=await puppeteer.launch({executablePath:findChromeExecutable(),headless:true,args:['--no-sandbox']});
try {
  const page=await browser.newPage();
  await page.addScriptTag({content:source('zxart-compose.js')});
  await page.addScriptTag({content:source('zxart-ink.js')});
  const result=await page.evaluate(worker=>{
    const api=new Function('importScripts','self',worker+'\nreturn {drawShapes,render};')(()=>{},{});
    const stroke={path:[{x:25,y:40},{x:90,y:42},{x:165,y:37}],width:20,ink:.55,pressure:[.8,.8],dry:.9};
    const layer={shapes:[],brushStrokes:[stroke],ink:{seed:42,color:[0,0,0],bleed:0,rim:0}};
    const paint=l=>{
      const canvas=new OffscreenCanvas(200,100),ctx=canvas.getContext('2d');
      ZXArtInk.draw(ctx,l,{},200,100,1,0,0,api.drawShapes);
      return ctx.getImageData(0,0,200,100).data;
    };
    const sum=p=>p.reduce((n,v,i)=>n+(i%4===3?v:0),0);
    const support=p=>p.reduce((n,v,i)=>n+(i%4===3&&v>8?1:0),0);
    const dry=paint(layer),wet=paint({...layer,brushStrokes:[{...stroke,dry:0}]});
    const narrow=paint({...layer,brushStrokes:[{...stroke,pressure:[.2,.2]}]});
    const tilted=sign=>paint({...layer,brushStrokes:[{...stroke,oblique:sign}]});
    const centroid=p=>p.reduce((n,v,i)=>n+(i%4===3?Math.floor(i/4/200)*v:0),0)/sum(p);
    const tiltShift=centroid(tilted(1))-centroid(tilted(-1));
    const repeat=paint(layer),other=paint({...layer,ink:{...layer.ink,seed:43}});
    const overlap=paint({...layer,brushStrokes:[stroke,stroke]});
    const wash={shapes:[{points:[40,20,150,20,150,70,40,70],fill:[0,0,0,.4],closed:true}],ink:{seed:42,color:[0,0,0],bleed:0,rim:0}};
    const flat=paint(wash),diffused=paint({...wash,ink:{...wash.ink,bleed:5}});
    let outside=0,flatOutside=0,exposed=0;
    for(let y=0;y<100;y++)for(let x=0;x<200;x++) {
      const i=(y*200+x)*4+3;
      if(x<40||x>=150||y<20||y>=70){outside+=diffused[i];flatOutside+=flat[i];}
      if(x>35&&x<150&&y>37&&y<43&&dry[i]<10&&wet[i]>10)exposed++;
    }
    const bitmap=api.render({width:200,height:100,background:[1,1,1,1],layers:[layer]},200,100);
    const canvas=new OffscreenCanvas(200,100),ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();
    const workerPixels=ctx.getImageData(0,0,200,100).data;
    return {version:ZXArtInk.version,repeat:dry.every((v,i)=>v===repeat[i]),changed:dry.some((v,i)=>v!==other[i]),
      tiltShift,dryInk:sum(dry),wetInk:sum(wet),singleInk:sum(dry),overlapInk:sum(overlap),exposed,
      normalWidth:support(dry),lowPressureWidth:support(narrow),outside,flatOutside,
      diffusionMassRatio:sum(diffused)/sum(flat),workerPainted:workerPixels.some((v,i)=>i%4===0&&v<240)};
  },source('zxart-worker.js'));
  assert.ok(result.repeat,'same inputs and implementation reproduce all pixels');
  assert.ok(result.changed,'seed affects bristle contact');
  assert.ok(result.wetInk>result.dryInk&&result.exposed>0,'dry contact exposes paper inside the wet stroke footprint');
  assert.ok(result.normalWidth>result.lowPressureWidth,'pressing expands the stroke footprint');
  assert.ok(result.tiltShift>2,'reversing side loading moves the ink across the stroke');
  assert.ok(result.overlapInk>result.singleInk,'strokes accumulate ink without vector overprint');
  assert.equal(result.flatOutside,0,'unwashed fixture stays inside its polygon');
  assert.ok(result.outside>0,'wet ink diffuses beyond the original polygon');
  assert.ok(result.diffusionMassRatio>.95&&result.diffusionMassRatio<1.1,'diffusion does not substantially lose ink');
  assert.ok(result.workerPainted,'the actual Worker render branch paints the new ink layer');
  console.log('PASS raster ink mechanics',JSON.stringify(result));
} finally {await browser.close();}
