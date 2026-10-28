// Shared rules for the video templates (docs/VIDEO_V2_PLAN.md). Pure functions only, so the same
// module runs in the page and under `node --test`. Timing values follow HuapingInkReveal.swift and
// HuapingVideoTiming.swift (references/IOS-HUAPING.md §4–5); palettes come from app-palettes.json.
import { huapingCalendar } from './huaping-footer.js';

export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const easeOut = x => 1 - Math.pow(1 - clamp(x), 3);

// ---------------------------------------------------------------- palette

const SEASON_OF_TERM = {
  spring: ['立春', '雨水', '惊蛰', '春分', '清明', '谷雨'],
  summer: ['立夏', '小满', '芒种'],
  lateSummer: ['夏至', '小暑', '大暑', '立秋', '处暑'],
  autumn: ['白露', '秋分', '寒露', '霜降'],
  winter: ['立冬', '小雪', '大雪', '冬至', '小寒', '大寒'],
};

export function seasonOfTerm(term) {
  const season = Object.keys(SEASON_OF_TERM).find(key => SEASON_OF_TERM[key].includes(term));
  if (!season) throw new Error(`未知节气：${term}`);
  return season;
}

/**
 * One of the seven App palettes × light/dark, the same rules as the poster: `seasonal` (default)
 * follows the recipe's solar term (or date); night subjects default to dark.
 * `data` is the parsed resources/core/app-palettes.json.
 */
export function resolveVideoPalette(data, { palette = 'seasonal', appearance, term, date, night = false } = {}) {
  let id = palette;
  let implied;
  const alias = data.aliases?.[palette];
  if (alias) ({ palette: id, appearance: implied } = alias);
  if (id === 'seasonal') {
    const solarTerm = term || (date ? huapingCalendar(date).term : null);
    if (!solarTerm) throw new Error('palette 为 seasonal 时，配方需要 term 或 date');
    id = data.seasonal[seasonOfTerm(solarTerm)];
  }
  const entry = data.palettes[id];
  if (!entry) throw new Error(`未知 palette：${palette}（可选 ${Object.keys(data.palettes).join(' / ')} / seasonal）`);
  if (appearance !== undefined && appearance !== 'light' && appearance !== 'dark') throw new Error(`appearance 只能是 light 或 dark：${appearance}`);
  const mode = appearance || implied || (night ? 'dark' : 'light');
  return { id, name: entry.name, appearance: mode, colors: entry[mode], painting: entry.painting[mode] };
}

// ---------------------------------------------------------------- type

/** 「唐 · 杜甫」; an unknown dynasty leaves the author alone. Never invent either. */
export function byline(dynasty, author, separator = ' · ') {
  return [dynasty, author].map(value => String(value || '').trim()).filter(Boolean).join(separator);
}

/** Minimum sizes on a 1080-wide frame (plan §2.3): body text 34px, small text 28px. */
export const TYPE_FLOOR = { body: 34, small: 28 };

export function typeFloorIssues({ fontSize, inscriptionSize }, width = 1080) {
  const k = width / 1080;
  const issues = [];
  if (fontSize < TYPE_FLOOR.body * k) issues.push(`诗句字号 ${fontSize.toFixed(1)}px 小于 ${TYPE_FLOOR.body * k}px`);
  if (inscriptionSize < TYPE_FLOOR.small * k) issues.push(`题款字号 ${inscriptionSize.toFixed(1)}px 小于 ${TYPE_FLOOR.small * k}px`);
  return issues;
}

// ---------------------------------------------------------------- safe area

/** Douyin 9:16 controls: the right 140px and bottom 380px of a 1080×1920 frame. */
export const VIDEO_SAFE = { right: 140, bottom: 380 };

/**
 * Shrinks the engine's normalised verse rect so that the box huapingPlan derives from it
 * (4% horizontal / 3% vertical inset) stays out of the platform's control areas.
 */
export function clipVerseRect(rect, { width, height, right = VIDEO_SAFE.right * width / 1080, bottom = VIDEO_SAFE.bottom * width / 1080 }) {
  const maxRight = (width - right) / width;
  const maxBottom = (height - bottom) / height;
  return {
    x: rect.x,
    y: rect.y,
    width: Math.max(0, Math.min(rect.width, (maxRight - rect.x) / 0.96)),
    height: Math.max(0, Math.min(rect.height, (maxBottom - rect.y) / 0.97)),
  };
}

