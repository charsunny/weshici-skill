// Browser side of the video templates: one ShanShui@5 painting per clip, placed low in a 9:16 frame,
// with the verse box lifted above it and the afterglow sampled from the real pixels. Needs
// zxart-compose.js and zxart-shanshui-v5.js loaded as classic scripts first.
import { renderZXArt } from './weishi-video-core.js';
import { huapingClauses } from './huaping-layout.js';
import {
  resolveVideoPalette, artPlacement, paintingStats, placeOffset, liftRect, clipVerseRect,
  pickWeather, geeseCount, afterglowPlan,
} from './huaping-video.js';

const OVERRIDES = ['seed', 'scene', 'composition', 'artHeight', 'quietTop', 'verseSide'];
const SKY = ['moon', 'crescent', 'sunrise', 'sunset', 'stars', 'snow', 'rain', 'afterRain', 'mist'];

export async function loadRecipe(fallback) {
  const params = new URLSearchParams(location.search);
  const recipe = await (await fetch(`/resources/recipes/${params.get('recipe') || fallback}.json`)).json();
  const palettes = await (await fetch('/resources/core/app-palettes.json')).json();
  return { params, recipe, palettes };
}

/**
 * The engine decides purpose, composition and motifs from the poem; the recipe keeps its seed. A recipe
 * may pin scene and composition when the engine's own pick hides the poem's subject (and says why in
 * `procedural.note`); URL parameters override for exploring seeds.
 */
export function planPainting({ poem, title, procedural, params, verseColumns, verseChars, verseSide = 'left' }) {
  const proc = { ...(procedural || {}) };
  for (const key of OVERRIDES) if (params?.has(key)) proc[key] = params.get(key);
  if (proc.generator !== 'shanshui@5') throw new Error(`视频模板需要 shanshui@5 配方，当前为 ${proc.generator}`);
  const matched = window.poetryScene(poem, title);
  const scene = proc.scene || matched.scene;
  const art = matched.paintingProcedural(proc.seed, {
    purpose: 'inscription-v1',
    composition: proc.composition || null,
    quietTop: Number(proc.quietTop ?? 0.06),
    verseSide: proc.verseSide || verseSide,
    verseColumns,
    verseChars,
  });
  if (scene !== matched.scene) {
    // Another scene brings its own motifs; the poem's weather and sky come along.
    art.params.scene.motifs = window.canonicalMotifs([...window.defaultMotifsForScene(scene),
      ...art.params.scene.motifs.filter(m => SKY.includes(m))]);
  }
  const motifs = art.params.scene.motifs;
  const night = motifs.includes('moon') || motifs.includes('crescent') || scene === 'moonNight';
  return { proc, scene, art, motifs, night };
}

/** Recipe palette (or URL override) resolved against the painting's motifs; sets the CSS slots. */
export function applyPalette(palettes, recipe, params, plan) {
  const palette = resolveVideoPalette(palettes, {
    palette: params.get('palette') || recipe.palette,
    appearance: params.get('appearance') || recipe.appearance,
    term: recipe.term, date: recipe.date, night: plan.night,
  });
  for (const [slot, value] of Object.entries(palette.colors)) document.documentElement.style.setProperty(`--${slot}`, value);
  palette.cinnabar = palettes.palettes[palette.id].light.seal;
  return palette;
}

/**
 * Renders the painting on a shorter canvas and sets it low in the frame, so it fills the lower half
 * instead of floating in an upper band; nothing is stretched. The engine recomposes for each height,
 * so unless the recipe pins one, the height whose painting carries the most ink wins.
 */
