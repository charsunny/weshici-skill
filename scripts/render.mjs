#!/usr/bin/env node
/**
 * 微诗视频工作台 · 多进程确定性渲染与音画合成器 (render.mjs)
 *
 * 特性：
 * 1. 多 Worker (Page) 并行分片截帧（默认 4 路并发，提速 3~4 倍）
 * 2. 一键输出九宫格关键帧接触表 (--sheet / --sheet-only) 供 Checkpoint 1 视觉把关
 * 3. 自动采集页面 window.EV 并通过 core/foley.mjs 合成东方拟音 WAV
 * 4. FFmpeg 自动混音（配乐 + 拟音）与 -14 LUFS 响度标准化
 *
 * 用法：
 *   node tools/video-studio/bin/render.mjs --scene huaping-motion --recipe hanlu-dufu --sheet
 *   node tools/video-studio/bin/render.mjs --scene huaping-motion --recipe qingming-dumu --sheet-only
 *   node scripts/render.mjs --scene ink-story --recipe wanqing-dufu-story --workers 4 --sheet
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  STUDIO_ROOT,
  REPO_ROOT,
  resolveRepoFile,
  startStudioServer,
  loadPuppeteer,
  findChromeExecutable,
  normalizeSceneUrl,
} from './server-util.mjs';
import { renderFoleyWav } from '../resources/core/foley.mjs';

const args = process.argv.slice(2);
const hasFlag = (k) => args.includes(`--${k}`);
const getArg = (k, def) => {
  const idx = args.indexOf(`--${k}`);
  return idx >= 0 && args[idx + 1] && !args[idx + 1].startsWith('--') ? args[idx + 1] : def;
};

const RATIO_SIZES = {
  '9:16': '1080x1920',
  '3:4': '1080x1440',
  '1:1': '1080x1080',
  '16:9': '1920x1080',
};

const sceneArg = getArg('scene', 'huaping-motion');
const recipeArg = getArg('recipe', sceneArg === 'huaping-motion' ? 'hanlu-dufu' : '');
const ratioArg = getArg('ratio', hasFlag('horizontal') ? '16:9' : '');
const FPS = Number(getArg('fps', 30));
const WORKERS = Math.max(1, Math.min(8, Number(getArg('workers', 4))));
const defaultSize = RATIO_SIZES[ratioArg] || '1080x1920';
const [W, H] = getArg('size', defaultSize)
  .split('x')
  .map(Number);
const sheetOnly = hasFlag('sheet-only');
const makeSheet = sheetOnly || hasFlag('sheet');
const audioOverride = getArg('audio', '');

const ratioSuffix = ratioArg && ratioArg !== '9:16' ? `-${ratioArg.replace(':', 'x')}` : '';
const slugName = (recipeArg ? `${path.basename(sceneArg, '.html')}-${recipeArg}` : path.basename(sceneArg, '.html')) + ratioSuffix;
const defaultOut = path.join(STUDIO_ROOT, 'out', `${slugName}.mp4`);
const outMp4 = path.resolve(getArg('out', defaultOut));
const outDir = path.dirname(outMp4);
const outSheet = outMp4.replace(/\.mp4$/i, '') + '.sheet.jpg';

function runCmd(cmd, cmdArgs) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, cmdArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    let errText = '';
    proc.stderr.on('data', (d) => {
      errText += d.toString();
    });
    proc.on('exit', (code) => {
      if (code === 0) resolve(errText);
      else reject(new Error(`${cmd} exited ${code}:\n${errText.slice(-1200)}`));
    });
  });
}

async function seekAndCapture(page, t, filePath) {
  await page.evaluate(async (timeSec) => {
    window.render(timeSec);
    const vids = Array.from(document.querySelectorAll('video'));
    await Promise.all(
      vids.map((v) => {
        if (!v.duration || isNaN(v.duration)) return Promise.resolve();
        const wraps = [];
        let el = v;
        while (el && el !== document.body) {
          if (el.classList?.contains('scene')) wraps.push(el);
          el = el.parentElement;
        }
        if (wraps.some((w) => parseFloat(w.style.opacity || '1') < 0.01)) return Promise.resolve();
        const target = Math.min(Math.max(0, timeSec % v.duration), Math.max(0, v.duration - 0.04));
        if (Math.abs(v.currentTime - target) < 0.015) return Promise.resolve();
        return new Promise((r) => {
          const done = () => {
            v.removeEventListener('seeked', done);
            r();
          };
          v.addEventListener('seeked', done, { once: true });
          v.currentTime = target;
          setTimeout(done, 250);
        });
      })
    );
  }, t);

  await page.screenshot({
    path: filePath,
    type: 'jpeg',
    quality: 92,
    clip: { x: 0, y: 0, width: W, height: H },
  });
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const { server, baseUrl } = await startStudioServer(0);
  const puppeteer = await loadPuppeteer();
  const browser = await puppeteer.launch({
    executablePath: findChromeExecutable(),
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'],
  });

  try {
    let relUrl = normalizeSceneUrl(sceneArg, recipeArg);
    if (ratioArg) relUrl += `&ratio=${encodeURIComponent(ratioArg)}`;
    const fullUrl = baseUrl + relUrl;

    // 1. 打开主探针页，读取 DUR、EV、RECIPE
    const probePage = await browser.newPage();
    await probePage.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    await probePage.goto(fullUrl, { waitUntil: 'networkidle0' });
    await probePage.waitForFunction('window.READY === true', { timeout: 30000 });

    const meta = await probePage.evaluate(() => ({
      dur: Number(window.DUR) || 15,
      ev: Array.isArray(window.EV) ? window.EV : [],
      recipe: window.RECIPE || null,
    }));

    const FROM = Number(getArg('from', 0));
    const TO = Number(getArg('to', meta.dur));
    const durationSec = Math.max(0.5, TO - FROM);

    // 2. 如果仅生成关键帧接触表 (--sheet-only)
    if (sheetOnly) {
      const tmpSheetDir = path.join(outDir, `.tmp-sheet-${Date.now()}`);
      fs.mkdirSync(tmpSheetDir, { recursive: true });
      const sampleCount = 9;
      for (let i = 0; i < sampleCount; i++) {
        const ratio = sampleCount === 1 ? 0.5 : i / (sampleCount - 1);
        const t = FROM + 0.35 + ratio * Math.max(0.1, durationSec - 0.7);
        const fPath = path.join(tmpSheetDir, `s-${String(i).padStart(2, '0')}.jpg`);
        await seekAndCapture(probePage, t, fPath);
      }
      const thumbW = W > H ? 560 : 340;
      await runCmd('ffmpeg', [
        '-y',
        '-i',
        path.join(tmpSheetDir, 's-%02d.jpg'),
        '-vf',
        `scale=${thumbW}:-1,tile=3x3:padding=10:margin=10:color=0x808080`,
        '-frames:v',
        '1',
        '-q:v',
        '2',
        outSheet,
      ]);
      fs.rmSync(tmpSheetDir, { recursive: true, force: true });
      console.log(`接触表已生成: ${outSheet}`);
      return;
    }

    // 3. 多 Worker 并行渲染全部帧
    const totalFrames = Math.round(durationSec * FPS);
    const tmpFramesDir = path.join(outDir, `.tmp-frames-${Date.now()}`);
    fs.mkdirSync(tmpFramesDir, { recursive: true });

    const workerCount = Math.min(WORKERS, totalFrames);
    console.log(
      `开始渲染: ${slugName} (${W}×${H} @ ${FPS}fps, 时长 ${durationSec}s, 共 ${totalFrames} 帧, ${workerCount} 路并行)...`
    );

    const pages = [probePage];
    for (let w = 1; w < workerCount; w++) {
      const p = await browser.newPage();
      await p.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
      await p.goto(fullUrl, { waitUntil: 'networkidle0' });
      await p.waitForFunction('window.READY === true', { timeout: 30000 });
      pages.push(p);
    }

    const t0 = Date.now();
    let completed = 0;

    await Promise.all(
      pages.map(async (page, wIdx) => {
        const chunk = Math.ceil(totalFrames / workerCount);
        const startFrame = wIdx * chunk;
        const endFrame = Math.min(totalFrames, startFrame + chunk);
        for (let f = startFrame; f < endFrame; f++) {
          const t = FROM + f / FPS;
          const frameFile = path.join(tmpFramesDir, `f-${String(f).padStart(5, '0')}.jpg`);
          await seekAndCapture(page, t, frameFile);
          completed++;
          if (completed % FPS === 0 || completed === totalFrames) {
            const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
            process.stdout.write(
              `\r  进度: ${completed}/${totalFrames} 帧 (${((completed / totalFrames) * 100).toFixed(0)}%, 已耗时 ${elapsed}s)`
            );
          }
        }
      })
    );
    process.stdout.write('\n');

    // 4. 如开启 --sheet，直接从已渲染帧抽 9 张拼接接触表
    if (makeSheet) {
      const tmpSheetDir = path.join(outDir, `.tmp-sheet-${Date.now()}`);
      fs.mkdirSync(tmpSheetDir, { recursive: true });
      for (let i = 0; i < 9; i++) {
        const fIdx = Math.min(totalFrames - 1, Math.max(0, Math.round((0.04 + (i / 8) * 0.92) * (totalFrames - 1))));
        const src = path.join(tmpFramesDir, `f-${String(fIdx).padStart(5, '0')}.jpg`);
        const dst = path.join(tmpSheetDir, `s-${String(i).padStart(2, '0')}.jpg`);
        fs.copyFileSync(src, dst);
      }
      const thumbW = W > H ? 560 : 340;
      await runCmd('ffmpeg', [
        '-y',
        '-i',
        path.join(tmpSheetDir, 's-%02d.jpg'),
        '-vf',
        `scale=${thumbW}:-1,tile=3x3:padding=10:margin=10:color=0x808080`,
        '-frames:v',
        '1',
        '-q:v',
        '2',
        outSheet,
      ]);
      fs.rmSync(tmpSheetDir, { recursive: true, force: true });
      console.log(`接触表已生成: ${outSheet}`);
    }

    // 5. 音轨合成：支持三路混音 (voice 人声/主曲 + bgm 配乐自动压低 + foley 东方拟音) + -14 LUFS 标准化
    const audioMode = audioOverride || meta.recipe?.audioMode || (meta.ev.length > 0 ? 'bgm+foley' : 'silent');
    const bgmRel = meta.recipe?.bgm || '/artifacts/promo-8.0/assets/audio/radio-calm.m4a';
    const bgmFile = resolveRepoFile(bgmRel);
    const voiceRel = meta.recipe?.voice || '';
    const voiceFile = voiceRel ? resolveRepoFile(voiceRel) : '';
    const voiceSeek = Number(meta.recipe?.voiceSeek || 0);

    const hasVoice = Boolean(voiceFile && fs.existsSync(voiceFile) && audioMode !== 'silent');
    const hasBgm = audioMode.includes('bgm') && fs.existsSync(bgmFile);
    const hasFoley = audioMode.includes('foley') && meta.ev.length > 0;

    let foleyWav = null;
    if (hasFoley) {
      foleyWav = path.join(tmpFramesDir, 'foley.wav');
      const shiftedEv = meta.ev
        .map((e) => ({ ...e, t: Number(e.t) - FROM }))
        .filter((e) => e.t >= 0 && e.t < durationSec);
      renderFoleyWav(shiftedEv, durationSec, foleyWav);
    }

    const ffArgs = ['-y', '-framerate', String(FPS), '-i', path.join(tmpFramesDir, 'f-%05d.jpg')];
    const fadeOutStart = Math.max(0, durationSec - 2.0).toFixed(2);

    const audioInputs = [];
    const filterParts = [];
    const mixLabels = [];

    if (hasVoice) {
      if (voiceSeek > 0) ffArgs.push('-ss', String(voiceSeek));
      ffArgs.push('-i', voiceFile);
      const idx = audioInputs.length + 1;
      audioInputs.push('voice');
      filterParts.push(
        `[${idx}:a]atrim=0:${durationSec},afade=t=in:st=0:d=0.4,afade=t=out:st=${fadeOutStart}:d=1.8,volume=1.15[voice]`
      );
      mixLabels.push('[voice]');
    }

    if (hasBgm) {
      ffArgs.push('-stream_loop', '-1', '-i', bgmFile);
      const idx = audioInputs.length + 1;
      audioInputs.push('bgm');
      const bgmVol = hasVoice ? 0.25 : 0.62;
      filterParts.push(
        `[${idx}:a]atrim=0:${durationSec},afade=t=in:st=0:d=1.0,afade=t=out:st=${fadeOutStart}:d=2.0,volume=${bgmVol}[bgm]`
      );
      mixLabels.push('[bgm]');
    }

    if (foleyWav) {
      ffArgs.push('-i', foleyWav);
      const idx = audioInputs.length + 1;
      audioInputs.push('sfx');
      filterParts.push(`[${idx}:a]atrim=0:${durationSec}[sfx]`);
      mixLabels.push('[sfx]');
    }

    if (mixLabels.length) {
      const mixed = mixLabels.length > 1 ? '[mix]' : mixLabels[0];
      if (mixLabels.length > 1) {
        filterParts.push(`${mixLabels.join('')}amix=inputs=${mixLabels.length}:duration=first:dropout_transition=0[mix]`);
      }
      // Measure the actual mix before mastering; a single dynamic pass can miss -14 LUFS.
      const target = 'loudnorm=I=-14:TP=-1.5:LRA=11';
      const measurement = await runCmd('ffmpeg', [...ffArgs,
        '-filter_complex', [...filterParts, `${mixed}${target}:print_format=json[aout]`].join(';'),
        '-map', '[aout]', '-vn', '-f', 'null', '-',
      ]);
      const stats = JSON.parse(measurement.match(/\{\s*"input_i"[\s\S]*?\}/)[0]);
      const measured = `:measured_I=${stats.input_i}:measured_TP=${stats.input_tp}:measured_LRA=${stats.input_lra}:measured_thresh=${stats.input_thresh}:offset=${stats.target_offset}:linear=true`;
      filterParts.push(`${mixed}${target}${measured}[aout]`);
      ffArgs.push('-filter_complex', filterParts.join(';'), '-map', '0:v:0', '-map', '[aout]', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000');
    }

    ffArgs.push(
      '-t',
      String(durationSec),
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '18',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      outMp4
    );

    await runCmd('ffmpeg', ffArgs);
    fs.rmSync(tmpFramesDir, { recursive: true, force: true });
    console.log(`视频导出成功: ${outMp4}`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