// ---------------------------------------------------------------- painting placement

/**
 * A 9:16 frame is taller than the engine's portrait composition wants: generated at full height, the
 * painting floats in an upper band and leaves the lower half bare. So the painting is generated on a
 * shorter canvas (`artHeight`) and placed unscaled at `offset` from the top; paper above it continues
 * the sky. `rect` / `anchors` map the engine's normalised coordinates into the frame, so text and
 * afterglow stay where the painting put them.
 */
export function artPlacement({ width, height, artHeight = height, offset = height - artHeight }) {
  const h = Math.max(1, Math.round(artHeight));
  const y = v => (offset + v * h) / height;
  const span = v => v * h / height;
  const point = p => Object.fromEntries(Object.entries(p).map(([key, value]) =>
    [key, ['y', 'baseY', 'topY', 'roofY'].includes(key) ? y(value) : value]));
  return {
    width, height: h, offset,
    rect: r => ({ x: r.x, y: y(r.y), width: r.width, height: span(r.height) }),
    anchors: a => a && {
      ...a,
      water: a.water ? { x: a.water.x, y: a.water.y.map(y) } : null,
      boats: (a.boats || []).map(point),
      trees: (a.trees || []).map(point),
      buildings: (a.buildings || []).map(point),
      // The paper above the painting is sky as well.
      sky: { ...(a.sky || {}), y: [0, y(a.sky?.y?.[1] ?? 0.38)] },
    },
  };
}

const inked = (data, i, paper, threshold) =>
  Math.hypot(data[i] - paper[0], data[i + 1] - paper[1], data[i + 2] - paper[2]) > threshold;

/**
 * Ink in an RGBA buffer: `mass` is the inked share of the painting outside `avoid` (a pixel rect,
 * the verse box), `top` / `bottom` the first and last rows (px) carrying a real stroke.
 */
export function paintingStats(data, width, height, paper, { avoid = null, threshold = 28, step = 4 } = {}) {
  let ink = 0, total = 0, top = null, bottom = null;
  for (let y = 0; y < height; y += step) {
    let row = 0, count = 0;
    for (let x = 0; x < width; x += step) {
      if (avoid && x >= avoid.x && x < avoid.x + avoid.width && y >= avoid.y && y < avoid.y + avoid.height) continue;
      count++;
      if (inked(data, (y * width + x) * 4, paper, threshold)) row++;
    }
    ink += row;
    total += count;
    // A row counts once a few samples are inked, so lone specks of paper grain do not.
    if (row >= 3) { top ??= y; bottom = y; }
  }
  return { mass: total ? ink / total : 0, top, bottom };
}

/**
 * The engine paints its sun as a translucent #AB4033 disc, which reads pink on light paper. Finds it
 * (pixels clearly warmer than the paper — the paintings are otherwise ink on paper), returns its
 * centre, and fills it, edge included, with the colour around it, so the cinnabar sun can replace it.
 */
export function knockOutSun(data, width, height, paper, { warmth = 24, edge = 8 } = {}) {
  // Warmth is measured relative to the paper's own tint, on both red−green and red−blue.
  const rg = paper[0] - paper[1], rb = paper[0] - paper[2];
  const warm = (i, limit) => data[i] - data[i + 1] - rg > limit && data[i] - data[i + 2] - rb > limit;
  let sx = 0, sy = 0, n = 0, x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!warm((y * width + x) * 4, warmth)) continue;
      sx += x; sy += y; n++;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  if (!n) return null;
  // Fill with what lies around the disc (paper, or a painted bank it overlaps), not flat paper,
  // so no ring shows where the engine's larger disc was.
  const pad = Math.max(x1 - x0, y1 - y0) * 0.3 + 2;
  const ys = [Math.max(0, Math.floor(y0 - pad)), Math.min(height - 1, Math.ceil(y1 + pad))];
  const xs = [Math.max(0, Math.floor(x0 - pad)), Math.min(width - 1, Math.ceil(x1 + pad))];
  const around = [0, 0, 0];
  let m = 0;
  for (let y = ys[0]; y <= ys[1]; y++) {
    for (let x = xs[0]; x <= xs[1]; x++) {
      const i = (y * width + x) * 4;
      if (warm(i, edge)) continue;
      for (let k = 0; k < 3; k++) around[k] += data[i + k];
      m++;
    }
  }
  const fill = m ? around.map(v => Math.round(v / m)) : paper;
  for (let y = ys[0]; y <= ys[1]; y++) {
    for (let x = xs[0]; x <= xs[1]; x++) {
      const i = (y * width + x) * 4;
      if (warm(i, edge)) data.set(fill, i);
    }
  }
  const cx = sx / n, cy = sy / n;
  return { x: cx, y: cy, count: n };
}

