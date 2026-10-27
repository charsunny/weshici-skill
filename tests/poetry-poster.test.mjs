import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { preparePosterManifest, appPalettes, paletteIds, seasonalPalette } from '../resources/core/poetry-poster.js';
import { posterTerrain, fitTerrain, ridgeAt } from '../resources/core/poster-terrain.js';

const example = JSON.parse(fs.readFileSync(new URL('../examples/poster-ludi.json', import.meta.url)));
const swatches = JSON.parse(fs.readFileSync(new URL('../examples/poster-palettes.json', import.meta.url)));
const one = card => preparePosterManifest({ date: '2026-10-27', cards: [card] }).cards[0];
const base = { title: '山居秋暝', author: '王维', lines: ['明月松间照'] };

test('theme covers do not consume poem numbers and the issue stays reproducible', () => {
  const result = preparePosterManifest(example);
  assert.equal(result.date, '2026-10-27');
  assert.deepEqual(result.cards.map(card => card.index), [0, 1, 2, 3, 4, 5, 6]);
  assert.ok(result.cards.every(card => card.total === 6));
  assert.deepEqual(result, preparePosterManifest(JSON.parse(JSON.stringify(example))));
  assert.notEqual(result.cards[1].seed, preparePosterManifest({ ...example, date: '2026-10-28' }).cards[1].seed);
});
test('excerpts are checked against the source rather than silently substituted', () => {
  const card = { ...example.cards[1], lines: ['明月松间照'] };
  assert.throws(() => preparePosterManifest({ cards: [card] }), /摘句不在原诗/);
  assert.throws(() => preparePosterManifest({ cards: [{ ...card, poem: '', lines: ['一二三四五六七八九'] }] }), /每行不超过 8 字/);
  assert.throws(() => preparePosterManifest({ cards: [{ ...example.cards[1], layout: 'hero' }] }), /hero 大字版/);
});
test('invalid drawing choices and dates fail before rendering', () => {
  const card = example.cards[1];
  assert.throws(() => preparePosterManifest({ cards: [{ ...card, motifs: ['moon', 'sun'] }] }), /日或月/);
  assert.throws(() => preparePosterManifest({ cards: [{ ...card, palette: 'unknown' }] }), /palette/);
  assert.throws(() => preparePosterManifest({ cards: [{ ...card, motifs: ['unknown'] }] }), /画面元素/);
  assert.throws(() => preparePosterManifest({ ...example, date: '2026-02-30' }), /日期/);
});

