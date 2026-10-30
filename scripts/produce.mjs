#!/usr/bin/env node
/**
 * 微诗视频工作台 · 一键端到端制片与发布总控台 (produce.mjs)
 *
 * 流程 (遵循 DIRECTOR.md 三层架构与 poetryhub-skill 发布标准):
 *   1. 检索 Voicebox 朗读库 (`audio-cue.mjs`)，提取人声 MP3 与逐行时间戳 `timed_lyrics.json`
 *   2. 自动生成导演配方 `recipes/<slug>.json`、分镜企划 `out/<slug>.treatment.md` 与社区发布文案 `out/<slug>.caption.md`
 *   3. 执行 `readcheck.mjs` 自动化字幕驻留时长与拟音事件门禁检查
 *   4. 执行 `render.mjs --workers 4 --sheet` 多进程并行渲染 `1080×1920` MP4 + 九宫格接触表 `.sheet.jpg` + 封面图 `.cover.jpg`
 *   5. 若传入 `--publish` 且配置了 `POETRYHUB_API_KEY`，直接调用 `poetryhub-skill/scripts/poetryhub.mjs publish-video` 发布
 *
 * 用法:
 *   node tools/video-studio/bin/produce.mjs --query "李白" --style ink-story
 *   node tools/video-studio/bin/produce.mjs --query "王维" --style huaping-motion
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildTreatmentMarkdown, buildCaptionMarkdown } from './caption.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STUDIO_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(STUDIO_ROOT, '..');
const ASSETS_ROOT = '/Volumes/XiPass/literature/assets';

function parseArgs(argv) {
  const args = {
    query: '王维',
    style: 'ink-story',
    slug: null,
    workers: 4,
    publish: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--query' && argv[i + 1]) args.query = argv[++i];
    else if (a === '--style' && argv[i + 1]) args.style = argv[++i];
    else if (a === '--slug' && argv[i + 1]) args.slug = argv[++i];
    else if (a === '--workers' && argv[i + 1]) args.workers = Number(argv[++i]) || 4;
    else if (a === '--publish') args.publish = true;
  }
  return args;
}

function makeSlug(str) {
  return (
    str
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '') || `poem-${Date.now()}`
  );
}

async function main() {
  const args = parseArgs(process.argv);
  const outDir = path.join(STUDIO_ROOT, 'out');
  fs.mkdirSync(outDir, { recursive: true });

  const slug = args.slug || makeSlug(`auto-${args.style}-${args.query}`);
  const recipeDir = fs.existsSync(path.join(STUDIO_ROOT, 'resources/recipes'))
    ? path.join(STUDIO_ROOT, 'resources/recipes')
    : path.join(STUDIO_ROOT, 'recipes');
  const recipePath = path.join(recipeDir, `${slug}.json`);

  console.log(`\n🎬 [1/4] 音频先行对齐: 检索「${args.query}」并生成导演配方...`);
  execFileSync(
    process.execPath,
    [
      path.join(__dirname, 'audio-cue.mjs'),
      '--query',
      args.query,
      '--style',
      args.style,
      '--out',
      recipePath,
    ],
    { stdio: 'inherit' },
  );

  const recipe = JSON.parse(fs.readFileSync(recipePath, 'utf8'));
  const treatmentPath = path.join(outDir, `${slug}.treatment.md`);
  const captionPath = path.join(outDir, `${slug}.caption.md`);
  fs.writeFileSync(treatmentPath, buildTreatmentMarkdown(recipe, slug, args.style), 'utf8');
  fs.writeFileSync(captionPath, buildCaptionMarkdown(recipe, args.style), 'utf8');
  console.log(`   ✓ 分镜企划单: ${treatmentPath}`);
  console.log(`   ✓ 社区发布文案: ${captionPath}`);

  console.log(`\n🔍 [2/4] 自动化质检门禁 (readcheck.mjs)...`);
  execFileSync(
    process.execPath,
    [
      path.join(__dirname, 'readcheck.mjs'),
      '--scene',
      args.style,
      '--recipe',
      slug,
    ],
    { stdio: 'inherit' },
  );

  const mp4Path = path.join(outDir, `${slug}.mp4`);
  const coverPath = path.join(outDir, `${slug}.cover.jpg`);
  console.log(`\n🚀 [3/4] 多进程并行渲染 1080×1920 成片与九宫格接触表...`);
  execFileSync(
    process.execPath,
    [
      path.join(__dirname, 'render.mjs'),
      '--scene',
      args.style,
      '--recipe',
      slug,
      '--workers',
      String(args.workers),
      '--sheet',
      '--out',
      mp4Path,
    ],
    { stdio: 'inherit' },
  );

  // 抽取黄金时刻帧 (65% 处) 作为高清封面图
  const peakTime = Math.max(1.5, Number(recipe.duration || 10) * 0.65).toFixed(2);
  execFileSync(
    'ffmpeg',
    ['-y', '-ss', peakTime, '-i', mp4Path, '-frames:v', '1', '-q:v', '2', coverPath],
    { stdio: 'ignore' },
  );
  console.log(`   ✓ 封面图已生成: ${coverPath}`);

  const poemId = recipe.poemId || recipe.poem?.id || '<POEM_ID>';
  const publishCmd = `./poetryhub-skill/scripts/poetryhub.mjs publish-video --poem-id "${poemId}" --text-file "${captionPath}" --video-file "${mp4Path}" --thumbnail "${coverPath}"`;

  console.log(`\n✨ [4/4] 制片完成！`);
  console.log(`   · 成片 MP4 : ${mp4Path}`);
  console.log(`   · 接触表   : ${mp4Path.replace(/\.mp4$/, '.sheet.jpg')}`);
  console.log(`   · 封面图   : ${coverPath}`);
  console.log(`   · 发布指令 : ${publishCmd}`);

  if (args.publish) {
    if (!process.env.POETRYHUB_API_KEY) {
      console.warn(`   ⚠️ 未检测到 POETRYHUB_API_KEY 环境变量，跳过自动上传，可使用上方指令手动发布。`);
    } else {
      console.log(`   📤 正在调用 poetryhub.mjs publish-video 发布至微诗社区...`);
      execFileSync(
        process.execPath,
        [
          path.join(REPO_ROOT, 'poetryhub-skill/scripts/poetryhub.mjs'),
          'publish-video',
          '--poem-id',
          poemId,
          '--text-file',
          captionPath,
          '--video-file',
          mp4Path,
          '--thumbnail',
          coverPath,
        ],
        { stdio: 'inherit' },
      );
    }
  }
}

main().catch((err) => {
  console.error('produce.mjs error:', err);
  process.exit(1);
});
