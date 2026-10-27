#!/usr/bin/env node
/**
 * 微诗词 · WeShici Skill (/weshici) · 多平台视觉素材与社媒成片生成器 (generate.mjs)
 *
 * 基础素材生成 (Foundational Assets):
 *   - wallpaper: 设备壁纸 (iPhone, iPad, Mac 4K, 桌面宽屏; 纯山水或题签闲章版)
 *   - image: 静止意境画 (1:1, 3:4, 16:9, 9:16 自定义画幅，宣纸雅致排版)
 *   - video: 基础动态画屏短片 (1080×1920 MP4, 烟波流转、草木微澜)
 *
 * 高级社媒成片生成 (Platform-Ready Suites):
 *   - xiaohongshu: 小红书 3:4 (1080×1440) 4联卡片（封面/诗境/笔墨拆解/纯壁纸）+ 爆款文案
 *   - wechat-sticker: 微信透明底朱红闲章贴图、墨色微物贴图、宣纸微画与朋友圈日签卡
 *   - douyin: 抖音 9:16 (1080×1920) 短视频（安全区避让、黄金 1.5s Hook、-14 LUFS 混音与发布文案）
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { generatePosters } from './poster.mjs';

import {
  STUDIO_ROOT,
  startStudioServer,
  loadPuppeteer,
  findChromeExecutable,
} from './server-util.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 载入 zxart-shanshui-v5.js 以获取诗意场景匹配器
let poetrySceneFn = null;
try {
  const zxartCode = fs.readFileSync(path.join(STUDIO_ROOT, 'resources/vendor/zxart/zxart-shanshui-v5.js'), 'utf8');
  const sandbox = { Math, Date, Array, Object, Number, String, Set, Map, Infinity, NaN };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(zxartCode, sandbox);
  if (typeof sandbox.poetryScene === 'function') {
    poetrySceneFn = sandbox.poetryScene;
  }
} catch (e) {
  // fallback
}

function resolvePoeticScene(text, title) {
  if (typeof poetrySceneFn === 'function') {
    try {
      const match = poetrySceneFn(text || '', title || '');
      if (match && match.scene) return match.scene;
    } catch (_) {}
  }
  return 'retreat';
}

const DEVICE_PRESETS = {
  'mac-4k': { width: 3840, height: 2160, label: 'Mac 4K 超清横屏' },
  'desktop': { width: 2560, height: 1440, label: '桌面 2K 横屏' },
  'ipad': { width: 2048, height: 2732, label: 'iPad Pro 竖屏' },
  'iphone': { width: 1290, height: 2796, label: 'iPhone Pro Max 锁屏' },
  'mobile': { width: 1080, height: 2400, label: '安卓全高清锁屏' },
};

const RATIO_PRESETS = {
  '1:1': { width: 1080, height: 1080 },
  '3:4': { width: 1080, height: 1440 },
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
};

function slugify(str) {
  return (
    str
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '') || `asset-${Date.now()}`
  );
}

function parseCliArgs(argv) {
  const command = argv[2] || 'help';
  const opts = {
    title: '山居秋暝',
    poem: command === 'poster' ? '明月松间照，清泉石上流。' : '空山新雨后，天气晚来秋。明月松间照，清泉石上流。',
    author: '王维',
    dynasty: '唐',
    scene: '',
    device: 'iphone',
    ratio: '3:4',
    mode: 'inscribed',
    duration: 10,
    out: '',
    pure: false,
    card: null,
    type: 'seal',
    workers: 4,
  };

  for (let i = 3; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--title' && argv[i + 1]) opts.title = argv[++i];
    else if (a === '--poem' && argv[i + 1]) opts.poem = argv[++i];
    else if (a === '--author' && argv[i + 1]) opts.author = argv[++i];
    else if (a === '--dynasty' && argv[i + 1]) opts.dynasty = argv[++i];
    else if (a === '--date' && argv[i + 1]) opts.date = argv[++i];
    else if (a === '--manifest' && argv[i + 1]) opts.manifest = argv[++i];
    else if (a === '--palette' && argv[i + 1]) opts.palette = argv[++i];
    else if (a === '--layout' && argv[i + 1]) opts.layout = argv[++i];
    else if (a === '--theme' && argv[i + 1]) opts.theme = argv[++i];
    else if (a === '--seed' && argv[i + 1]) opts.seed = argv[++i];
    else if (a === '--scene' && argv[i + 1]) opts.scene = argv[++i];
    else if (a === '--device' && argv[i + 1]) opts.device = argv[++i];
    else if (a === '--ratio' && argv[i + 1]) opts.ratio = argv[++i];
    else if (a === '--mode' && argv[i + 1]) opts.mode = argv[++i];
    else if (a === '--type' && argv[i + 1]) opts.type = argv[++i];
    else if (a === '--duration' && argv[i + 1]) opts.duration = Number(argv[++i]) || 10;
    else if (a === '--out' && argv[i + 1]) opts.out = argv[++i];
    else if (a === '--pure') opts.pure = true;
    else if (a === '--card' && argv[i + 1]) opts.card = Number(argv[++i]);
    else if (a === '--workers' && argv[i + 1]) opts.workers = Number(argv[++i]) || 4;
  }
  return { command, opts };
}

async function renderCardScreenshot(serverOrigin, queryParams, outPath, width, height) {
  const puppeteer = await loadPuppeteer();
  const execPath = findChromeExecutable();
  const browser = await puppeteer.launch({
    executablePath: execPath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    const url = `${serverOrigin}/resources/templates/media-suite/index.html?${new URLSearchParams(queryParams).toString()}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.READY === true, { timeout: 30000 });
    const omitted = await page.evaluate(() => window.__huapingPlan?.omittedClauses || []);
    if (omitted.length) console.warn(`   · 画屏为摘句排版，本张未展示：${omitted.join('，')}`);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    await page.screenshot({ path: outPath, type: 'png' });
  } finally {
    await browser.close();
  }
}

async function handleWallpaper(serverOrigin, opts, outDir) {
  const preset = DEVICE_PRESETS[opts.device] || DEVICE_PRESETS['iphone'];
  const scene = opts.scene || resolvePoeticScene(opts.poem, opts.title);
  const slug = slugify(`${opts.title}-wallpaper-${opts.device}`);
  const outPng = opts.out || path.join(outDir, `${slug}.png`);

  console.log(`\n🖼️ 正在生成「${opts.title}」${preset.label} (${preset.width}×${preset.height})...`);
  console.log(`   · 算法画境: ${scene} (ShanShui@5)`);
  console.log(`   · 版式类型: ${opts.pure ? '纯净水墨 (无字留白)' : '雅致题跋闲章'}`);

  await renderCardScreenshot(
    serverOrigin,
    {
      mode: 'wallpaper',
      pure: String(opts.pure),
      title: opts.title,
      poem: opts.poem,
      author: opts.author,
      dynasty: opts.dynasty,
      scene,
    },
    outPng,
    preset.width,
    preset.height
  );

  console.log(`   ✓ 壁纸已生成: ${outPng}`);
}

async function handleImage(serverOrigin, opts, outDir) {
  const preset = RATIO_PRESETS[opts.ratio] || RATIO_PRESETS['3:4'];
  const scene = opts.scene || resolvePoeticScene(opts.poem, opts.title);
  const slug = slugify(`${opts.title}-image-${opts.ratio.replace(':', 'x')}`);
  const outPng = opts.out || path.join(outDir, `${slug}.png`);

  console.log(`\n🎨 正在生成「${opts.title}」静态写意诗画 (${preset.width}×${preset.height})...`);
  console.log(`   · 诗情意象: ${scene}`);

  await renderCardScreenshot(
    serverOrigin,
    {
      mode: 'image',
      date: opts.date || '',
      title: opts.title,
      poem: opts.poem,
      author: opts.author,
      dynasty: opts.dynasty,
      scene,
    },
    outPng,
    preset.width,
    preset.height
  );

  console.log(`   ✓ 诗画已生成: ${outPng}`);
}

async function handleXiaohongshu(serverOrigin, opts, outDir) {
  const scene = opts.scene || resolvePoeticScene(opts.poem, opts.title);
  const slug = slugify(`${opts.title}-xiaohongshu`);
  const cardsDir = path.join(outDir, slug);
  fs.mkdirSync(cardsDir, { recursive: true });

  console.log(`\n📕 正在生成「${opts.title}」小红书 3:4 (1080×1440) 4 联卡片与爆款文案...`);
  console.log(`   · 意象识别: ${scene} (ShanShui@5 Sanyuan Composition)`);

  const cards = [
    { idx: 1, name: '01-cover.png', label: '封面大图 (古意水墨大片)' },
    { idx: 2, name: '02-poem-reading.png', label: '诗境品读 (诗文释义对览)' },
    { idx: 3, name: '03-technique-breakdown.png', label: '笔墨解构 (画理与构图剖析)' },
    { idx: 4, name: '04-wallpaper-ending.png', label: '纯享壁纸 (尾页长按保存)' },
  ];

  for (const card of cards) {
    const cardPath = path.join(cardsDir, card.name);
    process.stdout.write(`   · 渲染卡片 ${card.idx}/4: ${card.label}...`);
    await renderCardScreenshot(
      serverOrigin,
      {
        mode: 'xiaohongshu',
        card: String(card.idx),
        title: opts.title,
        poem: opts.poem,
        author: opts.author,
        dynasty: opts.dynasty,
        scene,
      },
      cardPath,
      1080,
      1440
    );
    console.log(' ✓');
  }

  // 撰写小红书文案
  const copyMd = path.join(cardsDir, `copy.md`);
  const lines = opts.poem.split(/[，。？！；\n]/).filter(Boolean);
  const copyContent = `# 小红书发布文案

## 【封面主视觉文案】
**标题**：一首《${opts.title}》，道尽中国人的隐逸美学与千载诗心 🌿
**副标**：宋元水墨古韵大片 ✦ 留白皆是境界

---

## 【图文笔记正文】
“${lines[0] || '空山新雨后'}，${lines[1] || '天气晚来秋'}。”

如果说盛唐的盛大如烈火烹油，
那${opts.author}笔下的山水，便是秋雨初霁后的万籁俱寂。

今日以 ZixiaoArt ShanShui@5 算法山水，重现《${opts.title}》的宋元画境：
⛰️ **高远与深远并济**：墨分五色，山势深厚，山脚溪石微露；
☁️ **腰云锁翠**：层云横贯山腰，虚实相生，留出神游冥想之境；
🌊 **清泉激石**：枯湿浓淡间，水墨活泼流动，不见雕琢之痕。

从文字到山水，每看一遍，皆能洗涤浮躁。

✦ 第 4 图为 3:4 / 9:16 纯净无字壁纸，长按即可保存～
✦ 喜欢的朋友点赞收藏，下一期想看哪一首诗词，评论区告诉我！

---

## 【热门话题标签】
#东方美学 #古诗词里的东方美 #国风壁纸 #山水画 #中国传统色 #小红书图文 #唯美壁纸 #治愈系风景 #宋代美学 #${opts.author} #${opts.title}
`;
  fs.writeFileSync(copyMd, copyContent, 'utf8');

  console.log(`\n✨ 小红书套系输出完成:`);
  console.log(`   · 4联卡片目录: ${cardsDir}`);
  console.log(`   · 小红书文案  : ${copyMd}`);
}

async function handleWeChatSticker(serverOrigin, opts, outDir) {
  const scene = opts.scene || resolvePoeticScene(opts.poem, opts.title);
  const slug = slugify(`${opts.title}-wechat`);
  const stickerDir = path.join(outDir, slug);
  fs.mkdirSync(stickerDir, { recursive: true });

  console.log(`\n💬 正在生成「${opts.title}」微信透明贴图与日签卡...`);

  // 1. 透明底朱红闲章贴图 (512×512)
  const sealPath = path.join(stickerDir, '01-sticker-seal.png');
  process.stdout.write(`   · 贴图 1/3: 512×512 透明底朱红印章...`);
  await renderCardScreenshot(
    serverOrigin,
    { mode: 'wechat-sticker', type: 'seal', shape: 'circle', title: opts.title },
    sealPath,
    512,
    512
  );
  console.log(' ✓');

  // 2. 宣纸底雅致微画贴图 (800×800)
  const xuanPath = path.join(stickerDir, '02-sticker-xuan.png');
  process.stdout.write(`   · 贴图 2/3: 800×800 宣纸微水墨画...`);
  await renderCardScreenshot(
    serverOrigin,
    { mode: 'wechat-sticker', type: 'xuan', title: opts.title, scene },
    xuanPath,
    800,
    800
  );
  console.log(' ✓');

  // 3. 微信朋友圈日签 (1080×1920)
  const cardPath = path.join(stickerDir, '03-wechat-daily-card.png');
  process.stdout.write(`   · 贴图 3/3: 1080×1920 朋友圈日签卡...`);
  await renderCardScreenshot(
    serverOrigin,
    {
      mode: 'wechat-card',
      title: opts.title,
      poem: opts.poem,
      author: opts.author,
      dynasty: opts.dynasty,
      scene,
    },
    cardPath,
    1080,
    1920
  );
  console.log(' ✓');

  console.log(`\n✨ 微信素材生成完毕: ${stickerDir}`);
}

async function handleDouyin(opts, outDir) {
  const slug = slugify(`${opts.title}-douyin`);
  console.log(`\n🎵 正在通过 produce.mjs 调度全流程生成抖音 9:16 (1080×1920) 短视频...`);
  console.log(`   · 诗词: ${opts.dynasty}·${opts.author}《${opts.title}》`);
  console.log(`   · 包含黄金 1.5s 开场 Hook、UI 安全区避让与 -14 LUFS Mastering`);

  execFileSync(
    process.execPath,
    [
      path.join(__dirname, 'produce.mjs'),
      '--query',
      opts.title,
      '--style',
      'huaping-motion',
      '--slug',
      slug,
      '--workers',
      String(opts.workers),
    ],
    { stdio: 'inherit' }
  );
}

async function main() {
  const { command, opts } = parseCliArgs(process.argv);
  const outDir = path.join(STUDIO_ROOT, 'out');
  fs.mkdirSync(outDir, { recursive: true });

  if (command === 'help' || command === '--help' || command === '-h') {
    console.log(`
微诗词 · WeShici Skill (/weshici) · 多平台视觉素材与社媒成片生成器

用法:
  weshici <command> [options]
  或: node scripts/generate.mjs <command> [options]

基础素材命令:
  wallpaper       生成高清设备壁纸 (iPhone, iPad, Mac 4K; 纯山水或题跋版)
                  选项: --title --poem --device (iphone|ipad|mac-4k|desktop) --pure
  image           生成静止意境诗画 (支持 1:1, 3:4, 16:9, 9:16 画幅)
                  选项: --title --poem --ratio (1:1|3:4|16:9|9:16)
  video           生成基础动态画屏短视频素材 (1080×1920, 动态墨韵流转)
                  选项: --title --poem --duration 10

高级社媒命令:
  poster         诗词海报：大字、浓色、分层山水，1080×1440 PNG
                  单张: --title --poem --author --palette (qinglv|yueye|nuanjin)
                        --layout (horizontal|vertical|hero) --theme --date --seed
                  组图: --manifest <JSON>；--out 指定输出目录
  xiaohongshu     生成小红书 3:4 (1080×1440) 4 联卡片与爆款文案 (封面/精读/画理/壁纸)
                  选项: --title --poem --author
  wechat-sticker  生成微信透明印章贴图、微水墨贴图与朋友圈日签卡
                  选项: --title --poem
  douyin          生成抖音 9:16 爆款短视频 (安全区布局、黄金 1.5s Hook、-14 LUFS 混音)
                  选项: --title --workers 4

通用选项:
  --date <YYYY-MM-DD>  静态分享图日期（默认北京时间当天）
  --scene <name>  强制指定画境 (retreat|fishing|desert|winterForest|spring|...)
  --out <path>    指定输出文件或目录
`);
    return;
  }

  // 启动内置 HTTP 服务
  const server = await startStudioServer(0);
  const origin = `http://127.0.0.1:${server.port}`;

  try {
    switch (command) {
      case 'wallpaper':
        await handleWallpaper(origin, opts, outDir);
        break;
      case 'image':
        await handleImage(origin, opts, outDir);
        break;
      case 'poster':
        await generatePosters(origin, opts, outDir);
        break;
      case 'xiaohongshu':
        await handleXiaohongshu(origin, opts, outDir);
        break;
      case 'wechat-sticker':
      case 'wechat':
        await handleWeChatSticker(origin, opts, outDir);
        break;
      case 'douyin':
      case 'video':
        await handleDouyin(opts, outDir);
        break;
      default:
        console.error(`未知命令: ${command}，输入 node scripts/generate.mjs help 查看说明。`);
        process.exit(1);
    }
  } finally {
    if (server && server.server && typeof server.server.close === 'function') {
      server.server.close();
    }
  }
}

main().catch((err) => {
  console.error('\n❌ generate.mjs 运行失败:', err);
  process.exit(1);
});
