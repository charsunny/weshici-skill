/**
 * 制片文案：分镜企划单与社区发布文案。只写成片里真有的东西——有朗读才写朗读，
 * 朗读库只有逐行起始时间，不写「词级时间戳」；混音只有固定音量，不写动态闪避。
 */
export const STYLE_NAMES = {
  'huaping-motion': '动态画屏',
  'ink-story': '写意水墨',
};

// Templates whose text follows the recording's timestamps; huaping-motion keeps the App's fixed reveal.
const TIMED = new Set(['ink-story']);

// What the clip really has, for the treatment and the caption: only claim a reading when the recipe
// carries one, and only line-level timing (the reading library has a start time per line, no words).
export function audioFacts(recipe, style) {
  const hasVoice = Boolean(recipe.voice);
  const timed = hasVoice && TIMED.has(style);
  return {
    hasVoice,
    voice: !hasVoice ? '无朗读，诗句按固定节奏逐字墨洇出现'
      : timed ? '朗读人声；诗句按每行朗读的起始时间逐字墨洇出现'
      : '朗读人声；诗句按固定节奏逐字墨洇出现，不跟随朗读时间',
    mix: hasVoice ? '朗读、配乐与程序化拟音混音，配乐整体压低，响度标准化至 -14 LUFS' : '配乐与程序化拟音混音，响度标准化至 -14 LUFS',
  };
}

export function buildTreatmentMarkdown(recipe, slug, style) {
  const title = recipe.title || recipe.poem?.title || '无题';
  const author = recipe.author || recipe.poem?.author || '';
  const dynasty = recipe.dynasty || recipe.poem?.dynasty || '';
  const cues = recipe.couplets || recipe.poem?.cues || [];
  const audio = audioFacts(recipe, style);
  const shot = style === 'ink-story' ? '逐联题跋，上一联化开' : '逐字墨洇';
  const rows = cues
    .map(
      (c, i) =>
        `| #${i + 1} | \`${Number(c.start).toFixed(2)}s – ${Number(c.end).toFixed(2)}s\` | 「${c.text}」 | ${shot} |`,
    )
    .join('\n');

  return `# 分镜企划单 — 《${title}》

- **剧目代号**: \`${slug}\`
- **视觉母版**: \`${style}\`（${STYLE_NAMES[style] || style}）
- **内容**: ${[dynasty, author].filter(Boolean).join(' · ')}《${title}》
- **配色**: \`${recipe.palette || 'seasonal'}\`${recipe.term ? `（${recipe.term}）` : ''}
- **画**: ${recipe.procedural?.generator || 'shanshui@5'}，seed \`${recipe.procedural?.seed || slug}\`；${recipe.procedural?.scene ? `配方指定 \`${recipe.procedural.scene}\` 场景（理由见配方 note）` : '场景、构图与母题由引擎按诗决定'}
- **声音**: ${audio.voice}；${audio.mix}
- **成片时长**: \`${recipe.duration}s\`（\`1080×1920\`，30fps）

## ${audio.hasVoice ? '朗读时间窗' : '诗句'}

| 序号 | 时间窗 | 诗句 | 画面 |
| :--- | :--- | :--- | :--- |
${rows || '| #1 | — | 全诗 | 逐字墨洇，落印 |'}

## 拟音

拟音事件由模板的 \`window.EV\` 给出，渲染时由 \`render.mjs\` 合成；时刻以渲染结果为准。
`;
}

export function buildCaptionMarkdown(recipe, style) {
  const title = recipe.title || recipe.poem?.title || '无题';
  const author = recipe.author || recipe.poem?.author || '';
  const dynasty = recipe.dynasty || recipe.poem?.dynasty || '';
  const lines = (recipe.lines || recipe.poem?.lines || (recipe.couplets || []).map((c) => c.text)).join('\n');
  const audio = audioFacts(recipe, style);
  const credit = [dynasty, author].filter(Boolean).join(' · ');
  return `【微诗${STYLE_NAMES[style] ? ` · ${STYLE_NAMES[style]}` : ''} · 《${title}》】

${lines}

—— ${credit ? `${credit}` : ''}《${title}》

本片由微诗视频工作台确定性渲染：
· 画面：ZixiaoArt ShanShui@5 程序化水墨山水；
· 声音：${audio.voice}；${audio.mix}。
`;
}
