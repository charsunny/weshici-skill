import fs from 'node:fs';
import path from 'node:path';
import { preparePosterManifest } from '../resources/core/poetry-poster.js';
import { loadPuppeteer, findChromeExecutable } from './server-util.mjs';

export async function generatePosters(origin, opts, outDir) {
  if (opts.ratio !== '3:4') throw new Error('poster 当前支持 3:4；壁纸和其他画幅请用 wallpaper / image');
  const input = opts.manifest ? JSON.parse(fs.readFileSync(opts.manifest, 'utf8')) : {
    theme: opts.theme || '诗词海报', date: opts.date,
    cards: [{ title: opts.title, author: opts.author, poem: opts.poem,
      lines: opts.poem.split(/[，。？！；\n]/).map(line => line.trim()).filter(Boolean),
      palette: opts.palette || (/[月夜]/.test(opts.poem) ? 'yueye' : 'qinglv'), layout: opts.layout, seed: opts.seed }],
  };
  if (opts.date) input.date = opts.date;
  const manifest = preparePosterManifest(input);
  const directory = opts.out || path.join(outDir, `poster-${manifest.date}`);
  fs.mkdirSync(directory, { recursive: true });
  const puppeteer = await loadPuppeteer();
  const browser = await puppeteer.launch({ executablePath: findChromeExecutable(), headless: true,
    args: ['--no-sandbox', '--hide-scrollbars'] });
  const outputs = [];
  try {
    for (const [index, card] of manifest.cards.entries()) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
      await page.setViewport({ width: 1080, height: 1440, deviceScaleFactor: 1 });
      await page.evaluateOnNewDocument(value => { window.POSTER = value; }, card);
      await page.goto(`${origin}/resources/templates/poetry-poster/index.html`, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => window.READY === true);
      const clipped = await page.evaluate(() => [...document.querySelectorAll('h1 span,.source,.context,.footer')]
        .filter(el => { const r = el.getBoundingClientRect(); return r.x < 0 || r.y < 0 || r.right > 1081 || r.bottom > 1441; })
        .map(el => el.textContent));
      if (errors.length || clipped.length) throw new Error(JSON.stringify({ errors, clipped }));
      const name = `${String(index + 1).padStart(2, '0')}-${card.layout === 'cover' ? 'cover' : 'poem'}.png`;
      await page.screenshot({ path: path.join(directory, name) });
      outputs.push(name);
      await page.close();
      console.log(`   ✓ ${name} · ${card.title}`);
    }
    if (outputs.length > 1) {
      const columns = Math.min(outputs.length > 6 ? 4 : 3, outputs.length);
      const page = await browser.newPage();
      await page.setViewport({ width: columns * 384 + 32, height: Math.ceil(outputs.length / columns) * 512 + 32, deviceScaleFactor: 1 });
      await page.setContent(`<style>body{margin:0;padding:24px;background:#e8e2d4;display:grid;grid-template-columns:repeat(${columns},368px);gap:16px}img{width:368px;height:490.667px}</style>${outputs.map(name => `<img src="data:image/png;base64,${fs.readFileSync(path.join(directory, name)).toString('base64')}">`).join('')}`);
      await page.evaluate(() => Promise.all([...document.images].map(image => image.decode())));
      await page.screenshot({ path: path.join(directory, 'contact-sheet.png') });
      await page.close();
    }
    fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({ ...input, date: manifest.date }, null, 2) + '\n');
    console.log(`诗词海报已生成：${directory}`);
  } finally {
    await browser.close();
  }
}
