import { resolveVideoPalette } from './huaping-video.js';
import { beijingDay, huapingCalendar } from './huaping-footer.js';
import { huapingClauses } from './huaping-layout.js';

export const STUDY_FORMAT = 'weshici-theme-art@1';

// Study-only dark papers: retain a visible theme hue without changing the App palette catalog.
const DARK_PAPER = {
  yaqing: '#202E30', 'moon-white': '#263642', 'xiang-leaf': '#383022',
  canglang: '#243B30', ousi: '#392B36', qingdai: '#23334E', rouge: '#402B2B',
};
const LIGHT_PAPER = {
  yaqing: '#E8EEEB', 'moon-white': '#E5EFF5', 'xiang-leaf': '#F3EBD7',
  canglang: '#E6EFE2', ousi: '#F1E6EE', qingdai: '#E5EAF3', rouge: '#F5E6E2',
};

export const STUDY_FONTS = {
  source_han_serif: { name:'思源宋体', path:'resources/assets/fonts/SourceHanSerifSC-Regular.otf' },
  shufa_liyu: { name:'漓雨手书', path:'resources/assets/fonts/painting/LiyuShoushu.ttf' },
  shufa_dongfang: { name:'东方大楷', path:'resources/assets/fonts/painting/AlimamaDongFangDaKai-Regular.otf' },
  shufa_xuanzong: { name:'玄宗行楷', path:'resources/assets/fonts/painting/xuanzong-v0.1.otf' },
  shufa_chongxi: { name:'崇羲篆体', path:'resources/assets/fonts/painting/chongxi-v1.00.otf' },
  shufa_yufan: { name:'余繁新语', path:'resources/assets/fonts/painting/yufan-regular-v1.0.ttf' },
  shufa_liujiang: { name:'流江毛草', path:'resources/assets/fonts/painting/liujian-maocao-v1.ttf' },
};

export function resolveStudyFont(font = 'source_han_serif') {
  if (typeof font === 'string') {
    if (!Object.hasOwn(STUDY_FONTS, font)) throw new Error('未知字体');
    return { id:font, ...STUDY_FONTS[font] };
  }
  if (!font || typeof font.name !== 'string' || !font.name.trim() || typeof font.path !== 'string'
      || !/\.(ttf|otf|woff2?)$/i.test(font.path)) throw new Error('自定义字体需要 name 和本地 TTF/OTF/WOFF/WOFF2 文件 path');
  return { id:'custom', name:font.name, path:font.path };
}

// Deliberately conservative: unsupported flowers stay with the existing poetry-scene matcher.
export function flowerForPoem(text) {
  if (/梅花|咏梅|梅枝|梅蕊/.test(text)) return '梅';
  if (/菊/.test(text)) return '菊';
  if (/兰花|幽兰|咏兰/.test(text)) return '兰';
  return null;
}

export function restoreStudy(snapshot) {
  if (snapshot.format !== STUDY_FORMAT || !snapshot.config || !snapshot.verse || !('request' in snapshot)) {
    throw new Error('不支持的作品快照');
  }
  return structuredClone(snapshot);
}

// Theme defaults are resolved once for a new work; saved works never call this function again.
export function resolveStudy(input, palettes) {
  const { theme: requestedTheme = 'yaqing', artwork: requestedArtwork = 'auto',
    artPalette: requestedArtPalette = 'follow-theme', purpose = 'inscription', seed, title, author } = input;
  const fullPoem = input.fullPoem || input.poem;
  if (![seed, title, author, fullPoem].every(v => typeof v === 'string' && v.trim())) throw new Error('需要固定种子、诗题、作者与诗句');
  if (!['inscription', 'reading'].includes(purpose)) throw new Error('未知用途');
  const date = input.date || beijingDay();
  huapingCalendar(date);
  const themePalette = resolveVideoPalette(palettes, { palette:requestedTheme, appearance:input.appearance,
    date, night:/明月|月夜|夜泊|夜静|寒夜/.test(fullPoem + title) });
  const theme = themePalette.id, appearance = themePalette.appearance;
  const inferredFlower = flowerForPoem(title + fullPoem);
  const artwork = requestedArtwork === 'auto' ? (inferredFlower ? 'flowers' : 'shanshui') : requestedArtwork;
  const flower = input.flower || inferredFlower || '自然';
  const artPalette = requestedArtPalette === 'follow-theme' ? theme : requestedArtPalette;
  if (!palettes.palettes[artPalette]) throw new Error('未知绘画墨色');
  if (!['shanshui', 'flowers', 'none'].includes(artwork)) throw new Error('未知绘画类型');
  if (!['自然', '梅', '荷', '菊', '兰'].includes(flower)) throw new Error('未知花卉');
  const poem = purpose === 'reading' ? fullPoem : input.excerpt || input.poem;
  if (!poem || huapingClauses(poem).some(line => !huapingClauses(fullPoem).includes(line))) throw new Error('摘句必须出自原诗');
  const colors = { ...palettes.palettes[theme][appearance] };
  colors.paper = (appearance === 'dark' ? DARK_PAPER : LIGHT_PAPER)[theme] || colors.paper;
  const elementTreatment = input.elementTreatment || 'refined-v1';
  if (!['original', 'refined-v1'].includes(elementTreatment)) throw new Error('未知元素处理版本');
  return {
    theme, appearance, artwork, artPalette, flower, seed, title, author, poem, fullPoem, date, purpose,
    requested: { theme:requestedTheme, artwork:requestedArtwork, artPalette:requestedArtPalette },
    width: 1080, height: 1440,
    colors,
    font:resolveStudyFont(input.font),
    elementTreatment,
    // Zero engine grain; one shared quiet paper layer is applied by the study template.
    paperStrength:0,
    artColors: { paper: colors.paper, ink: palettes.palettes[artPalette][appearance].ink,
      ...(elementTreatment === 'refined-v1' ? { accent:palettes.palettes[artPalette][appearance].accent,
        secondary:palettes.palettes[artPalette][appearance].secondary } : {}) },
    generator: artwork === 'none' ? null : artwork === 'flowers' ? 'nonflowers@2' : 'shanshui@5',
  };
}
