#!/usr/bin/env node
// node scripts/theme-art-study.mjs [manifest-or-recipes] [output-directory]
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { resolveStudy, restoreStudy, resolveStudyFont } from '../resources/core/theme-art-study.js';
import { STUDIO_ROOT, startStudioServer, loadPuppeteer, findChromeExecutable } from './server-util.mjs';

const inputPath = process.argv[2] || 'examples/theme-art-study.json';
const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const out = process.argv[3] || 'out/theme-art-validation/round-b';
const palettes = JSON.parse(fs.readFileSync(path.join(STUDIO_ROOT, 'resources/core/app-palettes.json'), 'utf8'));
const sha = buffer => createHash('sha256').update(buffer).digest('hex');
const sources = {};
for (const directory of ['resources/core', 'resources/vendor/zxart', 'resources/templates/theme-art-study']) {
  for (const name of fs.readdirSync(path.join(STUDIO_ROOT, directory), { recursive:true })) {
    if (/\.(js|css|html)$/.test(name)) {
      const file = `${directory}/${name}`;
      sources[file] = sha(fs.readFileSync(path.join(STUDIO_ROOT, file)));
    }
  }
}
for (const file of ['resources/assets/fonts/SourceHanSerifSC-Regular.otf', 'resources/assets/huaping/jianyang-seal.png']) {
  sources[file] = sha(fs.readFileSync(path.join(STUDIO_ROOT, file)));
}
if (input.snapshots) assert.deepEqual(sources, input.sources, '作品依赖版本不同；请恢复原版本后复现，不能静默重画');
const rawCases = input.cases || (input.snapshots ? null : input.appearances.flatMap(appearance => input.themes.flatMap(theme =>
  input.artworks.map(artwork => ({ ...input, appearance, theme, artwork })))));
const cases = input.snapshots
  ? input.snapshots.map((snapshot, i) => ({ config:restoreStudy(snapshot).config, snapshot, expected:input.hashes?.[i] }))
  : rawCases.map(item => ({ config:resolveStudy(item, palettes) }));
fs.mkdirSync(out, { recursive:true });
// Package exact font bytes beside recipes, so a custom font can be replayed on another machine.
for (const item of cases) {
  const font = item.config.font || resolveStudyFont();
  const file = path.resolve(item.snapshot ? path.dirname(inputPath) : STUDIO_ROOT, font.path);
  if (!fs.existsSync(file)) throw new Error(`字体不存在：${file}；App 字体请先运行 scripts/theme-art-fonts.mjs`);
  item.fontData = fs.readFileSync(file);
  const digest = sha(item.fontData);
  if (font.sha256) assert.equal(digest, font.sha256, '保存作品的字体文件已改变');
  const relative = `fonts/${digest}${path.extname(file).toLowerCase()}`;
  fs.mkdirSync(path.join(out, 'fonts'), { recursive:true });
  fs.writeFileSync(path.join(out, relative), item.fontData);
  const notice = fs.existsSync(file + '.LICENSE.txt') ? file + '.LICENSE.txt'
    : font.id === 'source_han_serif' ? path.join(STUDIO_ROOT, 'resources/assets/fonts/LICENSE.txt') : null;
  if (notice) fs.copyFileSync(notice, path.join(out, relative + '.LICENSE.txt'));
  item.config.font = { ...font, path:relative, sha256:digest };
  if (item.snapshot) item.snapshot = { ...item.snapshot, config:item.config };
}
const server = await startStudioServer();
let browser;
const records = [], plans = new Map(), repeated = new Set();
const luminance = hex => hex.match(/[a-f\d]{2}/gi).map(v => parseInt(v, 16) / 255)
  .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
  .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
