import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveStudy, restoreStudy, STUDY_FORMAT, flowerForPoem, STUDY_FONTS } from '../resources/core/theme-art-study.js';
const palettes = JSON.parse(fs.readFileSync(new URL('../resources/core/app-palettes.json', import.meta.url)));
const base = { title:'春日', author:'朱熹', poem:'胜日寻芳泗水滨，无边光景一时新。', seed:'fixed' };

test('study papers retain theme differences in both appearances without modifying source palettes or ink', () => {
  const original = JSON.stringify(palettes), papers = new Set();
  for (const theme of Object.keys(palettes.palettes)) {
    for (const appearance of ['light', 'dark']) {
      const config = resolveStudy({ ...base, theme, appearance }, palettes);
      assert.notEqual(config.colors.paper, palettes.palettes[theme][appearance].paper);
      assert.equal(config.artColors.paper, config.colors.paper);
      assert.equal(config.colors.ink, palettes.palettes[theme][appearance].ink);
      papers.add(config.colors.paper);
    }
  }
  assert.equal(papers.size, Object.keys(palettes.palettes).length * 2);
  assert.equal(JSON.stringify(palettes), original);
});

test('App and custom fonts are independent from theme and artwork, invalid choices fail explicitly', () => {
  const baseline = resolveStudy(base, palettes);
  for (const font of Object.keys(STUDY_FONTS)) {
    const config = resolveStudy({ ...base, font }, palettes);
    assert.equal(config.font.id, font);
    assert.deepEqual(config.colors, baseline.colors);
    assert.deepEqual(config.artColors, baseline.artColors);
    assert.equal(config.artwork, baseline.artwork);
    assert.equal(config.poem, baseline.poem);
  }
  const font = { name:'自定义楷体', path:'/tmp/my font.ttf' };
  const config = resolveStudy({ ...base, font }, palettes);
  font.name = 'changed';
  assert.equal(config.font.name, '自定义楷体');
  for (const invalid of ['unknown', {name:'test'}, {name:'test',path:'font.js'}, {name:'',path:'font.otf'}]) {
    assert.throws(() => resolveStudy({ ...base, font:invalid }, palettes));
  }
});

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
  const changed = structuredClone(palettes); changed.palettes['moon-white'].light.ink = '#000000';
  assert.notEqual(resolveStudy({ ...base, theme:'seasonal', date:'2026-10-28' }, changed).colors.ink, config.colors.ink);
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

test('new element treatment follows the art palette while original treatment omits point colours', () => {
  const config = resolveStudy({ ...base, theme:'rouge', artPalette:'canglang', appearance:'dark' }, palettes);
  assert.equal(config.elementTreatment, 'landscape-v3');
  assert.equal(resolveStudy({ ...base, artwork:'flowers' }, palettes).elementTreatment, 'refined-v1');
  assert.equal(config.artColors.accent, palettes.palettes.canglang.dark.accent);
  assert.equal(config.artColors.secondary, palettes.palettes.canglang.dark.secondary);
  const original = resolveStudy({ ...base, elementTreatment:'original' }, palettes);
  assert.equal(original.artColors.accent, undefined);
  assert.throws(() => resolveStudy({ ...base, elementTreatment:'typo' }, palettes));
});

test('painted-v2 is opt-in and retains theme colours, font and poem', () => {
  const before = resolveStudy(base, palettes);
  const after = resolveStudy({ ...base, elementTreatment:'painted-v2' }, palettes);
  assert.equal(before.elementTreatment, 'landscape-v3');
  assert.equal(after.elementTreatment, 'painted-v2');
  assert.deepEqual(after.artColors, before.artColors);
  assert.deepEqual(after.font, before.font);
  assert.equal(after.poem, before.poem);
});
