#!/usr/bin/env node
// Audit the existing video templates after the static theme study; no MP4 or audio export.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { startStudioServer, loadPuppeteer, findChromeExecutable } from './server-util.mjs';
const out = process.argv[2] || 'out/theme-art-validation/motion';
const jobs = [
  {template:'huaping-motion', recipe:'qingming-dumu', palette:'canglang', appearance:'light'},
  {template:'huaping-motion', recipe:'hanlu-dufu', palette:'moon-white', appearance:'dark'},
  {template:'ink-story', recipe:'wanqing-dufu-story', palette:'yaqing', appearance:'light'},
  {template:'poem-song-mv', recipe:'sumuzhe-fanzhongyan-mv', palette:'canglang', appearance:'dark'},
];
fs.mkdirSync(out, {recursive:true});
const sha = b => createHash('sha256').update(b).digest('hex');
const server = await startStudioServer();
let browser;
const records = [];
try {
  const puppeteer = await loadPuppeteer();
  browser = await puppeteer.launch({executablePath:findChromeExecutable(), headless:true, args:['--no-sandbox','--hide-scrollbars']});
  for (const job of jobs) {
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => {if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);});
    await page.setViewport({width:1080,height:1920,deviceScaleFactor:1});
    await page.goto(`${server.baseUrl}/resources/templates/${job.template}/index.html?${new URLSearchParams({...job,capture:'1'})}`);
    await page.waitForFunction(() => window.READY, {timeout:90000});
    const state = await page.evaluate(() => ({duration:window.DUR, scene:window.SCENE, warnings:window.WARNINGS || []}));
    const duration = state.duration;
    assert.ok(duration > 3);
    const times = [0,.5,1,2,3,...[.4,.6,.8].map(k=>duration*k),duration-.1];
    const name = `${job.template}-${job.appearance}`, frames = [], adjacent = [];
    for (const [index, time] of [...times, duration-2, duration-1.5, duration-1].entries()) {
      await page.evaluate(t => window.render(t), time);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const problems = await page.evaluate(() => {
        return [...document.querySelectorAll('.hp-verses .hp-glyph,.hp-line,.hp-credit,.hp-seal,.hp-colophon .hp-glyph,.lyric span:not(.gap),.credit .title,.credit .author')].filter(el => {
          let opacity = 1;
          for (let p=el; p; p=p.parentElement) opacity *= Number(getComputedStyle(p).opacity);
          if (opacity < .5) return false;
          const r=el.getBoundingClientRect();
          return r.left < -1 || r.top < -1 || r.right > 941 || r.bottom > 1541;
        }).map(el=>el.textContent || el.className);
      });
      const file = `${name}-${String(index).padStart(2,'0')}.png`;
      const png = await page.screenshot({path:path.join(out,file)});
      const record = {time,file,sha256:sha(png),problems};
      if (index < times.length) frames.push(record); else adjacent.push(record);
    }
    await page.evaluate(t=>window.render(t),1);
    await page.evaluate(t=>window.render(t),duration-1);
    const replay = await page.screenshot();
    assert.equal(sha(replay), adjacent.at(-1).sha256, `${name}: seeking is not deterministic`);
    assert.ok(new Set(adjacent.map(f=>f.sha256)).size > 1, `${name}: settled frames are static`);
    assert.deepEqual(errors, [], name);
    const sheet = await browser.newPage();
    await sheet.setViewport({width:936,height:Math.ceil((frames.length+adjacent.length)/3)*568+16});
    await sheet.setContent('<style>body{margin:0;padding:8px;display:grid;grid-template-columns:repeat(3,300px);gap:8px;background:#858585;color:white;font:16px sans-serif}figure{margin:0}img{display:block;width:300px;height:533.333px}figcaption{padding:6px}</style>');
    await sheet.evaluate(items=>{for(const item of items){const f=document.createElement('figure'),i=document.createElement('img'),c=document.createElement('figcaption');i.src=item.image;c.textContent=item.label;f.append(i,c);document.body.append(f);}},
      [...frames,...adjacent].map((f,i)=>({image:`data:image/png;base64,${fs.readFileSync(path.join(out,f.file)).toString('base64')}`,label:`${i<9?'关键帧':'余韵'} ${f.time.toFixed(2)}s`})));
    await sheet.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
    await sheet.screenshot({path:path.join(out,`${name}-sheet.png`)});
    await sheet.close(); await page.close();
    records.push({...job,...state,frames,adjacent,seekDeterministic:true});
    console.log(`PASS ${name}; layout flags: ${frames.concat(adjacent).reduce((n,f)=>n+f.problems.length,0)}; warnings: ${state.warnings.length}`);
  }
  fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({browser:await browser.version(),records},null,2)+'\n');
  assert.ok(records.every(r=>r.frames.concat(r.adjacent).every(f=>f.problems.length===0)), 'visible video text enters the safety margins');
} finally { await browser?.close(); server.server.close(); }
