#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {startStudioServer,loadPuppeteer,findChromeExecutable} from './server-util.mjs';
const original=process.argv.includes('--original');
const out=process.argv[2]||'out/landscape-default/static';fs.mkdirSync(out,{recursive:true});
const mountain={title:'山居秋暝',author:'王维',dynasty:'唐',poem:'空山新雨后，天气晚来秋。明月松间照，清泉石上流。'};
const snow={title:'江雪',author:'柳宗元',dynasty:'唐',poem:'千山鸟飞绝，万径人踪灭。孤舟蓑笠翁，独钓寒江雪。'};
// Public-domain texts checked against Wikisource (渔歌子) and gushiwen.cn/shiwenv_32c4c7921ebe.aspx.
const fishingPoems=[
 {name:'image-yugezi',title:'渔歌子',author:'张志和',dynasty:'唐',poem:'西塞山前白鹭飞，桃花流水鳜鱼肥。青箬笠，绿蓑衣，斜风细雨不须归。'},
 {name:'image-qiujiang',title:'题秋江独钓图',author:'王士祯',dynasty:'清',poem:'一蓑一笠一扁舟，一丈丝纶一寸钩。一曲高歌一樽酒，一人独钓一江秋。'},
];
const jobs=[
 ...fishingPoems.map(p=>({mode:'image',...p})),
 {name:'image-shanju-light',mode:'image',...mountain},
 {name:'image-jiangxue-light',mode:'image',...snow},
 {name:'image-shanju-dark',mode:'image',scheme:'dark',...mountain},
 {name:'wallpaper-iphone',mode:'wallpaper',width:1290,height:2796,...snow},
 ...[1,2,3,4].map(card=>({name:`xiaohongshu-${card}`,mode:'xiaohongshu',card,...mountain})),
 {name:'wechat-daily',mode:'wechat-card',height:1920,...mountain},
 {name:'wechat-xuan',mode:'wechat-sticker',type:'xuan',width:800,height:800,...mountain},
 {name:'image-wangyue-axe',mode:'image',title:'望岳',author:'杜甫',dynasty:'唐',poem:'岱宗夫如何，齐鲁青未了。造化钟神秀，阴阳割昏晓。'},
];
const server=await startStudioServer(),p=await loadPuppeteer(),browser=await p.launch({executablePath:findChromeExecutable(),headless:true,args:['--no-sandbox','--hide-scrollbars']});
const records=[];
try{
 for(const job of jobs){
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const {name,width=1080,height=1440,...query}=job;
  await page.setViewport({width,height,deviceScaleFactor:1});
  await page.goto(server.baseUrl+'/resources/templates/media-suite/index.html?'+new URLSearchParams({date:'2026-10-29',...(original?{element_treatment:'original'}:{}),...query}));
  await page.waitForFunction(()=>window.READY,{timeout:180000});
  const record=await page.evaluate(()=>({art:window.ART_RESULT,plan:window.__huapingPlan,footer:window.__huapingFooter,exports:window.__exports,
   outside:[...document.querySelectorAll('.hp-glyph,.hp-seal,.xhs-title-group,.xhs-callout,.wc-header')].filter(el=>{const r=el.getBoundingClientRect();return r.left<0||r.top<0||r.right>innerWidth+1||r.bottom>innerHeight+1;}).map(el=>el.textContent||el.className)}));
  assert.deepEqual(errors,[],name);assert.equal(record.art?.ok,true,name);assert.equal(record.art.brushwork?.version,original?undefined:'landscape-v3',name);assert.deepEqual(record.outside,[],name);
  if(!original && name.endsWith('axe'))assert.equal(record.art.brushwork.technique,'axe');
  if(['江雪','渔歌子','题秋江独钓图'].includes(job.title)) {
   assert.equal(record.art.request.scene,'fishing',name);
   assert.ok(record.art.sceneElements.some(e=>e.motif==='angler'),name);
   assert.ok(record.art.anchors.boats.some(b=>b.length>.12),name);
  }
  const file=name+'.png',png=await page.screenshot({path:path.join(out,file)});
  records.push({...job,width,height,...record,file,sha256:createHash('sha256').update(png).digest('hex')});await page.close();console.log('PASS '+name);
 }
 const page=await browser.newPage();await page.setViewport({width:1104,height:Math.ceil(records.length/3)*540+24});
 await page.setContent('<style>body{margin:0;padding:12px;display:grid;grid-template-columns:repeat(3,352px);gap:12px;background:#777;color:white;font:15px sans-serif}figure{margin:0}img{width:352px;height:500px;object-fit:contain;display:block}figcaption{padding:8px}</style>');
 await page.evaluate(items=>{for(const x of items){const f=document.createElement('figure'),i=new Image(),c=document.createElement('figcaption');i.src=x.src;c.textContent=x.name;f.append(i,c);document.body.append(f);}},records.map(x=>({name:x.name,src:'data:image/png;base64,'+fs.readFileSync(path.join(out,x.file)).toString('base64')})));
 await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));await page.screenshot({path:path.join(out,'contact.png')});
 fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({browser:await browser.version(),records},null,2)+'\n');
}finally{await browser.close();server.server.close();}
