// Run explicitly: node tests/huaping-layout.browser.mjs [screenshot-directory]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startStudioServer, findChromeExecutable, loadPuppeteer } from '../scripts/server-util.mjs';
const out = process.argv[2];
if (out) fs.mkdirSync(out, { recursive: true });
const cases = [
  { name: '01-shanju', title: '山居秋暝', poem: '明月松间照，清泉石上流。', author: '王维', scene: 'retreat' },
  { name: '02-jiangxue', title: '江雪', poem: '千山鸟飞绝，万径人踪灭。孤舟蓑笠翁，独钓寒江雪。', author: '柳宗元', scene: 'fishing', palette: 'yuebai' },
  { name: '03-xiaochi', title: '小池', poem: '小荷才露尖尖角，早有蜻蜓立上头。', author: '杨万里', dynasty: '宋', scene: 'lotusPond', palette: 'yaluanqing' },
  { name: '04-wallpaper', mode: 'wallpaper', width: 1290, height: 2796, title: '枫桥夜泊', poem: '月落乌啼霜满天，江枫渔火对愁眠。', author: '张继' },
  { name: '05-square', height: 1080 },
  { name: '06-wide', width: 1920, height: 1080 },
  { name: '07-long-title', title: '奉和中书舍人贾至早朝大明宫兼呈诸位同舍之作' },
  { name: '08-left', verse_side: 'left' },
  { name: '09-eight-clauses', poem: '空山新雨后，天气晚来秋。明月松间照，清泉石上流。竹喧归浣女，莲动下渔舟。随意春芳歇，王孙自可留。' },
  { name: '10-pure', mode: 'wallpaper', pure: 'true', width: 1290, height: 2796 },
];
const server = await startStudioServer(0);
const puppeteer = await loadPuppeteer();
const browser = await puppeteer.launch({ executablePath: findChromeExecutable(), headless: true, args: ['--no-sandbox', '--hide-scrollbars'] });
const records = [];
try {
  for (const spec of cases) {
    const { name, width = 1080, height = 1440, ...query } = spec;
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.goto(`${server.baseUrl}/resources/templates/media-suite/index.html?${new URLSearchParams({ mode: 'image', date: '2026-10-26', title: '山居秋暝', poem: '明月松间照，清泉石上流。', author: '王维', dynasty: '唐', ...query })}`);
    await page.waitForFunction(() => window.READY === true, { timeout: 30000 });
    const result = await page.evaluate(() => {
      const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
      return { footer: window.__huapingFooter, footerRect: document.querySelector('.hp-share-footer') ? rect(document.querySelector('.hp-share-footer')) : null,
        dateRect: document.querySelector('.hp-share-date') ? rect(document.querySelector('.hp-share-date')) : null,
        tagRect: document.querySelector('.hp-share-tag') ? rect(document.querySelector('.hp-share-tag')) : null,
        brandRect: document.querySelector('.hp-share-brand') ? rect(document.querySelector('.hp-share-brand')) : null,
        qrRect: document.querySelector('.hp-share-qr') ? rect(document.querySelector('.hp-share-qr')) : null,
        plan: window.__huapingPlan, block: document.querySelector('.hp-block') ? rect(document.querySelector('.hp-block')) : null,
        glyphs: [...document.querySelectorAll('.hp-glyph, .hp-seal')].map(rect),
        columns: [...document.querySelectorAll('.hp-verses .hp-column')].map(el => ({ text: el.textContent, ...rect(el) })),
        fontLoaded: document.fonts.check('100px SongReg') };
    });
    assert.deepEqual(errors, [], name);
    if (spec.pure === 'true') assert.equal(result.block, null);
    else {
      assert.ok(result.fontLoaded, name);
      const { box } = result.plan;
      for (const r of [result.block, ...result.glyphs]) {
        assert.ok(r.x >= box.x - 1 && r.right <= box.x + box.width + 1 && r.y >= box.y - 1 && r.bottom <= box.y + box.height + 1,
          `${name}: outside verse box ${JSON.stringify({ r, box })}`);
      }
      assert.deepEqual(result.columns.map(c => c.text), result.plan.clauses);
      assert.ok(result.columns.every((c, i) => i === 0 || c.x < result.columns[i - 1].x), 'right-to-left reading order');
    }
    if (!spec.mode || spec.mode === 'image') {
      assert.equal(result.footer.dateText, '2026年10月26日');
      assert.equal(result.footer.tag, '霜降 · 初候');
      assert.ok(result.dateRect.x > result.qrRect.right && result.dateRect.bottom <= result.tagRect.y + 1);
      const calendarCenter = (result.dateRect.y + result.tagRect.bottom) / 2;
      for (const r of [result.qrRect, result.brandRect]) assert.ok(Math.abs(calendarCenter - (r.y + r.bottom) / 2) < 1,
        `${name}: calendar, brand and QR should share a vertical center`);
      assert.ok(result.block.bottom < result.footerRect.y && result.tagRect.bottom < height);
    } else assert.equal(result.footer, undefined);
    if (out) await page.screenshot({ path: path.join(out, `${name}.png`) });
    records.push({ name, width, height, ...result });
    console.log(`PASS ${name}: ${result.plan?.fontSize.toFixed(2) || 'pure'} px, omitted ${result.plan?.omittedClauses.length || 0}`);
    await page.close();
  }
  if (out) fs.writeFileSync(path.join(out, 'layout-checks.json'), JSON.stringify(records, null, 2));
} finally {
  await browser.close();
  server.server.close();
}
