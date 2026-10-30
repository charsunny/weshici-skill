#!/usr/bin/env node
// Compare actual Worker raster treatments without changing scene geometry or production defaults.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadPuppeteer, findChromeExecutable } from './server-util.mjs';
const out=path.resolve(process.argv[2]||'out/theme-art-validation/ink-study');
fs.mkdirSync(out,{recursive:true});
const sources={},context=vm.createContext({TextEncoder,btoa});
for(const name of ['zxart-compose.js','zxart-shanshui-v5.js']) {
 const source=fs.readFileSync('resources/vendor/zxart/'+name,'utf8');
 sources[name]=createHash('sha256').update(source).digest('hex');vm.runInContext(source,context);
}
const inkSource=fs.readFileSync('resources/vendor/zxart/zxart-ink.js','utf8');
sources['zxart-ink.js']=createHash('sha256').update(inkSource).digest('hex');
vm.runInContext(inkSource,context);
sources['landscape-ink-study.mjs']=createHash('sha256').update(fs.readFileSync(new URL(import.meta.url))).digest('hex');
const worker=fs.readFileSync('resources/vendor/zxart/zxart-worker.js','utf8');
sources['zxart-worker.js']=createHash('sha256').update(worker).digest('hex');
const Engine=context.ShanShuiEngineV5,original=Engine.prototype.paintingBrushStroke;
const area=points=>Math.abs(points.reduce((n,p,i)=>{const q=points[(i+1)%points.length];return n+p.x*q.y-q.x*p.y;},0)/2);
// Observe existing paths only. Always execute the original brush so random draws remain identical.
Engine.prototype.paintingBrushStroke=function(points,options={}) {
 const polys=original.call(this,points,options),dry=options.moisture<.3;
 const role=dry?'cun':options.moisture>.5?'dots':'contour';
 const body=polys[dry?0:2]||polys[0];
 const alpha=Math.min(.95,polys.reduce((n,p)=>n+area(p.p)*(p.fil?.a||0),0)/Math.max(.001,area(body.p)));
 for(const p of polys)p.studyRole=role;
 polys[0].studyStroke={path:this.inkCurve(points,4).map(p=>({x:p.x+10,y:p.y+8})),width:options.width||2,ink:options.ink??.6,oblique:options.oblique||0,pressure:options.pressure||[.15,1,.8,.4,.02],dry:dry?.88:.25};
 polys[0].studyBody={p:body.p,fil:{r:0,g:0,b:0,a:alpha},wid:0};return polys;
};
const make=()=>{const e=new Engine('bank-proof');e.landscapeSeed='bank-proof';
 return e.paintingLandscapeStone([{x:0,y:0},{x:220,y:0}],90,1);};
const polys=make();assert.deepEqual(polys,make());
const toShape=p=>({points:p.p.flatMap(q=>[q.x+10,q.y+8]),fill:p.fil?[p.fil.r/255,p.fil.g/255,p.fil.b/255,p.fil.a]:null,
 stroke:null,lineWidth:0,closed:true,...(p.overprint?{overprint:true}:{})});