/**
 * Makes the ink more solid without touching the paper: each pixel's distance from the paper grows
 * by up to `gain`, ramping in above the paper grain so the grain itself is left alone.
 */
export function deepenInk(data, paper, { gain = 2.4, grain = 8, ramp = 20 } = {}) {
  const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
  const base = lum(...paper);
  for (let i = 0; i < data.length; i += 4) {
    const d = Math.abs(base - lum(data[i], data[i + 1], data[i + 2]));
    if (d <= grain) continue;
    const f = 1 + (gain - 1) * clamp((d - grain) / ramp);
    for (let k = 0; k < 3; k++) data[i + k] = Math.max(0, Math.min(255, Math.round(paper[k] + (data[i + k] - paper[k]) * f)));
  }
  return data;
}

/**
 * Where the painting goes: bottom-aligned, and lower only when its last stroke would otherwise end
 * above `target` — then the bare paper under it is cropped so that stroke lands at `target` (by
 * default the top of the platform's bottom bar, 1 − 380/1920). Only blank paper is ever lost.
 */
export function placeOffset({ frameHeight, artHeight, contentBottom, target = 1 - VIDEO_SAFE.bottom / 1920 }) {
  const aligned = frameHeight - artHeight;
  if (contentBottom == null) return aligned;
  return Math.max(aligned, Math.round(target * frameHeight - contentBottom));
}

/**
 * Lifts a normalised verse rect towards `top` through the paper above the painting, stopping at the
 * highest position where `clear(rect)` holds (no ink under the text). Never moves it down.
 */
export function liftRect(rect, { top = 0.12, clear = () => true, step = 0.005 }) {
  for (let y = Math.min(top, rect.y); y < rect.y; y += step) {
    const candidate = { ...rect, y };
    if (clear(candidate)) return candidate;
  }
  return rect;
}

// ---------------------------------------------------------------- entrance

/**
 * Glyph-by-glyph ink reveal, colophon, then the seal (HuapingInkReveal): each glyph 0.25s, staggered
 * 0.12s; the colophon is one 0.18s unit; the seal starts 0.3s after it and lasts 0.2s. A share video
 * settles by 3.0s, so a long poem compresses the stagger rather than overrunning the budget.
 */
export function inkRevealPlan({ count, start = 0.3, unit = 0.25, stagger = 0.12, colophon = 0.18,
  sealDelay = 0.3, sealDuration = 0.2, settleBy = 3.0, minStagger = 0.03 }) {
  const overhead = unit + colophon + sealDelay + sealDuration;
  let step = count > 1 ? stagger : 0;
  if (count > 1 && start + (count - 1) * step + overhead > settleBy) {
    step = Math.max(minStagger, (settleBy - start - overhead) / (count - 1));
  }
  const starts = Array.from({ length: count }, (_, i) => start + i * step);
  const verseEnd = (starts.at(-1) ?? start) + unit;
  const colophonStart = verseEnd;
  const sealStart = colophonStart + colophon + sealDelay;
  return { starts, unit, stagger: step, colophonStart, colophonDuration: colophon, sealStart, sealDuration,
    settle: sealStart + sealDuration };
}

/** blur 6pt→0, scale 1.06→1, opacity 0→1, cubic ease-out; `pt` converts points to pixels. */
export function inkGlyphState(t, t0, unit = 0.25, pt = 1) {
  const p = easeOut((t - t0) / unit);
  return { opacity: p, blur: (1 - p) * 6 * pt, scale: 1 + 0.06 * (1 - p) };
}

/** Seal: scale 1.15→1 in 0.2s, cubic ease-out, no overshoot. */
export function sealState(t, t0, duration = 0.2) {
  const p = easeOut((t - t0) / duration);
  return { opacity: p, scale: 1 + 0.15 * (1 - p) };
}

/** HuapingVideoTiming: ceil(entrance end + clamp(chars × 0.3, 6, 20)). */
export function videoDuration(charCount, entryEnd) {
  return Math.ceil(entryEnd + clamp(charCount * 0.3, 6, 20));
}

