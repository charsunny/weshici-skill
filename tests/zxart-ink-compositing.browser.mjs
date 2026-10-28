// Regression: successive washes must accumulate alpha in the actual Canvas renderer.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { loadPuppeteer, findChromeExecutable } from '../scripts/server-util.mjs';
const source=fs.readFileSync(new URL('../resources/vendor/zxart/zxart-worker.js',import.meta.url),'utf8');
const puppeteer=await loadPuppeteer();
const browser=await puppeteer.launch({executablePath:findChromeExecutable(),headless:true,args:['--no-sandbox']});
try {
  const page=await browser.newPage();
  const result=await page.evaluate(code=>{
    const draw=new Function('importScripts','ZXArtCompose','self',code+'\nreturn drawShapes;')(
      ()=>{}, {installShims(){}}, {});
    const render=(overprint,count)=>{
      const canvas=new OffscreenCanvas(20,20),ctx=canvas.getContext('2d');
      const shape={points:new Float32Array([2,2,18,2,18,18,2,18]),fill:[0,0,0,.5],stroke:null,lineWidth:0};
      if(overprint)shape.overprint=true;
      draw(ctx,structuredClone(Array.from({length:count},()=>shape)));
      return ctx.getImageData(10,10,1,1).data[3];
    };
    return {legacy:render(false,2),twoWashes:render(true,2),threeWashes:render(true,3)};
  },source);
  assert.equal(result.legacy,128,'legacy same-style union is preserved');
  assert.ok(Math.abs(result.twoWashes-192)<=1,'two half-opacity washes accumulate to 75% ink');
  assert.ok(Math.abs(result.threeWashes-224)<=1,'a third wash accumulates to 87.5% ink');
  console.log('PASS actual Canvas wash accumulation',result);
} finally {await browser.close();}
