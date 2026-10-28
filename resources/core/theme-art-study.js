import { resolveVideoPalette } from './huaping-video.js';
import { beijingDay, huapingCalendar } from './huaping-footer.js';
import { huapingClauses } from './huaping-layout.js';

export const STUDY_FORMAT = 'weshici-theme-art@1';

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
  return {
    theme, appearance, artwork, artPalette, flower, seed, title, author, poem, fullPoem, date, purpose,
    requested: { theme:requestedTheme, artwork:requestedArtwork, artPalette:requestedArtPalette },
    width: 1080, height: 1440,
    colors,
    // Zero engine grain; one shared quiet paper layer is applied by the study template.
    paperStrength:0,
    artColors: { paper: colors.paper, ink: palettes.palettes[artPalette][appearance].ink },
    generator: artwork === 'none' ? null : artwork === 'flowers' ? 'nonflowers@2' : 'shanshui@5',
  };
}