const roles=['contour','cun','wash','dots'];
const grouped=Object.fromEntries(roles.map(role=>[role,[]]));
const brushGroups=Object.fromEntries(roles.map(role=>[role,[]]));
const compact=Object.fromEntries(roles.map(role=>[role,[]]));
const mask=polys.filter(p=>p.fil?.r===255).map(toShape);
const washPolys=polys.filter(p=>p.overprint);
for(const p of polys) {
 if(p.studyRole) {
  grouped[p.studyRole].push(toShape(p));
  if(p.studyBody)compact[p.studyRole].push(toShape(p.studyBody));
  if(p.studyStroke)brushGroups[p.studyRole].push(p.studyStroke);
 } else if(p.overprint)grouped.wash.push(toShape(p));
}
// This fixed test stone has 12 front-plane passes and three groups of 24 seam passes.
assert.equal(washPolys.length,84,'fixed 7d44536 test stone changed; review the wash groups before comparing');
for(const [start,end] of [[0,12],[12,36],[36,60],[60,84]]) {
 const group=washPolys.slice(start,end),outer=group[0];
 const alpha=Math.min(.95,group.reduce((n,p)=>n+area(p.p)*p.fil.a,0)/area(outer.p));
 compact.wash.push(toShape({...outer,fil:{r:0,g:0,b:0,a:alpha},overprint:false}));
}
const profiles={
 contour:{wash:{bleed:.35,rim:.15,grain:.12,fullResolution:true},tooth:.12},
 cun:{wash:{bleed:0,rim:0,grain:.28,fullResolution:true},tooth:.95},
 wash:{wash:{bleed:2.4,rim:.45,grain:.10,fullResolution:true},tooth:.08},
 dots:{wash:{bleed:.2,rim:.2,grain:.1,fullResolution:true},tooth:.15}
};
const paperSource=new Engine('bank-proof').backgroundPaper();
const paper={...paperSource,shade:Array.from(paperSource.shade),strength:paperSource.strength*.45,tint:[.15,.17,.13,1]};
const drawing=layers=>({width:240,height:110,background:[.95,.94,.90,1],paper,layers});
const layer=(shapes,extra={})=>({shapes,opacity:1,blend:'normal',...extra});
const maskLayer=layer(mask.map(s=>({...s,fill:[.95,.94,.90,s.fill[3]]})));
const vector=drawing([maskLayer,layer(polys.filter(p=>p.fil?.r!==255).map(toShape))]);
const washed=(groups,until=4)=>drawing([maskLayer,...roles.slice(0,until).map(role=>layer(groups[role],{blend:'multiply',...profiles[role]}))]);
const rasterProfiles=Object.fromEntries(roles.map((role,i)=>[role,{seed:20261028+i*71,color:[0,0,0],bleed:role==='wash'?4.8:role==='cun'?0:.25,rim:role==='wash'?.35:.2}]));
const rasterDrawing=(until=4)=>drawing([maskLayer,...roles.slice(0,until).map(role=>layer(role==='wash'?compact.wash:[],{blend:'multiply',brushStrokes:brushGroups[role],ink:rasterProfiles[role]}))]);
const cases=[['vector','A · 矢量叠染，关闭纸面滤镜',vector],['raster','B · 相同几何，分层 drawWashed',washed(grouped)],
 ['compact','C · 完整笔体与整块染面，分层 drawWashed',washed(compact)],
 ['current','现有候选 · 整层轻滤镜',drawing([maskLayer,layer(polys.filter(p=>p.fil?.r!==255).map(toShape),{wash:{bleed:.12,rim:.08,grain:.45,fullResolution:true},tooth:.20})])],['bristles','D · 逐毫接触、墨量衰减与湿墨扩散',rasterDrawing()]];
for(let i=1;i<=4;i++)cases.push(['phase-'+i,['','勾','勾＋皴','勾＋皴＋染','勾＋皴＋染＋点'][i],rasterDrawing(i)]);
const reference='out/theme-art-validation/landscape-flow-reference/cha-shibiao-detail.jpg';
const hasReference=fs.existsSync(reference);
if(hasReference)fs.copyFileSync(reference,path.join(out,'reference.jpg'));
const stats={sources,seed:'bank-proof',inkVersion:context.ZXArtInk.version,rasterProfiles,profiles,paperStrength:paper.strength,
 shapes:{vector:polys.length,compact:1+Object.values(compact).reduce((n,g)=>n+g.length,0)},renders:[]};
