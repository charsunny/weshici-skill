import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fitMap, routePath, routeUpTo, rulerLayout, GEOGRAPHY } from '../resources/core/footprint.js';

const recipe = JSON.parse(fs.readFileSync(new URL('../resources/recipes/sushi-footprint.json', import.meta.url), 'utf8'));
const MAP = { x: 130, y: 120, width: 780, height: 860 };
const points = [...recipe.map.flatMap(name => GEOGRAPHY[name]), ...recipe.stations.map(s => s.lonlat)];

test('the map fits its box without stretching east–west, north up', () => {
  const project = fitMap(points, MAP);
  for (const p of points) {
    const [x, y] = project(p);
    assert.ok(x >= MAP.x - 1e-6 && x <= MAP.x + MAP.width + 1e-6 && y >= MAP.y - 1e-6 && y <= MAP.y + MAP.height + 1e-6);
  }
  const [hx, hy] = project(recipe.stations[0].lonlat); // 黄州
  const [dx, dy] = project(recipe.stations[2].lonlat); // 儋州
  assert.ok(hy < dy, 'north is up');
  assert.ok(dx < hx, 'west is left');
  // One degree of latitude is longer on the page than one degree of longitude at ~25°N.
  const [a0, b0] = project([112, 25]), [a1] = project([113, 25]), [, b1] = project([112, 26]);
  assert.ok(Math.abs(b1 - b0) > Math.abs(a1 - a0));
});

test('the route passes through every station and can be drawn up to any fraction', () => {
  const project = fitMap(points, MAP);
  const route = routePath(recipe.stations.map(s => s.lonlat), recipe.bends, project);
  assert.equal(route.stops.length, recipe.stations.length);
  assert.equal(route.stops[0], 0);
  assert.ok(Math.abs(route.stops.at(-1) - 1) < 1e-9);
  assert.ok(route.stops.every((s, i) => i === 0 || s > route.stops[i - 1]));
  const end = routeUpTo(route, 1).at(-1);
  const last = project(recipe.stations.at(-1).lonlat);
  assert.ok(Math.hypot(end[0] - last[0], end[1] - last[1]) < 1e-6);
  const half = routeUpTo(route, 0.5);
  let length = 0;
  for (let i = 1; i < half.length; i++) length += Math.hypot(half[i][0] - half[i - 1][0], half[i][1] - half[i - 1][1]);
  assert.ok(Math.abs(length - route.total / 2) < 1e-6);
  assert.equal(routeUpTo(route, 0).length, 1);
});

test('timeline labels never overlap and stay inside the ruler, even for close years', () => {
  // 28px labels of four CJK characters, as in the template; 1079 / 1080 / 1082 crowd together.
  const widths = recipe.events.map(e => Math.max(4 * 0.55 * 28, Array.from(e.text).length * 28 * 1.1) + 8);
  const layout = rulerLayout(recipe.events, { x0: 120, x1: 920, widths });
  for (const row of [0, 1]) {
    const labels = layout.filter(l => l.row === row).sort((a, b) => a.left - b.left);
    labels.forEach((l, i) => { if (i) assert.ok(l.left >= labels[i - 1].right + 18 - 1e-9, `${l.year} clears ${labels[i - 1].year}`); });
  }
  for (const l of layout) {
    assert.ok(l.left >= 120 - 1e-9 && l.right <= 920 + 1e-9, `${l.year} inside`);
    assert.ok(l.row === 0 || l.row === 1);
  }
  // Ticks keep their true positions: years in order, evenly scaled.
  const per = (layout[5].tick - layout[0].tick) / (1100 - 1079);
  layout.forEach(l => assert.ok(Math.abs(l.tick - (layout[0].tick + (l.year - 1079) * per)) < 1e-9));
  // A lone label sits on its tick.
  assert.equal(rulerLayout([{ year: 1, text: 'a' }, { year: 100, text: 'b' }], { x0: 0, x1: 1000, widths: [50, 50] })[0].center, 25);
});