test('palettes are the seven App identities, with both appearances and painting colours', () => {
  assert.deepEqual(paletteIds.sort(), ['canglang', 'moon-white', 'ousi', 'qingdai', 'rouge', 'xiang-leaf', 'yaqing']);
  assert.match(appPalettes.source.commit, /^[0-9a-f]{40}$/);
  for (const id of paletteIds) {
    const entry = appPalettes.palettes[id];
    for (const appearance of ['light', 'dark']) {
      for (const slot of ['paper', 'ink', 'surface', 'muted', 'rule', 'accent', 'secondary', 'seal']) assert.match(entry[appearance][slot], /^#[0-9A-F]{6}$/, `${id}.${appearance}.${slot}`);
      for (const slot of ['far', 'top', 'body', 'line', 'point']) assert.match(entry.painting[appearance][slot], /^#[0-9A-F]{6}$/i, `${id}.painting.${appearance}.${slot}`);
    }
    assert.ok(entry.painting.reason);
  }
  // Spot-check against THEME_PALETTES 第四稿.
  assert.equal(appPalettes.palettes.yaqing.light.paper, '#F4F5F3');
  assert.equal(appPalettes.palettes.qingdai.dark.accent, '#D8B56C');
  assert.equal(appPalettes.palettes.rouge.dark.seal, '#F4A98C');
});

test('palette and appearance are validated and resolved into colours', () => {
  const card = one({ ...base, palette: 'moon-white', appearance: 'dark' });
  assert.equal(card.palette, 'moon-white');
  assert.equal(card.appearance, 'dark');
  assert.deepEqual(card.colors, appPalettes.palettes['moon-white'].dark);
  assert.deepEqual(card.paint, appPalettes.palettes['moon-white'].painting.dark);
  // The QR code is always printed dark-on-light.
  assert.deepEqual(card.qr, { tile: appPalettes.palettes['moon-white'].light.surface, ink: appPalettes.palettes['moon-white'].light.ink });
  assert.throws(() => one({ ...base, appearance: 'dim' }), /appearance/);
  assert.throws(() => one({ ...base, palette: 'jade' }), /palette/);
  // Without an appearance, a moon means a dark poster; otherwise light, and the default motifs follow.
  assert.equal(one({ ...base, motifs: ['moon', 'pine'] }).appearance, 'dark');
  assert.equal(one({ ...base, motifs: ['sun'] }).appearance, 'light');
  assert.deepEqual(one(base).motifs, ['sun', 'pine', 'boat']);
  assert.deepEqual(one({ ...base, appearance: 'dark' }).motifs, ['moon', 'pine', 'boat']);
});

test('deprecated palette names map to App palettes and imply an appearance', () => {
  assert.deepEqual([one({ ...base, palette: 'qinglv' })].map(c => [c.palette, c.appearance]), [['canglang', 'light']]);
  assert.deepEqual([one({ ...base, palette: 'yueye' })].map(c => [c.palette, c.appearance]), [['qingdai', 'dark']]);
  assert.deepEqual([one({ ...base, palette: 'nuanjin' })].map(c => [c.palette, c.appearance]), [['xiang-leaf', 'light']]);
  assert.equal(one({ ...base, palette: 'qinglv', appearance: 'dark' }).appearance, 'dark');
  assert.deepEqual(one({ ...base, palette: 'yueye' }).motifs, ['moon', 'pine', 'boat']);
});

test('seasonal follows the solar term, including the boundary days', () => {
  const cases = {
    '2026-02-03': 'qingdai', '2026-02-04': 'canglang', // 大寒 → 立春
    '2026-05-04': 'canglang', '2026-05-05': 'rouge', // 谷雨 → 立夏
    '2026-06-20': 'rouge', '2026-06-21': 'xiang-leaf', // 芒种 → 夏至
    '2026-09-06': 'xiang-leaf', '2026-09-07': 'moon-white', // 处暑 → 白露
    '2026-10-27': 'moon-white', '2026-11-06': 'moon-white', '2026-11-07': 'qingdai', // 霜降 → 立冬
    '2026-01-01': 'qingdai', '2026-12-31': 'qingdai',
  };
  for (const [date, id] of Object.entries(cases)) assert.equal(seasonalPalette(date), id, date);
  assert.equal(preparePosterManifest({ date: '2026-07-10', cards: [base] }).cards[0].palette, 'xiang-leaf');
  assert.equal(preparePosterManifest({ date: '2026-07-10', cards: [{ ...base, palette: 'seasonal' }] }).cards[0].palette, 'xiang-leaf');
});

test('the swatch sheet covers seven palettes in both appearances', () => {
  const cards = preparePosterManifest(swatches).cards;
  assert.equal(cards.length, 14);
  assert.equal(new Set(cards.map(card => `${card.palette}/${card.appearance}`)).size, 14);
});

test('every card in a group gets its own terrain', () => {
  const cards = preparePosterManifest(example).cards;
  const terrains = cards.map(card => posterTerrain(card.seed, card.layout));
  assert.equal(new Set(terrains.map(t => JSON.stringify(t))).size, cards.length);
  assert.ok(new Set(terrains.map(t => t.horizon)).size >= cards.length - 1);
  const summit = t => {
    const mid = t.ranges.find(range => range.depth === 0.5);
    return mid.peaks.reduce((a, b) => (b.h > a.h ? b : a)).x;
  };
  assert.ok(new Set(terrains.map(summit)).size === cards.length);
  assert.deepEqual(posterTerrain(cards[2].seed, 'horizontal'), posterTerrain(cards[2].seed, 'horizontal'));
  // Vertical text stands on the right, so its massif leans left.
  assert.equal(posterTerrain(cards[1].seed, 'vertical').main, 'left');
});

test('fitting the terrain keeps ridges below the text', () => {
  const terrain = posterTerrain(12345, 'vertical');
  const box = { x0: 0, y0: 0.1, x1: 1, y1: 0.6 };
  const fitted = fitTerrain(terrain, [box]);
  for (const range of fitted.ranges) {
    for (let x = 0; x <= 1; x += 0.01) assert.ok(ridgeAt(range, x) > box.y1 + 0.01, `${range.depth} at ${x}`);
  }
});
