import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { preparePosterManifest } from '../resources/core/poetry-poster.js';

const example = JSON.parse(fs.readFileSync(new URL('../examples/poster-ludi.json', import.meta.url)));
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