/** Background push, linear 1→1.02 over the whole clip; text never scales. */
export function pushScale(t, duration) {
  return 1 + 0.02 * clamp(t / duration);
}

// ---------------------------------------------------------------- ink-story timeline

/**
 * Title page, then one couplet at a time, following the reading's line timestamps. Glyphs spread over
 * the line's spoken time at about `pace` seconds each (each glyph the App's 0.25s reveal); a leaf
 * dissolves over `dissolve` seconds, ending `linger` after the next line starts. The last couplet
 * stays; its colophon follows its last glyph and the seal lands 0.3s after that.
 */
export function storyTimeline({ couplets, glyphCounts, titleGlyphs, start = 0.3, pace = 0.27, dissolve = 0.6, linger = 0.15 }) {
  const times = (count, from, to) => {
    const span = Math.min(count * pace, Math.max(0.3, (to - from) * 0.85));
    return Array.from({ length: count }, (_, i) => from + i * span / count);
  };
  const title = { times: times(titleGlyphs, start, couplets[0].start), out: couplets[0].start + linger };
  const lines = couplets.map((c, i) => {
    const next = couplets[i + 1];
    return { times: times(glyphCounts[i], c.start, next ? next.start : c.end), out: next ? next.start + linger : Infinity };
  });
  const colophonAt = lines.at(-1).times.at(-1) + 0.25;
  return { title, lines, dissolve, titleColophonAt: title.times.at(-1) + 0.25, colophonAt, sealAt: colophonAt + 0.18 + 0.3 };
}

/** 0 while a leaf is whole, rising to 1 as it dissolves. */
export function leafGone(t, leaf, dissolve = 0.6) {
  return clamp((t - (leaf.out - dissolve)) / dissolve);
}

/** When a leaf reads (opacity ≥ 0.5): from its first glyph half-inked until it is half dissolved. */
export function readableWindow(leaf, dissolve = 0.6) {
  return [leaf.times[0] + 0.125, leaf.out - dissolve / 2];
}

// ---------------------------------------------------------------- song timeline

/**
 * A sung line inks in across its sung time: glyphs spread over 70% of the line (at most `pace` s per
 * glyph), each the App's 0.25s reveal. A line is current until the next one starts. The seal lands
 * 0.3s after the last glyph of the last line.
 */
export function songTimeline({ lyrics, glyphCounts, pace = 0.5 }) {
  const lines = lyrics.map((l, i) => {
    const end = lyrics[i + 1]?.start ?? l.end;
    const span = Math.min(glyphCounts[i] * pace, Math.max(0.3, (end - l.start) * 0.7));
    return { times: Array.from({ length: glyphCounts[i] }, (_, j) => l.start + j * span / glyphCounts[i]), end };
  });
  return { lines, sealAt: lines.at(-1).times.at(-1) + 0.25 + 0.3 };
}

// ---------------------------------------------------------------- weather and afterglow

const WEATHER_ORDER = ['rain', 'snow', 'moon', 'sunset', 'geese', 'mist'];
const MONTH_WORDS = /正月|二月|三月|四月|五月|六月|七月|八月|九月|十月|十一月|十二月|腊月|岁月|年月/g;

/**
 * Weather for a procedural painting (HuapingWeather + HuapingWeatherPlan): words in the poem and
 * title first, then one from the solar term; at most two, rain/snow and moon/sunset exclusive.
 * The painting then filters it — rain needs the scene's rain motif, snow its snow, no moon or sun
 * over one already painted, and @5 never gets an extra mist layer.
 */
export function pickWeather({ text = '', title = '', term = '', motifs = [] }) {
  const body = `${title}\n${text}`;
  const wanted = new Set();
  if (/[雨霖]/.test(body)) wanted.add('rain');
  if (/雪/.test(body)) wanted.add('snow');
  if (/月|婵娟|玉盘|蟾/.test(body.replace(MONTH_WORDS, ''))) wanted.add('moon');
  if (/夕|落日|斜阳|残阳|暮|晚/.test(body)) wanted.add('sunset');
  if (/[雁鸿]/.test(body)) wanted.add('geese');
  if (/[烟岚雾]/.test(body)) wanted.add('mist');
  if (!wanted.size && term) {
    if (['清明', '谷雨', '雨水'].includes(term)) wanted.add('rain');
    else if (['小雪', '大雪', '冬至', '小寒', '大寒'].includes(term)) wanted.add('snow');
    else if (['白露', '秋分', '寒露', '霜降'].includes(term)) wanted.add('geese');
  }
  const picked = [];
  for (const kind of WEATHER_ORDER) {
    if (!wanted.has(kind) || picked.length >= 2) continue;
    if ((kind === 'snow' && picked.includes('rain')) || (kind === 'sunset' && picked.includes('moon'))) continue;
    picked.push(kind);
  }
  const has = motif => motifs.includes(motif);
  return picked.filter(kind => ({
    rain: has('rain') && !has('afterRain'),
    snow: has('snow'),
    moon: !has('moon') && !has('crescent'),
    sunset: !has('sunset') && !has('sunrise'),
    geese: true,
    mist: false,
  })[kind]);
}

