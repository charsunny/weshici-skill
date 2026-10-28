// Canvas layer for weather and afterglow over a procedural painting. Every frame is a pure function
// of t (references/TECHNIQUE.md): no Math.random, no accumulated state. Ink and paper only — the
// seal stays the one spot of red. Plans come from huaping-video.js (pickWeather / afterglowPlan).
import { clamp, seeded } from './huaping-video.js';

const rgba = (hex, alpha) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${clamp(alpha).toFixed(3)})`;
};
const inside = (x, y, box, pad = 0) => box && x > box.x - pad && x < box.x + box.width + pad && y > box.y - pad && y < box.y + box.height + pad;

/**
 * @param ctx      2D context of a transparent canvas the size of the frame
 * @param scene    { width, height, colors, appearance, avoid (px rect), weather: [...], afterglow, geese, seed }
 */
export function drawAfterglow(ctx, t, scene) {
  const { width: W, height: H } = scene;
  ctx.clearRect(0, 0, W, H);
  const dark = scene.appearance === 'dark';
  // Effects are drawn in the painting's ink: dark ink on light paper, pale ink on dark paper.
  const ink = scene.colors.ink;
  const paper = scene.colors.paper;
  const k = W / 1080;
  if (scene.weather.includes('moon')) drawMoon(ctx, t, scene, paper, ink, dark, k);
  if (scene.weather.includes('sunset')) drawSun(ctx, t, scene, k);
  // Mist is paper-white on light paper; on dark paper it is a shade lighter than the paper (moonlit).
  if (scene.afterglow.mist) drawMist(ctx, t, scene, dark ? ink : paper, dark, k);
  drawRipples(ctx, t, scene, ink, dark, k);
  if (scene.weather.includes('geese')) drawGeese(ctx, t, scene, ink, dark, k);
  if (scene.weather.includes('rain')) drawRain(ctx, t, scene, ink, dark, k);
  if (scene.weather.includes('snow')) drawSnow(ctx, t, scene, ink, paper, dark, k);
}

// Only when the painting has no moon of its own: 5% of the width, paper-white with a faint halo.
function skySpot({ width: W, height: H, avoid, anchors }, k) {
  const skyBottom = (anchors?.sky?.y?.[1] ?? 0.38) * H;
  const x = avoid && avoid.x < W / 2 ? Math.max(avoid.x + avoid.width + 120 * k, W * 0.66) : W * 0.28;
  return { x: Math.min(x, W - 200 * k), y: skyBottom * 0.42 };
}

function drawMoon(ctx, t, scene, paper, ink, dark, k) {
  const { x, y } = skySpot(scene, k);
  const r = scene.width * 0.05;
  const cy = y - t * 0.6 * k;
  const halo = ctx.createRadialGradient(x, cy, r, x, cy, r * 2.6);
  halo.addColorStop(0, rgba(dark ? ink : paper, dark ? 0.14 : 0.5));
  halo.addColorStop(1, rgba(dark ? ink : paper, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, cy, r * 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = dark ? rgba(ink, 0.86) : rgba(paper, 1);
  ctx.beginPath();
  ctx.arc(x, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

// The setting sun is the seal's cinnabar, 3.5% of the width, smaller and softer than the seal reads.
function drawSun(ctx, t, scene, k) {
  const { x, y } = skySpot(scene, k);
  const r = scene.width * 0.035;
  const cy = y + 40 * k + t * 1.2 * k;
  const g = ctx.createRadialGradient(x, cy, r * 0.2, x, cy, r * 1.12);
  g.addColorStop(0, rgba(scene.cinnabar, 0.82));
  g.addColorStop(0.88, rgba(scene.cinnabar, 0.78));
  g.addColorStop(1, rgba(scene.cinnabar, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, cy, r * 1.12, 0, Math.PI * 2);
  ctx.fill();
}

// One thin band of mist drifting slowly across the mountains' waist.
function drawMist(ctx, t, { width: W, height: H, afterglow, seed }, color, dark, k) {
  const { y, height, direction } = afterglow.mist;
  const cy = y * H;
  const band = height * H;
  const rand = seeded(`${seed}-mist`);
  const drift = direction * t * 9 * k;
  ctx.save();
  for (let i = 0; i < 7; i++) {
    const span = W * (0.22 + 0.18 * rand());
    const x = ((rand() * 1.6 - 0.3) * W + drift + W * 1.6) % (W * 1.6) - W * 0.3;
    const dy = (rand() - 0.5) * band * 0.9;
    const g = ctx.createRadialGradient(x, cy + dy, 0, x, cy + dy, span);
    const a = (dark ? 0.07 : 0.5) * (0.6 + 0.4 * rand());
    g.addColorStop(0, rgba(color, a));
    g.addColorStop(0.55, rgba(color, a * 0.45));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.setTransform(1, 0, 0, band / span, 0, (cy + dy) * (1 - band / span));
    ctx.beginPath();
    ctx.arc(x, cy + dy, span, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Rings that open on the water and fade, plus a soft wash of lines under each boat.
function drawRipples(ctx, t, { width: W, height: H, afterglow }, ink, dark, k) {
  ctx.save();
  ctx.lineCap = 'round';
  for (const r of afterglow.ripples) {
    const p = ((t / r.period) + r.phase) % 1;
    const rx = r.size * W * (0.2 + 0.8 * p);
    const alpha = Math.sin(Math.PI * p) * (dark ? 0.22 : 0.2);
    ctx.strokeStyle = rgba(ink, alpha);
    ctx.lineWidth = 1.3 * k;
    for (const scale of [1, 0.62]) {
      ctx.beginPath();
      // Only the near and far arcs: a ripple seen at a low angle reads as two short strokes.
      ctx.ellipse(r.x * W, r.y * H, rx * scale, rx * scale * 0.2, 0, Math.PI * 0.08, Math.PI * 0.92);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(r.x * W, r.y * H, rx * scale, rx * scale * 0.2, 0, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }
  }
  for (const boat of afterglow.boats) {
    const len = Math.max(30 * k, boat.length * W);
    for (let i = 0; i < 3; i++) {
      const sway = Math.sin(t * 1.3 + i * 1.9) * 6 * k;
      const w = len * (1.1 + 0.25 * i + 0.08 * Math.sin(t * 0.9 + i));
      const y = boat.y * H + (5 + i * 7) * k;
      ctx.strokeStyle = rgba(ink, (dark ? 0.22 : 0.2) * (1 - i * 0.25));
      ctx.lineWidth = 1.2 * k;
      ctx.beginPath();
      ctx.moveTo(boat.x * W - w / 2 + sway, y);
      ctx.lineTo(boat.x * W + w / 2 + sway, y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// Geese crossing the open sky, never through the verse box. Wings are two tapered strokes.
function drawGeese(ctx, t, { width: W, height: H, avoid, anchors, geese, seed, duration }, ink, dark, k) {
  const skyBottom = (anchors?.sky?.y?.[1] ?? 0.38) * H;
  const left = avoid && avoid.x < W / 2 ? avoid.x + avoid.width + 40 * k : 60 * k;
  const right = avoid && avoid.x >= W / 2 ? avoid.x - 40 * k : W - 60 * k;
  if (right - left < 160 * k) return;
  const rand = seeded(`${seed}-geese`);
  // One crossing per clip, right to left (the south-bound autumn flight), starting already in frame.
  const p = clamp(0.12 + 0.76 * t / duration);
  const x0 = right - (right - left) * p;
  const y0 = skyBottom * (0.42 + 0.18 * rand()) + Math.sin(t * 0.7) * 4 * k - p * 18 * k;
  const span = (geese === 1 ? 24 : 16) * k;
  ctx.save();
  ctx.fillStyle = rgba(ink, dark ? 0.78 : 0.72);
  for (let i = 0; i < geese; i++) {
    const rank = Math.ceil(i / 2);
    const side = i % 2 ? 1 : -1;
    const x = x0 + rank * 30 * k;
    const y = y0 + side * rank * 13 * k;
    const flap = Math.sin(t * 4.2 + i * 0.8);
    goose(ctx, x, y, span * (1 - rank * 0.06), flap, k);
  }
  ctx.restore();
}

function goose(ctx, x, y, span, flap, k) {
  const lift = flap * span * 0.45;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + side * span * 0.45, y - span * 0.2 - lift * 0.5, x + side * span, y - lift);
    ctx.quadraticCurveTo(x + side * span * 0.5, y - span * 0.05 - lift * 0.3, x, y + 2.2 * k);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(x - span * 0.12, y + 0.6 * k, span * 0.22, 1.8 * k, 0, 0, Math.PI * 2);
  ctx.fill();
}

// Fine slanted ink lines, held back from the verse box so the poem stays clean.
function drawRain(ctx, t, { width: W, height: H, avoid, seed }, ink, dark, k) {
  const rand = seeded(`${seed}-rain`);
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < 84; i++) {
    const x0 = rand() * (W + 200 * k);
    const y0 = rand() * H;
    const speed = (620 + 240 * rand()) * k;
    const len = (16 + 14 * rand()) * k;
    const alpha = (dark ? 0.26 : 0.24) * (0.55 + 0.45 * rand());
    const y = (y0 + t * speed) % (H + len) - len;
    const x = x0 - y * 0.16;
    if (inside(x, y, avoid, 24 * k)) continue;
    ctx.strokeStyle = rgba(ink, alpha);
    ctx.lineWidth = 1.2 * k;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - len * 0.16, y + len);
    ctx.stroke();
  }
  ctx.restore();
}

// Flakes are paper-white; on light paper each one gets a faint ink rim so it reads at all.
function drawSnow(ctx, t, { width: W, height: H, avoid, seed }, ink, paper, dark, k) {
  const rand = seeded(`${seed}-snow`);
  ctx.save();
  for (let i = 0; i < 88; i++) {
    const x0 = rand() * W;
    const y0 = rand() * H;
    const r = (1.8 + 2.2 * rand()) * k;
    const speed = (36 + 30 * rand()) * k;
    const sway = (12 + 14 * rand()) * k;
    const phase = rand() * Math.PI * 2;
    const alpha = 0.5 + 0.5 * rand();
    const y = (y0 + t * speed) % H;
    const x = (x0 + Math.sin(t * 0.8 + phase) * sway + W) % W;
    if (inside(x, y, avoid, 12 * k)) continue;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (dark) {
      ctx.fillStyle = rgba(ink, 0.72 * alpha);
      ctx.fill();
    } else {
      ctx.fillStyle = rgba('#FFFFFF', alpha);
      ctx.fill();
      ctx.strokeStyle = rgba(ink, 0.16 * alpha);
      ctx.lineWidth = 0.9 * k;
      ctx.stroke();
    }
  }
  ctx.restore();
}
