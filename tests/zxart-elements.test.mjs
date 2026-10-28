import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const json = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function engine(flowers = false) {
  const context = vm.createContext({ TextEncoder, btoa });
  vm.runInContext(fs.readFileSync(new URL('../resources/vendor/zxart/zxart-compose.js', import.meta.url), 'utf8'), context);
  if (flowers) context.ZXArtCompose.installShims(context);
  const file = flowers ? 'nonflowers/main.js' : 'zxart-shanshui-v5.js';
  vm.runInContext(fs.readFileSync(new URL(`../resources/vendor/zxart/${file}`, import.meta.url), 'utf8'), context);
  return context.ZXArtCompose;
}
const palette = { paper:'#243B30', ink:'#E3EBE2', accent:'#8FCBA8', secondary:'#D9A27A' };
const params = { quiet_top:.18, verse_side:'right', verse_columns:2, verse_chars:5, element_treatment:'refined-v1' };
const monochrome = { paper:palette.paper, ink:palette.ink };

test('refined mountain, roof and tree details keep geometry, masks and most ink unchanged', () => {
  const api = engine();
  const request = { generator:'shanshui@5', seed:'study-山居秋暝', variant:'retreat', params:{ ...params, scene:{ motifs:['pine', 'bamboo', 'hut', 'stream', 'moon'], purpose:'inscription-v1', composition:'corner' } }, palette, width:1080, height:1440 };
  const tinted = api.generate(request);
  const plain = api.generate({ ...request, palette:monochrome });
  const original = api.generate({ ...request, params:{ ...request.params, element_treatment:'original' } });
  assert.equal(json(tinted.trace), json(original.trace), 'no extra random draws or geometry changes');
  assert.equal(json(tinted.sceneElements), json(original.sceneElements));
  assert.equal(json(tinted.anchors), json(original.anchors));
  assert.equal(json(tinted.verse), json(original.verse));
  assert.equal(json(tinted), json(api.generate(request)), 'reproducible colour');
  let changed = 0, count = 0;
  tinted.layers.forEach((layer, l) => layer.shapes.forEach((shape, i) => {
    const before = plain.layers[l].shapes[i];
    count++;
    assert.equal(json(shape.points), json(before.points));
    for (const key of ['fill', 'stroke']) {
      assert.equal(Boolean(shape[key]), Boolean(before[key]), 'no new filled shapes');
      if (!shape[key]) continue;
      assert.ok(shape[key][3] >= before[key][3] && shape[key][3] <= Math.max(.3, before[key][3]), 'point colour has bounded opacity');
      if (json(shape[key]) !== json(before[key])) changed++;
      assert.ok(shape[key].every(v => Number.isFinite(v) && v >= 0 && v <= 1));
    }
  }));
  assert.ok(changed > 20 && changed < count * .35, `sparse but visible detail selection: ${changed}/${count}`);
  assert.ok(tinted.layers.some(layer => layer.fade?.bottom > layer.fade?.top), 'renderer receives effective mountain fade');
  // The moon disk is bright; the surrounding washes retain their low source opacity.
  assert.ok(tinted.layers.some(layer => layer.shapes.some(s => s.fill?.[3] === .52)
    && layer.shapes.some(s => s.fill?.[3] > 0 && s.fill[3] < .03)));
});

test('flower point colour changes stems, preserves petals and remains deterministic', () => {
  // The Worker reloads nonflowers for each request, resetting its globals and wrappers.
  const api = { generate:request => engine(true).generate(request) };
  const request = { generator:'nonflowers@2', seed:'theme-art-study-spring-20261028', variant:'自然', params, palette, width:1080, height:1440 };
  const tinted = api.generate(request);
  const plain = api.generate({ ...request, palette:monochrome });
  assert.equal(json(tinted.layers[1]), json(plain.layers[1]), 'native flower colour is unchanged');
  assert.notEqual(json(tinted.layers[0]), json(plain.layers[0]), 'stem side receives theme colour');
  assert.equal(json(tinted.trace), json(plain.trace));
  assert.equal(json(tinted), json(api.generate(request)));
  assert.throws(() => api.generate({ ...request, params:{ element_treatment:'typo' } }));
});
