// Production brush/wash semantics. Pixel mechanics are not an aesthetic acceptance test.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {loadPuppeteer,findChromeExecutable} from '../scripts/server-util.mjs';
const source=name=>fs.readFileSync(new URL('../resources/vendor/zxart/'+name,import.meta.url),'utf8');
const puppeteer=await loadPuppeteer();
const browser=await puppeteer.launch({executablePath:findChromeExecutable(),headless:true,args:['--no-sandbox']});
try {
  const page=await browser.newPage();
  await page.addScriptTag({content:source('zxart-compose.js')});
  await page.addScriptTag({content:source('zxart-ink.js')});
  const result=await page.evaluate(code=>{
    const api=new Function('importScripts','self',code+'\nreturn {drawShapes,render};')(()=>{},{});
    const shape={points:[20,30,180,30,180,50,20,50],fill:[0,0,0,.75],closed:true,brush:{seed:42,dry:.85}};
    const paint=shapes=>{const c=new OffscreenCanvas(200,100),ctx=c.getContext('2d');api.drawShapes(ctx,shapes);return ctx.getImageData(0,0,200,100).data;};
    const dry=paint([shape]),repeat=paint([shape]),wet=paint([{...shape,brush:{...shape.brush,dry:.1}}]);
    const shifted=new OffscreenCanvas(200,100),sc=shifted.getContext('2d');
    sc.translate(-10,-10);api.drawShapes(sc,[shape]);
    const restored=new OffscreenCanvas(200,100),rc=restored.getContext('2d');rc.drawImage(shifted,10,10);
    const shiftedPixels=rc.getImageData(0,0,200,100).data;
    const layerInvariant=dry.every((v,i)=>v===shiftedPixels[i]);
    const other=paint([{...shape,brush:{...shape.brush,seed:43}}]);
    const sum=p=>p.reduce((n,v,i)=>n+(i%4===3?v:0),0);
    const loaded={...shape,fill:[0,0,0,.4],brush:{...shape.brush,ink:.4}};
    const opacityRatio=sum(paint([{...loaded,fill:[0,0,0,.2]}]))/sum(paint([loaded]));
    const tilt=side=>paint([{...shape,fill:[0,0,0,.45],brush:{seed:42,dry:.5,oblique:side}}]);
    const centroid=p=>p.reduce((n,v,i)=>n+(i%4===3?Math.floor(i/4/200)*v:0),0)/sum(p);
    const sideShift=centroid(tilt(1))-centroid(tilt(-1));
    const plainWash={points:[40,20,150,20,150,70,40,70],fill:[0,0,0,.4],closed:true,wetInk:{bleed:0,rim:0}};
    const singleWash=paint([plainWash]),doubleWash=paint([plainWash,plainWash]);
    const terrainProfile={bleed:3.6,rim:.16,terrain:{flow:[0,1]}};
    const terrainWash=paint([{...plainWash,wetInk:terrainProfile}]);
    const terrainAgain=paint([{...plainWash,wetInk:terrainProfile}]);
    const acrossWash=paint([{...plainWash,wetInk:{...terrainProfile,terrain:{flow:[1,0]}}}]);
    const ordinaryWash=paint([{...plainWash,wetInk:{bleed:3.6,rim:.16}}]);
    const deviation=p=>{
      const values=[];for(let y=30;y<60;y++)for(let x=50;x<140;x++)values.push(p[(y*200+x)*4+3]);
      const mean=values.reduce((a,b)=>a+b,0)/values.length;
      return Math.sqrt(values.reduce((n,v)=>n+(v-mean)**2,0)/values.length);
    };
    const terrainChecks={repeat:terrainWash.every((v,i)=>v===terrainAgain[i]),
      directional:terrainWash.some((v,i)=>v!==acrossWash[i]),variation:deviation(terrainWash),ordinaryVariation:deviation(ordinaryWash)};
    let zeroBleed=0;
    for(let y=0;y<100;y++)for(let x=0;x<200;x++)if(x<40||x>=150||y<20||y>=70)zeroBleed+=singleWash[(y*200+x)*4+3];
    let gaps=0;
    for(let y=33;y<47;y++)for(let x=25;x<175;x++){const i=(y*200+x)*4+3;if(dry[i]<10&&wet[i]>30)gaps++;}
    const wash=paint([{points:[40,20,150,20,150,70,40,70],fill:[0,0,0,.4],closed:true,overprint:true,wetInk:true}]);
    let bleed=0;
    for(let y=0;y<100;y++)for(let x=0;x<200;x++)if(x<40||x>=150||y<20||y>=70)bleed+=wash[(y*200+x)*4+3];
    const background=[.95,.94,.89,1],shade=Array.from({length:512*512},(_,i)=>(i*17+Math.floor(i/512)*11)%256);
    const scene={width:200,height:100,background,paper:{shade,tint:[.4,.35,.25],strength:.15,texel:1},layers:[]};
    const render=d=>{const bitmap=api.render(d,200,100),c=new OffscreenCanvas(200,100),ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();return ctx.getImageData(0,0,200,100).data;};
    const tallWash={...plainWash,lineWidth:0,points:[40,5,150,5,150,95,40,95],wetInk:{...terrainProfile,bleed:5.6,rim:.45}};
    const fullWash=render({...scene,paper:null,layers:[{shapes:[tallWash]}]});
    const tiledWash=render({...scene,paper:null,layers:[{shapes:[tallWash],fade:{top:1000,bottom:2000,seed:42}}]});
    let tileDifference=0;
    for(let y=15;y<85;y++)for(let x=50;x<140;x++)for(let k=0;k<3;k++) {
      const i=(y*200+x)*4+k;tileDifference=Math.max(tileDifference,Math.abs(fullWash[i]-tiledWash[i]));
    }
    const paper=render(scene),mask=render({...scene,layers:[{shapes:[{points:[20,20,180,20,180,80,20,80],fill:background,closed:true,paperMask:true}]}]});
    const colored={width:200,height:100,background:[.45,.7,.8,1],layers:[]};
    const normal=render({...colored,layers:[{shapes:[{...plainWash,fill:[.3,.25,.2,.4]}]}]});
    const multiplied=render({...colored,layers:[{blend:'multiply',shapes:[{...plainWash,fill:[.3,.25,.2,.4]}]}]});
    const multiplyDelta=normal[(40*200+80)*4]-multiplied[(40*200+80)*4];
    let maskDifferences=0;
    for(let y=22;y<78;y++)for(let x=22;x<178;x++)for(let k=0;k<3;k++)if(paper[(y*200+x)*4+k]!==mask[(y*200+x)*4+k])maskDifferences++;
    return {tileDifference,terrainChecks,opacityRatio,multiplyDelta,layerInvariant,repeat:dry.every((v,i)=>v===repeat[i]),changed:dry.some((v,i)=>v!==other[i]),dryInk:sum(dry),wetInk:sum(wet),gaps,bleed,maskDifferences,sideShift,zeroBleed,accumulation:sum(doubleWash)/sum(singleWash)};
  },source('zxart-worker.js'));
  assert.ok(result.tileDifference<=2,`difference ${result.tileDifference}: inactive fade must not introduce horizontal tile boundaries into a wet primitive`);
  assert.ok(result.terrainChecks.repeat,'mountain wet profiles replay deterministically');
  assert.ok(result.terrainChecks.directional,'wash loading follows the supplied slope direction');
  assert.ok(result.terrainChecks.variation>result.terrainChecks.ordinaryVariation,'mountain faces contain more than uniform grey');
  assert.ok(Math.abs(result.opacityRatio-.5)<.025,'distance opacity stays separate from brush pigment loading');
  assert.ok(result.multiplyDelta>0,'wet primitives inherit their containing layer blend mode');
  assert.ok(result.layerInvariant,'paper contact stays fixed when an offscreen layer translates its canvas');
  assert.ok(result.repeat,'production brush pixels replay exactly');
  assert.ok(result.changed,'seed changes the ink contact');
  assert.ok(result.wetInk>result.dryInk&&result.gaps>0,'dry marks expose paper within their footprint');
  assert.ok(result.bleed>0,'individual washes diffuse beyond their original polygon');
  assert.equal(result.zeroBleed,0,'an explicit dry profile does not diffuse');
  assert.ok(result.accumulation>1.2,'successive wet primitives accumulate without an overprint flag');
  assert.ok(result.sideShift>1,'side loading moves pigment across the production brush footprint');
  assert.equal(result.maskDifferences,0,'opaque terrain masks retain the underlying paper texture');
  console.log('PASS production terrain ink',result);
} finally {await browser.close();}
