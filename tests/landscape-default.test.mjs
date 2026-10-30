import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
const context=vm.createContext({TextEncoder,btoa});
for(const name of ['zxart-compose.js','zxart-shanshui-v5.js'])vm.runInContext(fs.readFileSync(new URL('../resources/vendor/zxart/'+name,import.meta.url),'utf8'),context);
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
test('shared poetic recipes choose the dominant cun and honour explicit choice',()=>{
 for(const [title,text,cun] of [['望岳','岱宗夫如何','axe'],['山居秋暝','明月松间照，清泉石上流','hemp'],['江雪','孤舟蓑笠翁','hemp']]) {
  const scene=context.poetryScene(text,title);
  assert.equal(scene.paintingProcedural('fixed').params.scene.cun,cun);
  assert.equal(scene.paintingProcedural('fixed',{cun:'hemp'}).params.scene.cun,'hemp');
 }
});
test('both shanshui@5 entry points default to landscape-v3; explicit original stays legacy',()=>{
 const api=context.ZXArtCompose,recipe=context.poetryScene('明月松间照，清泉石上流','山居秋暝').paintingProcedural('defaults');
 const req={...recipe,width:420,height:630,palette:{paper:'#f0eee2',ink:'#242820'}};
 const implicit=api.generate(req),explicit=api.generate({...req,params:{...req.params,element_treatment:'landscape-v3'}});
 assert.equal(implicit.brushwork.version,'landscape-v3');assert.equal(hash(implicit),hash(explicit));
 const legacy=api.generate({...req,params:{...req.params,element_treatment:'original'}});
 assert.equal(legacy.brushwork,undefined);assert.notEqual(hash(legacy.layers),hash(implicit.layers));
 const direct=context.generatePoetryPaintingV5({seed:'direct',scene:'retreat',width:420,height:630,options:{motifs:['hut'],cun:'axe'}},{paper:[.95,.94,.89,1],ink:[.14,.16,.13,1],isDark:false}).drawing;
 assert.equal(direct.brushwork.version,'landscape-v3');assert.equal(direct.brushwork.technique,'axe');
});

test('fishing subjects outrank winter, autumn and title settings without requiring a poem title',()=>{
 const poems=[
  ['江雪','千山鸟飞绝，万径人踪灭。孤舟蓑笠翁，独钓寒江雪。'],
  ['渔歌子','西塞山前白鹭飞，桃花流水鳜鱼肥。青箬笠，绿蓑衣，斜风细雨不须归。'],
  ['题秋江独钓图','一蓑一笠一扁舟，一丈丝纶一寸钩。一曲高歌一樽酒，一人独钓一江秋。'],
 ];
 for(const [title,text] of poems){
  for(const heading of [title,''])assert.equal(context.poetryScene(text,heading).scene,'fishing');
  const recipe=context.poetryScene(text,title).paintingProcedural('routing-'+title);
  const art=context.ZXArtCompose.generate({...recipe,width:420,height:630,palette:{paper:'#f0eee2',ink:'#242820'}});
  assert.ok(art.sceneElements.some(e=>e.motif==='angler'),title);
  assert.ok(art.anchors.boats.some(b=>b.length>.12),title);
 }
 assert.equal(context.poetryScene('风雪夜归人','逢雪宿芙蓉山主人').scene,'winterForest');
 assert.notEqual(context.poetryScene('寒江雪满天','').scene,'fishing');
 assert.notEqual(context.poetryScene('一蓑烟雨任平生','定风波').scene,'fishing');
});

test('water rendering uses clipped coordinates and recipe bank scale leaves other compositions unchanged',()=>{
 const palette={paper:[.95,.94,.89,1],ink:[.14,.16,.13,1],isDark:false};
 const stage=new context.PaintingStageV5('water-clip',420,630,palette,null,.08,{});
 stage.engine.landscapeSeed='water-clip';
 const points=[{x:-10,y:10},{x:30,y:10},{x:30,y:30},{x:-10,y:30}];
 const clipped=stage.clipWater([{p:points,pts:points}],{minX:0,minY:0,maxX:20,maxY:20});
 assert.ok(clipped.length);
 assert.ok(clipped.every(poly=>poly.p.every(p=>p.x>=0&&p.x<=20&&p.y>=0&&p.y<=20)), 'renderer and anchor coordinates must obey the same water clip');
 const draw=bank_scale=>context.generatePoetryPaintingV5({seed:'sumuzhe-1019',scene:'fishing',width:420,height:630,
  options:{motifs:['sunset','mist'],composition:'oppositeBank',...(bank_scale==null?{}:{bank_scale})}},palette).drawing;
 const normal=draw(),explicit=draw(1),small=draw(.35);
 assert.equal(hash(normal),hash(explicit));
 const bank=d=>d.sceneElements.find(e=>e.motif==='groundBank').bounds;
 assert.ok(bank(small).width<bank(normal).width*.5);
 assert.ok(bank(small).height<bank(normal).height*.5);
 assert.ok(small.sceneElements.some(e=>e.motif==='sunset'));
 assert.ok(small.anchors.water);
});
