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
if(fs.existsSync(path.join(root,'ink-study/checks.json'))) {
 parts.push('<section id="ink-study"><h2>最新试验 · 同一岩面的笔墨管线</h2><p>按画质优先的要求，对比矢量叠染、现有湿墨滤镜、完整笔体与新的逐毫栅格笔墨。保持岩面及行笔路线不变，分别判断墨感和造型；原画局部以相同图像像素尺寸并排显示。新管线改善了断墨与边缘，但重复笔簇和扇形染面仍然明显，尚未接入整幅山水。</p><p><a href="ink-study/index.html">打开 A/B/C/D 与原画局部对照</a> · <a href="ink-study/checks.json">版本与复现记录</a></p></section>');
}
const flowChecks=path.join(root,'landscape-flow-after/checks.json');
if(fs.existsSync(flowChecks)) {
 const records=JSON.parse(fs.readFileSync(flowChecks,'utf8')).records;
 const before=JSON.parse(fs.readFileSync(path.join(root,'landscape-structure-after/checks.json'),'utf8')).records;
 const sample=(directory,r,label)=>`<a class="sample" href="${directory}/${r.name}.png"><img loading="lazy" src="${directory}/${r.name}.png" alt="${esc(label)}"><span>${esc(label)}</span></a>`;
 const crop=(directory,r,box,label)=>`<a class="sample" href="${directory}/${r.name}.png"><svg viewBox="${box}" role="img" aria-label="${esc(label)}"><image href="${directory}/${r.name}.png" width="1080" height="1440"/></svg><span>${esc(label)}</span></a>`;
 parts.push('<section id="landscape-flow"><h2>本轮 · 阴阳面、顺势皴笔与折带石岸</h2><p>按 VPS Claude 的七条审图意见继续修订。撤掉整面墨粒；飞白限定在笔触内部，明面留纸，转折与阴面聚墨。逐面按勾、皴、染、点叠加；山居固定披麻，峭壁题材用斧劈，种子只变化结构与笔触。左侧山体改用起伏收脚，主客峰错开，溪岸也使用折带笔。近岸替换长平板轮廓，以错落肩线、斜收脚和搭接台阶承托折笔。</p><style>.flow-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;max-width:1000px}.flow-pair svg{display:block;width:100%;background:#e8ece5}.flow-pair figure{margin:0}.flow-pair figcaption{font-size:13px}</style>');
 if(fs.existsSync(path.join(root,'landscape-flow-reference/cha-shibiao-detail.jpg'))) {
  parts.push('<h3>先看原画局部 · 近岸转折与留纸</h3><p>左为博物馆发布的查士标《松竹茅屋图》局部（1686，B69D41），右为本轮程序画。两边均裁取 485 × 260 图像像素，以相同缩放显示，不代表原作实物尺寸；点击查看完整图像。</p><div class="flow-pair"><a class="sample" href="landscape-flow-reference/cha-shibiao-detail.jpg"><svg viewBox="0 480 485 260" role="img" aria-label="查士标原画近岸"><image href="landscape-flow-reference/cha-shibiao-detail.jpg" width="485" height="765"/></svg><span>原画 · 干擦、折带与横点互相衔接</span></a>'+crop('landscape-flow-after',records[0],'150 900 485 260','候选 · 检查折角与皴染是否连成石面')+'</div>');
  parts.push('<details><summary>展开原画完整局部与候选山脚</summary><div class="flow-pair"><a class="sample" href="landscape-flow-reference/cha-shibiao-detail.jpg"><img loading="lazy" src="landscape-flow-reference/cha-shibiao-detail.jpg" alt="查士标松竹茅屋图局部"><span>Asian Art Museum · B69D41</span></a>'+crop('landscape-flow-after',records[0],'50 400 560 760','候选山脚 · 看阴面、留白与树屋关系')+'</div></details>');
 }
 parts.push('<h3>固定种子 · 改前与改后局部</h3><div class="flow-pair">'+crop('landscape-structure-after',before[0],'40 350 550 750','483a8b9 · 上一稿')+crop('landscape-flow-after',records[0],'40 350 550 750','本轮 · 明暗与顺势皴染')+'</div>');
 for(const i of [0,1,4,12]) parts.push(`<h3>${esc(records[i].config.title)} · ${esc(records[i].config.seed)} · ${records[i].config.appearance==='dark'?'深色':'浅色'}</h3><div class="flow-pair">${sample('landscape-structure-after',before[i],'上一稿')}${sample('landscape-flow-after',records[i],'本轮候选')}</div>`);
 parts.push('<details><summary>完整 14 张验证矩阵</summary>'+grid('landscape-flow-after',()=>true)+'</details><p>仍有差距：披麻笔簇偏卷曲、岩面组合仍重复，折带岸石尚缺原画干擦的厚薄变化。溪流仍局限在近岸，未形成贯通近远的龙脉；单独拉长溪流会造成悬空石块，该试验已撤回。不能将本轮改动或测试通过视为已经接近原画。</p><p><a href="https://education.asianart.org/resources/brushpainting-nature-in-art-school-program-selected-resources/">原画局部来源</a> · <a href="https://education.asianart.org/wp-content/uploads/sites/6/2019/09/Brushstrokes.pdf#page=20">教材第 20 页</a> · <a href="landscape-flow-brush/index.html">单笔与树石证明</a> · <a href="landscape-flow-after/recipes.json">配方</a> · <a href="landscape-flow-replay/checks.json">重放</a> · <a href="landscape-flow-tests.txt">回归测试</a></p></section>');
}
const structureChecks=path.join(root,'landscape-structure-after/checks.json');
if(fs.existsSync(structureChecks)) {
 const records=JSON.parse(fs.readFileSync(structureChecks,'utf8')).records;
 const before=JSON.parse(fs.readFileSync(path.join(root,'landscape-mass-after/checks.json'),'utf8')).records;
 const sample=(directory,r,label)=>`<a class="sample" href="${directory}/${r.name}.png"><img loading="lazy" src="${directory}/${r.name}.png" alt="${esc(label)}"><span>${esc(label)}</span></a>`;
 parts.push('<section id="landscape-structure"><h2>本轮 · 岩面转折、积墨与松树枝法</h2><p>左为 79b9812 保存的上一稿，右为当前候选；使用相同种子、主题、诗句和字体。山体改为较短的叠嶂，横向峰肩接下行皴笔；近岸沿水势倾斜，松树主枝弯转后分叉聚叶。景物随新岸面落位。</p><p>本轮同时修复了成图里的积墨：以前相邻同色淡墨被合成一次填色，现在新皴染逐层叠加。纸面滤镜只做轻微墨边扰动，不是物理水墨扩散。</p><style>.structure-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;max-width:960px}.structure-pair svg{width:100%;display:block}</style>');
 for(const i of [0,1,4,8]) parts.push(`<h3>${esc(records[i].config.seed)} · ${records[i].config.appearance==='dark'?'深色':'浅色'}</h3><div class="structure-pair">${sample('landscape-mass-after',before[i],'上一稿')}${sample('landscape-structure-after',records[i],'本轮候选')}</div>`);
 parts.push('<details open><summary>近看山石、松树与岸坡</summary><div class="structure-pair">');
 for(const directory of ['landscape-mass-after','landscape-structure-after']) parts.push(`<svg viewBox="40 580 650 550" role="img" aria-label="树屋与岸坡对照"><image href="${directory}/${records[0].name}.png" width="1080" height="1440"/></svg>`);
 parts.push('</div></details><h3>多种子、深浅与全文阅读</h3>'+grid('landscape-structure-after',()=>true));
 parts.push('<p>仍需解决：岩面组合有重复，洗染还偏平滑，局部皴笔和树叶仍能辨认出程序规则。结构与墨量改善不等于已接近原画的自然笔墨，本轮不作为目标完成或 App 迁移依据。</p><p><a href="https://education.asianart.org/wp-content/uploads/sites/6/2019/09/Brushstrokes.pdf#page=20">查士标局部及教材说明（PDF 第 20 页）</a> · <a href="landscape-structure-brush/index.html">笔触、树石证明页</a> · <a href="landscape-structure-after/recipes.json">配方</a> · <a href="landscape-structure-replay/checks.json">重放检查</a> · <a href="landscape-structure-tests.txt">回归测试</a> · <a href="landscape-structure-compositing.txt">Canvas 积墨检查</a></p></section>');
}
const massChecks = path.join(root,'landscape-mass-after/checks.json');
if(fs.existsSync(massChecks)) {
 const records=JSON.parse(fs.readFileSync(massChecks,'utf8')).records;
 const before=JSON.parse(fs.readFileSync(path.join(root,'landscape-after/checks.json'),'utf8')).records;
 const sample=(directory,r,label)=>`<a class="sample" href="${directory}/${r.name}.png"><img loading="lazy" src="${directory}/${r.name}.png" alt="${esc(label)}"><span>${esc(label)}</span></a>`;
 parts.push('<section id="landscape-mass"><h2>前轮 · 枯笔、岩面与近岸墨色</h2><p>左为 42c5972 保存的上一稿，右为当前候选；种子、诗句、主题与字体相同。调整峰肩轮廓、皴笔分组与枯笔落墨，增加近岸转面和裂隙，并恢复前景树屋的墨量。景物会随新岩面重新落位。</p><style>.mass-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;max-width:960px}.mass-pair svg{width:100%;display:block}</style>');
 for(const i of [0,1,4,8]) parts.push(`<h3>${esc(records[i].config.seed)} · ${records[i].config.appearance==='dark'?'深色':'浅色'}</h3><div class="mass-pair">${sample('landscape-after',before[i],'上一稿')}${sample('landscape-mass-after',records[i],'当前候选')}</div>`);
 parts.push('<details><summary>放大近岸与树屋</summary><div class="mass-pair">');
 for(const directory of ['landscape-after','landscape-mass-after']) parts.push(`<svg viewBox="40 620 680 530" role="img" aria-label="近岸对照"><image href="${directory}/${records[0].name}.png" width="1080" height="1440"/></svg>`);
 parts.push('</div></details><h3>完整矩阵</h3>'+grid('landscape-mass-after',()=>true));
 parts.push('<p>仍有差距：峰形与皴笔的组合可辨认出程序规则，松冠重复，纸墨交融不足。本轮仅作为继续试验的候选，不等同于原画水准，也不迁移 App。</p><p><a href="landscape-mass-brush/index.html">单笔、岩石与双皴法证明页</a> · <a href="landscape-mass-after/recipes.json">配方</a> · <a href="landscape-mass-replay/checks.json">重放检查</a> · <a href="landscape-mass-tests.txt">测试记录</a></p></section>');
}
const landscapeChecks = path.join(root, 'landscape-after/checks.json');
if (fs.existsSync(landscapeChecks)) {
 const records = JSON.parse(fs.readFileSync(landscapeChecks,'utf8')).records;
 const before = JSON.parse(fs.readFileSync(path.join(root,'brush-after/checks.json'),'utf8')).records;
 const sample = (directory,r,label) => `<a class="sample" href="${directory}/${r.name}.png"><img loading="lazy" src="${directory}/${r.name}.png" alt="${esc(label)}"><span>${esc(label)}</span></a>`;
 parts.push('<section id="landscape"><h2>山势与笔法重构 · 教材约束下的种子生成</h2><p>对照亚洲艺术博物馆 Brushstrokes 的点叶、皴法和提按图版，将峰肩、岩面转折、皴笔及墨染一起生成。主导皴法为披麻或斧劈近似，同一种子可以重放。App 尚未迁移。</p><p><a href="landscape-brush/index.html">先看：一笔 → 皴法 → 山体的证明页</a> · <a href="https://education.asianart.org/wp-content/uploads/sites/6/2019/09/Brushstrokes.pdf#page=40">教材图版（PDF 第 40–45 页）</a></p><style>.landscape-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;max-width:960px}</style>');
 for(const index of [0,1]) parts.push(`<h3>${index?'深色':'浅色'} · 旧稿与结构重做</h3><div class="landscape-pair">${sample('brush-after',before[index],'painted-v2 · 固定轮廓')}${sample('landscape-after',records[index],`landscape-v3 · ${records[index].brushwork?.technique==='axe'?'斧劈':'披麻'}近似`)}</div>`);
 parts.push('<h3>多种子 · 同一首诗</h3><div class="grid">');
 for(const r of records.slice(4,12)) parts.push(sample('landscape-after',r,`${r.config.seed} · ${r.config.appearance==='dark'?'深':'浅'} · ${r.brushwork?.technique==='axe'?'斧劈':'披麻'}`));
 parts.push('</div><h3>其他诗意与全文阅读</h3><div class="grid">');
 for(const r of [...records.slice(2,4),...records.slice(12)]) parts.push(sample('landscape-after',r,`${r.config.title} · ${r.config.purpose==='reading'?'全文阅读':names[r.config.theme]}`));
 parts.push('</div><p>审图重点：峰肩有错落与遮掩，皴笔沿岩面转折，明面有留白，树冠成组而非椭圆贴片。仍属程序笔法近似：局部岩面、树冠与坡岸可见规则感，尚未模拟真实水墨扩散；不能将检查通过等同于传统画作水准。</p><p><a href="landscape-after/checks.json">14 张检查记录</a> · <a href="landscape-after/recipes.json">保存配方</a> · <a href="landscape-tests.txt">回归测试</a></p></section>');
}
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
