#!/usr/bin/env node
// Assemble the local acceptance page after the study, replay and motion checks have run.
import fs from 'node:fs';
import path from 'node:path';
const root = process.argv[2] || 'out/theme-art-validation';
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names = {yaqing:'鸦青','moon-white':'月白','xiang-leaf':'缃叶',canglang:'苍筤',ousi:'藕丝',qingdai:'青黛',rouge:'胭脂'};
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
// Brushwork study is opt-in; keep the accepted theme and element treatments available below.
const brushChecks = path.join(root, 'brush-after/checks.json');
if (fs.existsSync(brushChecks)) {
 const after = JSON.parse(fs.readFileSync(brushChecks, 'utf8')).records;
 const before = JSON.parse(fs.readFileSync(path.join(root, 'elements-after/checks.json'), 'utf8')).records;
 parts.push('<style>.brush-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;max-width:920px}.brush-pair svg{display:block;width:100%}</style><section id="brush"><h2>笔触试验 · 山有块面，树有疏密</h2><p>左为上一轮主题点染版，右为本轮试验。固定外形、景物位置、字体与纸色；山体改用连续淡染、阴面块面和短皴笔，树冠改用成组墨簇与少量提示线。尚未切换默认版本。</p>');
 after.forEach((next, index) => {
  const previous = before.find(r => r.config.seed === next.config.seed && r.config.theme === next.config.theme && r.config.appearance === next.config.appearance && r.config.artwork === 'shanshui');
  if (!previous) throw new Error('缺少笔触对照基线');
  parts.push(`<h3>${esc(next.config.title)} · ${next.config.appearance === 'light' ? '浅色' : '深色'}</h3><div class="brush-pair">`);
  for (const [directory, record, label] of [['elements-after', previous, '上一轮'], ['brush-after', next, '笔触试验']]) {
   parts.push(`<a class="sample" href="${directory}/${record.name}.png"><img loading="lazy" src="${directory}/${record.name}.png" alt="${label}"><span>${label}</span></a>`);
  }
  parts.push('</div>');
  if (index < 2) {
   parts.push('<details><summary>放大山体与松冠</summary><div class="brush-pair">');
   for (const [directory, record] of [['elements-after', previous], ['brush-after', next]]) parts.push(`<svg viewBox="180 340 415 690"><image href="${directory}/${record.name}.png" width="1080" height="1440"/></svg>`);
   parts.push('</div></details>');
  }
 });
 parts.push('<p>试验仍有山形偏柱状、部分叶簇偏规则的问题，不能视为成熟国画效果。这里验证块面与笔触尺度的方向，后续需继续处理山势、皴笔与墨染的关系。参考 <a href="https://education.asianart.org/wp-content/uploads/sites/6/2019/09/Brushstrokes.pdf">亚洲艺术博物馆笔墨教材</a>，程序实现属于近似。</p><p><a href="brush-after/checks.json">检查记录</a> · <a href="brush-after/recipes.json">试验配方</a></p></section>');
}

// Element comparison preserves the pre-treatment images instead of regenerating the baseline.
const elementChecks = path.join(root, 'elements-after/checks.json');
if (fs.existsSync(elementChecks)) {
 const after = JSON.parse(fs.readFileSync(elementChecks, 'utf8')).records;
 const before = JSON.parse(fs.readFileSync(path.join(root, 'elements-before/checks.json'), 'utf8')).records;
 const sample = (directory, record, label, crop) => `<a class="sample" href="${directory}/${record.name}.png">${crop
  ? `<svg viewBox="${crop}" role="img" aria-label="${esc(label)}局部"><image href="${directory}/${record.name}.png" width="1080" height="1440"/></svg>`
  : `<img loading="lazy" src="${directory}/${record.name}.png" alt="${esc(label)}">`}<span>${esc(label)}</span></a>`;
 const pair = (index, crop) => `<div class="element-pair">${sample('elements-before', before[index], '原版', crop)}${sample('elements-after', after[index], '优化＋主题点染', crop)}</div>`;
 parts.push('<style>.element-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;max-width:920px}.element-pair svg{display:block;width:100%;border:1px solid #d5dbd7;box-sizing:border-box}</style><section id="elements"><h2>元素修订 · 墨骨与主题点染</h2><p>每组左为修订前，右为新版；诗句、字体、种子和纸色相同。山尖与枝叶用主题强调色，屋顶茅草用主题配色，花朵保留原色。先看局部，再展开完整样张。</p>');
 for (const [index, title, crop] of [[6,'苍筤 · 山尖皴线','220 345 210 260'],[6,'苍筤 · 松枝与茅草','365 690 225 340'],[15,'深色 · 山尖、月与淡云','205 340 345 360'],[0,'花茎 · 连续明暗与侧面点色','125 730 280 400'],[10,'深色梅枝 · 枝干可见度','30 420 590 780']]) {
  parts.push(`<h3>${title}</h3>${pair(index, crop)}`);
 }
 parts.push('<details><summary>展开全部 18 组浅深对照</summary>');
 after.forEach((record, index) => parts.push(`<h3>${esc(record.config.title)} · ${esc(names[record.config.theme])} · ${record.config.appearance === 'light' ? '浅色' : '深色'} · ${esc(record.config.artwork === 'flowers' ? record.config.flower : '山水')}</h3>${pair(index)}`));
 parts.push('</details><p>新增处理仅由实验入口启用。山脚和远岸淡出、花茎明暗连续、深色山水降亮；局部点染采用细笔筛选，尚未完成原生青绿笔法移植。程序松针和部分花簇造型仍需后续美术调整。</p><p><a href="elements-after/checks.json">18 张检查记录</a> · <a href="elements-after/recipes.json">保存配方</a></p></section>');
}

