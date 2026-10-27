import { posterRandom, ridgeAt } from '/resources/core/poster-terrain.js';

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
export function mix(a, b, t) {
  const p = rgb(a), q = rgb(b);
  return '#' + p.map((v, i) => Math.round(v + (q[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
const rgba = (hex, alpha) => `rgba(${rgb(hex).join(',')},${alpha})`;

// Paints the landscape for one card. `terrain` comes from posterTerrain (already fitted
// around the text); `boxes` are the text blocks in canvas fractions, kept clear of trees.
export function paintPoster(canvas, card, terrain, boxes = []) {
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const rand = posterRandom(card.seed ^ 0x9e3779b9);
  const r = (a, b) => a + (b - a) * rand();
  const pick = list => list[Math.floor(rand() * list.length)];
  const { paper, ink, seal } = card.colors;
  const paint = card.paint;
  const dark = card.appearance === 'dark';
  const has = motif => card.motifs.includes(motif);
  const X = x => x * W, Y = y => y * H;
  const horizon = Y(terrain.horizon);
  const fadeTop = Y(0.85), fadeBottom = Y(0.9);
  const cover = card.layout === 'cover';
  const wind = terrain.main === 'left' ? 1 : -1;
  // Trunks and stems: ink on light paper; on dark paper a muted light so they do not glow.
  const stroke = dark ? mix(paper, paint.line, 0.55) : paint.line;
  // Mountains dissolve into mist. At night the mist is a shade brighter than the paper (moonlit haze).
  const mist = dark ? mix(paper, ink, 0.1) : paper;
  // Boat, hut and figures: ink by day; a muted light at night, so 泥金 stays a line colour.
  const figure = dark ? mix(paper, ink, 0.55) : paint.line;

  // ---- brush primitives ----
  function polyline(pts, ctx = g) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  }
  function bezier(p0, p1, p2, p3, n = 24) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      pts.push([
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
      ]);
    }
    return pts;
  }
  // A filled stroke whose width follows width(t), so lines start and end like a brush.
  function brush(pts, width, color, alpha = 1, ctx = g) {
    if (pts.length < 2) return;
    const left = [], right = [];
    pts.forEach(([x, y], i) => {
      const [x1, y1] = pts[Math.max(0, i - 1)], [x2, y2] = pts[Math.min(pts.length - 1, i + 1)];
      const len = Math.hypot(x2 - x1, y2 - y1) || 1;
      const w = width(i / (pts.length - 1)) / 2;
      left.push([x - (y2 - y1) / len * w, y + (x2 - x1) / len * w]);
      right.push([x + (y2 - y1) / len * w, y - (x2 - x1) / len * w]);
    });
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    polyline([...left, ...right.reverse()], ctx);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  const taper = (w0, w1 = 0) => t => (w0 + (w1 - w0) * t) * (0.7 + 0.3 * Math.sin(Math.PI * Math.min(1, t * 1.4)));
  const leaf = w => t => w * Math.sin(Math.PI * Math.pow(t, 0.8));
  function dot(x, y, rx, ry, angle, color, alpha) {
    g.save();
    g.globalAlpha = alpha;
    g.fillStyle = color;
    g.beginPath();
    g.ellipse(x, y, rx, ry, angle, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  // ---- paper ----
  function paperGrain() {
    const tile = document.createElement('canvas');
    tile.width = tile.height = 256;
    const tg = tile.getContext('2d');
    const image = tg.createImageData(256, 256);
    const [ir, ig, ib] = rgb(ink);
    for (let i = 0; i < image.data.length; i += 4) {
      const v = rand();
      image.data[i] = ir; image.data[i + 1] = ig; image.data[i + 2] = ib;
      image.data[i + 3] = v > 0.6 ? Math.floor((v - 0.6) * (dark ? 14 : 18)) : 0;
    }
    tg.putImageData(image, 0, 0);
    tg.strokeStyle = rgba(ink, dark ? 0.03 : 0.035);
    tg.lineWidth = 0.6;
    for (let i = 0; i < 26; i++) {
      const x = rand() * 256, y = rand() * 256, a = rand() * Math.PI;
      tg.beginPath();
      tg.moveTo(x, y);
      tg.quadraticCurveTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9 + 3, x + Math.cos(a) * 18, y + Math.sin(a) * 18);
      tg.stroke();
    }
    g.fillStyle = g.createPattern(tile, 'repeat');
    g.fillRect(0, 0, W, H);
  }

  // ---- sky ----
  function sunOrMoon() {
    const cx = X(terrain.anchors.sun.x), cy = Y(terrain.anchors.sun.y), rad = W * 0.05;
    g.save();
    if (has('moon')) {
      const glow = g.createRadialGradient(cx, cy, rad, cx, cy, rad * 3.6);
      const tone = dark ? ink : paint.far;
      glow.addColorStop(0, rgba(tone, dark ? 0.12 : 0.2));
      glow.addColorStop(1, rgba(tone, 0));
      g.fillStyle = glow;
      g.fillRect(cx - rad * 4, cy - rad * 4, rad * 8, rad * 8);
      // Light mode leaves the moon as blank paper inside a wash (烘云托月).
      g.fillStyle = dark ? mix(paper, ink, 0.86) : paper;
      g.beginPath();
      g.arc(cx, cy, rad, 0, Math.PI * 2);
      g.fill();
      if (!dark) {
        g.strokeStyle = rgba(paint.far, 0.25);
        g.lineWidth = 1;
        g.stroke();
      }
    } else if (has('sun')) {
      // Cinnabar, not a pink disc: solid at the heart, the edge bleeding into the paper.
      const sr = W * 0.035;
      const tone = mix(card.cinnabar.seal, card.cinnabar.secondary, 0.22);
      const disc = g.createRadialGradient(cx, cy, 0, cx, cy, sr * 1.12);
      disc.addColorStop(0, rgba(tone, dark ? 0.86 : 0.82));
      disc.addColorStop(0.62, rgba(tone, dark ? 0.8 : 0.74));
      disc.addColorStop(0.86, rgba(tone, 0.45));
      disc.addColorStop(1, rgba(tone, 0));
      g.fillStyle = disc;
      g.beginPath();
      g.arc(cx, cy, sr * 1.12, 0, Math.PI * 2);
      g.fill();
      for (let k = 0; k < 260; k++) {
        const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * sr * 0.9;
        g.globalAlpha = r(0.04, 0.12);
        g.fillStyle = rand() < 0.5 ? paper : mix(tone, ink, 0.3);
        g.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r(1, 2.5), r(1, 2));
      }
      g.globalAlpha = 1;
    }
    g.restore();
  }

  function birds() {
    const { x, y } = terrain.anchors.birds;
    const n = 3 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const bx = X(x) + i * r(18, 30) * wind, by = Y(y) + r(-14, 14) + i * r(-4, 6), s = r(5, 8);
      brush(bezier([bx - s, by - s * 0.3], [bx - s * 0.5, by - s * 0.7], [bx - 2, by - 1], [bx, by + 1], 8), taper(1.6, 0.4), paint.line, 0.6);
      brush(bezier([bx, by + 1], [bx + 2, by - 2], [bx + s * 0.5, by - s * 0.8], [bx + s, by - s * 0.5], 8), taper(1.6, 0.3), paint.line, 0.6);
    }
  }

  // ---- mountains ----
  const ridgeCache = new Map();
  function ridgePoints(range) {
    if (!ridgeCache.has(range)) {
      const pts = [];
      for (let x = -12; x <= W + 12; x += 3) pts.push([x, Y(ridgeAt(range, x / W))]);
      ridgeCache.set(range, pts);
    }
    return ridgeCache.get(range);
  }
  function rangeTones(range) {
    const d = range.depth;
    const far = d < 0.2;
    const strength = far ? (dark ? 0.42 : 0.34) : (dark ? 0.56 : 0.56) + d * (dark ? 0.38 : 0.44);
    return {
      crest: mix(paper, far ? paint.far : paint.top, strength),
      body: mix(paper, far ? paint.far : paint.body, strength * (far ? 0.6 : 0.55)),
      strength,
    };
  }
  function rangeShape(range, ctx = g) {
    const pts = ridgePoints(range);
    polyline([...pts, [W + 12, Y(range.base) + 4], [-12, Y(range.base) + 4]], ctx);
    ctx.closePath();
  }
  function fillRange(range, ctx = g) {
    const pts = ridgePoints(range);
    const { crest, body } = rangeTones(range);
    const top = Math.min(...pts.map(p => p[1])), base = Y(range.base);
    ctx.save();
    rangeShape(range, ctx);
    const grad = ctx.createLinearGradient(0, top, 0, base);
    grad.addColorStop(0, crest);
    grad.addColorStop(0.45, mix(crest, body, 0.4));
    grad.addColorStop(0.78, mix(body, mist, 0.5));
    grad.addColorStop(1, mist);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.clip();
    // Mineral grain settles just under the ridge, so the wash never looks airbrushed.
    if (ctx === g && range.depth > 0.2) {
      ctx.fillStyle = crest;
      for (let k = 0; k < 1400; k++) {
        const [x, y] = pts[Math.floor(rand() * pts.length)];
        if (base - y < 8) continue;
        ctx.globalAlpha = r(0.12, 0.4);
        const d = Math.abs(r(-1, 1) * r(0, 1)) * (base - y) * 0.7;
        ctx.fillRect(x + r(-3, 3), y + d, r(0.8, 2.2), r(0.8, 2));
      }
      ctx.globalAlpha = 1;
    }
    // Wash the crest: dense just under the ridge, thinning downward into mist.
    const bands = range.depth < 0.2 ? 10 : 22;
    for (let k = 0; k < bands; k++) {
      ctx.save();
      ctx.translate(0, k * 3.2);
      ctx.globalAlpha = (range.depth < 0.2 ? 0.26 : 0.34) * Math.pow(1 - k / bands, 1.4);
      ctx.strokeStyle = crest;
      ctx.lineWidth = 7;
      polyline(pts, ctx);
      ctx.stroke();
      ctx.restore();
    }
    // Keep the foot in mist all the way across.
    const foot = ctx.createLinearGradient(0, base - Y(0.06), 0, base);
    foot.addColorStop(0, rgba(mist, 0));
    foot.addColorStop(1, rgba(mist, 1));
    ctx.fillStyle = foot;
    ctx.fillRect(0, base - Y(0.06), W, Y(0.06) + 6);
    ctx.restore();
  }
  function textureRange(range) {
    const pts = ridgePoints(range);
    const base = Y(range.base);
    const near = range.depth;
    g.save();
    rangeShape(range);
    g.clip();
    // Hemp-fibre strokes falling from the ridge along the slope.
    const strokes = near < 0.2 ? 30 : 240;
    for (let i = 0; i < strokes; i++) {
      const j = Math.floor(rand() * pts.length);
      const [x, y] = pts[j];
      const height = (base - y) / H;
      if (height < 0.02) continue;
      const slope = (pts[Math.min(pts.length - 1, j + 2)][1] - pts[Math.max(0, j - 2)][1]) / 12;
      const side = Math.sign(slope) || 1;
      const len = r(0.3, 0.85) * (base - y) * 0.6;
      const sx = x + r(-4, 4), sy = y + r(3, 14);
      const ex = sx + side * len * r(0.25, 0.6), ey = sy + len;
      brush(bezier([sx, sy], [sx + side * len * 0.1, sy + len * 0.3], [ex - side * len * 0.1, ey - len * 0.35], [ex, ey], 14),
        taper(near < 0.2 ? 1 : r(0.9, 1.8), 0.2), paint.line, r(0.06, near < 0.2 ? 0.1 : 0.22));
    }
    g.restore();
    if (near < 0.2) return;
    // Contour, broken here and there like a lifted brush.
    // Only where there is a mountain: along the flat foot it would rule a line across the page.
    const raised = ([, y]) => base - y > H * 0.006;
    let i = 0;
    while (i < pts.length - 2) {
      if (!raised(pts[i])) { i++; continue; }
      const run = Math.floor(r(25, 110));
      let end = i;
      while (end < Math.min(pts.length, i + run) && raised(pts[end])) end++;
      const seg = pts.slice(i, end);
      const w = (near > 0.7 ? 2.6 : 2.1) * (dark ? 0.9 : 1);
      brush(seg, t => w * (0.45 + 0.55 * Math.sin(Math.PI * t)), paint.line, dark ? 0.62 : 0.7);
      i = end + (rand() < 0.3 ? Math.floor(r(1, 3)) : 0);
    }
    // Moss dots in a few clusters on the upper slopes, set back from the contour, with gaps between.
    const top = Math.max(...range.peaks.map(p => p.h));
    mossClusters(pts, base, top * 0.35, 3 + Math.floor(rand() * 5));
    // A stand of distant trees along one stretch of the ridge.
    const start = Math.floor(r(0.15, 0.7) * pts.length), span = Math.floor(r(15, 40));
    for (let j = start; j < Math.min(pts.length, start + span); j += 1 + Math.floor(rand() * 2)) {
      const [x, y] = pts[j];
      if ((base - y) / H < 0.03) continue;
      const h = r(5, 12);
      brush([[x, y + 3], [x + r(-1, 1), y - h]], taper(r(2.2, 3.4), 0.6), paint.line, r(0.35, 0.6));
    }
  }

  function ridgeYAt(pts, x) {
    return pts[Math.max(0, Math.min(pts.length - 1, Math.round((x + 12) / 3)))][1];
  }
  function mossClusters(pts, base, minHeight, clusters) {
    const alpha = () => (dark ? r(0.35, 0.6) : r(0.6, 0.9));
    for (let c = 0; c < clusters; c++) {
      let j = 0, tries = 0;
      do { j = Math.floor(rand() * pts.length); } while ((base - pts[j][1]) / H < minHeight && ++tries < 30);
      if (tries >= 30) continue;
      const cx = pts[j][0], spread = r(6, 20), drop = r(3, 16);
      const n = 2 + Math.floor(Math.pow(rand(), 1.5) * 8);
      for (let m = 0; m < n; m++) {
        const x = cx + (rand() + rand() - 1) * spread;
        const y = ridgeYAt(pts, x) + drop + (rand() + rand() - 1) * spread * 0.35;
        if (y < ridgeYAt(pts, x) + 1.5) continue;
        // Mostly round dots, some flat horizontal dabs.
        const flat = rand() < 0.35;
        dot(x, y, flat ? r(2.6, 4.6) : r(1.4, 3), flat ? r(0.9, 1.5) : r(1.2, 2.4), flat ? r(-0.15, 0.15) : r(0, Math.PI), paint.line, alpha());
      }
    }
  }

  // A thin layer of haze lying on the water line.
  function horizonMist() {
    const band = g.createLinearGradient(0, horizon - Y(0.035), 0, horizon + Y(0.045));
    band.addColorStop(0, rgba(mist, 0));
    band.addColorStop(0.45, rgba(mist, dark ? 0.75 : 0.5));
    band.addColorStop(1, rgba(mist, 0));
    g.fillStyle = band;
    g.fillRect(0, horizon - Y(0.035), W, Y(0.08));
  }

  // ---- water ----
  function waterClip() {
    g.beginPath();
    g.rect(0, horizon, W, H - horizon);
    g.clip();
  }
  function reflections() {
    const layer = document.createElement('canvas');
    layer.width = W; layer.height = H;
    const lg = layer.getContext('2d');
    terrain.ranges.filter(range => range.depth > 0.2).forEach(range => fillRange(range, lg));
    g.save();
    waterClip();
    g.globalAlpha = dark ? 0.3 : 0.22;
    g.setTransform(1, 0, 0, -0.62, 0, horizon * 1.62);
    g.drawImage(layer, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    // Fade the reflection away from the shore, then break it with water.
    const reach = Y(0.15);
    const fade = g.createLinearGradient(0, horizon, 0, horizon + reach);
    fade.addColorStop(0, rgba(paper, 0));
    fade.addColorStop(1, rgba(paper, 1));
    g.fillStyle = fade;
    g.fillRect(0, horizon, W, reach);
    g.fillStyle = paper;
    g.fillRect(0, horizon + reach, W, H);
    for (let y = horizon + 2; y < horizon + reach; y += r(3, 8)) {
      g.globalAlpha = r(0.5, 0.95);
      g.fillRect(r(-W * 0.2, W * 0.6), y, r(W * 0.2, W * 0.9), r(0.8, 1.8));
    }
    g.restore();
  }
  function ripples() {
    g.save();
    waterClip();
    const depth = fadeBottom - horizon;
    for (let i = 0; i < 200; i++) {
      const t = Math.pow(rand(), 1.6);
      const y = horizon + 4 + t * depth;
      const len = W * (0.01 + 0.07 * t) * r(0.5, 1.4);
      const x = r(-len, W);
      const lift = r(0.5, 1.8) * (1 + t * 2.5);
      const alpha = r(0.08, 0.22) * (y > fadeTop ? Math.max(0, 1 - (y - fadeTop) / (fadeBottom - fadeTop)) : 1);
      if (alpha <= 0.01) continue;
      brush(bezier([x, y], [x + len * 0.3, y - lift], [x + len * 0.6, y + lift * 0.4], [x + len, y], 10), taper(0.6 + t * 1.0, 0.3), paint.line, alpha);
    }
    if (has('moon')) {
      // Moonlight broken on the water under the moon.
      const mx = X(terrain.anchors.sun.x);
      for (let i = 0; i < 46; i++) {
        const t = Math.pow(rand(), 1.3);
        const y = horizon + 6 + t * (fadeTop - horizon);
        const half = W * (0.008 + 0.045 * t) * r(0.3, 1);
        g.globalAlpha = r(0.12, 0.34) * (1 - t * 0.5);
        g.fillStyle = dark ? ink : mix(paper, paint.far, 0.35);
        g.fillRect(mx - half + r(-8, 8) * (1 + t * 4), y, half * 2, r(1, 2.2));
      }
    }
    g.restore();
  }
  // A flat spit of sand from one side: a light wash, a brushed edge, a few dots and ripples at its tip.
  function spit(s) {
    const y = Y(s.y), th = Math.max(3, Y(s.thick));
    const dir = s.side === 'left' ? 1 : -1;
    const x0 = s.side === 'left' ? -20 : W + 20, x1 = s.side === 'left' ? X(s.reach) : W - X(s.reach);
    const top = [];
    for (let k = 0; k <= 40; k++) {
      const t = k / 40, x = x0 + (x1 - x0) * t;
      top.push([x, y - th * (1 - Math.pow(t, 2.2)) - th * 0.6 * Math.sin(Math.PI * t * 2.2) * (1 - t) + r(-0.4, 0.4)]);
    }
    g.save();
    const grad = g.createLinearGradient(0, y - th * 1.6, 0, y + 3);
    grad.addColorStop(0, mix(paper, paint.top, dark ? 0.4 : 0.32));
    grad.addColorStop(1, mix(paper, paint.body, dark ? 0.22 : 0.18));
    g.fillStyle = grad;
    polyline([...top, [x1, y + 2], [x0, y + 2]]);
    g.closePath();
    g.fill();
    g.restore();
    brush(top, t => (1.2 + th * 0.12) * (0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.1))) + 0.3, paint.line, 0.6);
    brush([[x0, y + 1.5], [x1 + dir * 6, y + 1.5]], taper(0.9, 0.4), paint.line, 0.28);
    for (let k = 0; k < 7; k++) {
      const [x, ty] = top[Math.floor(r(0.05, 0.75) * top.length)];
      dot(x, ty + 1, r(1.2, 2.4), r(0.9, 1.5), 0, paint.line, r(0.5, 0.8));
    }
    for (let k = 0; k < 4; k++) {
      const xx = x1 + dir * r(-30, 40), yy = y + r(4, 6 + th * 2);
      brush([[xx, yy], [xx + dir * r(20, 60), yy]], taper(0.9, 0.2), paint.line, 0.22);
    }
    return { x0, x1, y, side: s.side };
  }

  // ---- foreground bank ----
  let bankTop = null;
  function bank() {
    const b = terrain.bank;
    const left = b.side === 'left';
    const reach = X(b.reach), top = Y(b.top), water = Y(0.885);
    const pts = [];
    for (let k = 0; k <= 60; k++) {
      const t = k / 60;
      const x = left ? t * reach : W - t * reach;
      const n = b.noise[k % b.noise.length];
      const y = top + (water - top) * Math.pow(t, 1.8) - Y(b.swell) * Math.sin(Math.PI * Math.min(1, t * 1.3)) * (1 - t) + n * 3;
      pts.push([left ? x - 14 * (1 - t) : x + 14 * (1 - t), y]);
    }
    bankTop = x => {
      const t = Math.min(1, Math.max(0, left ? x / reach : (W - x) / reach));
      return pts[Math.round(t * 60)][1];
    };
    const outline = [...pts, [pts.at(-1)[0], H + 10], [left ? -20 : W + 20, H + 10]];
    const crest = mix(paper, paint.top, dark ? 0.82 : 0.9);
    const body = mix(paper, paint.body, dark ? 0.4 : 0.32);
    g.save();
    polyline(outline);
    g.closePath();
    const grad = g.createLinearGradient(0, top - Y(0.02), 0, fadeBottom);
    grad.addColorStop(0, crest);
    grad.addColorStop(0.3, mix(crest, body, 0.55));
    grad.addColorStop(0.65, mix(body, paper, 0.55));
    grad.addColorStop(1, paper);
    g.fillStyle = grad;
    g.fill();
    g.clip();
    for (let k = 0; k < 18; k++) {
      g.save();
      g.translate(0, k * 3);
      g.globalAlpha = 0.22 * (1 - k / 18);
      g.strokeStyle = crest;
      g.lineWidth = 7;
      polyline(pts);
      g.stroke();
      g.restore();
    }
    // Boulders: a second and third contour inside the slope, each with strokes hanging from it.
    for (let j = 1; j <= 2; j++) {
      const a = Math.floor(r(0.05, 0.35) * pts.length), b = Math.min(pts.length - 1, a + Math.floor(r(0.3, 0.55) * pts.length));
      const drop = j * r(26, 40);
      const rock = pts.slice(a, b + 1).map(([x, y], i, all) => [x, y + drop * Math.sin(Math.PI * (0.25 + 0.75 * i / all.length))]);
      brush(rock, t => 2.2 * (0.4 + 0.6 * Math.sin(Math.PI * t)), paint.line, 0.5);
      for (let k = 0; k < 14; k++) {
        const [x, y] = rock[Math.floor(rand() * rock.length)];
        const len = r(14, 40), dir = (left ? 1 : -1) * r(0.2, 0.6);
        brush([[x, y + 2], [x + dir * len, y + len]], taper(r(1, 1.8), 0.2), paint.line, r(0.18, 0.32));
      }
    }
    for (let k = 0; k < 16; k++) {
      const [x, y] = pts[Math.floor(r(0.02, 0.9) * pts.length)];
      const len = r(16, 46), dir = (left ? 1 : -1) * r(0.1, 0.5);
      brush([[x, y + 3], [x + dir * len, y + len]], taper(r(1, 1.8), 0.2), paint.line, r(0.16, 0.3));
    }
    g.restore();
    let i = 0;
    while (i < pts.length - 2) {
      const run = Math.floor(r(10, 30));
      brush(pts.slice(i, i + run), t => 3 * (0.5 + 0.5 * Math.sin(Math.PI * t)), paint.line, 0.78);
      i += run - 1;
    }
    mossClusters(pts, Y(1), 0, 3 + Math.floor(rand() * 3));
    const tip = pts.at(-1);
    for (let k = 0; k < 6; k++) {
      const y = tip[1] + r(4, 22);
      const x = tip[0] + (left ? 1 : -1) * r(4, 50);
      brush([[x, y], [x + (left ? 1 : -1) * r(20, 70), y + r(-1, 1)]], taper(1.1, 0.2), paint.line, 0.3);
    }
    return { pts, left, reach, tip };
  }

  // ---- motifs ----
  // Highest point a tree may reach at x without entering the text.
  function ceilingAt(x) {
    let limit = 0;
    for (const box of boxes) if (x >= X(box.x0) - 40 && x <= X(box.x1) + 40) limit = Math.max(limit, Y(box.y1) + 36);
    return limit;
  }
  // 松针: wheels of short needles opening upward, gathered into clumps with dense hearts and loose edges.
  function needleWheel(cx, cy, len, color) {
    const n = 18 + Math.floor(rand() * 9);
    const from = Math.PI * r(0.9, 1.0), to = Math.PI * r(2.0, 2.1);
    for (let k = 0; k < n; k++) {
      const a = from + (to - from) * k / (n - 1) + r(-0.04, 0.04);
      const l = len * r(0.75, 1.05);
      const c = Math.cos(a), s = Math.sin(a) * 0.7;
      brush([[cx + c * l * 0.12, cy + s * l * 0.12], [cx + c * l, cy + s * l]], taper(1.5, 0.35), color, r(0.75, 0.95));
    }
  }
  function needleClump(cx, cy, size, color) {
    const wheels = 4 + Math.floor(rand() * 5);
    for (let k = 0; k < wheels; k++) {
      const u = (rand() + rand() - 1), v = (rand() + rand() - 1);
      needleWheel(cx + u * size * 0.55, cy + v * size * 0.16, size * r(0.2, 0.3) * (1 - Math.abs(u) * 0.35), color);
    }
  }
  function pine(x, y, h) {
    h = Math.min(h, y - ceilingAt(x));
    if (h < 70) return;
    // The trunk turns twice rather than curving smoothly.
    const sway = (rand() < 0.5 ? -1 : 1) * h * r(0.08, 0.16);
    const knots = [[x, y], [x + sway * r(-0.7, -0.1), y - h * r(0.3, 0.38)], [x + sway * r(0.7, 1.2), y - h * r(0.6, 0.68)], [x + sway * r(0.1, 0.6), y - h * 0.95]];
    const trunk = [];
    for (let i = 0; i < knots.length - 1; i++) {
      const [ax, ay] = knots[i], [bx, by] = knots[i + 1];
      const seg = bezier([ax, ay], [ax + (bx - ax) * 0.2, ay + (by - ay) * 0.4], [ax + (bx - ax) * 0.75, ay + (by - ay) * 0.7], [bx, by], 12);
      trunk.push(...(i ? seg.slice(1) : seg));
    }
    const width = t => h * (0.05 - 0.032 * t);
    const left = [], right = [];
    trunk.forEach(([px, py], i) => {
      const [x1, y1] = trunk[Math.max(0, i - 1)], [x2, y2] = trunk[Math.min(trunk.length - 1, i + 1)];
      const len = Math.hypot(x2 - x1, y2 - y1) || 1, w = width(i / (trunk.length - 1)) / 2;
      left.push([px - (y2 - y1) / len * w, py + (x2 - x1) / len * w]);
      right.push([px + (y2 - y1) / len * w, py - (x2 - x1) / len * w]);
    });
    const bark = dark ? mix(paper, ink, 0.2) : mix(paper, paint.body, 0.26);
    const edge = dark ? (card.palette === 'qingdai' ? paint.line : mix(paper, paint.line, 0.7)) : paint.line;
    g.save();
    g.fillStyle = bark;
    polyline([...left, ...right.slice().reverse()]);
    g.closePath();
    g.fill();
    g.restore();
    brush(left, t => 2.4 * (0.6 + 0.4 * Math.sin(Math.PI * t)) + 0.4, edge, dark ? 0.6 : 0.9);
    brush(right, t => 1.8 * (0.6 + 0.4 * Math.sin(Math.PI * t)) + 0.4, edge, dark ? 0.5 : 0.85);
    // Shade one side of the trunk, then scatter 鳞皴 scales: small open ovals, not a pattern.
    const shade = right.map(([rx, ry], i) => [rx + (left[i][0] - rx) * 0.3, ry + (left[i][1] - ry) * 0.3]);
    brush(shade, t => width(t) * 0.45, dark ? mix(paper, ink, 0.1) : mix(paper, paint.body, 0.5), dark ? 0.6 : 0.45);
    for (let k = 0; k < Math.floor(h / 9); k++) {
      const i = Math.floor(r(0.04, 0.85) * (left.length - 1));
      const [lx, ly] = left[i], [rx, ry] = right[i];
      const u = r(0.25, 0.75), w = Math.hypot(rx - lx, ry - ly);
      const angle = Math.atan2(ry - ly, rx - lx);
      g.save();
      g.strokeStyle = rgba(edge, dark ? 0.4 : 0.55);
      g.lineWidth = r(0.8, 1.3);
      g.beginPath();
      g.ellipse(lx + (rx - lx) * u, ly + (ry - ly) * u, w * r(0.12, 0.2), w * r(0.06, 0.1), angle + r(-0.3, 0.3), r(0, 1), Math.PI * r(1.2, 1.9));
      g.stroke();
      g.restore();
    }
    const needles = dark ? mix(paint.top, ink, 0.45) : mix(paint.top, paint.line, 0.6);
    const limb = dark ? mix(paper, ink, 0.38) : stroke;
    const branches = 4 + Math.floor(rand() * 3);
    for (let k = 0; k < branches; k++) {
      const at = 0.46 + (k / branches) * 0.44 + r(-0.03, 0.03);
      const [bx, by] = trunk[Math.floor(at * (trunk.length - 1))];
      const dir = (k % 2 ? 1 : -1) * (rand() < 0.15 ? -1 : 1);
      const len = h * r(0.2, 0.34) * (1.15 - at * 0.55);
      // Out and slightly down, then a turn upward (蟹爪).
      const elbow = [bx + dir * len * r(0.45, 0.6), by + h * r(0.01, 0.04)];
      const end = [elbow[0] + dir * len * r(0.4, 0.55), elbow[1] - h * r(0.03, 0.07)];
      brush([[bx, by], [(bx + elbow[0]) / 2, (by + elbow[1]) / 2 + 2], elbow], taper(h * 0.017, h * 0.011), limb, 0.9);
      brush([elbow, [(elbow[0] + end[0]) / 2, (elbow[1] + end[1]) / 2 - 1], end], taper(h * 0.011, h * 0.004), limb, 0.9);
      needleClump(end[0] - dir * len * 0.08, end[1] - h * 0.01, len * r(0.75, 1.0), needles);
      if (rand() < 0.6) needleClump(elbow[0], elbow[1] - h * 0.02, len * r(0.45, 0.6), needles);
    }
    const [tx, ty] = trunk.at(-1);
    needleClump(tx, ty - h * 0.01, h * r(0.22, 0.3), needles);
  }
  function maple(x, y, h) {
    h = Math.min(h, y - ceilingAt(x));
    if (h < 50) return;
    const trunk = bezier([x, y], [x - h * 0.05, y - h * 0.3], [x + h * 0.06, y - h * 0.5], [x + r(-0.05, 0.05) * h, y - h * 0.72], 20);
    brush(trunk, taper(h * 0.05, h * 0.012), stroke, 0.9);
    const ends = [];
    for (let k = 0; k < 5; k++) {
      const [bx, by] = trunk[Math.floor(r(0.35, 0.95) * (trunk.length - 1))];
      const a = -Math.PI / 2 + r(-1.1, 1.1);
      const len = h * r(0.18, 0.32);
      const end = [bx + Math.cos(a) * len, by + Math.sin(a) * len];
      brush(bezier([bx, by], [bx + Math.cos(a) * len * 0.3, by + Math.sin(a) * len * 0.5 + 4], [end[0], end[1] + 6], end, 10), taper(h * 0.016, h * 0.003), stroke, 0.8);
      ends.push(end);
    }
    const leaves = [paint.point, mix(paint.point, paint.line, 0.25), mix(paint.point, paper, 0.25)];
    for (const [ex, ey] of ends) {
      for (let k = 0; k < 34; k++) {
        const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * h * 0.13;
        dot(ex + Math.cos(a) * d, ey + Math.sin(a) * d * 0.7, r(2.2, 4.6), r(1.6, 3.2), r(0, Math.PI), pick(leaves), r(0.5, 0.85));
      }
    }
  }
  function reeds(x, y, count, h) {
    const plume = dark ? mix(paper, ink, 0.8) : mix(paper, paint.line, 0.4);
    h = Math.min(h, y - ceilingAt(x));
    for (let i = 0; i < count; i++) {
      const bx = x + r(-0.07, 0.07) * W, by = y + r(-6, 10);
      const hh = h * r(0.45, 1.05), lean = wind * hh * r(0.04, 0.2);
      const tip = [bx + lean, by - hh];
      const stemPts = bezier([bx, by], [bx + lean * 0.05, by - hh * 0.4], [tip[0] - lean * 0.3, tip[1] + hh * 0.25], tip, 18);
      brush(stemPts, taper(r(1.4, 2.2), 0.5), stroke, 0.85);
      // Blades leave the stem upward, then bow out; never a drooping fan.
      const blades = rand() < 0.35 ? 0 : 1 + Math.floor(rand() * 2);
      for (let k = 0; k < blades; k++) {
        const at = r(0.1, 0.45);
        const [lx, ly] = stemPts[Math.floor(at * (stemPts.length - 1))];
        const dir = rand() < 0.7 ? wind : -wind;
        const len = hh * r(0.22, 0.38);
        const bend = r(0.15, 0.5);
        brush(bezier([lx, ly], [lx + dir * len * 0.15, ly - len * 0.5], [lx + dir * len * 0.45, ly - len * 0.85], [lx + dir * len * (0.55 + bend * 0.6), ly - len * (0.8 - bend)], 16), leaf(r(2.6, 4.2)), stroke, 0.78);
      }
      // A soft, drooping panicle of fine hairs.
      const len = hh * r(0.14, 0.22);
      const spine = bezier(tip, [tip[0] + wind * len * 0.35, tip[1] - len * 0.2], [tip[0] + wind * len * 0.75, tip[1] + len * 0.05], [tip[0] + wind * len, tip[1] + len * r(0.35, 0.6)], 22);
      brush(spine, taper(1.2, 0.3), stroke, 0.6);
      for (const [k, [px, py]] of spine.entries()) {
        const t = k / spine.length, spread = (0.3 + Math.sin(Math.PI * Math.min(1, t * 1.15))) * len * 0.2;
        for (let m = 0; m < 5; m++) {
          const a = r(-1.2, 1.2);
          brush([[px, py], [px + wind * spread * 0.5 + Math.sin(a) * spread, py + Math.cos(a) * spread * 0.5 + spread * 0.3]], taper(1.3, 0.2), plume, r(0.45, 0.8));
        }
      }
    }
  }
  function cottage(x, y, s) {
    g.save();
    g.translate(x, y);
    g.scale(s, s);
    g.fillStyle = paper;
    g.fillRect(-36, -30, 64, 30);
    g.strokeStyle = figure;
    g.lineWidth = 1.6;
    g.strokeRect(-36, -30, 64, 30);
    g.restore();
    const roof = [[x - 50 * s, y - 28 * s], [x - 20 * s, y - 58 * s], [x + 22 * s, y - 60 * s], [x + 42 * s, y - 28 * s]];
    g.save();
    g.fillStyle = mix(paper, paint.body, 0.55);
    polyline(roof);
    g.closePath();
    g.fill();
    g.restore();
    brush(roof, taper(2.4, 1.4), figure, 0.85);
    for (let k = 0; k < 12; k++) {
      const t = k / 11, tx = x + (-22 + 44 * t) * s, bx = x + (-46 + 86 * t) * s;
      brush([[tx, y - 58 * s], [bx, y - 30 * s]], taper(0.9, 0.3), figure, 0.35);
    }
    g.save();
    g.fillStyle = rgba(figure, 0.75);
    g.fillRect(x - 6 * s, y - 22 * s, 11 * s, 22 * s);
    g.fillRect(x - 28 * s, y - 22 * s, 12 * s, 9 * s);
    g.restore();
  }
  function heron(x, y, s) {
    const fill = dark ? mix(paper, ink, 0.85) : paper;
    g.save();
    g.translate(x, y);
    g.scale(s * -wind, s);
    g.strokeStyle = paint.line;
    g.lineWidth = 1.3;
    g.beginPath(); g.moveTo(2, 4); g.lineTo(0, 30); g.moveTo(8, 4); g.lineTo(11, 30); g.stroke();
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(-20, -2);
    g.quadraticCurveTo(-4, -14, 14, -6);
    g.quadraticCurveTo(10, 8, -6, 6);
    g.closePath();
    g.fill(); g.stroke();
    g.lineWidth = 4;
    g.strokeStyle = fill;
    g.beginPath(); g.moveTo(12, -6); g.bezierCurveTo(24, -12, 10, -24, 20, -32); g.stroke();
    g.lineWidth = 1.2;
    g.strokeStyle = paint.line;
    g.beginPath(); g.moveTo(14, -5); g.bezierCurveTo(26, -12, 13, -24, 22, -33); g.stroke();
    g.beginPath(); g.moveTo(22, -33); g.lineTo(36, -30); g.stroke();
    g.restore();
  }
  function boat(x, y, s) {
    const hull = bezier([x - 46 * s, y - 6 * s], [x - 20 * s, y + 8 * s], [x + 22 * s, y + 8 * s], [x + 48 * s, y - 9 * s], 18);
    brush(hull, t => 7 * s * Math.sin(Math.PI * t) + 1, figure, 0.9);
    // A fisherman in a straw hat, with a rod over the water.
    g.save();
    g.fillStyle = figure;
    g.globalAlpha = 0.9;
    g.beginPath();
    g.moveTo(x - 4 * s, y - 3 * s); g.lineTo(x - 1 * s, y - 18 * s); g.lineTo(x + 9 * s, y - 18 * s); g.lineTo(x + 11 * s, y - 3 * s);
    g.closePath(); g.fill();
    g.beginPath();
    g.moveTo(x - 9 * s, y - 18 * s); g.quadraticCurveTo(x + 4 * s, y - 29 * s, x + 18 * s, y - 18 * s);
    g.closePath(); g.fill();
    g.restore();
    const dir = wind;
    brush([[x + 6 * s, y - 10 * s], [x + dir * 40 * s, y - 34 * s], [x + dir * 76 * s, y - 48 * s]], taper(1.4, 0.4), figure, 0.8);
    g.save();
    g.strokeStyle = rgba(figure, 0.4);
    g.lineWidth = 0.7;
    g.beginPath(); g.moveTo(x + dir * 76 * s, y - 48 * s); g.lineTo(x + dir * 80 * s, y + 10 * s); g.stroke();
    g.restore();
    for (let k = 0; k < 5; k++) {
      const yy = y + (8 + k * 4) * s, half = (40 - k * 6) * s * r(0.6, 1);
      brush([[x - half + r(-4, 4), yy], [x + half, yy]], taper(1.4, 0.3), figure, 0.22 - k * 0.03);
    }
  }
  // The old fort sits on the flattest high stretch of the massif: a low wall and one gate tower.
  function fortress() {
    const mid = terrain.ranges.find(range => range.depth > 0.4 && range.depth < 0.6);
    if (!mid) return;
    const base = Y(mid.base);
    const span = Math.min(X(terrain.anchors.fortress.span), 130);
    // Prefer a high, gentle stretch; judge slope over ~15px so rock-sized breaks do not count.
    let best = null;
    for (let x0 = X(0.04); x0 + span < X(0.96); x0 += 6) {
      const pts = [];
      for (let x = x0; x <= x0 + span; x += 3) pts.push([x, Y(ridgeAt(mid, x / W))]);
      const height = base - Math.max(...pts.map(p => p[1]));
      if (height < H * 0.012) continue;
      const steep = Math.max(...pts.slice(5).map((p, i) => Math.abs(p[1] - pts[i][1]) / 15));
      const inText = boxes.some(box => Y(box.y1) + 40 > Math.min(...pts.map(p => p[1])) - 40 && x0 + span > X(box.x0) && x0 < X(box.x1));
      if (inText) continue;
      const score = height / H * 4 - steep;
      if (!best || score > best.score) best = { pts, score };
    }
    if (!best) return;
    const wallTone = mix(paper, paint.body, dark ? 0.45 : 0.32);
    const foot = best.pts.map(([x, y]) => [x, y + 7]);
    const top = foot.map(([x, y]) => [x, y - 10]);
    g.save();
    g.fillStyle = wallTone;
    polyline([...top, ...foot.slice().reverse()]);
    g.closePath();
    g.fill();
    g.restore();
    brush(top, taper(1.6, 1.2), paint.line, 0.75);
    brush(foot, taper(1, 0.8), paint.line, 0.35);
    for (let k = 2; k < top.length - 2; k += 3) brush([[top[k][0], top[k][1]], [top[k][0], top[k][1] - 4]], taper(3, 3), paint.line, 0.7);
    const [tx, ty] = top[Math.floor(top.length * r(0.3, 0.7))];
    g.save();
    g.fillStyle = wallTone;
    g.fillRect(tx - 13, ty - 16, 26, 17);
    g.restore();
    brush([[tx - 13, ty], [tx - 13, ty - 16], [tx + 13, ty - 16], [tx + 13, ty]], taper(1.3, 1.1), paint.line, 0.7);
    brush([[tx - 3, ty], [tx - 3, ty - 8], [tx + 3, ty - 8], [tx + 3, ty]], taper(1, 1), paint.line, 0.6);
    // Pavilion roof with lifted eaves.
    brush(bezier([tx - 24, ty - 20], [tx - 12, ty - 22], [tx - 6, ty - 30], [tx, ty - 33], 10), taper(2.6, 1.6), paint.line, 0.85);
    brush(bezier([tx, ty - 33], [tx + 6, ty - 30], [tx + 12, ty - 22], [tx + 24, ty - 20], 10), taper(1.6, 2.6), paint.line, 0.85);
    brush([[tx - 9, ty - 23], [tx - 9, ty - 16]], taper(1.4, 1.4), paint.line, 0.7);
    brush([[tx + 9, ty - 23], [tx + 9, ty - 16]], taper(1.4, 1.4), paint.line, 0.7);
  }

  // ---- compose ----
  g.fillStyle = paper;
  g.fillRect(0, 0, W, H);
  sunOrMoon();
  if (has('sun') && rand() < 0.7) birds();
  const [far, ...front] = terrain.ranges;
  fillRange(far);
  textureRange(far);
  for (const range of front) {
    fillRange(range);
    textureRange(range);
  }
  if (has('fortress')) fortress();
  reflections();
  ripples();
  horizonMist();
  const spits = terrain.spits.map(spit);
  const shore = bank();

  const along = t => {
    const x = shore.left ? t * shore.reach : W - t * shore.reach;
    return [x, bankTop(x)];
  };
  const big = cover ? 1.25 : 1;
  let slot = terrain.anchors.trees;
  if (has('cottage')) {
    const [cx, cy] = along(0.22 + slot * 0.2);
    cottage(cx, cy + 4, 1.05);
    slot = slot > 0.5 ? 0.25 : 0.65;
  }
  if (has('pine')) {
    const [px, py] = along(0.25 + slot * 0.35);
    pine(px, py + 6, Y(0.25) * big);
    if (rand() < 0.5) {
      const t = 0.25 + slot * 0.35;
      const [qx, qy] = along(t > 0.5 ? t - 0.3 : t + 0.3);
      pine(qx, qy + 6, Y(0.16) * big);
    }
  }
  if (has('maple')) {
    const [mx, my] = along(has('pine') ? 0.12 + (1 - slot) * 0.2 : 0.3 + slot * 0.3);
    maple(mx, my + 6, Y(0.17) * big);
  }
  if (has('reeds')) {
    const [rx, ry] = along(0.88);
    reeds(rx, ry + 10, cover ? 16 : 11, Y(cover ? 0.24 : 0.17));
    const near = spits.at(-1);
    if (near) reeds(near.x1 - (near.side === 'left' ? 1 : -1) * W * 0.1, near.y + 3, cover ? 10 : 7, Y(cover ? 0.11 : 0.08) * (0.6 + (near.y / H - terrain.horizon) * 3));
  }
  if (has('heron')) heron(shore.tip[0] + (shore.left ? 1 : -1) * W * 0.05, shore.tip[1] - 8, 1.2);
  if (has('boat')) {
    const { x, y } = terrain.anchors.boat;
    // Keep the boat off any spit at its depth.
    let bx = X(x);
    const clear = shore.left ? shore.reach + 140 : W - shore.reach - 140;
    if (y > 0.8) bx = shore.left ? Math.max(bx, clear) : Math.min(bx, clear);
    for (const s of spits) {
      if (Math.abs(s.y - Y(y)) > Y(0.03)) continue;
      bx = s.side === 'left' ? Math.max(bx, s.x1 + 110) : Math.min(bx, s.x1 - 110);
    }
    const t = (y - terrain.horizon) / (0.9 - terrain.horizon);
    boat(bx, Y(y), 0.6 + t * 0.7);
  }

  // Dissolve the painting into blank paper above the footer.
  const fade = g.createLinearGradient(0, fadeTop, 0, fadeBottom);
  fade.addColorStop(0, rgba(paper, 0));
  fade.addColorStop(1, rgba(paper, 1));
  g.fillStyle = fade;
  g.fillRect(0, fadeTop, W, fadeBottom - fadeTop);
  g.fillStyle = paper;
  g.fillRect(0, fadeBottom, W, H - fadeBottom);
  paperGrain();
}
