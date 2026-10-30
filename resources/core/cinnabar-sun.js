// The setting sun accepted for poster v2 (references/POETRY-POSTER.md): cinnabar, not a pink disc —
// the light seal warmed 22% toward its ochre, solid at the heart, the edge bleeding into the paper,
// radius 3.5% of the canvas width. The light-appearance colours are used in both appearances.
// Shared by the poster and the video templates so there is one sun.
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const mix = (a, b, t) => {
  const p = rgb(a), q = rgb(b);
  return '#' + p.map((v, i) => Math.round(v + (q[i] - v) * t).toString(16).padStart(2, '0')).join('');
};
const rgba = (hex, alpha) => `rgba(${rgb(hex).join(',')},${alpha})`;

export const SUN_RADIUS = 0.035;

/** `seal` / `secondary` are the palette's light values; `rand` a seeded generator in [0, 1). */
export function drawCinnabarSun(g, { cx, cy, width, seal, secondary, ink, paper, dark, rand }) {
  const r = (a, b) => a + (b - a) * rand();
  const sr = width * SUN_RADIUS;
  const tone = mix(seal, secondary, 0.22);
  g.save();
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
  g.restore();
}
