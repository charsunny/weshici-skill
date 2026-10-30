// Seed → terrain for the poetry poster. Pure data in fractions of the canvas
// (x of width, y of height) so the same parameters can drive the App's share poster.

export function posterRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Where the water line sits and how high the tallest ridge may climb, per layout.
// Text always owns the top of the page; the painting gives way to it.
const FRAMES = {
  horizontal: { horizon: [0.68, 0.73], mainHeight: [0.14, 0.21] },
  hero: { horizon: [0.69, 0.74], mainHeight: [0.13, 0.20] },
  cover: { horizon: [0.66, 0.72], mainHeight: [0.16, 0.24] },
  vertical: { horizon: [0.73, 0.78], mainHeight: [0.27, 0.37] },
};

const round = value => Math.round(value * 10000) / 10000;

function noiseTable(rand, n = 48) {
  return Array.from({ length: n }, () => round(rand() * 2 - 1));
}

function peak(rand, x, h, spread, lean = 0) {
  return {
    x: round(x), h: round(h),
    wl: round(spread * (0.75 + rand() * 0.6) * (1 + lean)),
    wr: round(spread * (0.75 + rand() * 0.6) * (1 - lean)),
    k: round(0.2 + rand() * 0.6),
  };
}

// A summit never stands alone: give it lower shoulders so the massif reads as 山 rather than a cone.
function cluster(rand, x, h, spread, lean) {
  const peaks = [peak(rand, x, h, spread, lean)];
  const n = 1 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1;
    peaks.push(peak(rand, x + side * spread * (0.35 + rand() * 0.4), h * (0.5 + rand() * 0.32), spread * (0.35 + rand() * 0.3), lean));
  }
  return peaks;
}

// `sky` (optional) is the lowest edge of the text block; the main summit then rises to just below it.
export function posterTerrain(seed, layout = 'horizontal', sky = null) {
  const frame = FRAMES[layout] || FRAMES.horizontal;
  const rand = posterRandom(seed);
  const r = (a, b) => a + (b - a) * rand();
  const horizon = round(r(...frame.horizon));
  // Vertical text stands on the right, so its mountain always leans left.
  const main = layout === 'vertical' ? 'left' : rand() < 0.5 ? 'left' : 'right';
  const toMain = x => (main === 'left' ? x : 1 - x);
  const lean = r(-0.35, 0.35);

  // Far range: low, full width, a few soft peaks.
  const farPeaks = [];
  const farCount = 3 + Math.floor(rand() * 4);
  for (let i = 0; i < farCount; i++) {
    const x = (i + 0.2 + rand() * 0.6) / farCount;
    farPeaks.push(peak(rand, x, r(0.035, 0.09), r(0.1, 0.2)));
  }
  const far = { depth: 0, base: horizon, peaks: farPeaks, noise: noiseTable(rand), rough: round(r(0.005, 0.01)) };

  // Middle range: the main massif on one side; its tallest summit is the painting's anchor.
  const reachSky = sky == null ? null : Math.min(0.32, Math.max(frame.mainHeight[0], horizon - sky));
  const mainHeight = reachSky == null ? r(...frame.mainHeight) : reachSky * r(0.86, 1);
  const mainX = layout === 'vertical' ? r(0.16, 0.32) : r(0.14, 0.42);
  const reach = layout === 'vertical' ? r(0.5, 0.62) : r(0.5, 0.8);
  const spread = layout === 'vertical' ? r(0.2, 0.28) : r(0.15, 0.26);
  const midPeaks = cluster(rand, toMain(mainX), mainHeight, spread, main === 'left' ? lean : -lean);
  const shoulders = Math.floor(rand() * 3);
  for (let i = 0; i < shoulders; i++) {
    const x = mainX + spread + (i + 0.5) * (reach - mainX - spread) / Math.max(1, shoulders) + r(-0.03, 0.03);
    midPeaks.push(peak(rand, toMain(x), mainHeight * r(0.22, 0.5), r(0.07, 0.14)));
  }
  const mid = { depth: 0.5, base: round(horizon + 0.004), peaks: midPeaks, noise: noiseTable(rand), rough: round(r(0.014, 0.024)) };

  // A lower fold in front of the massif, so ridges overlap with mist between them.
  const foldPeaks = midPeaks.filter(() => rand() < 0.7).map(p => ({
    ...peak(rand, p.x + r(-0.1, 0.1), p.h * r(0.35, 0.6), (p.wl + p.wr) / 2 * r(0.5, 0.85)),
  }));
  const fold = foldPeaks.length ? { depth: 0.68, base: round(horizon + 0.006), peaks: foldPeaks, noise: noiseTable(rand), rough: round(r(0.012, 0.02)) } : null;

  // An answering hill on the far side, lower and nearer.
  const counterReach = r(0.16, 0.34);
  const counter = rand() < 0.7 ? {
    depth: 0.8, base: round(horizon + 0.008),
    peaks: cluster(rand, toMain(1 - counterReach * r(0.3, 0.6)), mainHeight * r(0.18, 0.36), counterReach * r(0.5, 0.8), 0),
    noise: noiseTable(rand), rough: round(r(0.006, 0.012)),
  } : null;

  // Foreground bank: a slope rising from one bottom corner, opposite the main massif by default.
  const bankSide = layout === 'vertical' ? (rand() < 0.6 ? 'left' : 'right') : rand() < 0.72 ? (main === 'left' ? 'right' : 'left') : main;
  const bank = {
    side: bankSide,
    top: round(r(0.78, 0.84)),
    reach: round(r(0.30, 0.48)),
    swell: round(r(0.015, 0.04)),
    noise: noiseTable(rand),
  };

  // Low spits of sand from alternating sides. They zigzag the water back to the horizon,
  // so it narrows with distance without any line pointing at the viewer.
  const spits = [];
  const count = 1 + Math.floor(rand() * 3);
  let side = bankSide === 'left' ? 'right' : 'left';
  for (let i = 0; i < count; i++) {
    const t = (i + 0.4 + rand() * 0.4) / (count + 0.6);
    const y = horizon + 0.02 + t * (bank.top - horizon - 0.035);
    spits.push({ side, y: round(y), reach: round(r(0.18, 0.42) * (0.6 + t * 0.6)), thick: round(0.004 + t * 0.012) });
    side = side === 'left' ? 'right' : 'left';
  }

  const sunSide = main === 'left' ? r(0.62, 0.84) : r(0.16, 0.38);
  const anchors = {
    sun: layout === 'vertical'
      ? { x: round(r(0.40, 0.52)), y: round(r(0.10, 0.16)) }
      : { x: round(sunSide), y: round(horizon - r(0.10, 0.15)) },
    boat: { x: round(r(0.3, 0.7)), y: round(horizon + r(0.04, 0.1)) },
    birds: { x: round(r(0.25, 0.7)), y: round(horizon - r(0.16, 0.22)) },
    fortress: { from: round(r(0.12, 0.3)), span: round(r(0.14, 0.22)) },
    trees: round(r(0.25, 0.75)),
  };

  return { seed: seed >>> 0, layout, horizon, main, ranges: [far, mid, fold, counter].filter(Boolean), spits, bank, anchors };
}

