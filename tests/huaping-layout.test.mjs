import test from 'node:test';
import assert from 'node:assert/strict';
import { huapingClauses, huapingPlan } from '../resources/core/huaping-layout.js';
const input = { poem: '明月松间照，清泉石上流。', title: '山居秋暝', dynasty: '唐', author: '王维',
  width: 1080, height: 1440, verse: { vertical: true, rect: { x: .5935, y: .2, width: .3565, height: .3765 } } };

test('Chinese and Western punctuation split clauses; quotes, whitespace and ornaments do not become glyphs', () => {
  assert.deepEqual(huapingClauses('「明月松间照」，清泉\n石上流! 竹喧归浣女；莲动下渔舟…'),
    ['明月松间照', '清泉石上流', '竹喧归浣女', '莲动下渔舟']);
});

test('five-character layout follows native size and keeps inscription within verse height', () => {
  const plan = huapingPlan(input);
  assert.ok(plan.fontSize > 80 && plan.fontSize < 85);
  assert.ok(plan.verseHeight <= plan.box.height + 0.001);
  assert.ok(plan.inscriptionHeight < plan.verseHeight);
  assert.equal(plan.attribution, '唐　王维');
  assert.equal(plan.omittedClauses.length, 0);
});

test('wide calligraphy cells reserve more horizontal space without dropping a couplet', () => {
  const ordinary = huapingPlan(input);
  const wide = huapingPlan({ ...input, columnWidth:1.4 });
  assert.ok(wide.fontSize < ordinary.fontSize);
  assert.deepEqual(wide.clauses, ordinary.clauses);
  assert.deepEqual(wide.omittedClauses, []);
  const verseWidth = (wide.clauses.length * wide.columnWidth + (wide.clauses.length - 1) * .62) * wide.fontSize;
  assert.ok(verseWidth + wide.inscriptionSize * wide.columnWidth + wide.fontSize * .9 <= wide.box.width);
});

test('scaling the canvas scales every layout dimension', () => {
  const a = huapingPlan(input);
  const b = huapingPlan({ ...input, width: 2160, height: 2880 });
  for (const key of ['fontSize', 'sealWidth', 'sealHeight', 'inscriptionSize', 'verseHeight']) assert.equal(b[key], a[key] * 2);
});

test('long titles shrink independently, split right to left, and leave poem and seal sizes intact', () => {
  const base = huapingPlan(input);
  const long = huapingPlan({ ...input, title: '奉和中书舍人贾至早朝大明宫兼呈诸位同舍之作' });
  assert.equal(long.fontSize, base.fontSize);
  assert.equal(long.sealWidth, base.sealWidth);
  assert.equal(long.titleColumns.length, 2);
  assert.equal(long.titleColumns.join(''), long.title);
  assert.ok(long.inscriptionSize > 0 && long.inscriptionSize < base.inscriptionSize);
});

test('lock-screen safety clamps vertically without moving the chosen column sideways', () => {
  const share = huapingPlan(input);
  const wallpaper = huapingPlan({ ...input, wallpaper: true });
  assert.equal(wallpaper.box.x, share.box.x);
  assert.equal(wallpaper.box.y, 1440 * .32);
  assert.ok(wallpaper.box.y + wallpaper.box.height <= 1440 * .88);
});

test('a narrow box removes whole couplets and reports every omitted clause', () => {
  const poem = '空山新雨后，天气晚来秋。明月松间照，清泉石上流。竹喧归浣女，莲动下渔舟。随意春芳歇，王孙自可留。';
  const plan = huapingPlan({ ...input, poem, verse: { vertical: true, rect: { x: .7, y: .2, width: .2, height: .4 } } });
  assert.equal(plan.clauses.length, 2);
  assert.deepEqual([...plan.clauses, ...plan.omittedClauses], huapingClauses(poem));
});