/** A lone goose when the poem says so (一雁、孤雁、孤鸿), otherwise a small skein. */
export function geeseCount(text = '') {
  return /一雁|孤雁|孤鸿|一鸿|只雁/.test(text) ? 1 : 5;
}

const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * Anchored afterglow that keeps the frame alive once the text has settled (Live Photo default C):
 * ripples only on open water, a wash of lines under each boat, and one thin mist band across the
 * mountains. Rects are normalised; `avoid` is the verse box, which motion must never cross.
 * The water anchor is a loose bounding box (often only the far water), so the spots around each
 * boat count as water too, `open(x, y)` (sampled from the painting) confirms a spot is bare, and
 * nothing goes into the sky. `rowInk(y)` is the painting's ink density along a row; the mist lies
 * where the mountains are densest, below the sky line.
 */
export function afterglowPlan({ anchors, avoid, seed = 1, rippleCount = 8, open = () => true, rowInk = null }) {
  const rand = seeded(seed);
  const plan = { ripples: [], boats: [], mist: null };
  if (!anchors) return plan;
  const skyBottom = anchors.sky?.y?.[1] ?? 0.38;
  const zones = [];
  if (anchors.water) {
    const { x, y } = anchors.water;
    if (y[1] - Math.max(y[0], skyBottom) > 0.02) zones.push({ x, y: [Math.max(y[0], skyBottom), y[1]] });
  }
  for (const boat of anchors.boats || []) {
    plan.boats.push({ x: boat.x, y: boat.y, length: boat.length });
    zones.push({ x: [Math.max(0.04, boat.x - 0.28), Math.min(0.96, boat.x + 0.28)], y: [Math.max(skyBottom, boat.y - 0.025), Math.min(0.97, boat.y + 0.07)] });
  }
  for (let tries = 0; zones.length && plan.ripples.length < rippleCount && tries < rippleCount * 40; tries++) {
    const zone = zones[tries % zones.length];
    const x = zone.x[0] + (zone.x[1] - zone.x[0]) * (0.05 + 0.9 * rand());
    const y = zone.y[0] + (zone.y[1] - zone.y[0]) * (0.05 + 0.9 * rand());
    // Perspective: rings near the horizon are small and flat, near the viewer wider.
    const size = 0.012 + 0.034 * clamp((y - skyBottom) / (1 - skyBottom));
    const r = { x: x - size * 1.2, y: y - 0.008, width: size * 2.4, height: 0.016 };
    if (avoid && overlaps(r, avoid)) continue;
    if (plan.ripples.some(other => Math.abs(other.x - x) < 0.09 && Math.abs(other.y - y) < 0.03)) continue;
    // Never on a hull: beside a boat, rings open only below its waterline.
    if (plan.boats.some(b => Math.abs(b.x - x) < b.length * 0.6 + size && y < b.y + 0.012)) continue;
    if (!open(x, y)) continue;
    plan.ripples.push({ x, y, size, period: 2.6 + 1.4 * rand(), phase: rand() });
  }
  let mistY = skyBottom - 0.02;
  if (rowInk) {
    let best = -1;
    for (let y = Math.max(0.12, skyBottom - 0.16); y <= Math.min(0.82, skyBottom + 0.3); y += 0.01) {
      const ink = rowInk(y);
      if (ink > best) [best, mistY] = [ink, y];
    }
  }
  plan.mist = { y: mistY, height: 0.035, direction: rand() < 0.5 ? -1 : 1 };
  return plan;
}

export function seeded(seed) {
  let a = typeof seed === 'number' ? seed >>> 0 : [...String(seed)].reduce((h, c) => Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0, 2166136261);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
