#!/usr/bin/env node
// A reproducible brush vocabulary proof, using the same methods as the painting generator.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { loadPuppeteer, findChromeExecutable } from './server-util.mjs';

const out = path.resolve(process.argv[2] || 'out/theme-art-validation/landscape-brush');
fs.mkdirSync(out, { recursive:true });
const context = vm.createContext({ TextEncoder, btoa });
const sources = {};
for (const file of ['zxart-compose.js','zxart-shanshui-v5.js']) {
  const code = fs.readFileSync(new URL(`../resources/vendor/zxart/${file}`, import.meta.url),'utf8');
  sources[file] = createHash('sha256').update(code).digest('hex');
  vm.runInContext(code, context);
}
const Engine = context.ShanShuiEngineV5;
const P = (x,y) => ({x,y});
const esc = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
function svg(polys, box) {
  const color = c => c ? `rgba(${c.r},${c.g},${c.b},${c.a})` : 'none';
  return `<svg viewBox="${box}" xmlns="http://www.w3.org/2000/svg">${polys.map(p=>
    `<polygon points="${p.p.map(q=>`${q.x.toFixed(3)},${q.y.toFixed(3)}`).join(' ')}" fill="${color(p.fil)}" stroke="${color(p.str)}" stroke-width="${p.wid||0}"/>`).join('')}</svg>`;
}
const stroke = new Engine('brush-vocabulary-20261028');
const route = [P(15,46),P(65,42),P(110,55),P(165,41),P(220,45)];
const swatches = [
  ['中锋 · 轻按', {width:3,ink:.75,moisture:.5}],
  ['中锋 · 提按', {width:18,ink:.75,moisture:.5,pressure:[.05,1,.25,.9,.02]}],
  ['侧锋 · 一侧浓墨', {width:24,ink:.8,moisture:.65,oblique:1}],
  ['枯笔 · 露纸', {width:22,ink:.8,moisture:.12}],
].map(([label,opts])=>`<article><h3>${label}</h3>${svg(stroke.paintingBrushStroke(route,opts),'0 0 240 90')}</article>`);
for (const pine of [true,false]) {
  stroke.landscapeSeed='foliage-proof';
  swatches.push(`<article><h3>${pine?'松叶点 · 向枝心收拢':'阔叶 · 分组点写'}</h3>${svg(stroke.paintingLandscapeCrown(120,58,175,52,pine),'0 0 240 90')}</article>`);
}
stroke.landscapeSeed='bank-proof';
swatches.push(`<article><h3>近岸 · 岩面与裂隙</h3>${svg(stroke.paintingStone(0,220,0,75,'cliff',1),'-5 -5 240 90')}</article>`);
swatches.push(`<article><h3>岸势 · 主坡与岸脚遮挡</h3>${svg(stroke.paintingSlope('cliff'),'-5 -10 350 120')}</article>`);
swatches.push(`<article><h3>松树 · 分枝、转干与聚叶</h3>${svg(stroke.paintingTree('pine'),'-35 0 210 195')}</article>`);
const paintings=[];
for (const seed of ['ridge-01','ridge-02','ridge-03']) for (const technique of ['hemp','axe']) {
  const engine = new Engine(seed);
  engine.landscapeSeed=seed;
  engine.landscapeTechnique=technique;
  const raw=engine.paintingMountain('folded',false,1.4);
  paintings.push(`<article><h3>${esc(seed)} · ${technique==='hemp'?'披麻皴近似':'斧劈皴近似'}</h3>${svg(raw,'-15 -15 400 535')}</article>`);
}
const html=`<!doctype html><meta charset="utf-8"><title>山水笔法验证</title>
<style>body{margin:0;background:#f3f1e9;color:#29332d;font:16px system-ui}main{padding:36px;max-width:1200px;margin:auto}h1{font:34px serif;margin:0 0 12px}p{line-height:1.7;color:#56615a}h2{font-size:22px;margin:30px 0 18px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}article{background:#faf9f4;padding:14px}h3{font-size:14px;font-weight:500;margin:0 0 8px}svg{display:block;width:100%;height:auto}a{color:#2e6a4e}@media(max-width:600px){main{padding:18px}.grid{grid-template-columns:repeat(2,1fr)}}</style>
<main><h1>从一笔到一座山</h1><p>先看提按与墨色，再看同种山势如何使用不同皴法。均由当前生成器实时构造；是技法近似，不是教材图像贴图。</p>
<h2>笔触与点叶</h2><div class="grid">${swatches.join('')}</div>
<h2>固定种子，比较两种皴法</h2><p>每对使用相同结构随机流；皴笔沿岩面落下，暗面与轮廓共用山石转折。</p><div class="grid" style="grid-template-columns:repeat(2,1fr)">${paintings.join('')}</div>
<p>参考：<a href="https://education.asianart.org/wp-content/uploads/sites/6/2019/09/Brushstrokes.pdf#page=40">Asian Art Museum · Brushstrokes，PDF 第 40–45 页</a>。尚未模拟真实水墨扩散；不将图形叠加称为破墨。</p></main>`;
fs.writeFileSync(path.join(out,'index.html'),html);
fs.writeFileSync(path.join(out,'sources.json'),JSON.stringify(sources,null,2)+'\n');
const puppeteer=await loadPuppeteer();
const browser=await puppeteer.launch({executablePath:findChromeExecutable(),headless:true,args:['--no-sandbox']});
try {
  const page=await browser.newPage();
  await page.setViewport({width:1100,height:1000,deviceScaleFactor:1});
  await page.goto('file://'+path.join(out,'index.html'));
  await page.screenshot({path:path.join(out,'proof.png'),fullPage:true});
} finally {await browser.close();}
console.log(`Saved brush proof to ${out}`);