export async function paintFrame(target, plan, palette, { width: W, height: H }) {
  const heights = (plan.proc.artHeight ? [Number(plan.proc.artHeight)] : [1440, 1560, 1680]).map(h => Math.round(h * W / 1080));
  let best = null;
  for (const artHeight of heights) {
    const canvas = document.createElement('canvas');
    const result = await renderZXArt(canvas, {
      generator: 'shanshui@5', seed: plan.art.seed, scene: plan.scene, params: plan.art.params,
      palette: { paper: palette.colors.paper, ink: palette.colors.ink }, width: W, height: artHeight,
    });
    // A fallback drawing is a failure, not a finished painting.
    if (!result.ok) throw new Error(`画屏渲染失败（${result.error || 'fallback'}），不能用简化山水代替`);
    // Ink is measured against the painting's own paper (its blank top strip), grain and tint included.
    const data = canvas.getContext('2d').getImageData(0, 0, W, artHeight).data;
    const stripHeight = Math.max(8, Math.round(0.02 * artHeight));
    const paper = meanColor(data, W * stripHeight);
    const r = result.verse.rect;
    const stats = paintingStats(data, W, artHeight, paper,
      { avoid: { x: r.x * W, y: r.y * artHeight, width: r.width * W, height: r.height * artHeight } });
    if (!best || stats.mass > best.stats.mass) best = { canvas, result, stats, artHeight, paper, stripHeight };
  }
  const place = artPlacement({ width: W, height: H, artHeight: best.artHeight,
    offset: placeOffset({ frameHeight: H, artHeight: best.artHeight, contentBottom: best.stats.bottom }) });
  target.width = W;
  target.height = H;
  const ctx = target.getContext('2d');
  // The painting's paper carries its own faint grain. The paper above it is the painting's blank top
  // strip, mirrored upward strip by strip so the grain runs on without a seam; if that strip is not
  // blank, its mean tone is used instead with a soft fade.
  const { stripHeight, paper } = best;
  const strip = best.canvas.getContext('2d').getImageData(0, 0, W, stripHeight).data;
  const blank = paintingStats(strip, W, stripHeight, paper, { threshold: 40 }).top === null;
  ctx.fillStyle = `rgb(${paper.join(',')})`;
  ctx.fillRect(0, 0, W, H);
  if (blank) {
    // Tiles alternate mirrored / upright, so every join meets the same row of grain.
    for (let bottom = place.offset, flip = true; bottom > 0; bottom -= stripHeight, flip = !flip) {
      const top = bottom - stripHeight;
      ctx.save();
      if (flip) {
        ctx.translate(0, bottom);
        ctx.scale(1, -1);
        ctx.drawImage(best.canvas, 0, 0, W, stripHeight, 0, 0, W, stripHeight);
      } else {
        ctx.drawImage(best.canvas, 0, 0, W, stripHeight, 0, top, W, stripHeight);
      }
      ctx.restore();
    }
  }
  ctx.drawImage(best.canvas, 0, place.offset);
  if (!blank && place.offset > 0) {
    const fade = ctx.createLinearGradient(0, place.offset, 0, place.offset + 0.06 * H);
    fade.addColorStop(0, `rgb(${paper.join(',')})`);
    fade.addColorStop(1, `rgba(${paper.join(',')},0)`);
    ctx.fillStyle = fade;
    ctx.fillRect(0, place.offset, W, 0.06 * H);
  }
  const pixels = ctx.getImageData(0, 0, W, H).data;
  const inked = (x, y, threshold) => {
    const i = (y * W + x) * 4;
    return Math.hypot(pixels[i] - paper[0], pixels[i + 1] - paper[1], pixels[i + 2] - paper[2]) > threshold;
  };
  const regionClear = rect => {
    for (let y = Math.round(rect.y * H); y < (rect.y + rect.height) * H; y += 4) {
      for (let x = Math.round(rect.x * W); x < (rect.x + rect.width) * W; x += 4) if (inked(x, y, 28)) return false;
    }
    return true;
  };
  // Text keeps the engine's verse box, lifted through bare paper towards the top of the frame (poem
  // above, painting below), then clipped out of the platform's right and bottom controls.
  const lift = rect => clipVerseRect(liftRect(place.rect(rect), { top: 0.11, clear: regionClear }), { width: W, height: H });
  return {
    width: W, height: H, place, inked, lift, artHeight: best.artHeight,
    verse: { ...best.result.verse, rect: lift(best.result.verse.rect) },
    anchors: place.anchors(best.result.anchors),
    reference: (params) => {
      const reference = window.ZXArtCompose.verseLayoutFor('shanshui@5', params, W, place.height);
      return { ...reference, rect: lift(reference.rect) };
    },
  };
}

