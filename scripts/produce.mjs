#!/usr/bin/env node
/**
 * 微诗视频工作台 · 一键端到端制片与发布总控台 (produce.mjs)
 *
 * 流程 (遵循 DIRECTOR.md 三层架构与 poetryhub-skill 发布标准):
 *   1. 检索本地 1,848 首 Voicebox 朗读库 (`audio-cue.mjs`)，提取人声 MP3 与词级时间戳 `timed_lyrics.json`
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

function buildTreatmentMarkdown(recipe, slug, style) {
  const title = recipe.title || recipe.poem?.title || '无题';
  const author = recipe.author || recipe.poem?.author || '佚名';
  const dynasty = recipe.dynasty || recipe.poem?.dynasty || '';
  const cues = recipe.couplets || recipe.poem?.cues || [];
  const rows = cues
    .map(
      (c, i) =>
        `| #${i + 1} | \`${Number(c.start).toFixed(2)}s – ${Number(c.end).toFixed(2)}s\` | 「${c.text}」 | 逐字墨洇显影 + 宣纸呼吸推镜 |`,
    )
    .join('\n');

  return `# 导演分镜企划单 (TREATMENT) — 《${title}》

- **剧目代号**: \`${slug}\`
- **视觉母版**: \`${style}\`
- **一句话主旨 (Premise)**: 以东方水墨与程序化山水还原 ${[dynasty, author].filter(Boolean).join('·')}《${title}》的诗境声场，做到字字落音、笔笔生墨。
- **传统色方案**: \`${recipe.mood || '旷达'}\` · 天气意象 \`${recipe.weather || 'mist'}\` · 算法山水 \`${recipe.procedural?.generator || 'shanshui@2'} (${recipe.procedural?.variant || '远山'})\`
- **成片总时长**: \`${recipe.duration}s\` (\`1080×1920\`, 30fps, \`-14 LUFS\`)

## 音频先行节拍网格 (Audio-First Cue Grid)

| 镜头序号 | 人声时间窗 | 诗句台词 | 画面与运镜调度 |
| :--- | :--- | :--- | :--- |
${rows || '| #1 | `0.85s – end` | 全诗显影 | 逐字墨洇 + 落印 |'}

## 声明式东方拟音 (Procedural Foley)

- \`0.35s\`: \`qin-harmonic\` (古琴泛音入画)
- \`0.95s\`: \`ink-drop\` (首句落墨入纸)
- \`${Math.max(2, Number(recipe.duration || 15) - 2.2).toFixed(2)}s\`: \`seal-stamp\` (朱印闷响收束)
`;
}

function buildCaptionMarkdown(recipe) {
  const title = recipe.title || recipe.poem?.title || '无题';
  const author = recipe.author || recipe.poem?.author || '佚名';
  const dynasty = recipe.dynasty || recipe.poem?.dynasty || '';
  const lines = (recipe.lines || recipe.poem?.lines || (recipe.couplets || []).map((c) => c.text)).join('\n');
  return `【微诗动态画屏 · 《${title}》】

${lines}

—— ${[dynasty, author].filter(Boolean).join(' · ')}《${title}》

本片由微诗视频工作台（Weishi Video Studio）确定性渲染生成：
· 视觉意境：采用「${recipe.mood || '旷达'}」传统色纸本与 ZixiaoArt「${recipe.procedural?.variant || '远山'}」算法水墨山水，叠合「${recipe.weather || 'mist'}」自然天气粒子；
· 声画同步：基于朗读人声词级时间戳驱动诗句逐字墨洇显影，配乐在人声区间自动闪避（-9dB Ducking），并以古琴泛音与朱文落印收束。
`;
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
  fs.writeFileSync(captionPath, buildCaptionMarkdown(recipe), 'utf8');
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
