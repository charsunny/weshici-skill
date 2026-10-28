import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveStudy, restoreStudy, STUDY_FORMAT, flowerForPoem } from '../resources/core/theme-art-study.js';
const palettes = JSON.parse(fs.readFileSync(new URL('../resources/core/app-palettes.json', import.meta.url)));
const base = { title:'春日', author:'朱熹', poem:'胜日寻芳泗水滨，无边光景一时新。', seed:'fixed' };

test('switching the theme retains artwork ink, seed and flower choice', () => {
  for (const appearance of ['light', 'dark']) {
    const a = resolveStudy({ ...base, appearance, artwork:'flowers', flower:'梅' }, palettes);
    const b = resolveStudy({ ...a, theme:'canglang' }, palettes);
    assert.notEqual(a.colors.paper, b.colors.paper);
    assert.equal(a.artColors.ink, b.artColors.ink);
    assert.equal(b.artColors.paper, b.colors.paper);
    assert.equal(a.flower, b.flower);
    assert.equal(a.seed, b.seed);
  }
});

test('poem subject survives every theme while explicit choices take priority', () => {
  for (const theme of Object.keys(palettes.palettes)) {
    const plum = resolveStudy({ ...base, title:'梅花', poem:'墙角数枝梅，凌寒独自开。', theme }, palettes);
    assert.equal(plum.artwork, 'flowers');
    assert.equal(plum.flower, '梅');
    assert.equal(plum.artPalette, theme);
    assert.equal(resolveStudy({ ...base, theme, title:'小池', poem:'小荷才露尖尖角，早有蜻蜓立上头。' }, palettes).artwork, 'shanshui');
    assert.equal(resolveStudy({ ...plum, artwork:'none' }, palettes).generator, null);
    assert.equal(resolveStudy({ ...plum, artwork:'shanshui', artPalette:'yaqing' }, palettes).artPalette, 'yaqing');
  }
  assert.equal(flowerForPoem('兰舟催发'), null);
});

test('reading keeps the full poem, inscriptions use only a verified excerpt', () => {
  const input = { ...base, fullPoem:'空山新雨后，天气晚来秋。明月松间照，清泉石上流。', excerpt:'明月松间照，清泉石上流。' };
  assert.equal(resolveStudy(input, palettes).poem, input.excerpt);
  assert.equal(resolveStudy({ ...input, purpose:'reading' }, palettes).poem, input.fullPoem);
  assert.throws(() => resolveStudy({ ...input, excerpt:'床前明月光' }, palettes));
});

test('seasonal and night defaults are concrete, and a saved work ignores later palette changes', () => {
  const config = resolveStudy({ ...base, theme:'seasonal', date:'2026-10-28' }, palettes);
  assert.equal(config.theme, 'moon-white');
  assert.equal(config.artPalette, 'moon-white');
  assert.equal(resolveStudy({ ...base, title:'月夜' }, palettes).appearance, 'dark');
  assert.equal(resolveStudy({ ...base, title:'月夜', appearance:'light' }, palettes).appearance, 'light');
  const snapshot = { format:STUDY_FORMAT, config, request:null, verse:{rect:{x:0,y:0,width:1,height:1}} };
  const original = JSON.stringify(snapshot);
  const changed = structuredClone(palettes); changed.palettes['moon-white'].light.paper = '#FFFFFF';
  assert.notEqual(resolveStudy({ ...base, theme:'seasonal', date:'2026-10-28' }, changed).colors.paper, config.colors.paper);
  assert.equal(JSON.stringify(restoreStudy(JSON.parse(original))), original);
  const copy = restoreStudy(snapshot); copy.config.colors.paper = '#000000';
  assert.equal(JSON.stringify(snapshot), original);
  assert.throws(() => restoreStudy({ ...snapshot, format:'unknown' }));
  assert.throws(() => resolveStudy({ ...base, date:'2026-02-30' }, palettes));
});
test('artwork and its ink can change without recolouring the interface', () => {
  const a = resolveStudy(base, palettes);
  const b = resolveStudy({ ...base, artwork:'flowers', artPalette:'moon-white' }, palettes);
  assert.deepEqual(a.colors, b.colors);
  assert.notEqual(a.artColors.ink, b.artColors.ink);
  assert.equal(b.generator, 'nonflowers@2');
  assert.equal(resolveStudy({ ...base, artwork:'none' }, palettes).generator, null);
});
test('invalid or incomplete experiments fail instead of silently substituting artwork', () => {
  for (const input of [{theme:'missing'}, {artPalette:'missing'}, {appearance:'auto'},
    {artwork:'qinglv'}, {flower:'桃'}, {seed:''}, {poem:''}]) {
    assert.throws(() => resolveStudy({ ...base, ...input }, palettes));
  }
});
