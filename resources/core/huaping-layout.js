// JianyangView.swift: measured verse box, right-to-left columns, title/author/seal colophon.
const PITCH = 1.18;
const GAP = 0.62;
const glyphs = text => Array.from(text);
const units = (text, cell) => text ? (glyphs(text).length - 1) * PITCH + cell : 0;

export function huapingClauses(text) {
  return text.split(/[，。！？；：、,.!?;:]/u)
    .map(line => line.replace(/[\s·…—\-“”‘’"'《》〈〉「」『』（）()【】\[\]]/gu, ''))
    .filter(Boolean);
}

export function huapingPlan({ poem, title = '', author = '', dynasty = '', verse, width, height,
  wallpaper = false, shareFooter = false, cell = 1.44, inkBottom = () => 0, preferredSize = Infinity }) {
  if (!verse?.rect || !huapingClauses(poem).length) throw new Error('画屏缺少诗句或留白框');
  const raw = verse.rect;
  const top = Math.max((raw.y + raw.height * 0.03) * height, height * (wallpaper ? 0.32 : 0.10));
  const bottom = Math.min((raw.y + raw.height * 0.97) * height, height * (wallpaper ? 0.88 : 0.84),
    shareFooter ? height - width * .05 - Math.min(width * .30, height * .30) - 8 * width / (width / height > 1.3 ? 640 : 414) : Infinity);
  const box = { x: (raw.x + raw.width * 0.04) * width, y: top,
    width: raw.width * 0.92 * width, height: bottom - top };
  if (box.height <= 0 || box.width <= 0) throw new Error('画屏安全区内没有可排字空间');
  const all = huapingClauses(poem);
  let clauses = all.slice(0, 8);
  title = title.trim().replace(/^《|》$/g, '');
  const attribution = [dynasty.trim(), author.trim()].filter(Boolean).join('　');
  const vertical = verse.vertical;
  const unit = width / 393;
  function fit() {
    const longest = Math.max(...clauses.map(line => glyphs(line).length));
    if (!vertical) return Math.min(30 * unit, box.width / (longest * 1.14),
      box.height / (clauses.length * (cell + 0.38) + 1.43));
    return Math.min(34 * unit, preferredSize,
      box.width / (clauses.length + (clauses.length - 1) * GAP + 1.34),
      box.height / ((longest - 1) * PITCH + cell),
      box.height / ((units(attribution, cell) + 0.45 + 0.9 * 354 / 173) * 0.44));
  }
  let fontSize = fit();
  while (fontSize < 17 * unit && clauses.length > 2) {
    clauses = clauses.slice(0, -(clauses.length % 2 === 0 ? 2 : 1));
    fontSize = fit();
  }
  const verseHeight = Math.max(...clauses.map(line => units(line, cell))) * fontSize;
  const bottomInset = inkBottom(clauses) * fontSize;
  const sealWidth = fontSize * 0.44 * 0.9;
  const sealHeight = sealWidth * 354 / 173;
  const inscriptionHeight = Math.max(sealHeight, Math.min(box.height, verseHeight * 0.86) - bottomInset);
  const titleGlyphs = glyphs(title);
  const separateTitle = titleGlyphs.length > 8;
  const titleColumns = titleGlyphs.length > 18
    ? [titleGlyphs.slice(0, Math.ceil(titleGlyphs.length / 2)).join(''), titleGlyphs.slice(Math.ceil(titleGlyphs.length / 2)).join('')]
    : title ? [title] : [];
  let inscriptionSize = Math.min(fontSize * 0.44, separateTitle
    ? Math.min(inscriptionHeight / Math.max(...titleColumns.map(t => units(t, cell))),
      (inscriptionHeight - sealHeight) / (units(attribution, cell) + 0.45))
    : (inscriptionHeight - sealHeight) / Math.max(1, units(title, cell) + units(attribution, cell)
      + (title && attribution ? 0.9 : 0) + (attribution ? 0.45 : 0)));
  // Keep a multi-column title inside the colophon's reserved width; never shrink the poem for its title.
  if (separateTitle) inscriptionSize = Math.min(inscriptionSize,
    (box.width - (clauses.length + (clauses.length - 1) * GAP) * fontSize - sealWidth - fontSize * 0.45) / (titleColumns.length + 0.6 + (titleColumns.length - 1) * 0.45));
  return { box, vertical, clauses, omittedClauses: all.slice(clauses.length), fontSize, cell,
    verseHeight, bottomInset, title, attribution, titleColumns, separateTitle,
    inscriptionSize, sealWidth, sealHeight, inscriptionHeight };
}

export async function mountHuaping(container, input) {
  await document.fonts.load('100px SongReg');
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = '100px SongReg';
  const metrics = ctx.measureText('国');
  const cell = (metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent) / 100;
  const inkBottom = clauses => {
    const longest = Math.max(...clauses.map(line => glyphs(line).length));
    const bottom = Math.max(...clauses.map(line => (glyphs(line).length - 1) * PITCH
      + (metrics.fontBoundingBoxAscent + ctx.measureText(glyphs(line).at(-1)).actualBoundingBoxDescent) / 100));
    return Math.max(0, (longest - 1) * PITCH + cell - bottom);
  };
  const plan = huapingPlan({ ...input, cell, inkBottom });
  const node = (className, parent) => {
    const element = document.createElement('div');
    element.className = className;
    parent?.appendChild(element);
    return element;
  };
  const columns = (lines, size, gap, parent, className) => {
    const group = node(`hp-columns ${className}`, parent);
    group.style.gap = `${size * gap}px`;
    for (const line of lines) {
      const column = node('hp-column', group);
      Object.assign(column.style, { width: `${size}px`, height: `${units(line, cell) * size}px`, fontSize: `${size}px` });
      glyphs(line).forEach((char, i) => {
        const glyph = node('hp-glyph', column);
        glyph.textContent = char;
        Object.assign(glyph.style, { top: `${i * PITCH * size}px`, lineHeight: `${cell * size}px` });
      });
    }
    return group;
  };
  const box = node('hp-box', container);
  box.setAttribute('aria-label', `${plan.clauses.join('，')}。${plan.title} ${plan.attribution}`);
  Object.assign(box.style, { left: `${plan.box.x}px`, top: `${plan.box.y}px`, width: `${plan.box.width}px`, height: `${plan.box.height}px` });
  const block = node(`hp-block ${plan.vertical ? '' : 'hp-horizontal'}`, box);
  const seal = document.createElement('img');
  seal.className = 'hp-seal';
  seal.alt = '微詩';
  seal.src = '/resources/assets/huaping/jianyang-seal.png';
  Object.assign(seal.style, { width: `${plan.sealWidth}px`, height: `${plan.sealHeight}px` });
  if (plan.vertical) {
    const colophon = node('hp-colophon', block);
    Object.assign(colophon.style, { marginRight: `${plan.fontSize * (plan.separateTitle ? 0.45 : 0.9)}px`, marginBottom: `${plan.bottomInset}px`, gap: `${plan.inscriptionSize * (plan.separateTitle ? 0.6 : 0.9)}px` });
    const size = plan.inscriptionSize;
    if (plan.separateTitle) colophon.classList.add('hp-colophon-wide');
    else if (plan.title) columns([plan.title], size, 0, colophon, 'hp-title');
    const authorColumn = node('hp-author-seal', colophon);
    authorColumn.style.gap = `${plan.attribution ? size * 0.45 : 0}px`;
    if (plan.attribution) {
      const author = columns([plan.attribution], size, 0, authorColumn, 'hp-author');
      author.style.color = input.accent;
    }
    authorColumn.appendChild(seal);
    if (plan.separateTitle) columns(plan.titleColumns, size, 0.45, colophon, 'hp-title');
    columns(plan.clauses, plan.fontSize, GAP, block, 'hp-verses');
  } else {
    block.style.fontSize = `${plan.fontSize}px`;
    for (const line of plan.clauses) node('hp-line', block).textContent = line;
    const footer = node('hp-footer', block);
    footer.style.fontSize = `${plan.fontSize * 0.44}px`;
    node('hp-credit', footer).textContent = [plan.title, plan.attribution].filter(Boolean).join('　');
    footer.appendChild(seal);
  }
  await seal.decode();
  return plan;
}