function noiseAt(table, x, scale) {
  const n = table.length;
  const p = ((x * scale) % n + n) % n;
  const i = Math.floor(p), t = p - i;
  const a = table[i % n], b = table[(i + 1) % n];
  const s = t * t * (3 - 2 * t);
  return a + (b - a) * s;
}

// Height of a range above its base at x, in fractions of the canvas height.
export function ridgeHeight(range, x) {
  let height = 0;
  for (const p of range.peaks) {
    const t = (x - p.x) / (x < p.x ? p.wl : p.wr);
    if (Math.abs(t) >= 1) continue;
    const u = Math.abs(t);
    // Shoulders stay full, summits come to a soft point.
    const v = p.h * Math.pow(1 - u * u, 1.1) * (1 - p.k * Math.sqrt(u) * 0.35);
    height = Math.max(height, v) + Math.min(height, v) * 0.08;
  }
  const top = Math.max(...range.peaks.map(p => p.h));
  const rough = range.rough * (0.35 + height / top);
  // Broad undulation, then rock-sized breaks; only the broad part reaches the flat foot.
  const n = noiseAt(range.noise, x, 7) * 0.45 + noiseAt(range.noise, x + 0.37, 19) * 0.3
    + noiseAt(range.noise, x + 0.71, 53) * 0.17 + noiseAt(range.noise, x + 0.13, 131) * 0.08;
  return Math.max(0, height + n * rough);
}

export function ridgeAt(range, x) {
  return range.base - ridgeHeight(range, x);
}

// Lower any peak that would climb into a text block. Boxes are {x0,y0,x1,y1} fractions.
export function fitTerrain(terrain, boxes, pad = 0.03) {
  const ranges = terrain.ranges.map(range => {
    const peaks = range.peaks.map(p => ({ ...p }));
    for (let pass = 0; pass < 4; pass++) {
      for (const box of boxes) {
        for (let x = Math.max(0, box.x0 - 0.02); x <= Math.min(1, box.x1 + 0.02); x += 0.01) {
          const limit = range.base - (box.y1 + pad);
          const over = ridgeHeight({ ...range, peaks }, x) - limit;
          if (over <= 0) continue;
          for (const p of peaks) {
            const t = Math.abs((x - p.x) / (x < p.x ? p.wl : p.wr));
            if (t < 1) p.h = Math.max(0.01, p.h - over * 1.1);
          }
        }
      }
    }
    return { ...range, peaks };
  });
  return { ...terrain, ranges };
}
