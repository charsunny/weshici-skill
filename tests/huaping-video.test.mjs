import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  resolveVideoPalette, byline, typeFloorIssues, clipVerseRect, VIDEO_SAFE, inkRevealPlan, inkGlyphState,
  sealState, videoDuration, pushScale, pickWeather, geeseCount, afterglowPlan,
  artPlacement, paintingStats, placeOffset, liftRect, storyTimeline, leafGone, readableWindow, knockOutSun, deepenInk, songTimeline,
} from '../resources/core/huaping-video.js';
import { huapingClauses, huapingPlan } from '../resources/core/huaping-layout.js';
import { sealStampState } from '../resources/core/weishi-video-core.js';

const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message || ''} ${actual} ≠ ${expected}`);
const palettes = JSON.parse(fs.readFileSync(new URL('../resources/core/app-palettes.json', import.meta.url), 'utf8'));

test('seasonal palette follows the recipe term or date; night subjects default to dark', () => {
  assert.equal(resolveVideoPalette(palettes, { term: '寒露' }).id, 'moon-white');
  assert.equal(resolveVideoPalette(palettes, { term: '清明' }).id, 'canglang');
  assert.equal(resolveVideoPalette(palettes, { term: '大雪' }).id, 'qingdai');
  assert.equal(resolveVideoPalette(palettes, { date: '2026-06-21' }).id, 'xiang-leaf');
  assert.equal(resolveVideoPalette(palettes, { term: '寒露' }).appearance, 'light');
  const night = resolveVideoPalette(palettes, { term: '寒露', night: true });
  assert.equal(night.appearance, 'dark');
  assert.deepEqual(night.colors, palettes.palettes['moon-white'].dark);
  assert.equal(resolveVideoPalette(palettes, { term: '寒露', night: true, appearance: 'light' }).appearance, 'light');
});

test('explicit palettes, deprecated aliases and bad input', () => {
  assert.equal(resolveVideoPalette(palettes, { palette: 'rouge', term: '寒露' }).id, 'rouge');
  assert.deepEqual(
    (({ id, appearance }) => ({ id, appearance }))(resolveVideoPalette(palettes, { palette: 'yueye' })),
    { id: 'qingdai', appearance: 'dark' });
  assert.throws(() => resolveVideoPalette(palettes, { palette: 'lanhui', term: '寒露' }), /未知 palette/);
  assert.throws(() => resolveVideoPalette(palettes, { palette: 'seasonal' }), /term 或 date/);
  assert.throws(() => resolveVideoPalette(palettes, { term: '寒露', appearance: 'dim' }), /appearance/);
});

test('byline leaves out an unknown dynasty and never fills one in', () => {
  assert.equal(byline('唐', '杜甫'), '唐 · 杜甫');
  assert.equal(byline('', '杜甫'), '杜甫');
  assert.equal(byline(undefined, ' 杜牧 '), '杜牧');
});

test('verse box clipped to the 9:16 safe area stays out of the right and bottom controls', () => {
  const W = 1080, H = 1920;
  const rect = { x: 0.51, y: 0.2, width: 0.44, height: 0.75 };
  const clipped = clipVerseRect(rect, { width: W, height: H });
  const plan = huapingPlan({ poem: '清明时节雨纷纷，路上行人欲断魂。', title: '清明', author: '杜牧', dynasty: '唐',
    width: W, height: H, verse: { vertical: true, rect: clipped } });
  assert.ok(plan.box.x + plan.box.width <= W - VIDEO_SAFE.right + 0.001);
  assert.ok(plan.box.y + plan.box.height <= H - VIDEO_SAFE.bottom + 0.001);
  // A box already clear of the controls is left alone.
  const left = { x: 0.05, y: 0.2, width: 0.44, height: 0.35 };
  assert.deepEqual(clipVerseRect(left, { width: W, height: H }), left);
});

test('ink reveal uses the App timing and settles a share video by 3.0s', () => {
  const short = inkRevealPlan({ count: 10 });
  assert.equal(short.stagger, 0.12);
  assert.equal(short.starts[0], 0.3);
  assert.ok(Math.abs(short.sealStart - (short.colophonStart + short.colophonDuration + 0.3)) < 1e-9);
  assert.equal(short.sealDuration, 0.2);
  for (const count of [20, 28, 56]) {
    const long = inkRevealPlan({ count });
    assert.ok(long.settle <= 3.0 + 1e-9, `${count} glyphs settle by 3.0s`);
    assert.ok(long.stagger < 0.12 && long.stagger >= 0.03);
  }
  assert.equal(inkRevealPlan({ count: 28, settleBy: Infinity }).stagger, 0.12);
});

test('glyph and seal states run from their start values to rest with no overshoot', () => {
  const start = inkGlyphState(0, 1);
  near(start.opacity, 0); near(start.blur, 6); near(start.scale, 1.06);
  assert.deepEqual(inkGlyphState(2, 1), { opacity: 1, blur: 0, scale: 1 });
  near(inkGlyphState(0, 1, 0.25, 2).blur, 12);
  near(sealState(0, 1).opacity, 0);
  near(sealState(0, 1).scale, 1.15);
  for (let t = 1; t <= 1.3; t += 0.01) {
    assert.ok(sealState(t, 1).scale >= 1 - 1e-9);
    assert.ok(sealStampState(t, 1).scale >= 1 - 1e-9);
  }
  assert.equal(sealState(1.2, 1).scale, 1);
});

test('duration follows HuapingVideoTiming and the push never passes 2%', () => {
  assert.equal(videoDuration(20, 3), 9);
  assert.equal(videoDuration(28, 3), 12);
  assert.equal(videoDuration(100, 3), 23);
  near(pushScale(0, 9), 1);
  near(pushScale(9, 9), 1.02);
  near(pushScale(20, 9), 1.02);
});

test('weather comes from the poem and is filtered by what the painting already has', () => {
  // 月夜忆舍弟: the painting has its own moon, so only the goose remains.
  assert.deepEqual(pickWeather({ text: '戍鼓断人行，秋边一雁声。露从今夜白，月是故乡明。', title: '月夜忆舍弟', term: '寒露',
    motifs: ['window', 'boat', 'moon'] }), ['geese']);
  assert.deepEqual(pickWeather({ text: '清明时节雨纷纷', title: '清明', motifs: ['rain'] }), ['rain']);
  assert.deepEqual(pickWeather({ text: '清明时节雨纷纷', title: '清明', motifs: [] }), []);
  assert.deepEqual(pickWeather({ text: '空山新雨后', motifs: ['rain', 'afterRain'] }), []);
  // Month names and 岁月 do not summon a moon; @5 never gets an extra mist.
  assert.deepEqual(pickWeather({ text: '九月九日忆山东兄弟，烟岚', motifs: [] }), []);
  assert.deepEqual(pickWeather({ text: '雨雪霏霏', motifs: ['rain', 'snow'] }), ['rain']);
  assert.equal(geeseCount('秋边一雁声'), 1);
  assert.equal(geeseCount('雁字回时'), 5);
});

test('afterglow ripples stay on open water, out of the sky, the verse box and the hull', () => {
  const anchors = { water: { x: [0.05, 0.95], y: [0.05, 0.9] }, boats: [{ x: 0.7, y: 0.8, length: 0.15 }], sky: { y: [0, 0.38] } };
  const avoid = { x: 0.05, y: 0.2, width: 0.4, height: 0.4 };
  const plan = afterglowPlan({ anchors, avoid, seed: 'test' });
  assert.ok(plan.ripples.length > 0);
  for (const r of plan.ripples) {
    assert.ok(r.y >= 0.38, 'not in the sky');
    assert.ok(!(r.x > avoid.x && r.x < avoid.x + avoid.width && r.y > avoid.y && r.y < avoid.y + avoid.height), 'not in the verse box');
    assert.ok(!(Math.abs(r.x - 0.7) < 0.09 && r.y < 0.812), 'not on the hull');
  }
  // Rings near the horizon are smaller than those near the viewer.
  const sorted = [...plan.ripples].sort((a, b) => a.y - b.y);
  assert.ok(sorted[0].size <= sorted.at(-1).size);
  assert.deepEqual(plan.boats, [{ x: 0.7, y: 0.8, length: 0.15 }]);
  // The painting vetoes inked spots; no water and no boat means no ripples.
  assert.equal(afterglowPlan({ anchors, seed: 'test', open: () => false }).ripples.length, 0);
  assert.equal(afterglowPlan({ anchors: { water: null, boats: [], sky: { y: [0, 0.38] } }, seed: 'test' }).ripples.length, 0);
  // Mist settles on the densest band of mountains.
  const mist = afterglowPlan({ anchors, seed: 'test', rowInk: y => (Math.abs(y - 0.45) < 0.005 ? 1 : 0) }).mist;
  assert.ok(Math.abs(mist.y - 0.45) < 0.011);
  assert.deepEqual(afterglowPlan({ anchors, seed: 'test' }), afterglowPlan({ anchors, seed: 'test' }));
});

test('a video type floor grows the colophon and seal, moving a long title to its own column', () => {
  const input = { poem: '戍鼓断人行，秋边一雁声。露从今夜白，月是故乡明。', title: '月夜忆舍弟', author: '杜甫', dynasty: '唐',
    width: 1080, height: 1920, verse: { vertical: true, rect: { x: 0.05, y: 0.2, width: 0.44, height: 0.2 } } };
  const base = huapingPlan(input);
  assert.ok(base.inscriptionSize < 28);
  assert.equal(base.separateTitle, false);
  const floored = huapingPlan({ ...input, minInscription: 28 });
  near(floored.inscriptionSize, 28);
  assert.equal(floored.fontSize, base.fontSize);
  assert.ok(floored.sealWidth >= 28 * 0.9 - 1e-9 && floored.sealWidth > base.sealWidth);
  assert.equal(floored.separateTitle, true);
  assert.deepEqual(floored.titleColumns, ['月夜忆舍弟']);
  // A short title still fits in one column with the attribution and seal.
  assert.equal(huapingPlan({ ...input, title: '江雪', minInscription: 28 }).separateTitle, false);
  assert.deepEqual(typeFloorIssues(floored), []);
  assert.equal(typeFloorIssues(base).length, 1);
});

test('a shorter painting placed low in the frame maps its verse box and anchors with it', () => {
  const place = artPlacement({ width: 1080, height: 1920, artHeight: 1440 });
  assert.equal(place.offset, 480);
  const rect = place.rect({ x: 0.05, y: 0, width: 0.4, height: 0.5 });
  near(rect.y, 0.25);
  near(rect.height, 0.375);
  const anchors = place.anchors({ water: { x: [0, 1], y: [0.5, 1] }, boats: [{ x: 0.7, y: 1, length: 0.1 }],
    trees: [{ x: 0.3, baseY: 0.5, topY: 0, width: 0.1 }], buildings: [], sky: { x: [0, 1], y: [0, 0.4] } });
  near(anchors.water.y[0], 0.625);
  near(anchors.boats[0].y, 1);
  near(anchors.trees[0].topY, 0.25);
  assert.equal(anchors.boats[0].x, 0.7);
  near(anchors.sky.y[1], 0.55);
  assert.equal(anchors.sky.y[0], 0, 'the paper above the painting is sky');
});

test('painting stats find the inked rows and ignore the verse box and lone specks', () => {
  const w = 40, h = 40, paper = [240, 240, 240];
  const data = new Uint8ClampedArray(w * h * 4).fill(240);
  const ink = (x, y) => data.set([20, 20, 20, 255], (y * w + x) * 4);
  for (let x = 0; x < w; x++) { ink(x, 20); ink(x, 28); }
  ink(4, 4); // a speck
  for (let x = 0; x < 12; x++) ink(x, 8); // inside the avoided box
  const stats = paintingStats(data, w, h, paper, { step: 4, avoid: { x: 0, y: 6, width: 14, height: 4 } });
  assert.equal(stats.top, 20);
  assert.equal(stats.bottom, 28);
  assert.ok(stats.mass > 0 && stats.mass < 0.3);
  assert.deepEqual(paintingStats(new Uint8ClampedArray(w * h * 4).fill(240), w, h, paper), { mass: 0, top: null, bottom: null });
});

test('the painting is bottom-aligned, and lowered only to crop bare paper under its last stroke', () => {
  assert.equal(placeOffset({ frameHeight: 1920, artHeight: 1440, contentBottom: 1400 }), 480);
  assert.equal(placeOffset({ frameHeight: 1920, artHeight: 1440, contentBottom: null }), 480);
  // Last stroke at 900px of 1440: lowered until it sits on the platform's bottom bar (1540px).
  assert.equal(placeOffset({ frameHeight: 1920, artHeight: 1440, contentBottom: 900 }), 640);
});

test('the verse box lifts through bare paper but never into ink and never down', () => {
  const rect = { x: 0.05, y: 0.3, width: 0.4, height: 0.2 };
  assert.deepEqual(liftRect(rect, { top: 0.11 }), { ...rect, y: 0.11 });
  const lifted = liftRect(rect, { top: 0.11, clear: r => r.y >= 0.2 });
  assert.ok(lifted.y >= 0.2 && lifted.y < 0.21);
  assert.deepEqual(liftRect(rect, { top: 0.11, clear: () => false }), rect);
  assert.deepEqual(liftRect({ ...rect, y: 0.05 }, { top: 0.11 }), { ...rect, y: 0.05 });
});

const recipe = slug => JSON.parse(fs.readFileSync(new URL(`../resources/recipes/${slug}.json`, import.meta.url), 'utf8'));

test('ink-story leaves follow the reading and stay long enough for readcheck', () => {
  for (const slug of ['wanqing-dufu-story', 'sushi-yufu']) {
    const r = recipe(slug);
    const glyphCounts = r.couplets.map(c => huapingClauses(c.text).join('').length);
    const story = storyTimeline({ couplets: r.couplets, glyphCounts, titleGlyphs: Array.from(r.title).length });
    // Same rule as scripts/readcheck.mjs: at least 1.5s and 0.22s per character.
    const check = (leaf, chars, label) => {
      const [from, to] = readableWindow(leaf, story.dissolve);
      assert.ok(to - from + 0.1 >= Math.max(1.5, chars * 0.22), `${slug} ${label}: ${(to - from).toFixed(2)}s`);
    };
    check(story.title, Array.from(r.title + r.author).length, 'title');
    story.lines.slice(0, -1).forEach((line, i) => check(line, glyphCounts[i], `couplet ${i + 1}`));
    story.lines.forEach((line, i) => {
      assert.equal(line.times[0], r.couplets[i].start, 'each couplet starts with its spoken line');
      assert.ok(line.times.every((t, j) => j === 0 || t > line.times[j - 1]));
    });
    assert.equal(story.lines.at(-1).out, Infinity, 'the last couplet stays');
    assert.ok(story.sealAt > story.colophonAt && story.sealAt < r.duration, `${slug} seal lands inside the reading`);
    // A leaf is whole until its dissolve begins and gone once it ends.
    const first = story.lines[0];
    assert.equal(leafGone(first.out - 0.61, first, story.dissolve), 0);
    near(leafGone(first.out, first, story.dissolve), 1);
  }
});

test('the engine\'s pink sun is found and laid back to paper; ink elsewhere is untouched', () => {
  const w = 30, h = 30, paper = [243, 246, 247];
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) data.set([...paper, 255], i);
  const px = (x, y, c) => data.set(c, (y * w + x) * 4);
  for (let y = 8; y <= 12; y++) for (let x = 18; x <= 22; x++) px(x, y, [218, 184, 186]); // #AB4033 at 0.34
  px(17, 10, [236, 228, 227]); // the disc's soft edge (#AB4033 at 0.1)
  px(5, 20, [30, 38, 46]); // an ink stroke
  const sun = knockOutSun(data, w, h, paper);
  assert.ok(Math.abs(sun.x - 20) < 1e-9 && Math.abs(sun.y - 10) < 1e-9);
  assert.equal(sun.count, 25);
  assert.deepEqual([...data.slice((10 * w + 20) * 4, (10 * w + 20) * 4 + 3)], paper);
  assert.deepEqual([...data.slice((10 * w + 17) * 4, (10 * w + 17) * 4 + 3)], paper, 'the edge goes too');
  assert.deepEqual([...data.slice((20 * w + 5) * 4, (20 * w + 5) * 4 + 3)], [30, 38, 46]);
  const blank = new Uint8ClampedArray(16).fill(240);
  assert.equal(knockOutSun(blank, 2, 2, [240, 240, 240]), null);
});

test('deepening the ink leaves paper and grain alone and pushes strokes away from the paper', () => {
  const paper = [240, 240, 240];
  const data = new Uint8ClampedArray([240, 240, 240, 255, 235, 236, 234, 255, 200, 200, 200, 255, 20, 20, 20, 255]);
  deepenInk(data, paper);
  assert.deepEqual([...data.slice(0, 3)], [240, 240, 240]);
  assert.deepEqual([...data.slice(4, 7)], [235, 236, 234], 'grain is left alone');
  assert.ok(data[8] < 200 - 40, `a pale stroke darkens: ${data[8]}`);
  assert.deepEqual([...data.slice(12, 15)], [0, 0, 0], 'already dark ink clamps');
  // On dark paper the same rule brightens light strokes.
  const night = new Uint8ClampedArray([110, 120, 130, 255]);
  deepenInk(night, [17, 26, 32]);
  assert.ok(night[0] > 110);
});

test('a sung line inks in across its sung time and the seal lands inside the song', () => {
  const r = recipe('sumuzhe-fanzhongyan-mv');
  const glyphCounts = r.lyrics.map(l => huapingClauses(l.text).join('').length);
  const song = songTimeline({ lyrics: r.lyrics, glyphCounts });
  song.lines.forEach((line, i) => {
    assert.equal(line.times.length, glyphCounts[i]);
    assert.equal(line.times[0], r.lyrics[i].start);
    assert.equal(line.end, r.lyrics[i + 1]?.start ?? r.lyrics[i].end);
    assert.ok(line.times.at(-1) + 0.25 <= line.end, `line ${i + 1} is fully inked before the next starts`);
    assert.ok(line.end - line.times[0] >= Math.max(1.5, glyphCounts[i] * 0.22), 'readcheck dwell');
  });
  assert.ok(song.sealAt < r.duration);
});