/** Mean RGB of the first `pixels` pixels of an RGBA buffer. */
function meanColor(data, pixels) {
  const sum = [0, 0, 0];
  for (let p = 0; p < pixels; p++) for (let k = 0; k < 3; k++) sum[k] += data[p * 4 + k];
  return sum.map(v => Math.round(v / pixels));
}

/**
 * Weather and afterglow for the frame: only what the painting really has, and motion that keeps clear
 * of `avoid` (the verse box in px). Ripples need bare water under them; the mist lies on the densest
 * band of mountains.
 */
export function afterglowScene(frame, palette, { poem, title, term, motifs, avoid, seed, duration }) {
  const { width: W, height: H, inked } = frame;
  const open = (nx, ny) => {
    let ink = 0, total = 0;
    for (let y = Math.round(ny * H - 12); y <= ny * H + 12; y += 3) {
      for (let x = Math.round(nx * W - 44); x <= nx * W + 44; x += 4) {
        if (x < 0 || y < 0 || x >= W || y >= H) return false;
        total++;
        if (inked(x, y, 36)) ink++;
      }
    }
    return ink / total < 0.1;
  };
  const rowInk = ny => {
    let ink = 0, total = 0;
    const y = Math.round(ny * H);
    for (let x = 0; x < W; x += 6) {
      if (x >= avoid.x && x <= avoid.x + avoid.width && y >= avoid.y && y <= avoid.y + avoid.height) continue;
      total++;
      if (inked(x, y, 24)) ink++;
    }
    return total ? ink / total : 0;
  };
  return {
    width: W, height: H, colors: palette.colors, appearance: palette.appearance, cinnabar: palette.cinnabar,
    weather: pickWeather({ text: poem, title, term, motifs }),
    afterglow: afterglowPlan({ anchors: frame.anchors, seed, open, rowInk,
      avoid: { x: avoid.x / W, y: avoid.y / H, width: avoid.width / W, height: avoid.height / H } }),
    anchors: frame.anchors, avoid, seed, duration,
    geese: geeseCount(huapingClauses(poem).join('')),
  };
}

/** The App's vertical seal as a mask, so it takes the palette's seal colour (the only red). */
export function sealElement(width, height) {
  const seal = document.createElement('i');
  seal.className = 'hp-seal';
  seal.setAttribute('aria-label', '微詩');
  seal.style.width = `${width}px`;
  seal.style.height = `${height}px`;
  return seal;
}

export function tintSeals(container) {
  for (const img of container.querySelectorAll('img.hp-seal')) {
    img.replaceWith(sealElement(parseFloat(img.style.width), parseFloat(img.style.height)));
  }
  return container.querySelector('.hp-seal');
}

/** Preview helpers shared by the templates: fit the 1080×1920 stage and loop when opened directly. */
export function previewLoop(stage, params, W = 1080, H = 1920) {
  if (params.has('capture')) return;
  const fit = () => {
    const k = Math.min(innerWidth / W, innerHeight / H);
    stage.style.transform = `translate(${(innerWidth - W * k) / 2}px, ${(innerHeight - H * k) / 2}px) scale(${k})`;
  };
  addEventListener('resize', fit);
  fit();
  if (window.parent !== window) return;
  const t0 = performance.now();
  const tick = now => { window.render(((now - t0) / 1000) % window.DUR); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}
