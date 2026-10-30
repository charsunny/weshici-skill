// Poet's footprint (poet-footprint): map projection, the route, and a timeline whose labels never
// overlap. Pure functions, run in the page and under `node --test`.

/**
 * Equirectangular map fitted into `rect` (px): longitudes are shortened by cos(mid-latitude) so the
 * map is not stretched east–west. `points` are [lon, lat] pairs that must all fit.
 */
export function fitMap(points, rect) {
  const lons = points.map(p => p[0]), lats = points.map(p => p[1]);
  const lon0 = Math.min(...lons), lon1 = Math.max(...lons), lat0 = Math.min(...lats), lat1 = Math.max(...lats);
  const k = Math.cos(((lat0 + lat1) / 2) * Math.PI / 180);
  const scale = Math.min(rect.width / ((lon1 - lon0) * k), rect.height / (lat1 - lat0));
  const x0 = rect.x + (rect.width - (lon1 - lon0) * k * scale) / 2;
  const y0 = rect.y + (rect.height - (lat1 - lat0) * scale) / 2;
  return ([lon, lat]) => [x0 + (lon - lon0) * k * scale, y0 + (lat1 - lat) * scale];
}

/**
 * The route as a polyline sampled from quadratic curves between stations (`bends` are optional
 * control points per leg, [lon, lat] or null for a straight leg), with cumulative lengths so it can
 * be drawn up to any fraction. `stops` gives the fraction at which each station is reached.
 */
export function routePath(stations, bends, project, samplesPerLeg = 48) {
  const points = [project(stations[0])];
  const stops = [0];
  for (let i = 1; i < stations.length; i++) {
    const a = project(stations[i - 1]), b = project(stations[i]);
    const c = bends?.[i - 1] ? project(bends[i - 1]) : [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    for (let s = 1; s <= samplesPerLeg; s++) {
      const t = s / samplesPerLeg;
      points.push([0, 1].map(k => (1 - t) ** 2 * a[k] + 2 * (1 - t) * t * c[k] + t ** 2 * b[k]));
    }
    stops.push(points.length - 1);
  }
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  const total = lengths.at(-1);
  return { points, lengths, total, stops: stops.map(i => lengths[i] / total) };
}

/** The part of the route drawn at fraction `f` (0–1), ending exactly at that length. */
export function routeUpTo(route, f) {
  const target = Math.max(0, Math.min(1, f)) * route.total;
  const out = [route.points[0]];
  for (let i = 1; i < route.points.length; i++) {
    if (route.lengths[i] <= target) { out.push(route.points[i]); continue; }
    const seg = route.lengths[i] - route.lengths[i - 1];
    const t = seg > 0 ? (target - route.lengths[i - 1]) / seg : 0;
    if (t > 0) out.push([0, 1].map(k => route.points[i - 1][k] + (route.points[i][k] - route.points[i - 1][k]) * t));
    break;
  }
  return out;
}

/**
 * Timeline labels that never overlap. Ticks sit at their true year; each label (its width given)
 * goes in whichever of `rows` rows needs the smallest shift from its tick, ties to the upper row,
 * and stays inside [x0, x1]. A shifted label keeps a leader line to its tick.
 */
export function rulerLayout(events, { x0, x1, widths, gap = 18, rows = 2 }) {
  const y0 = Math.min(...events.map(e => e.year)), y1 = Math.max(...events.map(e => e.year));
  const right = Array(rows).fill(-Infinity);
  return events.map((e, i) => {
    const tick = y1 === y0 ? (x0 + x1) / 2 : x0 + (e.year - y0) / (y1 - y0) * (x1 - x0);
    const half = widths[i] / 2;
    const wanted = Math.min(Math.max(tick, x0 + half), x1 - half);
    let best = null;
    for (let row = 0; row < rows; row++) {
      const center = Math.max(wanted, right[row] + gap + half);
      if (!best || center - wanted < best.center - wanted - 1e-9) best = { row, center };
    }
    right[best.row] = best.center + half;
    return { ...e, tick, center: best.center, row: best.row, left: best.center - half, right: best.center + half };
  });
}

/**
 * Sketch geography in [lon, lat], traced from rough coordinates — enough to place the stations,
 * not a survey. A recipe names the layers it draws in `map`.
 */
export const GEOGRAPHY = {
  // The Yangtze from Yichang to below Anqing, past Huangzhou.
  yangtze: [[111.3, 30.7], [112.2, 30.3], [112.9, 29.6], [113.1, 29.4], [113.8, 30.1], [114.3, 30.6], [114.9, 30.45],
    [115.6, 29.9], [116.0, 29.7], [116.6, 30.2], [117.0, 30.5], [117.6, 30.9]],
  // The south China coast from the Beibu Gulf to the Fujian border, round the Leizhou peninsula.
  coast: [[108.0, 21.6], [108.6, 21.7], [109.2, 21.45], [109.8, 21.5], [110.0, 20.9], [110.2, 20.3], [110.5, 20.4],
    [110.4, 21.0], [111.0, 21.5], [111.8, 21.6], [112.5, 21.8], [113.2, 22.0], [113.6, 22.4], [113.9, 22.4],
    [114.3, 22.3], [114.9, 22.6], [115.6, 22.8], [116.5, 22.95], [117.2, 23.5], [117.6, 23.9]],
  // The Gan river from Poyang down to Ganzhou, and the Bei river from Shaoguan to Guangzhou.
  gan: [[116.2, 29.1], [115.9, 28.7], [115.8, 28.2], [115.4, 27.5], [115.0, 26.8], [114.9, 25.85]],
  beijiang: [[113.6, 24.8], [113.3, 24.3], [113.0, 23.7], [113.2, 23.1]],
  // Hainan island, closed.
  hainan: [[108.6, 19.1], [108.65, 18.6], [109.2, 18.25], [109.6, 18.2], [110.1, 18.35], [110.5, 18.8], [110.9, 19.5],
    [111.0, 19.9], [110.7, 20.1], [110.2, 20.05], [109.6, 20.0], [109.1, 19.75], [108.7, 19.4], [108.6, 19.1]],
  // Peaks drawn as small map glyphs: the Nanling range, Lushan, Luofu and Wuzhi.
  peaks: [[110.8, 25.5], [111.8, 25.3], [112.8, 25.2], [113.6, 25.1], [114.4, 25.2], [115.3, 25.1],
    [116.0, 29.55], [114.05, 23.27], [109.7, 18.9]],
};