const puppeteer=await loadPuppeteer(),browser=await puppeteer.launch({executablePath:findChromeExecutable(),headless:true,args:['--no-sandbox']});
try {
 stats.browser=await browser.version();
 fs.writeFileSync(path.join(out,'scene.json'),JSON.stringify(rasterDrawing())+'\n');
 const page=await browser.newPage();await page.addScriptTag({path:path.resolve('resources/vendor/zxart/zxart-compose.js')});await page.addScriptTag({content:inkSource});
 await page.evaluate(code=>{window.studyRender=new Function('importScripts','self',code+'\nreturn render;')(()=>{},{});},worker);
 for(const [name,label,scene] of cases) {
  const start=performance.now();
  const result=await page.evaluate(({scene})=>{
   const bitmap=window.studyRender(scene,960,440),canvas=document.createElement('canvas');canvas.width=960;canvas.height=440;
   const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();
   return canvas.toDataURL('image/png').split(',')[1];
  },{scene});
  const png=Buffer.from(result,'base64');fs.writeFileSync(path.join(out,name+'.png'),png);
  stats.renders.push({name,milliseconds:Math.round(performance.now()-start),sha256:createHash('sha256').update(png).digest('hex')});
 }
 const repeat=await page.evaluate(scene=>{const bitmap=window.studyRender(scene,960,440),c=document.createElement('canvas');c.width=960;c.height=440;c.getContext('2d').drawImage(bitmap,0,0);bitmap.close();return c.toDataURL('image/png').split(',')[1];},rasterDrawing());
 assert.equal(createHash('sha256').update(Buffer.from(repeat,'base64')).digest('hex'),stats.renders[4].sha256);
 // Measure the existing tooth response using the same paper, independent of aesthetics.
 stats.tooth=await page.evaluate(paper=>{
  let min=1,max=0,sum=0,holes=0,count=0;
  for(let y=0;y<100;y+=.5)for(let x=0;x<220;x+=.5){const v=ZXArtCompose.WashNoise.tooth(.95,paper,x,y);min=Math.min(min,v);max=Math.max(max,v);sum+=v;holes+=v<.1;count++;}
  return {min,max,mean:sum/count,nearTransparentFraction:holes/count};
 },paper);
 assert.notEqual(stats.renders[0].sha256,stats.renders[1].sha256,'raster treatment must affect real pixels');
 const card=([name,label])=>`<figure><figcaption>${label}</figcaption><a href="${name}.png"><img src="${name}.png" alt="${label}"></a></figure>`;
 const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>同一岩面 · 矢量与湿墨栅格对照</title><style>body{margin:0;background:#f4f2e9;color:#28342e;font:16px/1.75 system-ui}main{max-width:1100px;margin:auto;padding:32px}h1{font:30px serif}h2{font-size:21px}p{max-width:900px}figure{margin:20px 0;padding:14px;background:#faf9f4}figcaption{margin-bottom:8px}img,svg{display:block;width:100%}.phases{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.phases figure{margin:0}a{color:#32664f}@media(max-width:600px){main{padding:16px}.phases{grid-template-columns:1fr}}</style><main><h1>同一岩面，先验证墨的生成方式</h1><p>固定 bank-proof、岩面轮廓与行笔路线，直接调用当前 Worker 的真实 Canvas 渲染。A 与 B 保持全部图元一致；C 将每笔合为完整笔体、每组淡染合为整块染面，透明度按图元面积估算，不代表墨量精确等价。D 沿相同行笔路线逐毫盖印，笔毫墨量衰减与纸纹高度共同决定接触；湿墨以栅格扩散并补边缘积墨。全部以相同像素和缩放显示。</p><div class="phases">${[cases[0],cases[1],cases[3],cases[2]].map(card).join('')}</div><h2>同一路线 · 完整笔体与新栅格笔毫</h2><div class="phases">${[cases[2],cases[4]].map(card).join('')}</div><p>本轮判断：D 的断墨、边缘和叠笔已有变化，但三组卷曲笔路、扇形染面与空旷平面仍来自原有造型，尚未达到原画笔墨。不能据此认定山水重做完成。</p><h2>D 的笔法顺序</h2><div class="phases">${cases.slice(5).map(card).join('')}</div>${hasReference?'<h2>原画与 D · 同为 485 × 260 图像像素裁切</h2><div class="phases"><figure><figcaption>查士标原画近岸 · B69D41，1686</figcaption><svg viewBox="0 480 485 260"><image href="reference.jpg" width="485" height="765"/></svg></figure><figure><figcaption>D 局部 · 相同缩放</figcaption><svg viewBox="240 100 485 260"><image href="bristles.png" width="960" height="440"/></svg></figure></div><p>图像像素相同，不代表原作实物尺度；参考图不参与生成。<a href="https://education.asianart.org/resources/brushpainting-nature-in-art-school-program-selected-resources/">博物馆图像来源</a></p>':''}<h2>先读测量，再判断画面</h2><p>图元数：A ${stats.shapes.vector}，C ${stats.shapes.compact}。现有 tooth=.95 在当前纸面上的保留率为 ${stats.tooth.min.toFixed(3)}–${stats.tooth.max.toFixed(3)}，均值 ${stats.tooth.mean.toFixed(3)}；接近透明的比例 ${(stats.tooth.nearTransparentFraction*100).toFixed(2)}%。它目前是按纸纹减薄 alpha，不是自动产生方向性飞白的笔毛模型。</p><p>A–C 的 multiply 只处理图层间混合，同层相邻同色图元仍会合并；D 在笔触内累计光学密度，再参与图层混合，不再依赖 overprint。这只是浅纸黑墨试验。multiply 不适合直接照搬到深纸浅色笔迹；本页未修改默认生成器，也未改 App。<a href="checks.json">源码、参数与结果记录</a> · <a href="scene.json">D 完整场景数据</a> · <a href="https://education.asianart.org/wp-content/uploads/sites/6/2019/09/Brushstrokes.pdf#page=20">教材第 20 页</a></p></main></html>`;
 fs.writeFileSync(path.join(out,'index.html'),html);fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify(stats,null,2)+'\n');
 await page.setViewport({width:1100,height:1000,deviceScaleFactor:1});await page.goto('file://'+path.join(out,'index.html'));
 await page.screenshot({path:path.join(out,'comparison.png'),fullPage:true});
 for(const width of [1100,390]) {await page.setViewport({width,height:1000});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'comparison page fits viewport');
 }
 await page.evaluate(async()=>{await Promise.all([...document.images].map(img=>img.decode()));});
 assert.ok(await page.evaluate(()=>[...document.images].every(img=>img.complete&&img.naturalWidth>0)),'all comparison images load');
} finally {await browser.close();}
console.log(JSON.stringify({out,shapes:stats.shapes,tooth:stats.tooth}));
