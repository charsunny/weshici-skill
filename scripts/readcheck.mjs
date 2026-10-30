#!/usr/bin/env node
/**
 * 微诗视频工作台 · 自动字幕停留时长与音效事件审计器 (readcheck.mjs)
 *
 * 用法：
 *   node tools/video-studio/bin/readcheck.mjs --scene huaping-motion --recipe hanlu-dufu
 *   node scripts/readcheck.mjs --scene ink-story --recipe wanqing-dufu-story
 */

import {
  startStudioServer,
  loadPuppeteer,
  findChromeExecutable,
  normalizeSceneUrl,
} from './server-util.mjs';

const args = process.argv.slice(2);
const getArg = (k, def) => {
  const idx = args.indexOf(`--${k}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : def;
};

const sceneArg = getArg('scene', 'huaping-motion');
const recipeArg = getArg('recipe', '');

export async function runReadcheck({ scene = sceneArg, recipe = recipeArg, silent = false } = {}) {
  const { server, baseUrl } = await startStudioServer(0);
  const puppeteer = await loadPuppeteer();
  const browser = await puppeteer.launch({
    executablePath: findChromeExecutable(),
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
    const relUrl = normalizeSceneUrl(scene, recipe);
    await page.goto(baseUrl + relUrl, { waitUntil: 'networkidle0' });
    await page.waitForFunction('window.READY === true', { timeout: 25000 });

    const report = await page.evaluate(() => {
      const dur = Number(window.DUR) || 15;
      const evs = Array.isArray(window.EV) ? window.EV : [];
      const hasTextsFn = typeof window.TEXTS === 'function';
      const spans = new Map();

      if (hasTextsFn) {
        const step = 0.1;
        for (let t = 0; t <= dur + 1e-6; t += step) {
          const ct = Math.min(dur, Number(t.toFixed(2)));
          window.render(ct);
          const list = window.TEXTS(ct) || [];
          for (const item of list) {
            if (!item || !item.text) continue;
            const key = `${item.id || 'txt'}::${item.text}`;
            if (!spans.has(key)) {
              spans.set(key, { id: item.id || 'txt', text: item.text, t0: ct, t1: ct });
            } else {
              spans.get(key).t1 = ct;
            }
          }
        }
      }

      const items = Array.from(spans.values()).map((s) => {
        const cleanChars = s.text.replace(/[\s，。！？、；：,.!?;:·《》「」]/g, '').length;
        const dwell = Number((s.t1 - s.t0 + 0.1).toFixed(2));
        const minReq = Number(Math.max(1.5, cleanChars * 0.22).toFixed(2));
        return {
          id: s.id,
          text: s.text.length > 26 ? s.text.slice(0, 26) + '…' : s.text,
          chars: cleanChars,
          window: `${s.t0.toFixed(1)}s–${s.t1.toFixed(1)}s`,
          dwell,
          minReq,
          ok: dwell >= minReq,
        };
      });

      return { dur, evs, hasTextsFn, items };
    });

    if (!silent) {
      console.log(`\n=== 微诗视频工作台 · 自动化质检报告 (readcheck) ===`);
      console.log(`场景: ${scene}${recipe ? ` (recipe: ${recipe})` : ''} | 总时长: ${report.dur}s | 音效点(EV): ${report.evs.length} 个`);
      if (report.evs.length > 0) {
        console.log(
          `音效序列: ` +
            report.evs.map((e) => `[${Number(e.t).toFixed(2)}s ${e.sfx} ${e.gain ?? -6}dB]`).join(' -> ')
        );
      }
      if (!report.hasTextsFn) {
        console.log(`提示: 当前页面未定义 window.TEXTS(t)，跳过字幕阅读时长检测。`);
      } else {
        console.log(`\n文本停留时长审计（标准：>= 0.22s/字 且 >= 1.5s）：`);
        for (const it of report.items) {
          const badge = it.ok ? 'PASS' : 'WARN';
          console.log(
            `  [${badge}] ${it.id.padEnd(16)} | ${it.window.padEnd(11)} | 停留 ${String(it.dwell).padStart(5)}s (需 >=${String(it.minReq).padStart(4)}s, ${String(it.chars).padStart(2)}字) | ${it.text}`
          );
        }
      }
      const allOk = report.items.every((i) => i.ok);
      console.log(`结论: ${allOk ? '全部通过 (ALL PASS)' : '存在停留偏短文本，请检查分镜时长'}\n`);
    }

    return report;
  } finally {
    await browser.close();
    server.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runReadcheck().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
