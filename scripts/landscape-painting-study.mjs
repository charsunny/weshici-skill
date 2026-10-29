#!/usr/bin/env node
// Inspect the actual painting without typography or a UI layout obscuring its structure.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {loadPuppeteer,findChromeExecutable} from './server-util.mjs';
const html=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const out=path.resolve(process.argv[2]||'out/theme-art-validation/painting-study');
fs.mkdirSync(out,{recursive:true});
const context=vm.createContext({TextEncoder,btoa}),sources={};
const read=name=>{const data=fs.readFileSync('resources/vendor/zxart/'+name,'utf8');sources[name]=createHash('sha256').update(data).digest('hex');return data;};
const compose=read('zxart-compose.js'),engine=read('zxart-shanshui-v5.js'),ink=read('zxart-ink.js'),worker=read('zxart-worker.js');
fs.mkdirSync(path.join(out,'sources'),{recursive:true});
for(const [name,code] of [['zxart-compose.js',compose],['zxart-shanshui-v5.js',engine],['zxart-ink.js',ink],['zxart-worker.js',worker]])fs.writeFileSync(path.join(out,'sources',name),code);
vm.runInContext(compose,context);vm.runInContext(engine,context);
const serial=value=>JSON.parse(JSON.stringify(value,(_,v)=>ArrayBuffer.isView(v)?Array.from(v):v));
const palette={paper:[.95,.94,.89,1],ink:[.14,.16,.13,1],isDark:false};
const scenes=[];
for(const seed of (process.argv[3]?[process.argv[3]]:['study-山居秋暝','ridge-01','ridge-02'])) {
 const req={seed,width:720,height:1080,quietTop:.02,elementTreatment:'landscape-v3',scene:'retreat',options:{cun:'hemp',motifs:['pine','bamboo','hut','stream','moon']},verse:null};
 const generated=context.generatePoetryPaintingV5(req,palette).drawing;
 for(const motif of req.options.motifs)assert.ok(generated.sceneElements.some(e=>e.motif===motif),seed+': '+motif);
 for(const layer of generated.layers)for(const shape of layer.shapes)
   assert.ok(Array.from(shape.points).every(Number.isFinite),seed+': finite terrain and brush geometry');
 const scene=serial(generated);
 assert.deepEqual(scene,serial(context.generatePoetryPaintingV5(req,palette).drawing));
 scenes.push({name:'painting-'+scenes.length,seed,scene});
}
const e=new context.ShanShuiEngineV5('bank-proof');e.landscapeSeed='bank-proof';
for(const [name,polys] of [['bank',e.paintingSlope('cliff')],['stone',e.paintingLandscapeStone([{x:0,y:0},{x:240,y:0}],80,1)]]) {
 let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
 for(const p of polys)for(const q of p.p){x0=Math.min(x0,q.x);y0=Math.min(y0,q.y);x1=Math.max(x1,q.x);y1=Math.max(y1,q.y);}
 const shapes=polys.map(p=>({points:p.p.flatMap(q=>[q.x-x0+12,q.y-y0+12]),closed:true,
  fill:p.fil?[p.fil.r===255?palette.paper[0]:palette.ink[0],p.fil.g===255?palette.paper[1]:palette.ink[1],p.fil.b===255?palette.paper[2]:palette.ink[2],p.fil.a]:null,
  lineWidth:0,...(p.brush?{brush:p.brush}:{}),...(p.overprint?{overprint:true}:{}),...(p.wetInk?{wetInk:p.wetInk}:{})}));
 scenes.push({name,seed:'bank-proof',scene:{width:x1-x0+24,height:y1-y0+24,background:palette.paper,layers:[{shapes}]}});
}
const p=await loadPuppeteer(),browser=await p.launch({executablePath:findChromeExecutable(),headless:true,args:['--no-sandbox']});
const browserVersion=await browser.version();
try {
 const page=await browser.newPage();await page.addScriptTag({content:compose});await page.addScriptTag({content:ink});
 await page.evaluate(code=>{window.paint=new Function('importScripts','self',code+'\nreturn render;')(()=>{},{});},worker);
 for(const item of scenes) {
  const width=720,height=item.name.startsWith('painting')?1080:Math.round(width*item.scene.height/item.scene.width);
  const render=()=>page.evaluate(({scene,width,height})=>{const bitmap=paint(scene,width,height),c=document.createElement('canvas');c.width=width;c.height=height;c.getContext('2d').drawImage(bitmap,0,0);bitmap.close();return c.toDataURL('image/png').split(',')[1];},{scene:item.scene,width,height});
  const result=await render(),repeated=await render();
  if(result!==repeated) {
    fs.writeFileSync(path.join(out,item.name+'-first.png'),Buffer.from(result,'base64'));
    fs.writeFileSync(path.join(out,item.name+'-repeat.png'),Buffer.from(repeated,'base64'));
  }
  assert.equal(createHash('sha256').update(repeated).digest('hex'),createHash('sha256').update(result).digest('hex'),item.name+': exact PNG replay');
  item.output={width,height};
  const bytes=Buffer.from(result,'base64');fs.writeFileSync(path.join(out,item.name+'.png'),bytes);
  item.sha256=createHash('sha256').update(bytes).digest('hex');
  if(item.name.startsWith('painting')) {
    const mountainCrop={x:160,y:100,width:520,height:500,renderWidth:width,renderHeight:height};
    const mountain=await page.evaluate(async({png,crop})=>{
      const img=new Image();img.src='data:image/png;base64,'+png;await img.decode();
      const c=document.createElement('canvas');c.width=crop.width;c.height=crop.height;
      c.getContext('2d').drawImage(img,-crop.x,-crop.y);return c.toDataURL('image/png').split(',')[1];
    },{png:result,crop:mountainCrop});
    const mountainBytes=Buffer.from(mountain,'base64');
    fs.writeFileSync(path.join(out,item.name+'-mountain.png'),mountainBytes);
    item.mountainDetail={...mountainCrop,sha256:createHash('sha256').update(mountainBytes).digest('hex')};
    const bank=item.scene.sceneElements.filter(e=>e.motif==='groundBank').at(-1);
    const crop={x:bank.bounds.x+bank.bounds.width*.5<.5?30:445,y:480,width:485,height:765,renderWidth:960,renderHeight:1440};
    const detail=await page.evaluate(({scene,crop})=>{
      const bitmap=paint(scene,crop.renderWidth,crop.renderHeight),c=document.createElement('canvas');
      c.width=crop.width;c.height=crop.height;c.getContext('2d').drawImage(bitmap,-crop.x,-crop.y);bitmap.close();
      return c.toDataURL('image/png').split(',')[1];
    },{scene:item.scene,crop});
    const detailBytes=Buffer.from(detail,'base64');
    fs.writeFileSync(path.join(out,item.name+'-detail.png'),detailBytes);
    item.detail={...crop,sha256:createHash('sha256').update(detailBytes).digest('hex')};
  }
 }
} finally {await browser.close();}
fs.writeFileSync(path.join(out,'scenes.json'),JSON.stringify({browserVersion,sources,scenes})+'\n');
const reference=path.resolve('out/theme-art-validation/landscape-flow-reference/cha-shibiao-detail.jpg');
const original=fs.existsSync(reference)?`<figure><img src="${html(path.relative(out,reference))}"><figcaption>查士标原作局部，仅作对照，不参与生成。</figcaption></figure>`
 : '<p>原作参考图未下载。<a href="https://education.asianart.org/wp-content/uploads/sites/6/2019/09/B69D41_Landscape_Detail.jpg">亚洲艺术博物馆图源</a></p>';
