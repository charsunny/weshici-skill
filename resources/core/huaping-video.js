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
