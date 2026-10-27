import { beijingDay, huapingCalendar } from './huaping-footer.js';

export const posterPalettes = {
  qinglv: { sky: ['#ebdcb8', '#d5b873'], ink: '#20483e', accent: '#a6422c', back: '#969775', mid: '#4f7965', front: '#234f43', river: '#a6b79b', sun: '#c55234' },
  yueye: { sky: ['#132f40', '#345668'], ink: '#eee2c4', accent: '#e89970', back: '#536e79', mid: '#31515e', front: '#153744', river: '#81938a', sun: '#e7d7af' },
  nuanjin: { sky: ['#edcf9a', '#cf975a'], ink: '#394835', accent: '#a23f27', back: '#ad935e', mid: '#7e8051', front: '#495d3f', river: '#cebc8d', sun: '#edddb3' },
};
const motifs = new Set(['sun', 'moon', 'reeds', 'maple', 'cottage', 'fortress', 'pine', 'boat', 'heron']);
const count = value => Array.from(value).length;
const cleanPoem = value => value.replace(/[\p{P}\p{Z}\s]/gu, '');

// Explicit excerpts avoid silently dropping verses or reusing an unrelated daily issue.
export function preparePosterManifest(input) {
  const date = input.date || beijingDay();
  huapingCalendar(date);
  if (!Array.isArray(input.cards) || !input.cards.length) throw new Error('poster 需要非空 cards 数组');
  const theme = String(input.theme || '诗词海报');
  if (count(theme) > 16) throw new Error('poster 主题最多 16 字');
  let poemIndex = 0;
  const total = input.cards.filter(card => card.layout !== 'cover').length;
  const cards = input.cards.map((card, index) => {
    const title = String(card.title || '').trim();
    const author = String(card.author || '').trim();
    const layout = card.layout || 'horizontal';
    const cover = layout === 'cover';
    if (!['horizontal', 'vertical', 'hero', 'cover'].includes(layout)) throw new Error(`未知 poster layout: ${layout}`);
    if (!title || count(title) > 32 || (!cover && !author) || count(author) > 12) throw new Error('poster 需要诗题（最多 32 字）和作者（最多 12 字）；封面可省略作者');
    const lines = card.lines;
    if (!Array.isArray(lines) || !lines.length || lines.length > (cover ? 1 : 2)
      || lines.some(line => typeof line !== 'string' || !line.trim() || count(line) > (cover ? 4 : 8))) {
      throw new Error('poster 诗句请明确摘选为 1—2 行，每行不超过 8 字；封面为 1 行、不超过 4 字');
    }
    if (layout === 'hero' && lines.some(line => count(line) > 5)) throw new Error('hero 大字版每行最多 5 字；长句请用 horizontal 或 vertical');
    if (card.poem && lines.some(line => !cleanPoem(card.poem).includes(cleanPoem(line)))) throw new Error(`摘句不在原诗中：${title}`);
    const palette = card.palette || 'qinglv';
    if (!Object.hasOwn(posterPalettes, palette)) throw new Error(`未知 poster palette: ${palette}`);
    const selectedMotifs = card.motifs || [palette === 'yueye' ? 'moon' : 'sun', 'pine', 'boat'];
    if (!Array.isArray(selectedMotifs) || selectedMotifs.some(motif => !motifs.has(motif))) throw new Error('poster motifs 包含不支持的画面元素');
    if (selectedMotifs.includes('sun') && selectedMotifs.includes('moon')) throw new Error('同张海报请选择日或月其中之一');
    const subtitle = String(card.subtitle || '');
    const caption = String(card.caption || '');
    if (count(subtitle) > 28 || count(caption) > 8) throw new Error('poster 副题最多 28 字，页脚短题最多 8 字');
    let seed = 2166136261;
    for (const char of String(card.seed ?? `${date}/${theme}/${index}/${title}`)) seed = Math.imul(seed ^ char.codePointAt(0), 16777619) >>> 0;
    return { title, author, lines, layout, palette, motifs: selectedMotifs, subtitle, caption, seed,
      index: cover ? 0 : ++poemIndex, total, date, theme };
  });
  return { date, theme, cards };
}
