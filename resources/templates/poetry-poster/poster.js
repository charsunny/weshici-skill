import { huapingInvitation, huapingCalendar } from '/resources/core/huaping-footer.js';
import { posterTerrain, fitTerrain } from '/resources/core/poster-terrain.js';
import { paintPoster } from './drawing.js';

const card = window.POSTER;
if (!card) throw new Error('请通过 generate.mjs poster 载入海报内容');
const W = 1080, H = 1440;
const cover = card.layout === 'cover';
const stage = document.getElementById('stage');
stage.className = `${card.layout} ${card.appearance}`;
for (const [slot, value] of Object.entries(card.colors)) stage.style.setProperty(`--${slot}`, value);
stage.style.setProperty('--qr-tile', card.qr.tile);
stage.style.setProperty('--qr-ink', card.qr.ink);

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const chars = value => Array.from(value).length;
const url = cover ? 'https://www.weshici.com' : huapingInvitation(card.title, card.author);
const qr = qrcode(0, 'M');
qr.addData(url);
qr.make();
const calendar = huapingCalendar(card.date);
const pad = n => String(n).padStart(2, '0');
const series = cover ? (card.total ? `${card.theme}　共 ${card.total} 首` : card.theme) : `${card.caption || card.theme}　${pad(card.index)} / ${pad(card.total)}`;
const source = cover ? '' : `<span class="title">${escape(card.title)}</span><span class="author">${escape(card.author)}</span>`;
const subtitle = card.subtitle ? `<p class="subtitle">${escape(card.subtitle).replaceAll('\n', '<br>')}</p>` : '';

document.getElementById('type').innerHTML = `
  <div class="type">
    <h1 class="verse">${card.lines.map(line => `<span>${escape(line)}</span>`).join('')}</h1>
    ${subtitle}
    <p class="source">${source}<i class="seal" aria-label="微詩"></i></p>
  </div>
  <div class="footer">
    <div class="brand">微诗</div>
    <div class="qr">${qr.createSvgTag({ scalable: true, cellSize: 1, margin: 0 })}</div>
    <div class="calendar"><div>${calendar.dateText}</div><div class="tag">${calendar.tag}</div></div>
    <div class="series">${escape(series)}</div>
  </div>`;

const longest = Math.max(...card.lines.map(chars));
const verse = document.querySelector('.verse');
const size = {
  horizontal: Math.min(116, 840 / longest),
  hero: Math.min(158, 860 / longest),
  vertical: Math.min(100, 760 / longest),
  cover: Math.min(236, 880 / longest / 1.14),
}[card.layout];
verse.style.fontSize = `${Math.floor(size)}px`;
// Long titles shrink rather than wrap or run off the page.
const sourceEl = document.querySelector('.source');
if (!cover) {
  const room = card.layout === 'vertical' ? 860 : 820;
  const length = chars(card.title) + chars(card.author) + 3;
  sourceEl.style.fontSize = `${Math.max(28, Math.min(32, room / length / 1.14))}px`;
}

await document.fonts.load('700 100px Song');
await document.fonts.load('400 32px Song');
await document.fonts.ready;

const boxes = [...document.querySelectorAll('.type > *')].map(el => {
  const rect = el.getBoundingClientRect();
  return { x0: rect.left / W, y0: rect.top / H, x1: rect.right / W, y1: rect.bottom / H };
});
// Horizontal layouts let the painting climb to just under the text; vertical keeps its tall frame.
const sky = card.layout === 'vertical' ? null : Math.max(...boxes.map(box => box.y1)) + 0.035;
const terrain = fitTerrain(posterTerrain(card.seed, card.layout, sky), boxes);
paintPoster(document.getElementById('art'), card, terrain, boxes);

window.poster = { ...card, source: url, terrain };
window.READY = true;
window.render = () => {};
window.DUR = 1;
