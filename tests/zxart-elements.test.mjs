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
  let source=fs.readFileSync(new URL(`../resources/vendor/zxart/${file}`, import.meta.url), 'utf8');
  // Expose the private seed/rectangle helpers in the test VM only; keep the public bundle unchanged.
  if (!flowers) source=source.replace('  PaintingStageV5,\n  generatePoetryPaintingV5',
    '  landscapeBrushEngineV5, CRect, PaintingStageV5,\n  generatePoetryPaintingV5');
  vm.runInContext(source, context);
  return { ...context.ZXArtCompose, Engine:context.ShanShuiEngineV5,
    landscapeBrushEngine:context.landscapeBrushEngineV5, Stage:context.PaintingStageV5, Rect:context.CRect };
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

test('painted study changes mountain and crown brushwork without moving the scene or changing defaults', () => {
  const api = engine();
  const request = { generator:'shanshui@5', seed:'study-山居秋暝', variant:'retreat',
    params:{ ...params, scene:{ motifs:['pine', 'bamboo', 'hut', 'stream', 'moon'], purpose:'inscription-v1', composition:'corner' } },
    palette, width:1080, height:1440 };
  const before = api.generate(request);
  const after = api.generate({ ...request, params:{ ...request.params, element_treatment:'painted-v2' } });
  assert.equal(json(after.verse), json(before.verse));
  assert.equal(json(after.sceneElements), json(before.sceneElements), 'asset bounds and scene placement stay fixed');
  assert.equal(json(after.anchors), json(before.anchors), 'weather and subject anchors stay fixed');
  const fineTree = new api.Engine('crown-count'), groupedTree = new api.Engine('crown-count');
  groupedTree.paintedStudySeed = 'crown-count';
  const fineCrown = fineTree.paintingPineNeedles(0, 0, 50, 15);
  const groupedCrown = groupedTree.paintingPineNeedles(0, 0, 50, 15);
  assert.ok(groupedCrown.length < fineCrown.length * .25, 'crown uses fewer marks; whole-scene counts also include new wash planes');
  assert.notEqual(json(after.layers), json(before.layers));
  for (const layer of after.layers) for (const shape of layer.shapes) {
    assert.ok([...shape.points].every(Number.isFinite));
    for (const color of [shape.fill, shape.stroke]) if (color) assert.ok(color.every(v => Number.isFinite(v) && v >= 0 && v <= 1));
  }
  assert.equal(json(after), json(api.generate({ ...request, params:{ ...request.params, element_treatment:'painted-v2' } })));
  assert.equal(json(before), json(api.generate(request)), 'experiment has no state leakage into refined-v1');
});

