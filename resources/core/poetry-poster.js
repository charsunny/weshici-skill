import fs from 'node:fs';
import { beijingDay, huapingCalendar } from './huaping-footer.js';

export const appPalettes = JSON.parse(fs.readFileSync(new URL('./app-palettes.json', import.meta.url), 'utf8'));
export const paletteIds = Object.keys(appPalettes.palettes);

const motifs = new Set(['sun', 'moon', 'reeds', 'maple', 'cottage', 'fortress', 'pine', 'boat', 'heron']);
const layouts = ['horizontal', 'vertical', 'hero', 'cover'];
const count = value => Array.from(value).length;
const cleanPoem = value => value.replace(/[\p{P}\p{Z}\s]/gu, '');

const SEASON_OF_TERM = {
  spring: ['立春', '雨水', '惊蛰', '春分', '清明', '谷雨'],
  summer: ['立夏', '小满', '芒种'],
  lateSummer: ['夏至', '小暑', '大暑', '立秋', '处暑'],
  autumn: ['白露', '秋分', '寒露', '霜降'],
  winter: ['立冬', '小雪', '大雪', '冬至', '小寒', '大寒'],
};

// Same five seasons as ZXSeasonTint / ZXPaletteCatalog.palette(for:).
export function posterSeason(date) {
  const { term } = huapingCalendar(date);
  return Object.keys(SEASON_OF_TERM).find(season => SEASON_OF_TERM[season].includes(term));
}

export function seasonalPalette(date) {
  return appPalettes.seasonal[posterSeason(date)];
}

// palette may be one of the seven ids, `seasonal`, or a deprecated alias that also implies an appearance.
export function resolvePalette(palette = 'seasonal', date) {
  const alias = appPalettes.aliases[palette];
  if (alias) return { id: alias.palette, appearance: alias.appearance, alias: palette };
  if (palette === 'seasonal') return { id: seasonalPalette(date), seasonal: true };
  if (!Object.hasOwn(appPalettes.palettes, palette)) throw new Error(`未知 poster palette: ${palette}（可选 ${paletteIds.join(' / ')} / seasonal）`);
  return { id: palette };
}

function seedOf(text) {
  let seed = 2166136261;
  for (const char of text) seed = Math.imul(seed ^ char.codePointAt(0), 16777619) >>> 0;
  return seed;
}

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
    if (!layouts.includes(layout)) throw new Error(`未知 poster layout: ${layout}`);
    if (!title || count(title) > 32 || (!cover && !author) || count(author) > 12) throw new Error('poster 需要诗题（最多 32 字）和作者（最多 12 字）；封面可省略作者');
    const lines = card.lines;
    if (!Array.isArray(lines) || !lines.length || lines.length > (cover ? 1 : 2)
      || lines.some(line => typeof line !== 'string' || !line.trim() || count(line) > (cover ? 4 : 8))) {
      throw new Error('poster 诗句请明确摘选为 1—2 行，每行不超过 8 字；封面为 1 行、不超过 4 字');
    }
    if (layout === 'hero' && lines.some(line => count(line) > 5)) throw new Error('hero 大字版每行最多 5 字；长句请用 horizontal 或 vertical');
    if (card.poem && lines.some(line => !cleanPoem(card.poem).includes(cleanPoem(line)))) throw new Error(`摘句不在原诗中：${title}`);

    const palette = resolvePalette(card.palette || 'seasonal', date);
    if (card.appearance !== undefined && !['light', 'dark'].includes(card.appearance)) throw new Error(`poster appearance 只能是 light 或 dark：${card.appearance}`);
    if (card.motifs !== undefined && (!Array.isArray(card.motifs) || card.motifs.some(motif => !motifs.has(motif)))) throw new Error('poster motifs 包含不支持的画面元素');
    const appearance = card.appearance || palette.appearance || (card.motifs?.includes('moon') ? 'dark' : 'light');
    const selectedMotifs = card.motifs || [appearance === 'dark' ? 'moon' : 'sun', 'pine', 'boat'];
    if (selectedMotifs.includes('sun') && selectedMotifs.includes('moon')) throw new Error('同张海报请选择日或月其中之一');

    const subtitle = String(card.subtitle || '');
    const caption = String(card.caption || '');
    if (count(subtitle) > 28 || count(caption) > 8) throw new Error('poster 副题最多 28 字，页脚短题最多 8 字');
    const seed = seedOf(String(card.seed ?? `${date}/${theme}/${index}/${title}`));
    const entry = appPalettes.palettes[palette.id];
    return {
      title, author, lines, layout, palette: palette.id, appearance, motifs: selectedMotifs, subtitle, caption, seed,
      index: cover ? 0 : ++poemIndex, total, date, theme,
      colors: entry[appearance], paint: entry.painting[appearance],
      // A dark poster still prints its QR code dark-on-light so it scans.
      qr: { tile: entry.light.surface, ink: entry.light.ink },
    };
  });
  return { date, theme, cards };
}