try {
  const puppeteer = await loadPuppeteer();
  browser = await puppeteer.launch({ executablePath:findChromeExecutable(), headless:true,
    args:['--no-sandbox', '--hide-scrollbars'] });
  if (input.browser) assert.equal(await browser.version(), input.browser, '作品浏览器版本不同');
  for (const [index, { config, snapshot, expected, fontData }] of cases.entries()) {
    const name = `${String(index + 1).padStart(2, '0')}-${config.appearance}-${config.theme}-${config.artwork}-${config.purpose}`;
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', request => new URL(request.url()).pathname === '/study-font'
      ? request.respond({ status:200, contentType:'application/octet-stream', body:fontData }) : request.continue());
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.setViewport({ width:config.width, height:config.height, deviceScaleFactor:1 });
    await page.evaluateOnNewDocument(value => {
      window.STUDY = value.config; window.STUDY_SNAPSHOT = value.snapshot;
      window.STUDY_FONT = '/study-font';
      window.addEventListener('error', event => { window.STUDY_ERROR = event.message; });
      window.addEventListener('unhandledrejection', event => { window.STUDY_ERROR = String(event.reason); });
    }, { config, snapshot });
    await page.goto(`${server.baseUrl}/resources/templates/theme-art-study/index.html`);
    await page.waitForFunction(() => window.READY || window.STUDY_ERROR, { timeout:60000 });
    assert.equal(await page.evaluate(() => window.STUDY_ERROR), undefined, name);
    const result = await page.evaluate(() => window.STUDY_RESULT);
    assert.deepEqual(errors, [], name);
    assert.deepEqual(result.plan.omittedClauses, [], `${name}: omitted verse`);
    const key = [config.title, config.poem, config.purpose, config.font.sha256].join('/');
    if (plans.has(key)) assert.deepEqual(result.plan, plans.get(key), `${name}: typesetting changed`);
    else plans.set(key, result.plan);
    const check = await page.evaluate(() => {
      const { config, plan } = window.STUDY_RESULT, box = plan.box;
      const bad = [...document.querySelectorAll('.hp-block,.hp-glyph,.hp-seal,.reading h1,.reading .author,.reading .line')].filter(el => {
        const r = el.getBoundingClientRect();
        return r.x < box.x - 1 || r.y < box.y - 1 || r.right > box.x + box.width + 1 || r.bottom > box.y + box.height + 1 || el.scrollWidth > el.clientWidth + 1;
      }).map(el => el.textContent || el.className);
      const canvas = document.getElementById('art');
      let clearReadingArea = true;
      if (config.purpose === 'reading') {
        const data = canvas.getContext('2d').getImageData(0, 0, config.width, plan.artTop).data;
        const rgb = config.colors.paper.match(/[a-f\d]{2}/gi).map(v => parseInt(v, 16));
        for (let i = 0; i < data.length; i += 4) {
          if (rgb.some((v, k) => Math.abs(data[i + k] - v) > 1)) { clearReadingArea = false; break; }
        }
      }
      return { bad, clearReadingArea,
        fontLoaded:[...document.fonts].some(face => face.family === 'StudyFont' && face.status === 'loaded'), art:canvas.toDataURL() };
    });
    assert.deepEqual(check.bad, [], `${name}: text outside its box`);
    assert.ok(check.fontLoaded && check.clearReadingArea, `${name}: font or reading background failed`);
    // Browser evidence records actual glyph fonts, including any fallback for missing characters.
    const client = await page.createCDPSession();
    await client.send('DOM.enable'); await client.send('CSS.enable');
    const { root } = await client.send('DOM.getDocument');
    const { nodeIds } = await client.send('DOM.querySelectorAll', { nodeId:root.nodeId,
      selector:'.hp-glyph,.hp-line,.hp-credit,.reading h1,.reading .author,.reading .line' });
    const usedFonts = new Map();
    for (const nodeId of nodeIds) {
      const { fonts } = await client.send('CSS.getPlatformFontsForNode', { nodeId });
      for (const font of fonts) usedFonts.set(font.postScriptName, (usedFonts.get(font.postScriptName) || 0) + font.glyphCount);
    }
    await client.detach();
    const levels = [luminance(config.colors.paper), luminance(config.colors.ink)].sort((a,b) => b-a);
    const contrast = (levels[0] + .05) / (levels[1] + .05);
    assert.ok(contrast >= 7, `${name}: insufficient text contrast`);
    const repeatKey = `${config.appearance}/${config.artwork}`;
    if (config.artwork === 'flowers' && !repeated.has(repeatKey)) {
      await page.reload();
      await page.waitForFunction(() => window.READY, { timeout:60000 });
      assert.equal(await page.evaluate(() => document.getElementById('art').toDataURL()), check.art, `${name}: nondeterministic flower`);
      repeated.add(repeatKey);
    }
    const png = await page.screenshot({ path:path.join(out, `${name}.png`) });
    if (expected) assert.equal(sha(png), expected, `${name}: saved work changed`);
    records.push({ name, ...result, sha256:sha(png), artSha256:sha(check.art), contrast,
      fontLoaded:check.fontLoaded, usedFonts:Object.fromEntries(usedFonts), clearReadingArea:check.clearReadingArea });
    await page.close();
    console.log(`PASS ${name} · ${config.title}`);
  }
  for (const appearance of [...new Set(records.map(r => r.config.appearance))]) {
    for (const purpose of [...new Set(records.map(r => r.config.purpose))]) {
      const group = records.filter(r => r.config.appearance === appearance && r.config.purpose === purpose);
      if (!group.length) continue;
      const page = await browser.newPage();
      await page.setViewport({ width:1152, height:Math.ceil(group.length / 3) * 518 + 24 });
      const names = { shanshui:'山水', flowers:'花卉', none:'素纸' };
      await page.setContent('<style>body{margin:0;padding:16px;background:#858585;display:grid;grid-template-columns:repeat(3,368px);gap:8px;font:16px sans-serif}figure{margin:0}img{display:block;width:360px;height:480px}figcaption{padding:6px;color:white}</style>');
      // Labels are text nodes: custom poem titles cannot become HTML.
      await page.evaluate(items => {
        for (const item of items) {
          const figure = document.createElement('figure'), img = document.createElement('img'), label = document.createElement('figcaption');
          img.src = item.image; label.textContent = item.label; figure.append(img, label); document.body.append(figure);
        }
      }, group.map(r => ({ image:`data:image/png;base64,${fs.readFileSync(path.join(out, r.name + '.png')).toString('base64')}`,
        label:`${r.config.title} · ${r.config.theme} · ${r.config.font.name} · ${names[r.config.artwork]}` })));
      await page.evaluate(() => Promise.all([...document.images].map(img => img.decode())));
      await page.screenshot({ path:path.join(out, `contact-${appearance}-${purpose}.png`) });
      await page.close();
    }
  }
  const browserVersion = await browser.version();
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(input, null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'recipes.json'), JSON.stringify({ browser:browserVersion, sources,
    snapshots:records.map(r => r.snapshot), hashes:records.map(r => r.sha256) }, null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'checks.json'), JSON.stringify({ browser:browserVersion, records }, null, 2) + '\n');
  console.log(`Saved ${records.length} samples to ${out}`);
} finally {
  await browser?.close();
  server.server.close();
}