test('structural landscape is seeded, preserves the verse and required subjects, and updates its geometry', () => {
  const api = engine();
  const request = { generator:'shanshui@5', seed:'study-山居秋暝', variant:'retreat',
    params:{ ...params, scene:{ motifs:['pine','hut','stream','moon'], purpose:'inscription-v1', composition:'corner' } },
    palette, width:1080, height:1440 };
  const legacy = api.generate(request);
  const nextRequest = {...request,params:{...request.params,element_treatment:'landscape-v3'}};
  const next = api.generate(nextRequest);
  assert.equal(json(next.verse),json(legacy.verse));
  assert.notEqual(json(next.trace),json(legacy.trace),'mountain geometry is rebuilt, not just recoloured');
  assert.notEqual(json(next.anchors),json(legacy.anchors),'weather anchors follow rebuilt geometry');
  assert.equal(next.brushwork.version,'landscape-v3');
  assert.ok(['hemp','axe'].includes(next.brushwork.technique));
  for (const motif of ['mainMountain','pine','hut']) assert.ok(next.sceneElements.some(e=>e.motif===motif),motif);
  for (const layer of next.layers) for (const shape of layer.shapes) {
    assert.ok([...shape.points].every(Number.isFinite));
    for (const color of [shape.fill,shape.stroke]) if(color) assert.ok(color.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
  }
  assert.equal(json(next),json(api.generate(nextRequest)),'same seed replays every stroke');
  assert.notEqual(json(next.layers),json(api.generate({...nextRequest,seed:'ridge-02'}).layers));
  assert.equal(json(legacy),json(api.generate(request)),'new brush state cannot leak into older treatments');
});

test('brush vocabulary leaves dry gaps and supports distinct pressure, side loading and cun families', () => {
  const api=engine(), path=[{x:0,y:0},{x:25,y:2},{x:50,y:0}];
  const dry=new api.Engine('brush-proof').paintingBrushStroke(path,{width:12,moisture:.1});
  const wet=new api.Engine('brush-proof').paintingBrushStroke(path,{width:12,moisture:.7});
  const area=p=>Math.abs(p.p.reduce((sum,q,i)=>{const r=p.p[(i+1)%p.p.length];return sum+q.x*r.y-r.x*q.y;},0)/2);
  assert.ok(dry.reduce((sum,p)=>sum+area(p),0)<wet.reduce((sum,p)=>sum+area(p),0)*.6,
    'dry hair ribbons cover less paper than wet ink, without painting white over existing strokes');
  assert.ok(dry.every(p=>p.fil.r===0),'exposed paper is transparent');
  const mountains=[];
  for(const technique of ['hemp','axe']) {
    const e=new api.Engine('ridge-01');e.landscapeSeed='ridge-01';e.landscapeTechnique=technique;
    mountains.push(e.paintingMountain('folded',false,1.4));
  }
  assert.notEqual(json(mountains[0]),json(mountains[1]));
  assert.notEqual(json(wet),json(new api.Engine('brush-proof').paintingBrushStroke(path,{width:12,moisture:.7,oblique:1})));
});

test('versioned seed streams distinguish nearby and reordered strings, and buildings clear trunks', () => {
  const api=engine();
  const seeds=Array.from({length:20},(_,i)=>'ridge-'+String(i+1).padStart(2,'0'));
  const values=seeds.map(seed=>api.landscapeBrushEngine('cun:'+seed).r());
  assert.equal(new Set(values).size,20);
  assert.ok(values.some(v=>v<.5)&&values.some(v=>v>=.5),'consecutive seeds cover both cun families');
  assert.notEqual(api.landscapeBrushEngine('abcd').r(),api.landscapeBrushEngine('dcba').r());
  // A building can move sideways along the same bank, without occupying the trunk corridor.
  const stage=new api.Stage('clearance',420,560,{},null,.08,{});
  stage.bankSurface={x0:0,step:10,heights:Array(43).fill(400)};
  stage.treeRoots={pine:{x:200,y:400}};
  stage.elements=[{motif:'pine',bounds:{x:.3,y:.3,width:.3,height:.42}}];
  const requested=api.Rect(180,340,40,60);
  const moved=stage.clearFigureGround(requested,true);
  assert.ok(moved.maxX<190||moved.minX>210);
  assert.equal(moved.maxY,400,'building remains supported by the bank');
});

test('two-point brush gestures retain pressure and mirrored study banks keep geometry aliases aligned', () => {
  const api=engine();
  const brush=new api.Engine('two-point-pressure').paintingBrushStroke([{x:0,y:0},{x:80,y:0}],
    {width:12,moisture:.6,pressure:[.05,1,.05]});
  const points=brush.flatMap(p=>p.p);
  assert.ok(points.some(p=>p.x>25&&p.x<55&&Math.abs(p.y)>4),
    'a straight gesture must press down between its two endpoints');
  assert.ok(points.filter(p=>p.x===0||p.x===80).every(p=>Math.abs(p.y)<1),
    'entry and exit remain light');
  for(const seed of ['bank-01','bank-02','bank-03','bank-04']) {
    const e=new api.Engine(seed);e.landscapeSeed=seed;
    for(const p of e.paintingSlope('cliff')) assert.equal(json(p.p),json(p.pts),
      'fitting and rendering must see the same mirrored geometry');
  }
});
