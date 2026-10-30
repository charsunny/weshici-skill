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
