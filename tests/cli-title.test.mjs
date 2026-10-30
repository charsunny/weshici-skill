import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';

test('single poster resolves missing author from its title and excerpt',async()=>{
 const server=http.createServer((req,res)=>{
  res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify({data:[{title:'早发白帝城',author:{name:'李白'},dynasty:'tang',content:'朝辞白帝彩云间，千里江陵一日还。两岸猨声啼不尽，轻舟已过万重山。'}]}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const out=await fs.mkdtemp(path.join(os.tmpdir(),'weshici-cli-title-'));
 try {
  const result=await new Promise((resolve,reject)=>{
   const proc=spawn(process.execPath,['scripts/generate.mjs','poster','--title','早发白帝城','--poem','轻舟已过万重山','--out',out],{
    cwd:new URL('..',import.meta.url),env:{...process.env,WEISHI_API_BASE:`http://127.0.0.1:${server.address().port}`},stdio:['ignore','pipe','pipe']
   });
   let log='';proc.stdout.on('data',x=>log+=x);proc.stderr.on('data',x=>log+=x);
   proc.on('error',reject);proc.on('exit',code=>resolve({code,log}));
  });
  assert.equal(result.code,0,result.log);
  assert.match(result.log,/唐 · 李白/);
  const manifest=JSON.parse(await fs.readFile(path.join(out,'manifest.json'),'utf8'));
  assert.equal(manifest.cards[0].author,'李白');
  assert.match(manifest.cards[0].poem,/轻舟已过万重山/);
  assert.ok((await fs.stat(path.join(out,'01-poem.png'))).size>10000);
 } finally {server.close();await fs.rm(out,{recursive:true,force:true});}
});
