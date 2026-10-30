#!/usr/bin/env node
/**
 * 微诗视频工作台 · 音频先行与朗读时间戳配方生成器 (audio-cue.mjs)
 *
 * 自动从微诗 Voicebox 朗读音频库 (/Volumes/XiPass/literature/assets/wish/audio/poetryhub-voicebox-readings)
 * 检索诗作，读取 reading_voicebox_male.mp3 与 timed_lyrics.json，通过 ffprobe 测量音频总时长，
 * 自动生成可直接交给 render.mjs 渲染的 Recipe JSON（逐行时间戳，朗读库没有词级时间）。
 *
 * 用法：
 *   node tools/video-studio/bin/audio-cue.mjs --query "杜甫-晚晴" --out tools/video-studio/recipes/auto-wanqing.json
 *   node tools/video-studio/bin/audio-cue.mjs --list "苏轼"
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ASSETS_ROOT, STUDIO_ROOT } from './server-util.mjs';
import { lookupPoem, poemFacts } from './poem-lookup.mjs';
import { beijingDay, huapingCalendar } from '../resources/core/huaping-footer.js';

const args = process.argv.slice(2);
const getArg = (k, def) => {
  const idx = args.indexOf(`--${k}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : def;
};

const externalReadingsDir = path.join(ASSETS_ROOT, 'wish/audio/poetryhub-voicebox-readings/2026-06-22');
const bundledReadingsDir = fs.existsSync(path.join(STUDIO_ROOT, 'resources/assets/readings'))
  ? path.join(STUDIO_ROOT, 'resources/assets/readings')
  : path.join(STUDIO_ROOT, 'assets/readings');
const READINGS_DIR =
  process.env.WEISHI_READINGS_DIR ||
  (fs.existsSync(externalReadingsDir) ? externalReadingsDir : bundledReadingsDir);

function probeDuration(filePath) {
  try {
    const out = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath],
      { encoding: 'utf-8' }
    );
    return Math.ceil(parseFloat(out.trim()) || 18);
  } catch {
    return 18;
  }
}

const listKeyword = getArg('list', '');
if (listKeyword) {
  const dirs = fs.readdirSync(READINGS_DIR).filter((d) => d.includes(listKeyword));
  console.log(`匹配的 Voicebox 朗读条目 (${dirs.length} 首):`);
  dirs.slice(0, 30).forEach((d) => console.log(`  - ${d}`));
  process.exit(0);
}

const query = getArg('query', '杜甫-晚晴');
const tokens = query.split(/[\s-]+/).filter(Boolean);
const dirs = fs.readdirSync(READINGS_DIR);
const matched = dirs.find((d) => tokens.every((tk) => d.includes(tk)));
if (!matched) {
  console.error(`未在 ${READINGS_DIR} 中找到匹配 "${query}" 的诗作朗读目录`);
  process.exit(1);
}

const folder = path.join(READINGS_DIR, matched);
const textRaw = fs.readFileSync(path.join(folder, 'text.txt'), 'utf-8').trim().split(/\r?\n/);
const title = (textRaw[0] || '').trim();
const authorLine = (textRaw[1] || '').trim();
const author = authorLine.split(/\s+/)[0] || '佚名';
const timed = JSON.parse(fs.readFileSync(path.join(folder, 'timed_lyrics.json'), 'utf-8'));
const mp3Path = path.join(folder, 'reading_voicebox_male.mp3');
const dur = probeDuration(mp3Path);
const poemId = matched.split('-').pop() || matched;
// 朗读库只有诗题和作者；朝代从诗库查，查不到就留空，不写「唐宋」之类的占位。
const facts = poemFacts(await lookupPoem({ title, author, poem: timed.map(item => item.text).join('，') }));
if (!facts.dynasty) console.warn(`诗库未查到《${title}》（${author}）的朝代，配方中 dynasty 留空`);

const couplets = timed.map((item, idx) => {
  const nextStart = timed[idx + 1] ? timed[idx + 1].start - 0.05 : dur;
  return {
    start: Number(item.start),
    end: Number(nextStart.toFixed(2)),
    text: item.text,
  };
});

const slug = `auto-${matched.split('-').slice(1, 3).join('-')}`;
// 节气取制作当天（北京时间），不写「时令」之类的占位；视频模板缺省随节气取 App 配色。
const date = getArg('date', beijingDay());
const recipe = {
  id: slug,
  poemId,
  title,
  dynasty: facts.dynasty,
  author,
  date,
  term: huapingCalendar(date).term,
  duration: dur,
  audioMode: 'voice+bgm+foley',
  voice: `/assets/wish/audio/poetryhub-voicebox-readings/2026-06-22/${matched}/reading_voicebox_male.mp3`,
  bgm: '/artifacts/promo-8.0/assets/audio/radio-calm.m4a',
  lines: couplets.map((c) => c.text),
  // ShanShui@5：只记 seed，用途、构图和母题由引擎按诗决定。
  procedural: { generator: 'shanshui@5', seed: matched },
  couplets,
};

const defaultRecipeDir = fs.existsSync(path.join(STUDIO_ROOT, 'resources/recipes'))
  ? path.join(STUDIO_ROOT, 'resources/recipes')
  : path.join(STUDIO_ROOT, 'recipes');
const outFile = path.resolve(getArg('out', path.join(defaultRecipeDir, `${slug}.json`)));
fs.writeFileSync(outFile, JSON.stringify(recipe, null, 2) + '\n', 'utf-8');
console.log(`已从 Voicebox 朗读库生成声画对齐配方: ${outFile} (总时长 ${dur}s, 共 ${couplets.length} 联)`);