// Later rounds remain separate from the original A–D evidence.
const fontChecks = path.join(root, 'light-font-v3/checks.json');
if (fs.existsSync(fontChecks)) {
 const records = JSON.parse(fs.readFileSync(fontChecks, 'utf8')).records;
 const sample = (r, directory = 'light-font-v3', label = '') => `<a class="sample" href="${directory}/${r.name}.png"><img loading="lazy" src="${directory}/${r.name}.png" alt="${esc(r.config.font?.name || '思源宋体')}"><span>${esc(label || `${names[r.config.theme]} · ${r.config.font.name}`)} · ${esc(r.config.colors.paper)}</span></a>`;
 const gallery = items => '<div class="grid">' + items.map(r => sample(r)).join('') + '</div>';
 const original = JSON.parse(fs.readFileSync(path.join(root, 'round-b-final/checks.json'), 'utf8')).records;
 parts.push('<section id="light-font"><h2>浅色主题纸面与 App 书法字体</h2><p>浅色保留各主题的淡色纸面；字体独立选择。使用 App 最近本地 QA 版本的六款画屏字体原文件。点击图片看原图。</p><h3>先看纸色 · 同为思源宋体</h3><div class="grid">');
 parts.push(sample(original.find(r => r.config.theme === 'moon-white' && r.config.appearance === 'light' && r.config.artwork === 'flowers'), 'round-b-final', '原版 · 月白'));
 parts.push(sample(records.find(r => r.config.theme === 'moon-white' && r.config.appearance === 'light' && r.config.font.id === 'source_han_serif'), 'light-font-v3', '新版 · 月白'));
 parts.push('</div><h3>七主题浅色 · 固定漓雨手书</h3>' + gallery(Object.keys(names).map(theme => records.find(r => r.config.theme === theme && r.config.font.id === 'shufa_liyu' && r.config.purpose === 'inscription' && r.config.appearance === 'light'))));
 for (const appearance of ['light','dark']) {
  const seen = new Set();
  const fonts = records.filter(r => r.config.theme === 'moon-white' && r.config.purpose === 'inscription' && r.config.appearance === appearance && r.config.font.id !== 'custom').filter(r => !seen.has(r.config.font.id) && seen.add(r.config.font.id));
  parts.push(`<h3>${appearance === 'light' ? '浅色' : '深色'} · 固定月白，比较七款字体</h3>` + gallery(fonts));
 }
 parts.push('<p>崇羲篆体样张输入繁体诗句；本入口不自动转换简繁。其余样张为简体。缺字使用思源宋体补齐，实际使用的字形字体记录在检查文件中。</p><h3>全文阅读 · 宋体与书法</h3>' + gallery(records.filter(r => r.config.purpose === 'reading')));
 parts.push('<h3>自定义字体</h3><p>配方可填写 <code>"font": {"name": "我的字体", "path": "/本机路径/my-font.ttf"}</code>，支持 TTF、OTF、WOFF、WOFF2。以下通过本地文件路径加载东方大楷；效果与字体列表中选择的版本一致。字体文件与校验值会随作品快照保存。</p>' + gallery(records.filter(r => r.config.font.id === 'custom')));
 parts.push(`<p>${records.length} 张样图通过字体加载、排字与正文对比度检查，最低对比度 ${Math.min(...records.map(r => r.contrast)).toFixed(2)}:1。<a href="light-font-v3/checks.json">检查记录</a> · <a href="light-font-v3/recipes.json">保存配方</a></p></section>`);
}
// Preserve the first acceptance round and show the later dark-paper refinement alongside it.
const darkChecks = path.join(root, 'dark-theme-v2/checks.json');
if (fs.existsSync(darkChecks)) {
 const updated = JSON.parse(fs.readFileSync(darkChecks, 'utf8')).records;
 const original = JSON.parse(fs.readFileSync(path.join(root, 'round-b-final/checks.json'), 'utf8')).records;
 parts.push('<style>.pairs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.pair h3{grid-column:1/-1;margin-bottom:0}@media(max-width:700px){.pairs{grid-template-columns:1fr}}</style><section id="dark-paper"><h2>深色纸面修订 · 保留主题色相</h2><p>每组左为原版，右为新版。同诗、同种子、同排字；只调整实验入口的纸色。鸦青偏墨青，月白偏深蓝灰，苍筤偏深绿。下方 A–D 样张保留原版，便于回看。</p><div class="pairs">');
 for (const next of updated) {
  const before = original.find(r => r.config.appearance === 'dark' && r.config.theme === next.config.theme && r.config.artwork === next.config.artwork);
  if (!before) throw new Error(`缺少原版对照：${next.name}`);
  parts.push(`<div class="pair"><h3>${esc(names[next.config.theme])} · ${esc(kinds[next.config.artwork])}</h3>`);
  for (const [directory, r, label] of [['round-b-final', before, '原版'], ['dark-theme-v2', next, '新版']]) {
   parts.push(`<a class="sample" href="${directory}/${r.name}.png"><img src="${directory}/${r.name}.png" alt="${esc(names[r.config.theme])} ${label}"><span>${label} · ${esc(r.config.colors.paper)}</span></a>`);
  }
  parts.push('</div>');
 }
 parts.push(`</div><p>新版 9 张排字、字体与资源检查通过；纸/墨最低对比度 ${Math.min(...updated.map(r=>r.contrast)).toFixed(2)}:1。<a href="dark-theme-v2/checks.json">检查记录</a></p></section>`);
}
parts.push('<section id="reading"><h2>01 · 全文阅读</h2><p>正文完整保留，景物置于正文之外；素纸用于比较阅读时是否需要配画。</p>');
for(const appearance of ['light','dark'])parts.push(`<h3>${appearance==='light'?'浅色':'深色'}</h3>`+grid('round-c',r=>r.config.purpose==='reading'&&r.config.appearance===appearance));
parts.push('</section><section id="inscription"><h2>02 · 题诗画屏</h2><p>山居、寒江、梅花、荷塘。末尾另有随节气梅花与用户显式选择的独立荷花。</p>');
for(const appearance of ['light','dark'])parts.push(`<h3>${appearance==='light'?'浅色':'深色'}</h3>`+grid('round-c',r=>r.config.purpose==='inscription'&&r.config.appearance===appearance));
parts.push('</section><section id="themes"><h2>03 · 固定诗画，切换主题</h2><p>同一首《春日》，固定种子、绘画墨色和排字。按鸦青、月白、苍筤依次查看；山水、花卉、素纸分别独立。</p>');
for(const appearance of ['light','dark'])parts.push(`<details${appearance==='light'?' open':''}><summary>${appearance==='light'?'浅色':'深色'} · 9 张</summary>`+grid('round-b-final',r=>r.config.appearance===appearance)+'</details>');
parts.push('<details><summary>保留 Claude 海报 v2 的 14 张配色基线</summary><a href="round-a/contact-sheet.png"><img class="sheet" loading="lazy" src="round-a/contact-sheet.png" alt="海报配色基线"></a></details></section>');
parts.push('<section id="motion"><h2>04 · 既有动态模板抽查</h2><p>每组 9 张关键帧和末段 3 张相邻帧。已检查跳转复现、余韵变化与文字安全区；没有导出 MP4 或验证音频。</p>');
for(const r of motion.records){const name=`${r.template}-${r.appearance}`;parts.push(`<details><summary>${esc(r.template)} · ${r.appearance==='light'?'浅色':'深色'}</summary><a href="motion/${name}-sheet.png"><img class="sheet" loading="lazy" src="motion/${name}-sheet.png" alt="${esc(name)}关键帧"></a></details>`);}
parts.push(`</section><section id="checks"><h2>05 · 验证与待审问题</h2><p>${c.records.length} 张诗作/阅读样本，最低文字对纸色对比度 ${Math.min(...c.records.map(r=>r.contrast)).toFixed(2)}:1；${replay.records.length} 张保存作品重放后 PNG 校验一致。完整记录：<a href="round-c/checks.json">静态</a> / <a href="round-c/content-checks.json">题材</a> / <a href="replay/checks.json">重放</a> / <a href="motion/checks.json">动态</a>。</p><div class="note">主题与用途的规则已实现并验证。仍需审美验收：本页顶部已修订花茎、深色梅枝可见度和岸脚硬边；程序松针与花簇造型、现有视频深色画面仍需改善。当前 Web 墨色选择不等于原生青绿、金碧、没骨笔法已移植。</div><p>全文阅读背景没有景物进入正文区；目前只覆盖固定 3:4 尺寸，长篇超出时明确报错。App 迁移前仍需动态字体、设备与无障碍验证。</p></section></main></html>`);
fs.writeFileSync(path.join(root,'review.html'),parts.join('\n'));
console.log(path.join(root,'review.html'));
