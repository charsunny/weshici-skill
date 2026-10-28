#!/usr/bin/env node
// Assemble the local acceptance page after the study, replay and motion checks have run.
import fs from 'node:fs';
import path from 'node:path';
const root = process.argv[2] || 'out/theme-art-validation';
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names = {yaqing:'鸦青','moon-white':'月白',canglang:'苍筤'};
const kinds = {shanshui:'山水',flowers:'花卉',none:'素纸'};
function grid(directory, filter) {
 const data=JSON.parse(fs.readFileSync(path.join(root,directory,'checks.json'),'utf8'));
 return '<div class="grid">'+data.records.filter(filter).map(r=>`<a class="sample" href="${directory}/${r.name}.png"><img loading="lazy" src="${directory}/${r.name}.png" alt="${esc(r.config.title)}"><span>${esc(r.config.title)} · ${esc(names[r.config.theme]||r.config.theme)} · ${esc(kinds[r.config.artwork])}</span></a>`).join('')+'</div>';
}
const c=JSON.parse(fs.readFileSync(path.join(root,'round-c/checks.json'),'utf8'));
const replay=JSON.parse(fs.readFileSync(path.join(root,'replay/checks.json'),'utf8'));
const motion=JSON.parse(fs.readFileSync(path.join(root,'motion/checks.json'),'utf8'));
const parts=[`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>微诗 · 主题与诗画验收</title>
<style>body{margin:0;background:#f4f5f3;color:#1d2926;font:16px/1.75 system-ui,sans-serif}main{max-width:1180px;margin:0 auto;padding:56px 24px}h1{font:36px/1.4 serif;margin:12px 0}h2{font-size:25px;margin:44px 0 12px}h3{font-size:18px;margin:26px 0 10px}p{max-width:850px;color:#4d5c57}nav{display:flex;gap:22px;flex-wrap:wrap;margin:28px 0}a{color:#2e6a4e}small{color:#60736b}section{border-top:1px solid #d9dfdb;padding-bottom:28px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}.sample{text-decoration:none;display:block}.sample img{width:100%;display:block;border:1px solid #d5dbd7;box-sizing:border-box}.sample span{display:block;padding:9px 0;font-size:13px}.sheet{display:block;max-width:100%;margin:18px 0}summary{cursor:pointer;padding:14px 0;font-weight:600}.note{padding:16px 20px;background:#e9eee9;border-left:3px solid #758f7d}code{font-size:14px}@media(max-width:700px){main{padding:28px 16px}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}h1{font-size:28px}}</style>
<main><small>WESHICI SKILL · 2026-10-28 · A–D 统一验收</small><h1>主题相随，诗画各有其意</h1><p>本轮验证主题、绘画与阅读用途的关系。App 尚未修改。点击任意小样查看原图；这页保留全部结果和已知限制，等待统一审美验收。</p><nav><a href="#reading">全文阅读</a><a href="#inscription">题诗画屏</a><a href="#themes">三主题对照</a><a href="#motion">动态抽查</a><a href="#checks">验证与限制</a></nav>`];
parts.push('<section id="reading"><h2>01 · 全文阅读</h2><p>正文完整保留，景物置于正文之外；素纸用于比较阅读时是否需要配画。</p>');
for(const appearance of ['light','dark'])parts.push(`<h3>${appearance==='light'?'浅色':'深色'}</h3>`+grid('round-c',r=>r.config.purpose==='reading'&&r.config.appearance===appearance));
parts.push('</section><section id="inscription"><h2>02 · 题诗画屏</h2><p>山居、寒江、梅花、荷塘。末尾另有随节气梅花与用户显式选择的独立荷花。</p>');
for(const appearance of ['light','dark'])parts.push(`<h3>${appearance==='light'?'浅色':'深色'}</h3>`+grid('round-c',r=>r.config.purpose==='inscription'&&r.config.appearance===appearance));
parts.push('</section><section id="themes"><h2>03 · 固定诗画，切换主题</h2><p>同一首《春日》，固定种子、绘画墨色和排字。按鸦青、月白、苍筤依次查看；山水、花卉、素纸分别独立。</p>');
for(const appearance of ['light','dark'])parts.push(`<details${appearance==='light'?' open':''}><summary>${appearance==='light'?'浅色':'深色'} · 9 张</summary>`+grid('round-b-final',r=>r.config.appearance===appearance)+'</details>');
parts.push('<details><summary>保留 Claude 海报 v2 的 14 张配色基线</summary><a href="round-a/contact-sheet.png"><img class="sheet" loading="lazy" src="round-a/contact-sheet.png" alt="海报配色基线"></a></details></section>');
parts.push('<section id="motion"><h2>04 · 既有动态模板抽查</h2><p>每组 9 张关键帧和末段 3 张相邻帧。已检查跳转复现、余韵变化与文字安全区；没有导出 MP4 或验证音频。</p>');
for(const r of motion.records){const name=`${r.template}-${r.appearance}`;parts.push(`<details><summary>${esc(r.template)} · ${r.appearance==='light'?'浅色':'深色'}</summary><a href="motion/${name}-sheet.png"><img class="sheet" loading="lazy" src="motion/${name}-sheet.png" alt="${esc(name)}关键帧"></a></details>`);}
parts.push(`</section><section id="checks"><h2>05 · 验证与待审问题</h2><p>${c.records.length} 张诗作/阅读样本，最低文字对纸色对比度 ${Math.min(...c.records.map(r=>r.contrast)).toFixed(2)}:1；${replay.records.length} 张保存作品重放后 PNG 校验一致。完整记录：<a href="round-c/checks.json">静态</a> / <a href="round-c/content-checks.json">题材</a> / <a href="replay/checks.json">重放</a> / <a href="motion/checks.json">动态</a>。</p><div class="note">主题与用途的规则已实现并验证。仍需审美验收：Web 山水的部分坡岸/树干较硬；深色梅枝较暗；现有视频深色画面细节偏淡。当前 Web 墨色选择不等于原生青绿、金碧、没骨笔法已移植。</div><p>全文阅读背景没有景物进入正文区；目前只覆盖固定 3:4 尺寸，长篇超出时明确报错。App 迁移前仍需动态字体、设备与无障碍验证。</p></section></main></html>`);
fs.writeFileSync(path.join(root,'review.html'),parts.join('\n'));
console.log(path.join(root,'review.html'));