const paintings=scenes.filter(x=>x.name.startsWith('painting'));
fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>山水原画幅验证</title><style>body{margin:0;background:#efede4;color:#384138;font:16px system-ui}main{max-width:1200px;margin:auto;padding:24px}.grid{display:flex;flex-wrap:wrap;gap:20px}figure{margin:0;flex:1;min-width:260px}img{width:100%;display:block}figcaption{padding:12px 0}</style><main><h1>山水原画幅 · 结构与笔墨</h1><div class="grid">${paintings.map(x=>`<figure><a href="${x.name}.png"><img src="${x.name}.png"></a><figcaption>${html(x.seed)}</figcaption></figure>`).join('')}</div><h2>林屋近景 · 同为 485 × 765 像素</h2><p>候选由完整画作重新以 960 × 1440 渲染后裁取，未做图像润色；对齐图像像素尺寸，不代表按原作实物尺寸校准。</p>${paintings.map(x=>`<h3>${html(x.seed)}</h3><div class="grid">${original}<figure><a href="${x.name}-detail.png"><img src="${x.name}-detail.png"></a><figcaption>候选局部</figcaption></figure></div>`).join('')}<h2>近岸 · 放大核对折带与转面</h2><img src="bank.png"><h2>独立矮石</h2><img src="stone.png"><p><a href="scenes.json">种子、完整绘图数据与复现校验</a></p></main>`);
console.log(out);
