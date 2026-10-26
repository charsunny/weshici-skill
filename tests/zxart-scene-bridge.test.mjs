import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function generate(scene, variant = scene) {
  const context = vm.createContext({});
  for (const name of ['zxart-compose.js', 'zxart-shanshui-v5.js']) {
    vm.runInContext(fs.readFileSync(new URL(`../resources/vendor/zxart/${name}`, import.meta.url), 'utf8'), context);
  }
  return context.ZXArtCompose.generate({
    generator: 'shanshui@5', seed: 'preview-bridge', variant,
    params: { quiet_top: 0.32, verse_side: 'left', verse_columns: 4, verse_chars: 10 },
    palette: { paper: '#E3E7F0', ink: '#3D3B4F' }, width: 1080, height: 1440,
  });
}

for (const [scene, raw, motif] of [
  ['retreat', '山居林泉', 'pine'],
  ['fishing', '江行渔隐', 'boat'],
  ['lotusPond', '荷塘夏景', 'lotus'],
]) {
  test(`${scene}: verse rectangle, trace and anchors survive the Worker bridge`, () => {
    const drawing = generate(scene);
    assert.ok(drawing.layers.some(layer => layer.shapes.length > 0));
    assert.ok(drawing.sceneElements.some(element => element.motif === motif));
    assert.ok(drawing.trace.polygons.length > 0);
    assert.ok(Array.isArray(drawing.anchors.boats));
    assert.doesNotThrow(() => structuredClone(drawing));
    for (const layer of drawing.layers) {
      for (const shape of layer.shapes) assert.ok([...shape.points].every(Number.isFinite));
    }
    assert.equal(JSON.stringify(drawing), JSON.stringify(generate(scene)), 'fixed seed is reproducible');
    assert.equal(JSON.stringify(drawing), JSON.stringify(generate(scene, raw)), 'serialized scene selects the same painting');
  });
}
